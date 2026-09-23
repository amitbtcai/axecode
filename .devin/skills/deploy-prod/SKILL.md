---
name: deploy-prod
description: Deploy Axe Code to production. Use when the user says "deploy to prod", "ship it", "release to prod", or asks to release the Electron app. Commits local changes, writes/verifies release notes, runs the stable release workflow, deploys the axeai.com site to Hostinger, then downloads and installs the build on this Mac.
---

# Deploy to prod

`scripts/deploy-to-prod.sh` runs the full pipeline end to end:

1. `git add -A` + commit pending changes + push `master`
2. Resolve the next version (`scripts/resolve-release-version.mjs`) and verify
   `website/public/changelog.json` has a well-formed entry for it — **the release
   workflow refuses to tag without one**
3. Dispatch `release.yml` (stable) and watch the run to green
4. Verify the GitHub release exists with macOS DMG assets
5. Deploy the axeai.com site to the Hostinger VPS by running
   `~/Documents/axeai/scripts/deploy-hostinger.sh` (commits + pushes pending
   site work first) — that is what publishes `/code`, the downloads API, and
   the changelog. `--skip-site` bypasses this when the site is already live.
6. Poll `https://axeai.com/api/downloads/latest` until it reports the version
   (5-minute cache; falls back to the GitHub asset URL if it lags)
7. Dispatch `scripts/install-desktop-dmg.sh` via `nohup` — it quits Axe Code,
   swaps `/Applications/Axe Code.app`, verifies `CFBundleShortVersionString`,
   and relaunches. Detached on purpose: quitting the app kills this process
   tree, so an in-app agent can trigger the install safely. Only
   `Axe Code.app` is touched — a running `Poracode.app` is a separate bundle
   and is left alone.

## When the user says "deploy to prod"

1. **Release notes first.** Check whether `website/public/changelog.json` already
   has an entry for the version `node scripts/resolve-release-version.mjs`
   prints. If not, invoke the `release-notes` skill and write the entry, then
   commit it — the script will push it.
2. Run `scripts/deploy-to-prod.sh` (add `-y` only if the user asked for a fully
   unattended run — replacing `/Applications` apps prompts otherwise).
3. If the script aborts on the changelog gate, do step 1 and re-run.
4. Report the released version, the GitHub release URL, whether
   `axeai.com/api/downloads/latest` picked it up, and the install log path
   (`/tmp/axecode-install.*/install.log`). The app relaunches itself; the
   installed version is verified inside the install log.

## Notes

- Site deploys go through the **Hostinger VPS**, not a GitHub website workflow —
  the Vercel workflows were removed. `deploy-hostinger.sh` requires the axeai
  repo on a clean `main` matching `origin/main`, and runs its own full verify
  - smoke checks (release.json commit match, security headers, routes).
- macOS builds are **unsigned** on this fork (`MAC_CSC_LINK` secret is not
  configured), so electron-updater refuses to apply macOS updates in-app —
  the install step is how this Mac actually gets the new build. Windows/Linux
  in-app updates are unaffected.
- Long pole: the release workflow builds macOS, Windows, and Linux — expect
  tens of minutes. `RELEASE_TIMEOUT_MIN` (default 120) and `SITE_TIMEOUT_MIN`
  (default 20) are tunable.
- Requires `gh` authenticated against `amitbtcai/axecode`, the repo checked out
  on `master`, and SSH access to the `hostinger` alias for the site deploy.
- Env overrides: `GH_REPO`, `AXEAI_REPO` (default `~/Documents/axeai`),
  `SITE_BASE`, `HOSTINGER_SSH_HOST`, `HOSTINGER_APP_DIR`.
