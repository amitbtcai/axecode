#!/usr/bin/env node
// Semi-automatic upstream sync.
//
// Implements the runbook in FORK.md ("Syncing with upstream"): it performs the
// mechanical parts of `git merge upstream/master` and stops the moment a
// decision needs a human, so branded changes always stay on top.
//
// What it does:
//   1. Refuses to run on a dirty working tree (use --force to override).
//   2. `git fetch upstream` and reports the commit distance.
//   3. Runs the merge. On conflict it auto-resolves ONLY the generated i18n
//      catalogs (`git checkout --theirs` + `re-extract`) — the one merge case
//      the runbook says theirs-always-wins. Every other conflict is listed and
//      left mid-merge for you to finish; the script exits 1 there.
//   4. After a fully merged tree, runs typecheck + lint unless --no-verify
//      is given. (Full `pnpm test` stays manual — it's the slowest check and
//      the runbook wants it run either way.)
//   5. Never commits. You review, fix remaining conflicts, and commit.
//
// Usage:
//   node scripts/sync-upstream.mjs [--no-verify] [--force]

import { execFileSync } from "node:child_process";

const noVerify = process.argv.includes("--no-verify");
const force = process.argv.includes("--force");

const run = (cmd, args, opts = {}) => {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  try {
    return execFileSync(cmd, args, { stdio: "inherit", encoding: "utf8", ...opts });
  } catch (err) {
    if (opts.ignoreFailure) return "";
    throw err;
  }
};

const capture = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();

const fail = (msg) => {
  console.error(`\nsync-upstream: ${msg}`);
  process.exit(1);
};

// 1. Clean working tree (unless forced).
const dirty = capture("git", ["status", "--porcelain"]);
if (dirty) {
  if (force) {
    console.log("⚠  working tree is dirty (--force); merging anyway\n");
  } else {
    fail("working tree is dirty — commit or stash first, or re-run with --force");
  }
}

// 2. Fetch and measure distance.
run("git", ["fetch", "upstream"]);
const behind = Number(capture("git", ["rev-list", "--count", "HEAD..upstream/master"]));
const ahead = Number(capture("git", ["rev-list", "--count", "upstream/master..HEAD"]));
if (behind === 0) {
  console.log(
    `\nAlready up to date with upstream/master (${ahead} commit(s) ahead of it). Nothing to do.`,
  );
  process.exit(0);
}
console.log(`\nupstream/master is ${behind} commit(s) ahead, we are ${ahead} ahead of it.`);

// 3. Merge. A clean automated merge resolves itself.
const mergeOk = run("git", ["merge", "upstream/master", "--no-edit"], {
  ignoreFailure: true,
});
if (mergeOk !== "") {
  // exit code 0 — also true when the merge produced a conflict index, so we
  // still probe for unmerged paths below.
}

// 4. If unmerged paths remain, resolve the catalogs mechanically.
const unmergedOutput = capture("git", ["status", "--porcelain"]);
const unmerged = unmergedOutput
  .split("\n")
  .filter((line) => /^(U|AA|DD|AU|UA|DU|UD)/.test(line))
  .map((line) => line.slice(3).trim());
const CATALOG_RE = /^src\/renderer\/locales\/[^/]+\/messages\.po$/;

if (unmerged.length > 0) {
  const catalogs = unmerged.filter((p) => CATALOG_RE.test(p));
  const otherUnmerged = unmerged.filter((p) => !CATALOG_RE.test(p));

  if (catalogs.length > 0) {
    console.log(
      `\nAuto-resolving ${catalogs.length} catalog conflict(s) with --theirs (catalog rule):`,
    );
    for (const path of catalogs) console.log(`  ${path}`);
    run("git", ["checkout", "--theirs", ...catalogs]);
    run("git", ["add", ...catalogs]);
    console.log(
      "\nRe-running i18n:extract so our branded strings re-apply on top of upstream's catalogs.",
    );
    run("pnpm", ["i18n:extract"]);
  }

  if (otherUnmerged.length > 0) {
    console.error(
      `\n${otherUnmerged.length} non-catalog conflict(s) remain — resolve these by hand:`,
    );
    for (const path of otherUnmerged) console.error(`  ${path}`);
    console.error(
      "\nThey were left mid-merge (git status shows them as unmerged). Finish with git add, then commit.",
    );
    process.exit(1);
  }
}

// 5. Verify on a fully merged tree.
if (noVerify) {
  console.log(
    "\nMerge complete (--no-verify). Typecheck/lint skipped — run them before committing.",
  );
} else {
  console.log("\nMerge complete. Running checks…");
  run("pnpm", ["run", "typecheck"]);
  run("pnpm", ["run", "lint"]);
  console.log("\nChecks passed. Run `pnpm test` before committing.");
}

console.log(
  "\nNext: review the diff (`git diff upstream/master`), commit, re-check brand/icon seams, and re-release.",
);
