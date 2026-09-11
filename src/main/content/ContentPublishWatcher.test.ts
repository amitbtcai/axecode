import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SharedSettings } from "@/shared/settings";
import { closeDatabase, initDatabase } from "../db/connection";
import { dbCreateContentCard, dbGetContentCard, dbUpdateContentCard } from "../db/contentCards";
import { dbGetProject, dbGetThread, dbUpsertProject, dbUpsertThread } from "../db/projectsThreads";
import { ContentPublishWatcher } from "./ContentPublishWatcher";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBindingEnv: string | undefined;
let sqliteAvailable = true;
try {
  new Database(":memory:").close();
} catch {
  if (existsSync(serverNativeBinding)) {
    nativeBindingEnv = serverNativeBinding;
  } else {
    sqliteAvailable = false;
  }
}

const agentStatuses = {
  windows: [
    {
      kind: "claude",
      installed: true,
      capabilities: { models: [{ id: "default" }], modelEfforts: {}, efforts: [] },
    },
  ],
  wsl: [],
  fromCache: false,
};

describe.skipIf(!sqliteAvailable)("ContentPublishWatcher", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "axecode-publish-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Axe Code",
        location: { kind: "posix", path: "/repo" },
        createdAt: "2026-07-25T00:00:00.000Z",
      },
      0,
    );
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function makeWatcher(startThread: (payload: unknown) => Promise<unknown>) {
    return new ContentPublishWatcher({
      startThread,
      getAgentStatuses: async () => agentStatuses as never,
      sendThreadCommand: () => true,
      ensureHomeProject: () => dbGetProject("project-1")!,
      getProject: dbGetProject,
      getSharedSettings: () =>
        ({
          mcpServers: [],
          globalServers: [],
          disabledBuiltInMcpServers: {},
          disabledBuiltInMcpTools: {},
        }) as unknown as SharedSettings,
      upsertThread: (thread, sortOrder) => dbUpsertThread(thread, sortOrder),
      threadExists: (id) => dbGetThread(id) != null,
    });
  }

  it("launches a publish thread for a due card and claims it", async () => {
    const card = dbCreateContentCard({ channel: "x", title: "Launch", body: "hello world" });
    dbUpdateContentCard(card.id, {
      status: "scheduled",
      scheduledFor: "2020-01-01T00:00:00.000Z",
    });

    const launches: { prompt: string; threadId: string }[] = [];
    const watcher = makeWatcher(async (payload) => {
      launches.push(payload as { prompt: string; threadId: string });
      return {};
    });
    watcher.tick();
    await watcher.drain();

    expect(launches).toHaveLength(1);
    expect(launches[0]!.prompt).toContain("hello world");
    expect(launches[0]!.prompt).toContain(card.id);

    const updated = dbGetContentCard(card.id)!;
    expect(updated.scheduledFor).toBeNull();
    expect(updated.sourceThreadId).toBe(launches[0]!.threadId);
    expect(dbGetThread(updated.sourceThreadId!)?.title).toBe("Publish: Launch");

    // Next tick must not refire — the claim cleared the due time.
    watcher.tick();
    await watcher.drain();
    expect(launches).toHaveLength(1);
  });

  it("leaves not-yet-due cards alone", async () => {
    const card = dbCreateContentCard({ channel: "x", title: "Later", body: "" });
    dbUpdateContentCard(card.id, {
      status: "scheduled",
      scheduledFor: "2999-01-01T00:00:00.000Z",
    });
    const launches: unknown[] = [];
    const watcher = makeWatcher(async (payload) => {
      launches.push(payload);
      return {};
    });
    watcher.tick();
    await watcher.drain();
    expect(launches).toHaveLength(0);
    expect(dbGetContentCard(card.id)!.scheduledFor).toBe("2999-01-01T00:00:00.000Z");
  });

  it("records publishError when the launch fails", async () => {
    const card = dbCreateContentCard({ channel: "x", title: "Boom", body: "" });
    dbUpdateContentCard(card.id, {
      status: "scheduled",
      scheduledFor: "2020-01-01T00:00:00.000Z",
    });
    const watcher = makeWatcher(async () => {
      throw new Error("supervisor down");
    });
    watcher.tick();
    await watcher.drain();
    expect(dbGetContentCard(card.id)!.publishError).toBe("supervisor down");
  });
});
