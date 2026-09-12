import { create } from "zustand";
import { readBridge } from "@/renderer/bridge";
import {
  CHANGELOG_URL,
  compareVersions,
  parseChangelogDocument,
  type ChangelogRelease,
} from "@/shared/changelog";
import { readStoredString, writeStoredString } from "@/renderer/utils/localStorage";
import {
  CHANGELOG_STORAGE_KEYS,
  migrateLegacyChangelogStorage,
} from "@/renderer/state/changelogPersistence";

const {
  seenVersion: SEEN_VERSION_KEY,
  acknowledgedVersion: ACK_VERSION_KEY,
  cache: CACHE_KEY,
} = CHANGELOG_STORAGE_KEYS;

if (typeof localStorage !== "undefined") migrateLegacyChangelogStorage(localStorage);

function currentAppVersion(): string {
  try {
    return readBridge().appVersion;
  } catch {
    return "0.0.0";
  }
}

/**
 * The newest release the user can have actually read right now: the latest entry
 * at or below the running version, never older than what they have already seen.
 * Crucially it does NOT jump to `current` when the notes for `current` have not
 * been published yet — leaving the seen marker behind is what lets a
 * late-arriving entry re-flag as unseen instead of being silently skipped.
 */
function advanceSeenVersion(
  releases: readonly ChangelogRelease[],
  current: string,
  prevSeen: string | null,
): string | null {
  let best = prevSeen;
  for (const release of releases) {
    if (compareVersions(release.version, current) > 0) continue;
    if (best === null || compareVersions(release.version, best) > 0) best = release.version;
  }
  return best;
}

/**
 * Acknowledge the running version: record it as acknowledged (clears the
 * version-bump flag) and advance the seen marker over any now-readable notes.
 * Persists both and returns the state patch.
 */
function acknowledgeCurrent(
  state: ChangelogState,
): Pick<ChangelogState, "lastSeenVersion" | "acknowledgedVersion"> {
  const current = currentAppVersion();
  const nextSeen = advanceSeenVersion(state.releases, current, state.lastSeenVersion);
  writeStoredString(ACK_VERSION_KEY, current);
  if (nextSeen !== null) writeStoredString(SEEN_VERSION_KEY, nextSeen);
  return { lastSeenVersion: nextSeen, acknowledgedVersion: current };
}

/**
 * The last successfully fetched changelog, so the app has content offline and
 * instantly on launch before {@link loadChangelog} refreshes it. Empty until
 * the first successful fetch — the changelog is not bundled in the app.
 */
function loadCachedReleases(): ChangelogRelease[] {
  const raw = readStoredString(CACHE_KEY);
  if (!raw) return [];
  try {
    return parseChangelogDocument(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

interface ChangelogState {
  /** Current releases, newest-first (cache → freshly fetched). Empty until first load. */
  releases: ChangelogRelease[];
  /**
   * Newest release version whose *content* the user has seen. Drives the
   * dialog's unread list and the late-content badge. `null` only until the first
   * launch initializes it (see {@link bootstrapSeenState}).
   */
  lastSeenVersion: string | null;
  /**
   * The app version the user last acknowledged in Settings → Changelog.
   * `null` only until the first launch initializes it.
   */
  acknowledgedVersion: string | null;
  /**
   * Fetch the changelog from the marketing site, validate it, cache it, and
   * apply it. Degrades silently when offline/unreachable — the cached (or empty)
   * list is kept.
   */
  loadChangelog: () => Promise<void>;
  /**
   * Called once on app mount. On a brand-new profile we silently catch the user
   * up to the current version.
   */
  bootstrapSeenState: () => void;
  /** Record the current version as seen, clearing the unseen flag. */
  markCurrentSeen: () => void;
}

// Dedupes concurrent loads — e.g. the launch fetch and opening Settings →
// Changelog at the same time share one request instead of both hitting the net.
let inFlightLoad: Promise<void> | null = null;

export const useChangelogStore = create<ChangelogState>((set) => ({
  releases: loadCachedReleases(),
  lastSeenVersion: readStoredString(SEEN_VERSION_KEY),
  acknowledgedVersion: readStoredString(ACK_VERSION_KEY),

  loadChangelog: () => {
    inFlightLoad ??= (async () => {
      try {
        const response = await fetch(CHANGELOG_URL);
        if (!response.ok) return;
        const releases = parseChangelogDocument(await response.json());
        if (!releases) return;
        writeStoredString(CACHE_KEY, JSON.stringify({ releases }));
        set({ releases });
      } catch {
        // Offline / unreachable / malformed — keep the cached (or empty) list.
      } finally {
        inFlightLoad = null;
      }
    })();
    return inFlightLoad;
  },

  bootstrapSeenState: () => {
    const current = currentAppVersion();
    const storedSeen = readStoredString(SEEN_VERSION_KEY);
    // Fresh profile: catch the user up to the current version so the next real
    // update is detected, and nothing is flagged on the very first launch.
    if (storedSeen === null) {
      writeStoredString(SEEN_VERSION_KEY, current);
      writeStoredString(ACK_VERSION_KEY, current);
      set({ lastSeenVersion: current, acknowledgedVersion: current });
      return;
    }
    // Existing profile upgrading into the acknowledged-version model: seed it
    // from the last-seen content version.
    if (readStoredString(ACK_VERSION_KEY) === null) {
      writeStoredString(ACK_VERSION_KEY, storedSeen);
      set({ acknowledgedVersion: storedSeen });
    }
  },

  markCurrentSeen: () => set((state) => acknowledgeCurrent(state)),
}));
