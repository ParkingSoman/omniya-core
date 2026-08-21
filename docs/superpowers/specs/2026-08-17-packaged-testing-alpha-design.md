# Packaged testing alpha (ARM Mac + Windows)

Date: 2026-08-17  
Branch: `testing`  
Status: approved for implementation (Intel Mac out of scope)

## Goal

Testers on Apple Silicon macOS and on Windows x64 download a GitHub prerelease, double-click the app, and use the alpha without Node, npm, Homebrew, or a separate liblouis install.

## Non-goals

- Intel Mac (`--mac --x64`) packaging
- Apple Developer ID signing / notarization
- Windows Authenticode signing
- Silent in-app auto-update on macOS (Electron's native updater requires code signing, which is out of scope — see "In-app updates" below)
- Bundling liblouis into `npm start` developer runs (Homebrew / `OMNIYA_LOU_TRANSLATE` stay valid there)
- Linux packages
- Committing `dist/` or `vendor/liblouis/` binaries to git

## Why CI is the Windows path

electron-builder architecture flags (`--mac --arm64`, `--win --x64`) are documented. A Windows **NSIS installer** built *from macOS* is **not** a flag swap; it needs Wine. This project's Windows job runs on `windows-latest`, so it can build an NSIS installer directly without Wine — see "In-app updates" below for why Windows now ships NSIS instead of zip. (A local `dist:win` run from a macOS dev machine would still need Wine for NSIS; that path stays CI-only, matching the existing "Windows: CI artifact only" note.)

Windows is built on `windows-latest`. macOS ARM is built on `macos-latest`. A successful local ARM Mac build verifies the Mac packager config and bundled liblouis wiring. It does **not** prove the Windows zip launches; that job exists so the Windows binary is produced on Windows with the official liblouis Windows zip.

## Runtime: how liblouis is found

`src/main/ueb-service.js` already spawns `lou_translate` with tables `unicode.dis,en-ueb-g1.ctb` / `en-ueb-g2.ctb`.

Resolution order:

1. `OMNIYA_LOU_TRANSLATE` if that path exists (developer override).
2. Packaged helper: `{resourcesPath}/liblouis/bin/lou_translate` (`.exe` on Windows), if that file exists.
3. Existing Homebrew absolute candidates (`/opt/homebrew/bin/lou_translate`, `/usr/local/bin/lou_translate`).
4. `null` (same as today).

When using the packaged helper, spawn with `LOUIS_TABLEPATH` set to `{resourcesPath}/liblouis/tables`. Do not import `electron` in `ueb-service.js` (unit tests run in Node). Use `process.resourcesPath` only when it is a non-empty string.

liblouis is spawned as a separate process (stdin/stdout). The app stays Apache-2.0; ship liblouis license/notice files next to the helper and mention liblouis in the README.

## Staging layout (not committed)

`scripts/stage-liblouis.mjs` writes:

```
vendor/liblouis/bin/lou_translate[.exe]
vendor/liblouis/lib/          # dylib or DLL as required by the helper
vendor/liblouis/tables/       # full table set (includes are required)
vendor/liblouis/NOTICE        # license text copied from the upstream tree
```

**macOS (local + `macos-latest`):** `brew install liblouis` if needed, copy helper + dylib + `share/liblouis/tables`, then `install_name_tool` so the helper uses `@executable_path` / `@loader_path` for liblouis (must not depend on Homebrew at testers’ machines).

**Windows (`windows-latest`):** download a **pinned** official win64 zip from liblouis.io / GitHub releases, unpack, normalize into the layout above.

electron-builder `extraResources`: `vendor/liblouis` → `liblouis` under `process.resourcesPath`.

## Packaging

- Tool: `electron-builder` (devDependency).
- Mac: `--mac --arm64`, target **zip** (unsigned; `identity: null` or equivalent so CI does not look for a Developer ID).
- Windows: `--win --x64`, target **NSIS** (unsigned, per-user install — see "In-app updates" below).
- Output directory `dist/` (gitignored).
- npm scripts: `dist:mac` runs stage + electron-builder `--publish never`; `dist:win` runs stage + electron-builder `--publish always` (needed to generate `latest.yml` for the Windows updater — the `generic` publish provider only writes this metadata locally, it does not upload anything itself).
- Both platforms build against a per-push version computed by `scripts/bump-testing-version.mjs` (`0.1.0-alpha.<run number>+<short sha>`), not the static `0.1.0` in git — see "In-app updates".

## GitHub rolling prerelease

On every push to `testing`:

- Job `pack-mac` on `macos-latest`: stage liblouis, `electron-builder --mac --arm64 --publish never`.
- Job `pack-win` on `windows-latest`: stage liblouis, `electron-builder --win --x64 --publish never`.

Both jobs upload with `gh release upload testing-app … --clobber` after ensuring prerelease tag `testing-app` exists (`--target` the pushed commit). Do not delete the whole release from one OS job (that races the other). Permissions: `contents: write`. Use `GITHUB_TOKEN`.

Both platform artifact filenames are pinned via electron-builder's `artifactName` (`Omniya-Core-mac-arm64.zip`, `Omniya-Core-Setup-x64.exe`) rather than the default `${version}`-embedded name — required so `--clobber` keeps overwriting the same filenames now that the version changes on every push (see below), instead of piling up a new differently-named asset per push.

## In-app updates

Windows testing builds now auto-update silently in the background; macOS testing builds do not (still no code signing — Electron's native macOS updater, Squirrel.Mac, requires a signed app to work at all). This means testers re-download manually only on macOS; Windows testers get pushes automatically.

- **Versioning**: CI runs `scripts/bump-testing-version.mjs` before building, which rewrites `package.json`'s version to `0.1.0-alpha.<GITHUB_RUN_NUMBER>+<short SHA>` — the run number is monotonically increasing and semver-comparable (unlike a raw SHA), and the `+sha` suffix is semver build metadata (ignored for version comparison, just useful for identifying which commit is running). Re-running an old workflow run instead of pushing a new commit reuses that run's original, now-stale run number and would clobber the release with an older version — always push a new commit to refresh `testing-app`.
- **Windows**: ships an NSIS installer, `perMachine: false` (per-user install, no admin elevation — required so a silent background update can actually run the installer without prompting for UAC). `electron-builder`'s `win.publish` config uses the `generic` provider pointed at the `testing-app` release's static download URL, not `provider: github` — electron-builder's GitHub publish provider always derives a release tag from the app version and cannot target a fixed literal tag like `testing-app`, which would defeat the single-rolling-release pattern. The `generic` provider instead just writes `latest.yml` locally at build time (no upload of its own); the existing `gh release upload testing-app … --clobber` step uploads it alongside the installer, exactly like the zips today. At runtime `electron-updater` (`src/main/updater.js`) reads that same static URL directly over HTTPS — no GitHub API involved — and only runs in packaged builds (`app.isPackaged`), never under `npm start` or the existing automated-test flag.
- **macOS**: no auto-updater. CI writes a small `dist/version.json` manifest alongside the mac zip on every push. The packaged app (`src/main/mac-update-check.js`) fetches that manifest directly (not the GitHub API, to avoid its 60 req/hour unauthenticated rate limit) and compares against the running version; if newer, the renderer shows an in-app banner linking to the release page. Opening that link goes through a dedicated `update:openReleasePage` IPC handler using `shell.openExternal` — the renderer's CSP (`connect-src 'self'`) and the existing `setWindowOpenHandler`/`will-navigate` guards block any direct link/fetch from the renderer itself.
- **No upgrade path** from an old zip-based Windows install to the new NSIS install — they don't collide or auto-migrate. Windows testers on an old zip build need one manual reinstall from the release page; after that, auto-updates take over.

## Gatekeeper (known remainder)

Unsigned Mac zips from the internet often will not open on the first double-click. README must say: if macOS refuses the app, use Open Anyway / right-click Open. That is not Homebrew. Signing is a later project decision.

Windows SmartScreen may similarly warn on an unsigned zip/exe; document “More info → Run anyway”.

## README / HUMAN-TESTING

Lead “Run this alpha” with the prerelease download (Apple Silicon Mac zip vs Windows x64 installer), then keep `npm start` as “run from source”.

Remove the absolute claims “there is no installer” and the boundary bullet “installers, release automation, or production packaging”. Replace with: this branch publishes an **unsigned testing zip** (not a production signed installer); Intel Mac is not offered yet; UEB liblouis is inside the zip.

## Verification

- Unit tests for resolve order (temp dirs; no real Electron required).
- `npm test` still passes on `testing`.
- Local: `npm run dist:mac`, launch the `.app`, confirm it starts. Confirm a UEB translate using the **bundled** helper (override or PATH that cannot see Homebrew) if feasible.
- Windows: CI artifact only in this pass; no local Windows launch required.
