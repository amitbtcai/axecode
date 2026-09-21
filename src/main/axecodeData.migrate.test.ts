import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbCtx = vi.hoisted(() => ({ failSnapshot: false }));
vi.mock("better-sqlite3", async () => {
  const { copyFileSync } = await import("node:fs");
  return {
    default: class TestDatabase {
      constructor(private readonly path: string) {}
      exec(sql: string): void {
        if (dbCtx.failSnapshot) throw new Error("snapshot failed");
        const match = /^VACUUM INTO '(.+)'$/.exec(sql);
        if (!match?.[1]) throw new Error(`Unexpected test SQL: ${sql}`);
        copyFileSync(this.path, match[1].replaceAll("''", "'"));
      }
      close(): void {}
    },
  };
});

const ctx = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => ctx.home };
});

import {
  migrateLegacyDataOnLaunch,
  legacyProductNameFor,
  readLegacyDataMigrationMarker,
  requestLegacyDataMigration,
  resolveLegacyElectronUserDataDir,
} from "./legacyDataMigration";
import { prepareAxeCodeDataRoot } from "./axecodeData";

describe("complete legacy data migration", () => {
  beforeEach(() => {
    ctx.home = mkdtempSync(join(tmpdir(), "axecode-migrate-"));
    dbCtx.failSnapshot = false;
  });

  afterEach(() => {
    rmSync(ctx.home, { recursive: true, force: true });
  });

  const legacyDir = () => join(ctx.home, ".lightcode");
  const newDir = () => join(ctx.home, ".axecode");
  const legacyElectronDir = () => join(ctx.home, "AppData", "Lightcode");
  const newElectronDir = () => join(ctx.home, "AppData", "Axe Code");

  function seedLegacyData(): void {
    mkdirSync(join(legacyDir(), "claude-profiles"), { recursive: true });
    mkdirSync(join(legacyDir(), "worktrees", "repo", "branch"), { recursive: true });
    mkdirSync(join(legacyDir(), "attachments", "thread-1"), { recursive: true });
    mkdirSync(join(legacyDir(), "cache"), { recursive: true });
    mkdirSync(join(legacyDir(), "logs"), { recursive: true });
    writeFileSync(join(legacyDir(), "settings.json"), '{"theme":"dark"}');
    writeFileSync(join(legacyDir(), "state.sqlite"), "db-bytes");
    writeFileSync(join(legacyDir(), "keybindings.json"), "{}");
    writeFileSync(join(legacyDir(), "secret-key.safe"), "secret");
    writeFileSync(join(legacyDir(), "claude-profiles", "default.json"), "{}");
    writeFileSync(join(legacyDir(), "worktrees", "repo", "branch", "user-file"), "work");
    writeFileSync(join(legacyDir(), "attachments", "thread-1", "image.png"), "image");
    writeFileSync(join(legacyDir(), "cache", "blob"), "cache");
    writeFileSync(join(legacyDir(), "logs", "app.log"), "log");
    writeFileSync(join(legacyDir(), "server.lock"), "stale-lock");

    mkdirSync(join(legacyElectronDir(), "Local Storage"), { recursive: true });
    mkdirSync(join(legacyElectronDir(), "IndexedDB"), { recursive: true });
    mkdirSync(join(legacyElectronDir(), "Partitions", "persist_lightcode-browser"), {
      recursive: true,
    });
    writeFileSync(join(legacyElectronDir(), "Local Storage", "leveldb"), "local-storage");
    writeFileSync(join(legacyElectronDir(), "IndexedDB", "db"), "indexed-db");
    writeFileSync(
      join(legacyElectronDir(), "Partitions", "persist_lightcode-browser", "Cookies"),
      "cookies",
    );
    writeFileSync(join(legacyElectronDir(), "lockfile"), "stale-lock");
  }

  function migrationOptions() {
    return {
      channel: "stable" as const,
      electronUserDataDir: newElectronDir(),
      legacyElectronUserDataDir: legacyElectronDir(),
    };
  }

  it("copies every user-data subtree plus Electron storage and keeps the Lightcode source", () => {
    seedLegacyData();

    prepareAxeCodeDataRoot(undefined, migrationOptions());

    expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe('{"theme":"dark"}');
    expect(readFileSync(join(newDir(), "state.sqlite"), "utf8")).toBe("db-bytes");
    expect(readFileSync(join(newDir(), "secret-key.safe"), "utf8")).toBe("secret");
    expect(readFileSync(join(newDir(), "worktrees", "repo", "branch", "user-file"), "utf8")).toBe(
      "work",
    );
    expect(readFileSync(join(newDir(), "attachments", "thread-1", "image.png"), "utf8")).toBe(
      "image",
    );
    expect(readFileSync(join(newDir(), "cache", "blob"), "utf8")).toBe("cache");
    expect(readFileSync(join(newDir(), "logs", "app.log"), "utf8")).toBe("log");
    expect(existsSync(join(newDir(), "server.lock"))).toBe(false);

    expect(readFileSync(join(newElectronDir(), "Local Storage", "leveldb"), "utf8")).toBe(
      "local-storage",
    );
    expect(readFileSync(join(newElectronDir(), "IndexedDB", "db"), "utf8")).toBe("indexed-db");
    expect(
      readFileSync(
        join(newElectronDir(), "Partitions", "persist_lightcode-browser", "Cookies"),
        "utf8",
      ),
    ).toBe("cookies");
    expect(existsSync(join(newElectronDir(), "lockfile"))).toBe(false);

    expect(readFileSync(join(legacyDir(), "settings.json"), "utf8")).toBe('{"theme":"dark"}');
    expect(readFileSync(join(legacyElectronDir(), "IndexedDB", "db"), "utf8")).toBe("indexed-db");
    expect(readLegacyDataMigrationMarker(newDir())).toMatchObject({
      version: 2,
      importedDataRoot: true,
      importedElectronUserData: true,
      importedSources: ["lightcode"],
    });
  });

  it("runs automatically only once", () => {
    seedLegacyData();
    prepareAxeCodeDataRoot(undefined, migrationOptions());
    writeFileSync(join(legacyDir(), "settings.json"), '{"theme":"light"}');

    prepareAxeCodeDataRoot(undefined, migrationOptions());

    expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe('{"theme":"dark"}');
  });

  it("backs up an existing AxeCode directory before the one-time import", () => {
    seedLegacyData();
    mkdirSync(newDir(), { recursive: true });
    writeFileSync(join(newDir(), "axecode-only.txt"), "keep-me");

    const result = migrateLegacyDataOnLaunch({ baseDir: newDir(), ...migrationOptions() });

    expect(result.status).toBe("migrated");
    expect(result.dataBackupPath).toBeDefined();
    expect(readFileSync(join(result.dataBackupPath!, "axecode-only.txt"), "utf8")).toBe("keep-me");
    expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe('{"theme":"dark"}');
  });

  it("lets Settings request a complete import again and backs up current AxeCode data", () => {
    seedLegacyData();
    prepareAxeCodeDataRoot(undefined, migrationOptions());
    writeFileSync(join(newDir(), "axecode-only.txt"), "new-data");
    writeFileSync(join(newElectronDir(), "axecode-only.txt"), "new-browser-data");
    writeFileSync(join(legacyDir(), "settings.json"), '{"theme":"light"}');
    writeFileSync(join(legacyElectronDir(), "IndexedDB", "db"), "updated-indexed-db");

    expect(requestLegacyDataMigration({ baseDir: newDir(), ...migrationOptions() })).toEqual({
      status: "scheduled",
    });
    const result = migrateLegacyDataOnLaunch({ baseDir: newDir(), ...migrationOptions() });

    expect(result.status).toBe("migrated");
    expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe('{"theme":"light"}');
    expect(readFileSync(join(result.dataBackupPath!, "axecode-only.txt"), "utf8")).toBe("new-data");
    expect(readFileSync(join(newElectronDir(), "IndexedDB", "db"), "utf8")).toBe(
      "updated-indexed-db",
    );
    expect(readFileSync(join(result.electronUserDataBackupPath!, "axecode-only.txt"), "utf8")).toBe(
      "new-browser-data",
    );
  });

  it("records a completed no-data check and reports no source for a manual request", () => {
    prepareAxeCodeDataRoot(undefined, migrationOptions());

    expect(readLegacyDataMigrationMarker(newDir())).toMatchObject({
      importedDataRoot: false,
      importedElectronUserData: false,
    });
    expect(requestLegacyDataMigration({ baseDir: newDir(), ...migrationOptions() })).toEqual({
      status: "no-legacy-data",
    });
  });

  it("does not import into a custom data root", () => {
    seedLegacyData();
    const customDir = join(ctx.home, "custom-data");

    expect(migrateLegacyDataOnLaunch({ baseDir: customDir, ...migrationOptions() })).toEqual({
      status: "unavailable",
    });
    expect(requestLegacyDataMigration({ baseDir: customDir, ...migrationOptions() })).toEqual({
      status: "unavailable",
    });
    expect(existsSync(customDir)).toBe(false);
  });

  it("imports into an explicitly allowed custom data root for an installed desktop", () => {
    seedLegacyData();
    const customDir = join(ctx.home, "custom-data");
    const customOptions = {
      baseDir: customDir,
      ...migrationOptions(),
      allowCustomDataRoot: true,
    };

    expect(requestLegacyDataMigration(customOptions)).toEqual({ status: "scheduled" });
    expect(migrateLegacyDataOnLaunch(customOptions)).toMatchObject({ status: "migrated" });

    expect(readFileSync(join(customDir, "settings.json"), "utf8")).toBe('{"theme":"dark"}');
    expect(readFileSync(join(newElectronDir(), "IndexedDB", "db"), "utf8")).toBe("indexed-db");
  });

  it("imports from Lightcode's legacy custom data root when configured", () => {
    seedLegacyData();
    const legacyCustomDir = join(ctx.home, "legacy-custom-data");
    const axecodeCustomDir = join(ctx.home, "axecode-custom-data");
    renameSync(legacyDir(), legacyCustomDir);

    const result = migrateLegacyDataOnLaunch({
      baseDir: axecodeCustomDir,
      ...migrationOptions(),
      legacyBaseDir: legacyCustomDir,
      allowCustomDataRoot: true,
    });

    expect(result.status).toBe("migrated");
    expect(readFileSync(join(axecodeCustomDir, "settings.json"), "utf8")).toBe('{"theme":"dark"}');
    expect(readFileSync(join(legacyCustomDir, "settings.json"), "utf8")).toBe('{"theme":"dark"}');
  });

  it("does not replace a custom data root that is already the legacy source", () => {
    seedLegacyData();

    expect(
      migrateLegacyDataOnLaunch({
        baseDir: legacyDir(),
        ...migrationOptions(),
        legacyBaseDir: legacyDir(),
        allowCustomDataRoot: true,
      }),
    ).toMatchObject({ status: "migrated" });

    expect(readFileSync(join(legacyDir(), "settings.json"), "utf8")).toBe('{"theme":"dark"}');
  });

  it("clears a stale staging directory before retrying", () => {
    seedLegacyData();
    const stagingDir = `${newDir()}.importing-lightcode`;
    mkdirSync(stagingDir, { recursive: true });
    writeFileSync(join(stagingDir, "partial-junk"), "junk");

    prepareAxeCodeDataRoot(undefined, migrationOptions());

    expect(existsSync(join(newDir(), "partial-junk"))).toBe(false);
    expect(existsSync(stagingDir)).toBe(false);
  });

  it("does not replace data while a headless server is using the destination", () => {
    seedLegacyData();
    mkdirSync(newDir(), { recursive: true });
    writeFileSync(join(newDir(), "server.lock"), String(process.pid));
    writeFileSync(join(newDir(), "axecode-only.txt"), "keep-me");

    expect(() => migrateLegacyDataOnLaunch({ baseDir: newDir(), ...migrationOptions() })).toThrow(
      "Cannot migrate data while a server is using",
    );
    expect(readFileSync(join(newDir(), "axecode-only.txt"), "utf8")).toBe("keep-me");
    expect(existsSync(join(newDir(), "settings.json"))).toBe(false);
    expect(existsSync(newElectronDir())).toBe(false);
  });

  it("restores both AxeCode data locations when a later import step fails", () => {
    seedLegacyData();
    mkdirSync(newDir(), { recursive: true });
    mkdirSync(newElectronDir(), { recursive: true });
    writeFileSync(join(newDir(), "axecode-only.txt"), "current-data");
    writeFileSync(join(newElectronDir(), "axecode-only.txt"), "current-browser-data");
    dbCtx.failSnapshot = true;

    expect(() => migrateLegacyDataOnLaunch({ baseDir: newDir(), ...migrationOptions() })).toThrow(
      "snapshot failed",
    );

    expect(readFileSync(join(newDir(), "axecode-only.txt"), "utf8")).toBe("current-data");
    expect(readFileSync(join(newElectronDir(), "axecode-only.txt"), "utf8")).toBe(
      "current-browser-data",
    );
    expect(existsSync(join(newElectronDir(), "IndexedDB"))).toBe(false);
    expect(readFileSync(join(legacyElectronDir(), "IndexedDB", "db"), "utf8")).toBe("indexed-db");
  });

  it("derives the legacy Electron directory, preferring the newest generation that exists", () => {
    // safeStorage still initializes under the original crypto identity.
    expect(legacyProductNameFor("stable")).toBe("Lightcode");
    expect(legacyProductNameFor("nightly")).toBe("Lightcode Nightly");

    const cfg = join(ctx.home, ".config");
    // Nothing on disk: report the newest generation's would-be path.
    expect(resolveLegacyElectronUserDataDir(join(cfg, "AxeCode"), "stable")).toBe(
      join(cfg, "Poracode"),
    );
    expect(resolveLegacyElectronUserDataDir(join(cfg, "AxeCode Nightly"), "nightly")).toBe(
      join(cfg, "Poracode Nightly"),
    );
    expect(resolveLegacyElectronUserDataDir(join(cfg, "AxeCode", "Dev"), "stable", true)).toBe(
      join(cfg, "Poracode", "Dev"),
    );

    // A stale Lightcode dir resolves when no Poracode dir exists.
    mkdirSync(join(cfg, "Lightcode"), { recursive: true });
    expect(resolveLegacyElectronUserDataDir(join(cfg, "AxeCode"), "stable")).toBe(
      join(cfg, "Lightcode"),
    );

    // Poracode wins when both generations are present.
    mkdirSync(join(cfg, "Poracode"), { recursive: true });
    expect(resolveLegacyElectronUserDataDir(join(cfg, "AxeCode"), "stable")).toBe(
      join(cfg, "Poracode"),
    );
  });

  describe("Poracode generation", () => {
    const poracodeDir = () => join(ctx.home, ".poracode");

    function seedPoracodeData(): void {
      mkdirSync(join(poracodeDir(), "attachments", "thread-9"), { recursive: true });
      writeFileSync(join(poracodeDir(), "settings.json"), '{"theme":"poradark"}');
      writeFileSync(join(poracodeDir(), "state.sqlite"), "pora-db");
      writeFileSync(join(poracodeDir(), "keybindings.json"), "{}");
      writeFileSync(join(poracodeDir(), "attachments", "thread-9", "shot.png"), "shot");
      writeFileSync(join(poracodeDir(), "server.lock"), "stale-lock");
    }

    it("imports .poracode data and records the consumed generation", () => {
      seedPoracodeData();

      const result = migrateLegacyDataOnLaunch({ baseDir: newDir(), ...migrationOptions() });

      expect(result.status).toBe("migrated");
      expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe('{"theme":"poradark"}');
      expect(readFileSync(join(newDir(), "attachments", "thread-9", "shot.png"), "utf8")).toBe(
        "shot",
      );
      expect(readFileSync(join(poracodeDir(), "settings.json"), "utf8")).toBe(
        '{"theme":"poradark"}',
      );
      expect(readLegacyDataMigrationMarker(newDir())).toMatchObject({
        version: 2,
        importedDataRoot: true,
        importedSources: ["poracode"],
      });
    });

    it("prefers .poracode over .lightcode when both generations exist", () => {
      seedPoracodeData();
      seedLegacyData();

      prepareAxeCodeDataRoot(undefined, migrationOptions());

      expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe('{"theme":"poradark"}');
    });

    it("still imports .poracode after a v1 marker recorded no legacy data", () => {
      // Reproduces machines where an AxeCode build ran before Poracode data was
      // recognized: v1 said "nothing to import" while ~/.poracode held threads.
      seedPoracodeData();
      mkdirSync(newDir(), { recursive: true });
      writeFileSync(
        join(newDir(), ".lightcode-migration-v1.json"),
        JSON.stringify({ version: 1, importedDataRoot: false, importedElectronUserData: false }),
      );

      const result = migrateLegacyDataOnLaunch({ baseDir: newDir(), ...migrationOptions() });

      expect(result.status).toBe("migrated");
      expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe('{"theme":"poradark"}');
      // The stale v1 marker must not survive into the imported data root.
      expect(existsSync(join(newDir(), ".lightcode-migration-v1.json"))).toBe(false);
      expect(readLegacyDataMigrationMarker(newDir())).toMatchObject({ version: 2 });
    });

    it("does not re-import .lightcode on machines that already consumed it at v1", () => {
      seedLegacyData();
      prepareAxeCodeDataRoot(undefined, migrationOptions());
      // Simulate the v1 outcome: lightcode was imported, the source dir remains.
      writeFileSync(
        join(newDir(), ".lightcode-migration-v1.json"),
        JSON.stringify({ version: 1, importedDataRoot: true, importedElectronUserData: true }),
      );
      rmSync(join(newDir(), ".legacy-migration-v2.json"), { force: true });
      writeFileSync(join(legacyDir(), "settings.json"), '{"theme":"stale"}');

      const result = migrateLegacyDataOnLaunch({ baseDir: newDir(), ...migrationOptions() });

      expect(result.status).toBe("no-legacy-data");
      expect(readFileSync(join(newDir(), "settings.json"), "utf8")).toBe('{"theme":"dark"}');
    });
  });
});
