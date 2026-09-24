import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";
import { decryptSecret, encryptSecret } from "@/shared/secretStorage";
import type { AxeAiAccountLinkState, AxeAiAccountLinkStartResult } from "@/shared/contracts";
import type { RemoteAccessIdentity } from "../remote/identity";
import { axeAiApiBaseUrl, axeAiApiFetch, AxeAiApiError } from "./axeaiApiClient";

const LINK_FILE_NAME = "axeai-account-link.json";
const LINK_POLL_MS = 2_000;
const HEARTBEAT_MS = 60_000;
/**
 * The device credential is the account's delegated authority for this
 * desktop — sealed with the shared safeStorage key like usage secrets, never
 * written to logs, and deleted on sign-out. The relay secret is derived
 * server-side from the desktop id; it is stored alongside so reconnects do
 * not depend on another claim round-trip.
 */
const persistedLinkSchema = z.object({
  deviceToken: z.string().min(1),
  deviceTokenExpiresAt: z.string().optional(),
  accountId: z.string().min(1),
  accountLabel: z.string().optional(),
  linkedAt: z.string().min(1),
  relaySecret: z.string().optional(),
  relayUrl: z.string().optional(),
  /** Set once remote access was auto-enabled by this link, so a later manual
   * disable in Settings is respected instead of fought. */
  remoteAutoEnabled: z.boolean().optional(),
});
type PersistedLink = z.infer<typeof persistedLinkSchema>;

/**
 * `relayUrl` from the API is the public HTTP(S) base; the host control socket
 * lives at `ws(s)://<base>/host`.
 */
function relayHostUrl(base: string): string {
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/host";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export interface AxeAiRelayCredentials {
  readonly relayUrl: string;
  readonly relaySecret: string;
  readonly desktopId: string;
}

interface LinkStartResponse {
  code: string;
  expiresIn: number;
  pollAfterMs?: number;
}

interface LinkStatusResponse {
  status: "pending" | "approved" | "expired" | "consumed";
}

interface LinkExchangeResponse {
  token: string;
  expiresAt?: string;
  account: { id: string; label?: string };
}

interface ClaimResponse {
  desktopId: string;
  relayUrl: string;
  relaySecret: string;
}

export interface AxeAiAccountLinkManagerOptions {
  readonly baseDir: string;
  readonly appVersion: string;
  readonly getIdentity: () => RemoteAccessIdentity;
  readonly onStateChanged: (state: AxeAiAccountLinkState) => void;
  /**
   * Fired once when a link flow completes — the caller uses it to flip remote
   * access on for first-time sign-in.
   */
  readonly onLinked: () => void;
  readonly reportError?: (error: unknown) => void;
}

export class AxeAiAccountLinkManager {
  private link: PersistedLink | null = null;
  private linkingPoll: { code: string; deadline: number; timer: NodeJS.Timeout } | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastDirectUrl: string | undefined;
  private disposed = false;

  constructor(private readonly options: AxeAiAccountLinkManagerOptions) {
    this.link = this.readPersisted();
  }

  private get linkPath(): string {
    return join(this.options.baseDir, LINK_FILE_NAME);
  }

  private readPersisted(): PersistedLink | null {
    try {
      if (!existsSync(this.linkPath)) return null;
      const raw = readFileSync(this.linkPath, "utf8");
      const parsed = persistedLinkSchema.safeParse(
        JSON.parse(decryptSecret(this.options.baseDir, raw)),
      );
      return parsed.success ? parsed.data : null;
    } catch (error) {
      // Corrupt or undecryptable (keychain key rotated) — treat as signed out.
      console.warn("[axecode] discarding unreadable AxeAI account link:", error);
      return null;
    }
  }

  private persist(link: PersistedLink | null): void {
    this.link = link;
    if (!link) {
      rmSync(this.linkPath, { force: true });
      return;
    }
    writeFileAtomic(this.linkPath, encryptSecret(this.options.baseDir, JSON.stringify(link)), {
      encoding: "utf8",
    });
  }

  getState(): AxeAiAccountLinkState {
    if (this.linkingPoll) {
      return {
        status: "linking",
        code: this.linkingPoll.code,
        expiresAt: new Date(this.linkingPoll.deadline).toISOString(),
        verificationUrl: `${axeAiApiBaseUrl()}/code/remote?link=${encodeURIComponent(this.linkingPoll.code)}`,
      };
    }
    if (!this.link) return { status: "signed-out" };
    return {
      status: "linked",
      ...(this.link.accountLabel ? { accountLabel: this.link.accountLabel } : {}),
      linkedAt: this.link.linkedAt,
    };
  }

  private emit(): void {
    try {
      this.options.onStateChanged(this.getState());
    } catch (error) {
      this.options.reportError?.(error);
    }
  }

  async startLink(): Promise<AxeAiAccountLinkStartResult> {
    if (this.linkingPoll) {
      const state = this.getState();
      if (state.status === "linking" && state.code && state.expiresAt && state.verificationUrl) {
        return {
          status: "linking",
          code: state.code,
          expiresAt: state.expiresAt,
          verificationUrl: state.verificationUrl,
        };
      }
    }
    const started = await axeAiApiFetch<LinkStartResponse>("/api/code/link/start", {
      method: "POST",
      body: {},
    });
    const deadline = Date.now() + started.expiresIn * 1000;
    this.stopLinkingPoll();
    const pollAfterMs = Math.max(500, started.pollAfterMs ?? LINK_POLL_MS);
    const timer = setInterval(() => void this.pollLink(), pollAfterMs);
    this.linkingPoll = { code: started.code, deadline, timer };
    this.emit();
    return {
      status: "linking",
      code: started.code,
      expiresAt: new Date(deadline).toISOString(),
      verificationUrl: `${axeAiApiBaseUrl()}/code/remote?link=${encodeURIComponent(started.code)}`,
    };
  }

  cancelLink(): void {
    this.stopLinkingPoll();
    this.emit();
  }

  private stopLinkingPoll(): void {
    if (!this.linkingPoll) return;
    clearInterval(this.linkingPoll.timer);
    this.linkingPoll = null;
  }

  private async pollLink(): Promise<void> {
    const pending = this.linkingPoll;
    if (!pending) return;
    if (Date.now() >= pending.deadline) {
      this.stopLinkingPoll();
      this.emit();
      return;
    }
    let status: LinkStatusResponse["status"];
    try {
      const res = await axeAiApiFetch<LinkStatusResponse>(
        `/api/code/link/status?code=${encodeURIComponent(pending.code)}`,
      );
      status = res.status;
    } catch (error) {
      // Transient network failures should not abort the flow; a hard API
      // rejection should.
      if (error instanceof AxeAiApiError && error.status >= 400 && error.status < 500) {
        this.stopLinkingPoll();
        this.emit();
      }
      return;
    }
    if (status === "pending") return;
    if (status === "approved") {
      try {
        const exchanged = await axeAiApiFetch<LinkExchangeResponse>("/api/code/link/exchange", {
          method: "POST",
          body: { code: pending.code },
        });
        this.stopLinkingPoll();
        this.persist({
          deviceToken: exchanged.token,
          ...(exchanged.expiresAt ? { deviceTokenExpiresAt: exchanged.expiresAt } : {}),
          accountId: exchanged.account.id,
          ...(exchanged.account.label ? { accountLabel: exchanged.account.label } : {}),
          linkedAt: new Date().toISOString(),
          ...(this.link?.relaySecret ? { relaySecret: this.link.relaySecret } : {}),
          ...(this.link?.relayUrl ? { relayUrl: this.link.relayUrl } : {}),
          remoteAutoEnabled: this.link?.remoteAutoEnabled,
        });
        this.emit();
        this.options.onLinked();
      } catch {
        // Exchange raced (double-submit) — leave the poll running until expiry
        // so the user sees the natural outcome.
      }
      return;
    }
    // expired / consumed
    this.stopLinkingPoll();
    this.emit();
  }

  /** Whether first-link auto-enable of remote access has already happened. */
  shouldAutoEnableRemote(): boolean {
    return Boolean(this.link && !this.link.remoteAutoEnabled);
  }

  markRemoteAutoEnabled(): void {
    if (!this.link || this.link.remoteAutoEnabled) return;
    this.persist({ ...this.link, remoteAutoEnabled: true });
  }

  /**
   * Register this desktop against the linked account and fetch the relay
   * credentials. Returns null when not linked or the API rejects the claim.
   */
  async ensureClaimed(directUrl?: string): Promise<AxeAiRelayCredentials | null> {
    if (!this.link) return null;
    const identity = this.options.getIdentity();
    try {
      const result = await axeAiApiFetch<ClaimResponse>("/api/code/desktops/claim", {
        method: "POST",
        deviceToken: this.link.deviceToken,
        body: {
          desktopId: identity.desktopId,
          label: identity.label,
          ...(directUrl ? { directUrl } : {}),
          appVersion: this.options.appVersion,
        },
      });
      const relayUrl = relayHostUrl(result.relayUrl);
      this.persist({ ...this.link, relaySecret: result.relaySecret, relayUrl });
      return {
        relayUrl,
        relaySecret: result.relaySecret,
        desktopId: identity.desktopId,
      };
    } catch (error) {
      if (error instanceof AxeAiApiError && error.status === 409) {
        // Owned by another account — drop the stale link so the user re-links.
        this.persist(null);
        this.stopHeartbeat();
        this.emit();
      } else {
        console.warn("[axecode] AxeAI desktop claim failed:", error);
      }
      return null;
    }
  }

  getRelayCredentials(): AxeAiRelayCredentials | null {
    if (!this.link?.relaySecret || !this.link.relayUrl) return null;
    return {
      relayUrl: this.link.relayUrl,
      relaySecret: this.link.relaySecret,
      desktopId: this.options.getIdentity().desktopId,
    };
  }

  /** Verify a browser-issued connect ticket against the account service. */
  async verifyConnectTicket(ticket: string): Promise<boolean> {
    if (!this.link) return false;
    const identity = this.options.getIdentity();
    try {
      await axeAiApiFetch<{ userId: string; desktopId: string }>("/api/code/connect/verify", {
        method: "POST",
        deviceToken: this.link.deviceToken,
        body: { ticket, desktopId: identity.desktopId },
      });
      return true;
    } catch {
      return false;
    }
  }

  isLinked(): boolean {
    return this.link !== null;
  }

  /** Called when the local remote server comes up — starts heartbeats. */
  notifyRemoteActive(directUrl?: string): void {
    this.lastDirectUrl = directUrl;
    if (!this.link) return;
    this.stopHeartbeat();
    void this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), HEARTBEAT_MS);
  }

  notifyRemoteInactive(): void {
    this.stopHeartbeat();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.link) return;
    const identity = this.options.getIdentity();
    try {
      await axeAiApiFetch("/api/code/desktops/heartbeat", {
        method: "POST",
        deviceToken: this.link.deviceToken,
        body: {
          desktopId: identity.desktopId,
          label: identity.label,
          ...(this.lastDirectUrl ? { directUrl: this.lastDirectUrl } : {}),
          appVersion: this.options.appVersion,
        },
      });
    } catch (error) {
      if (error instanceof AxeAiApiError && error.status === 404) {
        // The desktop row was revoked on the web — drop the local link.
        this.persist(null);
        this.stopHeartbeat();
        this.emit();
        return;
      }
      // Transient failure: the web "online" window lapses on its own; the
      // next heartbeat restores it.
    }
  }

  signOut(): void {
    this.stopLinkingPoll();
    this.stopHeartbeat();
    this.persist(null);
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLinkingPoll();
    this.stopHeartbeat();
  }
}
