import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import { type AxeCodeChannel, resolveAxeCodeChannel } from "@/shared/channel";
import { resolveAxeCodeBaseDir } from "@/shared/axecodePaths";
import Database from "better-sqlite3";
import { resolveBetterSqliteNativeBindingOptions } from "./db/connection";

const MIGRATION_VERSION = 2;
const MIGRATION_MARKER_FILENAME = ".legacy-migration-v2.json";
const MIGRATION_REQUEST_SUFFIX = ".legacy-migration-request-v2";
const LEGACY_V1_MARKER_FILENAME = ".lightcode-migration-v1.json";

interface LegacySourceSpec {
  /** Marker bookkeeping tag and suffix for staging/backup directory names. */
  readonly tag: string;
  readonly dataDirName: string;
  readonly productName: string;
}

// Newest generation first: `.poracode` data supersedes `.lightcode` data.
const LEGACY_SOURCES: Record<AxeCodeChannel, readonly LegacySourceSpec[]> = {
  stable: [
    { tag: "poracode", dataDirName: ".poracode", productName: "Poracode" },
    { tag: "lightcode", dataDirName: ".lightcode", productName: "Lightcode" },
  ],
  nightly: [
    { tag: "poracode", dataDirName: ".poracode-nightly", productName: "Poracode Nightly" },
    { tag: "lightcode", dataDirName: ".lightcode-nightly", productName: "Lightcode Nightly" },
  ],
};

// Chromium's safeStorage keys macOS Keychain and Linux secret-store entries by
// app name, and every released generation initialized crypto under "Lightcode".
const LEGACY_PRODUCT_NAME: Record<AxeCodeChannel, string> = {
  stable: "Lightcode",
  nightly: "Lightcode Nightly",
};

const TRANSIENT_DATA_ROOT_ENTRIES = new Set([
  "server.lock",
  MIGRATION_MARKER_FILENAME,
  LEGACY_V1_MARKER_FILENAME,
  "state.sqlite",
  "state.sqlite-journal",
  "state.sqlite-shm",
  "state.sqlite-wal",
]);
const TRANSIENT_ELECTRON_ENTRIES = new Set([
  "lockfile",
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
]);

export interface LegacyDataMigrationOptions {
  readonly baseDir: string;
  readonly channel?: AxeCodeChannel;
  readonly electronUserDataDir?: string;
  readonly legacyElectronUserDataDir?: string;
  readonly legacyBaseDir?: string;
  readonly allowCustomDataRoot?: boolean;
}

export interface LegacyDataMigrationResult {
  readonly status: "migrated" | "already-complete" | "no-legacy-data" | "unavailable";
  readonly dataBackupPath?: string;
  readonly electronUserDataBackupPath?: string;
}

export interface LegacyDataMigrationRequestResult {
  readonly status: "scheduled" | "no-legacy-data" | "unavailable";
}

interface MigrationMarker {
  readonly version: number;
  readonly completedAt: string;
  readonly importedDataRoot: boolean;
  readonly importedElectronUserData: boolean;
  /** Generation tags consumed by this marker (v2+). */
  readonly importedSources?: readonly string[];
  readonly dataBackupPath?: string;
  readonly electronUserDataBackupPath?: string;
}

function normalizedPath(path: string): string {
  const resolved = resolve(path).replaceAll("\\", "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isDirectory(path: string | undefined): path is string {
  if (!path || !existsSync(path)) return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function markerPath(baseDir: string): string {
  return join(baseDir, MIGRATION_MARKER_FILENAME);
}

function requestPath(baseDir: string): string {
  return `${baseDir}${MIGRATION_REQUEST_SUFFIX}`;
}

function isDefaultDataRoot(baseDir: string, channel: AxeCodeChannel): boolean {
  return normalizedPath(baseDir) === normalizedPath(resolveAxeCodeBaseDir(channel));
}

function legacySourcesFor(channel: AxeCodeChannel): readonly LegacySourceSpec[] {
  return LEGACY_SOURCES[channel];
}

/** Sources a prior migration already consumed and must never be re-imported. */
function consumedSources(marker: MigrationMarker | null): ReadonlySet<string> {
  if (!marker) return new Set();
  if (marker.version >= MIGRATION_VERSION) return new Set(marker.importedSources ?? []);
  // v1 markers predate the Poracode generation: they recorded only whether the
  // Lightcode data root was imported.
  return marker.importedDataRoot ? new Set(["lightcode"]) : new Set();
}

interface ResolvedLegacySource {
  readonly spec: LegacySourceSpec;
  readonly dataDir: string;
}

/**
 * Pick the newest legacy generation with data on disk that no prior migration
 * consumed. A `legacyBaseDir` override always wins and is reported under the
 * "custom" tag so it never marks a real generation as consumed.
 */
function resolveLegacySource(
  channel: AxeCodeChannel,
  override: string | undefined,
  consumed: ReadonlySet<string>,
  baseDir: string,
): ResolvedLegacySource | undefined {
  if (override) {
    if (normalizedPath(override) === normalizedPath(baseDir)) return undefined;
    return {
      spec: { tag: "custom", dataDirName: override, productName: override },
      dataDir: override,
    };
  }
  for (const spec of legacySourcesFor(channel)) {
    if (consumed.has(spec.tag)) continue;
    const candidate = join(homedir(), spec.dataDirName);
    if (normalizedPath(candidate) === normalizedPath(baseDir)) continue;
    if (isDirectory(candidate)) return { spec, dataDir: candidate };
  }
  return undefined;
}

export function legacyProductNameFor(channel: AxeCodeChannel): string {
  return LEGACY_PRODUCT_NAME[channel];
}

function uniqueBackupPath(targetDir: string, sourceTag: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `${targetDir}.before-${sourceTag}-import-${timestamp}`;
  let candidate = prefix;
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = `${prefix}-${suffix}`;
    suffix++;
  }
  return candidate;
}

function hasLiveServerLock(dataDir: string): boolean {
  const lockPath = join(dataDir, "server.lock");
  if (!existsSync(lockPath)) return false;
  try {
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function assertDataRootAvailable(dataDir: string): void {
  if (hasLiveServerLock(dataDir)) {
    throw new Error(`Cannot migrate data while a server is using ${dataDir}.`);
  }
}

function topLevelEntry(sourceDir: string, sourcePath: string): string | undefined {
  const rel = relative(sourceDir, sourcePath);
  if (!rel) return undefined;
  return rel.split(/[\\/]/, 1)[0];
}

function replaceDirectoryFromLegacy(
  sourceDir: string,
  targetDir: string,
  transientEntries: ReadonlySet<string>,
  sourceTag: string,
  prepareStaging?: (stagingDir: string) => void,
): string | undefined {
  const stagingDir = `${targetDir}.importing-${sourceTag}`;
  let backupDir: string | undefined;

  rmSync(stagingDir, { recursive: true, force: true });
  try {
    cpSync(sourceDir, stagingDir, {
      recursive: true,
      preserveTimestamps: true,
      filter: (sourcePath) => {
        const entry = topLevelEntry(sourceDir, sourcePath);
        return entry === undefined || !transientEntries.has(entry);
      },
    });
    prepareStaging?.(stagingDir);

    if (existsSync(targetDir)) {
      backupDir = uniqueBackupPath(targetDir, sourceTag);
      renameSync(targetDir, backupDir);
    }

    try {
      renameSync(stagingDir, targetDir);
    } catch (error) {
      if (backupDir && !existsSync(targetDir) && existsSync(backupDir)) {
        renameSync(backupDir, targetDir);
      }
      throw error;
    }
    return backupDir;
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function restoreReplacedDirectory(targetDir: string, backupDir: string | undefined): void {
  rmSync(targetDir, { recursive: true, force: true });
  if (backupDir && existsSync(backupDir)) renameSync(backupDir, targetDir);
}

function quoteSqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Create a transactionally consistent copy even when the source DB is in WAL mode. */
function snapshotLegacyDatabase(sourceDir: string, stagingDir: string): void {
  const sourcePath = join(sourceDir, "state.sqlite");
  if (!existsSync(sourcePath)) return;

  const destinationPath = join(stagingDir, "state.sqlite");
  const database = new Database(sourcePath, {
    ...resolveBetterSqliteNativeBindingOptions(),
    readonly: true,
    fileMustExist: true,
  });
  try {
    database.exec(`VACUUM INTO ${quoteSqliteString(destinationPath)}`);
  } finally {
    database.close();
  }
}

function writeMigrationMarker(baseDir: string, marker: MigrationMarker): void {
  mkdirSync(baseDir, { recursive: true });
  writeFileAtomic(markerPath(baseDir), `${JSON.stringify(marker, null, 2)}\n`, {
    encoding: "utf8",
  });
}

function removeMigrationRequest(baseDir: string): void {
  rmSync(requestPath(baseDir), { force: true });
}

export function resolveLegacyElectronUserDataDir(
  electronUserDataDir: string,
  channel: AxeCodeChannel = resolveAxeCodeChannel(),
  isDev = false,
): string {
  const currentProductDir = isDev ? dirname(electronUserDataDir) : electronUserDataDir;
  const mapCandidate = (productName: string): string => {
    const legacyProductDir = join(dirname(currentProductDir), productName);
    return isDev ? join(legacyProductDir, basename(electronUserDataDir)) : legacyProductDir;
  };
  // Newest generation first so a Poracode-era install wins over a stale
  // Lightcode directory when both happen to exist.
  const candidates = legacySourcesFor(channel).map((spec) => mapCandidate(spec.productName));
  return candidates.find((candidate) => isDirectory(candidate)) ?? candidates[0]!;
}

export function migrateLegacyDataOnLaunch(
  options: LegacyDataMigrationOptions,
): LegacyDataMigrationResult {
  const channel = options.channel ?? resolveAxeCodeChannel();
  if (!options.allowCustomDataRoot && !isDefaultDataRoot(options.baseDir, channel)) {
    return { status: "unavailable" };
  }

  const requested = existsSync(requestPath(options.baseDir));
  const priorMarker = readLegacyDataMigrationMarker(options.baseDir);
  if (!requested && priorMarker && priorMarker.version >= MIGRATION_VERSION) {
    return { status: "already-complete" };
  }

  // An explicit Settings request re-imports even generations a prior marker
  // consumed; automatic launches never re-import consumed sources.
  const consumed = requested ? new Set<string>() : consumedSources(priorMarker);
  const electronConsumed = !requested && priorMarker?.importedElectronUserData === true;
  const source = resolveLegacySource(channel, options.legacyBaseDir, consumed, options.baseDir);
  const importDataRoot = source !== undefined && isDirectory(source.dataDir);
  const importElectronUserData =
    !electronConsumed &&
    isDirectory(options.legacyElectronUserDataDir) &&
    options.electronUserDataDir !== undefined &&
    normalizedPath(options.legacyElectronUserDataDir) !==
      normalizedPath(options.electronUserDataDir);

  if (!importDataRoot && !importElectronUserData) {
    removeMigrationRequest(options.baseDir);
    if (!requested) {
      writeMigrationMarker(options.baseDir, {
        version: MIGRATION_VERSION,
        completedAt: new Date().toISOString(),
        importedDataRoot: false,
        importedElectronUserData: false,
        importedSources: [...consumed],
      });
    }
    return { status: "no-legacy-data" };
  }

  if (importDataRoot) {
    assertDataRootAvailable(source.dataDir);
    if (isDirectory(options.baseDir)) assertDataRootAvailable(options.baseDir);
  }

  let electronUserDataImported = false;
  let dataImported = false;
  let electronUserDataBackupPath: string | undefined;
  let dataBackupPath: string | undefined;
  try {
    if (importElectronUserData) {
      electronUserDataBackupPath = replaceDirectoryFromLegacy(
        options.legacyElectronUserDataDir,
        options.electronUserDataDir!,
        TRANSIENT_ELECTRON_ENTRIES,
        source?.spec.tag ?? "legacy",
      );
      electronUserDataImported = true;
    }

    if (importDataRoot) {
      dataBackupPath = replaceDirectoryFromLegacy(
        source.dataDir,
        options.baseDir,
        TRANSIENT_DATA_ROOT_ENTRIES,
        source.spec.tag,
        (stagingDir) => snapshotLegacyDatabase(source.dataDir, stagingDir),
      );
      dataImported = true;
    }

    writeMigrationMarker(options.baseDir, {
      version: MIGRATION_VERSION,
      completedAt: new Date().toISOString(),
      importedDataRoot: importDataRoot,
      importedElectronUserData:
        importElectronUserData || priorMarker?.importedElectronUserData === true,
      importedSources: [
        ...consumed,
        ...(importDataRoot && source.spec.tag !== "custom" ? [source.spec.tag] : []),
      ],
      ...(dataBackupPath ? { dataBackupPath } : {}),
      ...(electronUserDataBackupPath ? { electronUserDataBackupPath } : {}),
    });
    removeMigrationRequest(options.baseDir);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (dataImported) {
      try {
        restoreReplacedDirectory(options.baseDir, dataBackupPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (electronUserDataImported) {
      try {
        restoreReplacedDirectory(options.electronUserDataDir!, electronUserDataBackupPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      const details = rollbackErrors
        .map((rollbackError) =>
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        )
        .join("; ");
      throw new Error(
        `Legacy data import failed and AxeCode data could not be fully restored: ${details}`,
        { cause: error },
      );
    }
    throw error;
  }

  return {
    status: "migrated",
    ...(dataBackupPath ? { dataBackupPath } : {}),
    ...(electronUserDataBackupPath ? { electronUserDataBackupPath } : {}),
  };
}

export function requestLegacyDataMigration(
  options: LegacyDataMigrationOptions,
): LegacyDataMigrationRequestResult {
  const channel = options.channel ?? resolveAxeCodeChannel();
  if (!options.allowCustomDataRoot && !isDefaultDataRoot(options.baseDir, channel)) {
    return { status: "unavailable" };
  }

  const source = resolveLegacySource(channel, options.legacyBaseDir, new Set(), options.baseDir);
  const hasLegacyData =
    (source !== undefined && isDirectory(source.dataDir)) ||
    (isDirectory(options.legacyElectronUserDataDir) &&
      options.electronUserDataDir !== undefined &&
      normalizedPath(options.legacyElectronUserDataDir) !==
        normalizedPath(options.electronUserDataDir));
  if (!hasLegacyData) return { status: "no-legacy-data" };

  writeFileAtomic(
    requestPath(options.baseDir),
    `${JSON.stringify({ version: MIGRATION_VERSION, requestedAt: new Date().toISOString() })}\n`,
    { encoding: "utf8" },
  );
  return { status: "scheduled" };
}

export function readLegacyDataMigrationMarker(baseDir: string): MigrationMarker | null {
  for (const filename of [MIGRATION_MARKER_FILENAME, LEGACY_V1_MARKER_FILENAME]) {
    try {
      return JSON.parse(readFileSync(join(baseDir, filename), "utf8")) as MigrationMarker;
    } catch {
      // Try the older marker name next.
    }
  }
  return null;
}
