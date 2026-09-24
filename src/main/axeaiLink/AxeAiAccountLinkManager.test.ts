import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxeAiAccountLinkManager } from "./AxeAiAccountLinkManager";

const DESKTOP_IDENTITY = { desktopId: "desktop-test", label: "Test Desktop" };

interface MockReply {
  status?: number;
  body?: unknown;
}

function jsonResponse(reply: MockReply): Response {
  const status = reply.status ?? 200;
  return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Route-table fetch mock: keys are "METHOD /path" (query ignored). A queued
 * array of replies is shifted per call so a route can answer pending →
 * approved across polls.
 */
function stubFetch(routes: Record<string, MockReply | MockReply[]>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, ...(init ? { init } : {}) });
      const path = new URL(url).pathname;
      const key = `${init?.method ?? "GET"} ${path}`;
      const route = routes[key];
      const reply = Array.isArray(route) ? route.shift() : route;
      if (!reply) return jsonResponse({ status: 404, body: { error: "not_found" } });
      return jsonResponse(reply);
    }),
  );
  return calls;
}

function makeManager(baseDir: string) {
  const states: string[] = [];
  const onLinked = vi.fn<() => void>();
  const manager = new AxeAiAccountLinkManager({
    baseDir,
    appVersion: "1.0.0-test",
    getIdentity: () => DESKTOP_IDENTITY,
    onStateChanged: (state) => states.push(state.status),
    onLinked,
  });
  return { manager, states, onLinked };
}

function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("timed out waiting"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

describe("AxeAiAccountLinkManager", () => {
  let baseDir: string;
  let manager: AxeAiAccountLinkManager | null = null;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "axeai-link-test-"));
  });

  afterEach(() => {
    manager?.dispose();
    manager = null;
    vi.unstubAllGlobals();
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("reports signed-out with no persisted link", () => {
    const { manager: m } = makeManager(baseDir);
    manager = m;
    expect(m.getState().status).toBe("signed-out");
    expect(m.isLinked()).toBe(false);
  });

  it("runs the link flow: start → approved → exchange → linked + persisted", async () => {
    stubFetch({
      "POST /api/code/link/start": {
        body: { code: "AX-TEST-CODE", expiresIn: 600, pollAfterMs: 1 },
      },
      "GET /api/code/link/status": [
        { body: { status: "pending" } },
        { body: { status: "approved" } },
      ],
      "POST /api/code/link/exchange": {
        body: { token: "dev-token", account: { id: "user-1", label: "Amit" } },
      },
    });
    const { manager: m, states, onLinked } = makeManager(baseDir);
    manager = m;

    const start = await m.startLink();
    expect(start.status).toBe("linking");
    expect(start.code).toBe("AX-TEST-CODE");
    expect(start.verificationUrl).toContain("/code/remote?link=");
    expect(m.getState().status).toBe("linking");

    await waitFor(() => m.getState().status === "linked");
    expect(onLinked).toHaveBeenCalledTimes(1);
    expect(m.getState()).toMatchObject({ status: "linked", accountLabel: "Amit" });
    expect(states).toEqual(expect.arrayContaining(["linking", "linked"]));
    expect(existsSync(join(baseDir, "axeai-account-link.json"))).toBe(true);

    // Restart: the persisted link reloads.
    const { manager: reloaded } = makeManager(baseDir);
    manager?.dispose();
    manager = reloaded;
    expect(reloaded.getState()).toMatchObject({ status: "linked", accountLabel: "Amit" });
  });

  it("stops linking when the code expires on the server", async () => {
    stubFetch({
      "POST /api/code/link/start": { body: { code: "AX-EXPIRE", expiresIn: 600, pollAfterMs: 1 } },
      "GET /api/code/link/status": { body: { status: "expired" } },
    });
    const { manager: m } = makeManager(baseDir);
    manager = m;
    await m.startLink();
    await waitFor(() => m.getState().status === "signed-out");
    expect(m.isLinked()).toBe(false);
  });

  it("claims the desktop, persists relay credentials, and verifies connect tickets", async () => {
    stubFetch({
      "POST /api/code/link/start": { body: { code: "AX-CLAIM", expiresIn: 600, pollAfterMs: 1 } },
      "GET /api/code/link/status": { body: { status: "approved" } },
      "POST /api/code/link/exchange": {
        body: { token: "dev-token", account: { id: "user-1" } },
      },
      "POST /api/code/desktops/claim": {
        body: {
          desktopId: "desktop-test",
          relayUrl: "https://relay.axeai.com",
          relaySecret: "axr_secret",
        },
      },
      "POST /api/code/connect/verify": { body: { userId: "user-1", desktopId: "desktop-test" } },
    });
    const { manager: m } = makeManager(baseDir);
    manager = m;
    await m.startLink();
    await waitFor(() => m.getState().status === "linked");

    const creds = await m.ensureClaimed("http://192.168.1.2:49152");
    expect(creds).toEqual({
      relayUrl: "wss://relay.axeai.com/host",
      relaySecret: "axr_secret",
      desktopId: "desktop-test",
    });
    // Credentials persist for reconnect without another claim round-trip.
    expect(m.getRelayCredentials()).toEqual(creds);
    expect(await m.verifyConnectTicket("good-ticket")).toBe(true);
  });

  it("drops the link when the claim reports the desktop owned by another account", async () => {
    stubFetch({
      "POST /api/code/link/start": { body: { code: "AX-409", expiresIn: 600, pollAfterMs: 1 } },
      "GET /api/code/link/status": { body: { status: "approved" } },
      "POST /api/code/link/exchange": {
        body: { token: "dev-token", account: { id: "user-1" } },
      },
      "POST /api/code/desktops/claim": { status: 409, body: { error: "owned_by_other" } },
    });
    const { manager: m } = makeManager(baseDir);
    manager = m;
    await m.startLink();
    await waitFor(() => m.getState().status === "linked");

    expect(await m.ensureClaimed()).toBeNull();
    expect(m.getState().status).toBe("signed-out");
    expect(existsSync(join(baseDir, "axeai-account-link.json"))).toBe(false);
  });

  it("heartbeats while remote is active and drops the link on a 404 revoke", async () => {
    const calls = stubFetch({
      "POST /api/code/link/start": { body: { code: "AX-HB", expiresIn: 600, pollAfterMs: 1 } },
      "GET /api/code/link/status": { body: { status: "approved" } },
      "POST /api/code/link/exchange": {
        body: { token: "dev-token", account: { id: "user-1" } },
      },
      "POST /api/code/desktops/heartbeat": { status: 404, body: { error: "revoked" } },
    });
    const { manager: m } = makeManager(baseDir);
    manager = m;
    await m.startLink();
    await waitFor(() => m.getState().status === "linked");

    m.notifyRemoteActive("http://192.168.1.2:49152");
    await waitFor(() => m.getState().status === "signed-out");
    expect(calls.some((call) => call.url.includes("/api/code/desktops/heartbeat"))).toBe(true);
    expect(m.isLinked()).toBe(false);
  });

  it("sign-out clears state and the persisted file", async () => {
    stubFetch({
      "POST /api/code/link/start": { body: { code: "AX-OUT", expiresIn: 600, pollAfterMs: 1 } },
      "GET /api/code/link/status": { body: { status: "approved" } },
      "POST /api/code/link/exchange": {
        body: { token: "dev-token", account: { id: "user-1" } },
      },
    });
    const { manager: m } = makeManager(baseDir);
    manager = m;
    await m.startLink();
    await waitFor(() => m.getState().status === "linked");

    m.signOut();
    expect(m.getState().status).toBe("signed-out");
    expect(existsSync(join(baseDir, "axeai-account-link.json"))).toBe(false);
  });
});
