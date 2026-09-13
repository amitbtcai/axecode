---
name: deploy-prod
description: Deploy Axe Code to production. Use when the user says "deploy to prod", "ship it", "release to prod", or asks to release the Electron app. Commits local changes, writes/verifies release notes, runs the stable release workflow, waits for the website, then downloads and installs the build on this Mac.
---

# Deploy to prod

`scripts/deploy-to-prod.sh` runs the full pipeline end to end:

1. `git add -A` + commit pending changes + push `master`
2. Resolve the next version (`scripts/resolve-release-version.mjs`) and verify
   `website/public/changelog.json` has a well-formed entry for it — **the release
   workflow refuses to tag without one**
3. Dispatch `release.yml` (stable) and watch the run to green
4. Verify the GitHub release exists with macOS DMG assets
5. Wait for `deploy-website.yml` and poll `https://axeai.com/code` until it
   serves the new version
6. Download the DMG via the site's `/api/download/mac-<arch>` endpoint
   (falls back to the GitHub asset if the site lags)
7. Replace `Axe Code.app` in `/Applications` and verify
   `CFBundleShortVersionString` matches. Only `Axe Code.app` is touched — a
   running `Poracode.app` is a separate bundle and is left alone

## When the user says "deploy to prod"

1. **Release notes first.** Check whether `website/public/changelog.json` already
   has an entry for the version `node scripts/resolve-release-version.mjs`
   prints. If not, invoke the `release-notes` skill and write the entry, then
   commit it — the script will push it.
2. Run `scripts/deploy-to-prod.sh` (add `-y` only if the user asked for a fully
   unattended run — replacing `/Applications` apps prompts otherwise).
3. If the script aborts on the changelog gate, do step 1 and re-run.
4. Report the released version, the GitHub release URL, whether
   `axeai.com/code` picked it up, and the installed app version.

## Notes

- Known gap: `axeai.com/code` was 404 at the time this was written — the site may
  still deploy under a different domain (`poracode.com` serves the upstream
  fork's build). `SITE_BASE` env var overrides the poll target; the download
  falls back to GitHub release assets automatically.
- Long pole: the release workflow builds macOS (signed + notarized), Windows,
  and Linux — expect tens of minutes. `RELEASE_TIMEOUT_MIN` (default 120) and
  `SITE_TIMEOUT_MIN` (default 20) are tunable.
- Requires `gh` authenticated against `amitbtcai/axecode` and the repo checked
  out on `master`.
