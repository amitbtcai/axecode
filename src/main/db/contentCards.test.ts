import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  dbCreateContentCard,
  dbDeleteContentCard,
  dbGetContentCard,
  dbGetContentCards,
  dbUpdateContentCard,
} from "./contentCards";
import { dbUpsertProject } from "./projectsThreads";

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

describe.skipIf(!sqliteAvailable)("contentCards (real sqlite round-trip)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "axecode-content-cards-"));
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

  it("creates, reads, updates, filters, and deletes cards", () => {
    const card = dbCreateContentCard({
      channel: "writer",
      title: "Why devs hate frameworks",
      body: "# Draft body",
      projectId: "project-1",
      sourceThreadId: "thread-1",
    });
    expect(card.status).toBe("draft");
    expect(dbGetContentCard(card.id)).toEqual(card);

    const updated = dbUpdateContentCard(card.id, {
      status: "approved",
      scheduledFor: "2026-09-20T14:00:00.000Z",
    });
    expect(updated?.status).toBe("approved");
    expect(updated?.scheduledFor).toBe("2026-09-20T14:00:00.000Z");

    dbCreateContentCard({ channel: "x", title: "Post", body: "" });
    expect(dbGetContentCards({ status: "approved" })).toHaveLength(1);
    expect(dbGetContentCards({ channel: "x" })).toHaveLength(1);
    expect(dbGetContentCards({ projectId: "project-1" })).toHaveLength(1);
    expect(dbGetContentCards({})).toHaveLength(2);

    dbDeleteContentCard(card.id);
    expect(dbGetContentCard(card.id)).toBeNull();
  });

  it("round-trips media attachments and the rich body doc", () => {
    const card = dbCreateContentCard({ channel: "x", title: "Post", body: "" });
    expect(card.media).toEqual([]);
    expect(card.bodyDoc).toBeNull();

    const media = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "image" as const,
        name: "thumb.png",
        path: "/tmp/thumb.png",
      },
    ];
    const bodyDoc = { type: "doc", content: [{ type: "paragraph" }] };
    const updated = dbUpdateContentCard(card.id, { media, bodyDoc });
    expect(updated?.media).toEqual(media);
    expect(updated?.bodyDoc).toEqual(bodyDoc);
  });

  it("records publish outcome fields", () => {
    const card = dbCreateContentCard({ channel: "x", title: "Launch post", body: "text" });
    const published = dbUpdateContentCard(card.id, {
      status: "published",
      publishUrl: "https://x.com/acct/status/1",
      publishError: null,
    });
    expect(published?.publishUrl).toBe("https://x.com/acct/status/1");
    const failed = dbUpdateContentCard(card.id, { publishError: "not logged in" });
    expect(failed?.publishError).toBe("not logged in");
  });

  it("cascades when the project row is deleted", () => {
    const card = dbCreateContentCard({
      channel: "seo",
      title: "Keyword post",
      body: "",
      projectId: "project-1",
    });
    getSqlite().prepare("DELETE FROM projects WHERE id = ?").run("project-1");
    expect(dbGetContentCard(card.id)).toBeNull();
  });
});
