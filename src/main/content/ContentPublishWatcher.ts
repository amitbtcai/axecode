import { randomUUID } from "node:crypto";
import type {
  AgentStatus,
  AgentStatusesResponse,
  ContentCard,
  Project,
  RemoteThreadCommand,
  StartThreadPayload,
  Thread,
} from "@/shared/contracts";
import { DEFAULT_TERMINAL_SIZE, resolveMcpLaunchSnapshot } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { buildContentPublishPrompt } from "@/shared/contentPublish";
import {
  dbGetContentCards,
  dbGetContentSocialAccounts,
  dbUpdateContentCard,
} from "../db/contentCards";
import { dbStartPublishAttempt } from "../db/contentPublishAttempts";
import { resolveUnrestrictedThreadPermissions } from "../threads/threadLaunchConfig";

/**
 * Fork-owned (Axe Code): fires content cards whose `scheduled_for` has
 * passed. Each due card launches a real GUI thread (persisted, sidebar-
 * visible) whose prompt is the shared publish playbook — the agent reviews,
 * posts via the signed-in browser (browseros-neo MCP), and reports the URL
 * or error back onto the card.
 *
 * Firing is guarded twice: an in-memory set while the launch is in flight,
 * then `scheduled_for` is cleared + `source_thread_id` stamped so the next
 * tick cannot refire even if the process restarts mid-launch.
 */
export interface ContentPublishWatcherDeps {
  startThread(payload: StartThreadPayload): Promise<unknown>;
  getAgentStatuses(wslDistros: string[]): Promise<AgentStatusesResponse>;
  sendThreadCommand(command: RemoteThreadCommand): boolean;
  ensureHomeProject(): Project;
  getProject(projectId: string): Project | null;
  getSharedSettings(): SharedSettings;
  upsertThread(thread: Thread, sortOrder: number): void;
  threadExists(threadId: string): boolean;
  now?: () => number;
  tickIntervalMs?: number;
  newId?: () => string;
}

export class ContentPublishWatcher {
  private readonly launching = new Set<string>();
  private readonly pending: Promise<void>[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(private readonly deps: ContentPublishWatcherDeps) {}

  start(): void {
    if (this.timer || this.disposed) return;
    this.timer = setInterval(() => this.tick(), this.deps.tickIntervalMs ?? 30_000);
    this.timer.unref?.();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick(): void {
    if (this.disposed) return;
    const now = this.now();
    for (const card of dbGetContentCards({ status: "scheduled" })) {
      if (!card.scheduledFor || Date.parse(card.scheduledFor) > now) continue;
      if (this.launching.has(card.id)) continue;
      this.launching.add(card.id);
      this.pending.push(
        this.launch(card, "scheduled")
          .catch((error: unknown) => {
            dbUpdateContentCard(card.id, {
              publishError: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(() => this.launching.delete(card.id)),
      );
    }
  }

  /** Await all in-flight launches — used by tests; production ticks don't wait. */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  /**
   * Manual publish — same path as the due-card tick, invoked by the
   * `publishContentCard` IPC so the Content board posts without opening a chat.
   */
  publishCard(card: ContentCard): void {
    if (this.launching.has(card.id)) return;
    this.launching.add(card.id);
    this.pending.push(
      this.launch(card, "manual")
        .catch((error: unknown) => {
          dbUpdateContentCard(card.id, {
            publishError: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => this.launching.delete(card.id)),
    );
  }

  private async launch(card: ContentCard, trigger: "scheduled" | "manual"): Promise<void> {
    const project = card.projectId
      ? this.deps.getProject(card.projectId)
      : this.deps.ensureHomeProject();
    if (!project) throw new Error("Card's project no longer exists.");

    const agent = await this.pickAgent(project);
    if (!agent) throw new Error("No agent installed to run the publish.");
    const agentKind = agent.kind;

    // Claim the card before launching: clear the due time so no tick refires,
    // and link the publish thread so the modal can open it.
    const threadId = (this.deps.newId ?? randomUUID)();
    const claimed = dbUpdateContentCard(card.id, {
      scheduledFor: null,
      publishError: null,
    });
    if (!claimed) return;

    // Open a history row for this run — completed when the agent reports
    // back via update_content_card (or by the launch-failure catch above).
    const accounts = dbGetContentSocialAccounts();
    dbStartPublishAttempt({
      card: claimed,
      trigger,
      threadId,
      destinationUrl: accounts.find((a) => a.channel === claimed.channel)?.url ?? null,
    });

    const nowIso = new Date(this.now()).toISOString();
    const title = `Publish: ${card.title || card.id.slice(0, 8)}`;
    const config = {
      model: agent.capabilities.models[0]?.id ?? "default",
      ...(await resolveUnrestrictedThreadPermissions(
        this.deps.getAgentStatuses,
        agentKind,
        project.location,
      )),
    };
    const thread: Thread = {
      id: threadId,
      projectId: project.id,
      title,
      agentKind,
      config,
      status: "launching",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      threadStatusSource: "server",
      createdAt: nowIso,
      updatedAt: nowIso,
      activeTurnStartedAt: nowIso,
    };
    this.deps.upsertThread(thread, -Date.now());

    const prompt = buildContentPublishPrompt(claimed, accounts);
    this.deps.sendThreadCommand({
      kind: "start",
      threadId,
      projectId: project.id,
      agentKind,
      config,
      prompt,
      title,
      presentationMode: "gui",
      launchRuntime: false,
      focus: false,
    });

    const payload: StartThreadPayload = {
      threadId,
      projectLocation: project.location,
      agentKind,
      config,
      prompt,
      initialSize: DEFAULT_TERMINAL_SIZE,
      presentationMode: "gui",
      ...resolveMcpLaunchSnapshot(this.deps.getSharedSettings(), project.mcpServers ?? []),
    };
    await this.deps.startThread(payload);
    // Record the launch on the card so "Open source thread" reaches it.
    dbUpdateContentCard(card.id, { sourceThreadId: threadId });
  }

  /** First installed agent on the project's host — publish threads reuse it. */
  private async pickAgent(project: Project): Promise<AgentStatus | null> {
    try {
      const statuses = await this.deps.getAgentStatuses(
        project.location.kind === "wsl" ? [project.location.distro] : [],
      );
      const agents = getProjectAgentStatuses(project.location, statuses.windows, statuses.wsl);
      return agents.find((a) => a.installed) ?? null;
    } catch {
      return null;
    }
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}
