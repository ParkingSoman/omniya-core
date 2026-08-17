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
- In-app auto-update (`electron-updater`)
- Bundling liblouis into `npm start` developer runs (Homebrew / `OMNIYA_LOU_TRANSLATE` stay valid there)
- Linux packages
- Committing `dist/` or `vendor/liblouis/` binaries to git

## Why CI is the Windows path

electron-builder architecture flags (`--mac --arm64`, `--win --x64`) are documented. A Windows **NSIS installer** from macOS is **not** a flag swap; it needs Wine. This project ships **zip** artifacts so each GitHub runner can package without Wine.

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
- Windows: `--win --x64`, target **zip** (not NSIS).
- Output directory `dist/` (gitignored).
- npm scripts: `dist:mac` and `dist:win` run stage + electron-builder `--publish never`.

## GitHub rolling prerelease

On every push to `testing`:

- Job `pack-mac` on `macos-latest`: stage liblouis, `electron-builder --mac --arm64 --publish never`.
- Job `pack-win` on `windows-latest`: stage liblouis, `electron-builder --win --x64 --publish never`.

Both jobs upload with `gh release upload testing-app … --clobber` after ensuring prerelease tag `testing-app` exists (`--target` the pushed commit). Do not delete the whole release from one OS job (that races the other). Permissions: `contents: write`. Use `GITHUB_TOKEN`.

No in-app updater. Testers re-download from the same release URL when they want a newer alpha.

## Gatekeeper (known remainder)

Unsigned Mac zips from the internet often will not open on the first double-click. README must say: if macOS refuses the app, use Open Anyway / right-click Open. That is not Homebrew. Signing is a later project decision.

Windows SmartScreen may similarly warn on an unsigned zip/exe; document “More info → Run anyway”.

## README / HUMAN-TESTING

Lead “Run this alpha” with the prerelease download (Apple Silicon Mac zip vs Windows x64 zip), then keep `npm start` as “run from source”.

Remove the absolute claims “there is no installer” and the boundary bullet “installers, release automation, or production packaging”. Replace with: this branch publishes an **unsigned testing zip** (not a production signed installer); Intel Mac is not offered yet; UEB liblouis is inside the zip.

## Verification

- Unit tests for resolve order (temp dirs; no real Electron required).
- `npm test` still passes on `testing`.
- Local: `npm run dist:mac`, launch the `.app`, confirm it starts. Confirm a UEB translate using the **bundled** helper (override or PATH that cannot see Homebrew) if feasible.
- Windows: CI artifact only in this pass; no local Windows launch required.
