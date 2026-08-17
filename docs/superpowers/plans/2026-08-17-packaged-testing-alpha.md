# Packaged testing alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship unsigned Apple Silicon Mac and Windows x64 zip builds of the `testing` alpha with bundled liblouis, refresh them on each `testing` push via GitHub prerelease `testing-app`, and point testers at that download.

**Architecture:** electron-builder extraResources copies a staged `vendor/liblouis` tree into `process.resourcesPath`. `ueb-service.js` prefers that helper when present. CI on `macos-latest` and `windows-latest` stages the matching upstream liblouis and uploads zips to one rolling prerelease.

**Tech Stack:** Electron 43, electron-builder, liblouis (`lou_translate`), GitHub Actions, `gh release`.

**Worktree:** `/Users/shonusengupta/omniya-core/.worktrees/testing` on branch `testing`. Do not commit `dist/`, `vendor/liblouis/`, or unrelated untracked files (`test/nemeth-everyday-check.mjs`, `test/nemeth-spotcheck.mjs`).

**Spec:** `docs/superpowers/specs/2026-08-17-packaged-testing-alpha-design.md`

---

### File map

- Modify: `src/main/ueb-service.js` — bundled helper + `LOUIS_TABLEPATH`
- Modify: `test/unit/ueb-service.test.js` — resolve-order tests
- Create: `scripts/stage-liblouis.mjs` — normalize liblouis into `vendor/liblouis`
- Create: `scripts/liblouis-version.txt` — pinned Windows zip version string (and comment for Homebrew)
- Modify: `package.json` — electron-builder, scripts
- Modify: `.gitignore` — `dist/`, `vendor/liblouis/`
- Create: `electron-builder.yml` or `build` key in package.json
- Create: `.github/workflows/testing-app.yml`
- Modify: `README.md`, `docs/HUMAN-TESTING.md`

---

### Task 1: Bundled liblouis resolution (TDD)

**Files:**
- Modify: `src/main/ueb-service.js`
- Modify: `test/unit/ueb-service.test.js`

- [ ] **Step 1: Write failing tests** in `test/unit/ueb-service.test.js`

Export `resolveLouTranslate(options = {})` where options may include `env`, `resourcesPath`, `homebrewCandidates`, `exists` (defaults to `fs.existsSync`). Keep the existing tests working by defaulting those to `process.env` / `process.resourcesPath` / the two Homebrew paths.

Add tests (use `node:os` `tmpdir` + real files, or a fake `exists` map):

1. When `OMNIYA_LOU_TRANSLATE` points at an existing path, that path wins even if a bundled helper exists.
2. When env is unset and `{resourcesPath}/liblouis/bin/lou_translate` exists (use `.exe` suffix in a Windows-platform test by passing `platform: 'win32'`), return that bundled path.
3. When bundled is missing, fall back to the first existing Homebrew candidate.
4. When nothing exists, return `null`.
5. `louSpawnEnv(binPath, options)` returns `LOUIS_TABLEPATH` set to `{resourcesPath}/liblouis/tables` when `binPath` is the bundled helper; does not force that env when using Homebrew.

- [ ] **Step 2: Run** `node --test test/unit/ueb-service.test.js`  
  Expected: new tests FAIL (exports missing or old resolve behavior).

- [ ] **Step 3: Implement** in `ueb-service.js`:

```js
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TABLE = {
  g1: 'unicode.dis,en-ueb-g1.ctb',
  g2: 'unicode.dis,en-ueb-g2.ctb'
};

const DEFAULT_HOMEBREW = [
  '/opt/homebrew/bin/lou_translate',
  '/usr/local/bin/lou_translate'
];

function bundledBin(resourcesPath, platform) {
  if (!resourcesPath) return null;
  const name = platform === 'win32' ? 'lou_translate.exe' : 'lou_translate';
  return path.join(resourcesPath, 'liblouis', 'bin', name);
}

export function resolveLouTranslate(options = {}) {
  const env = options.env ?? process.env;
  const exists = options.exists ?? ((p) => Boolean(p) && fs.existsSync(p));
  const platform = options.platform ?? process.platform;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const homebrewCandidates = options.homebrewCandidates ?? DEFAULT_HOMEBREW;

  const fromEnv = env.OMNIYA_LOU_TRANSLATE;
  if (fromEnv && exists(fromEnv)) return fromEnv;

  const bundled = bundledBin(resourcesPath, platform);
  if (bundled && exists(bundled)) return bundled;

  for (const candidate of homebrewCandidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function louSpawnEnv(binPath, options = {}) {
  const env = { ...(options.env ?? process.env) };
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const platform = options.platform ?? process.platform;
  const bundled = bundledBin(resourcesPath, platform);
  if (binPath && bundled && path.resolve(binPath) === path.resolve(bundled) && resourcesPath) {
    env.LOUIS_TABLEPATH = path.join(resourcesPath, 'liblouis', 'tables');
  }
  return env;
}
```

Use `louSpawnEnv` in `runLou` for `spawn` `env`. Preserve current `runLou` / `translateUeb` / `backTranslateUeb` behavior.

- [ ] **Step 4: Re-run unit tests.** Expected: PASS (g1/g2 roundtrips still skip if no Homebrew louis).

- [ ] **Step 5: Commit** `feat: prefer bundled liblouis in packaged UEB service`

---

### Task 2: Stage liblouis into vendor/

**Files:**
- Create: `scripts/stage-liblouis.mjs`
- Create: `scripts/liblouis-windows-url.txt` containing exactly one line, the pinned official 64-bit Windows zip URL (choose current stable win64 from https://liblouis.io/downloads/ or GitHub releases, e.g. `https://github.com/liblouis/liblouis/releases/download/v3.36.0/liblouis-3.36.0-win64.zip` — verify the URL returns 200 before committing).
- Modify: `.gitignore` add:

```
dist/
vendor/liblouis/
```

- [ ] **Step 1: Implement `scripts/stage-liblouis.mjs`** (Node ESM, no extra deps):

  - Output root: `vendor/liblouis` (delete and recreate).
  - **darwin:** Resolve Homebrew prefix (`brew --prefix liblouis`). Copy `bin/lou_translate`, every `liblouis*.dylib` from the formula `lib` dir into `vendor/liblouis/bin` (same directory as the helper so `@executable_path` works), copy the full `share/liblouis/tables` directory to `vendor/liblouis/tables`. Copy `COPYING` / `LICENSE` / `NEWS` if present into `vendor/liblouis/NOTICE` (concatenate what exists). Run `install_name_tool` so `lou_translate` and the dylibs do not reference `/opt/homebrew` or `/usr/local`. Fail the script if `otool -L` on the staged helper still contains those prefixes.
  - **win32:** Download the URL from `scripts/liblouis-windows-url.txt`, unzip, find `lou_translate.exe` and the liblouis DLL, copy into `vendor/liblouis/bin`, copy `tables` (search for `en-ueb-g2.ctb`) into `vendor/liblouis/tables`, copy license files to NOTICE.
  - **other platforms:** exit 1 with a clear message.
  - After staging, `fs.existsSync` the helper and `tables/en-ueb-g2.ctb` or exit 1.

- [ ] **Step 2: Run** `node scripts/stage-liblouis.mjs` on this Mac. Expected: `vendor/liblouis/bin/lou_translate` exists; `otool -L` has no Homebrew prefixes; `LOUIS_TABLEPATH=vendor/liblouis/tables vendor/liblouis/bin/lou_translate -f unicode.dis,en-ueb-g1.ctb` translates `hello`.

- [ ] **Step 3: Commit** the script, URL pin, and gitignore only (not `vendor/liblouis`). Message: `chore: add liblouis staging script for packaged builds`

---

### Task 3: electron-builder config

**Files:**
- Modify: `package.json`
- Create: `electron-builder.yml` if keeping package.json small; otherwise a `build` key is fine. One place only.

- [ ] **Step 1: Add `electron-builder` as a devDependency** matching current major docs (install with npm so lockfile updates).

- [ ] **Step 2: Config**

```yaml
appId: org.axiya.omniyacore
productName: Omniya Core
files:
  - src/**/*
  - package.json
extraResources:
  - from: vendor/liblouis
    to: liblouis
mac:
  identity: null
  target:
    - target: zip
      arch:
        - arm64
  category: public.app-category.education
win:
  target:
    - target: zip
      arch:
        - x64
directories:
  output: dist
```

`CSC_IDENTITY_AUTO_DISCOVERY=false` in the Mac npm script so unsigned zip does not fail looking for a cert.

Scripts:

```json
"dist:mac": "node scripts/stage-liblouis.mjs && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac --arm64 --publish never",
"dist:win": "node scripts/stage-liblouis.mjs && electron-builder --win --x64 --publish never"
```

On Windows, `CSC_IDENTITY_AUTO_DISCOVERY=false` prefix is not valid shell. Use `cross-env` only if necessary; otherwise set the env in the GitHub Action for Mac and keep `dist:win` without that prefix. For `dist:mac` on zsh, the inline env assignment is fine.

- [ ] **Step 3: Run** `npm run dist:mac`. Expected: zip under `dist/` containing `Omniya Core.app`. Confirm `Omniya Core.app/Contents/Resources/liblouis/bin/lou_translate` exists.

- [ ] **Step 4: Commit** package.json, lockfile, electron-builder config. Message: `build: package unsigned arm64 Mac zip with bundled liblouis`

---

### Task 4: GitHub Actions rolling prerelease

**Files:**
- Create: `.github/workflows/testing-app.yml`

- [ ] **Step 1: Workflow**

```yaml
name: testing-app

on:
  push:
    branches: [testing]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  pack-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: brew install liblouis
      - run: npm ci
      - run: npm run dist:mac
      - name: Publish zip to testing-app prerelease
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release view testing-app >/dev/null 2>&1 || gh release create testing-app --prerelease --title "Testing alpha (unsigned)" --notes "Rolling unsigned zips for the testing branch. Re-download after each push. Apple Silicon Mac and Windows x64 only." --target "$GITHUB_SHA"
          gh release upload testing-app dist/*.zip --clobber

  pack-win:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run dist:win
      - name: Publish zip to testing-app prerelease
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release view testing-app >$null 2>&1; if ($LASTEXITCODE -ne 0) { gh release create testing-app --prerelease --title "Testing alpha (unsigned)" --notes "Rolling unsigned zips for the testing branch. Re-download after each push. Apple Silicon Mac and Windows x64 only." --target $env:GITHUB_SHA }
          gh release upload testing-app dist/*.zip --clobber
```

Use PowerShell-compatible `gh` on Windows (default shell). If `dist/*.zip` glob is unreliable on Windows, upload the explicit electron-builder artifact name after listing `dist`.

Do **not** `gh release delete` from either job.

- [ ] **Step 2: Commit** `ci: publish unsigned testing zips on each testing push`

---

### Task 5: README and HUMAN-TESTING

**Files:**
- Modify: `README.md`
- Modify: `docs/HUMAN-TESTING.md`

- [ ] **Step 1:** Change clone-and-run pointer (line ~40) to the download section.

- [ ] **Step 2:** Replace **Run this alpha** so the first path is:

  1. Open https://github.com/ParkingSoman/omniya-core/releases/tag/testing-app
  2. Apple Silicon Mac: download the `arm64` mac zip, unzip, open **Omniya Core**. If macOS blocks it: System Settings → Privacy & Security → Open Anyway, or right-click the app → Open.
  3. Windows x64: download the win zip, unzip, run **Omniya Core.exe**. If SmartScreen appears: More info → Run anyway.
  4. Literary UEB is bundled; no Homebrew liblouis and no Node for this path.
  5. Intel Mac is not packaged yet — use run-from-source or wait.

  Then a subsection **Run from source** with the existing `git checkout testing` / `npm install` / `npm start` plus Homebrew liblouis for UEB when not using a packaged build.

- [ ] **Step 3:** “What the app is”: remove “There is no installer.” Say testers can download an unsigned zip from the testing prerelease.

- [ ] **Step 4:** Boundaries list: delete `installers, release automation, or production packaging`. Add that production-signed installers and Intel Mac zips are still out of scope; the testing prerelease is unsigned alpha packaging only.

- [ ] **Step 5:** `docs/HUMAN-TESTING.md`: replace “Launch with `npm start`” / “There is no installer yet” / Homebrew as a prerequisite for humans with: prefer the prerelease zip; `npm start` remains for contributors; packaged app includes liblouis.

- [ ] **Step 6: Commit** `docs: send testers to the unsigned testing-app zips`

---

### Task 6: Verify ARM Mac packaged app

**Files:** none new (run commands)

- [ ] **Step 1:** `npm test` in the worktree. Expected: pass.

- [ ] **Step 2:** `npm run dist:mac` if dist is stale. Open the `.app` (not via `npm start`):

```bash
open "dist/mac-arm64/Omniya Core.app"
```

(Adjust path to whatever electron-builder actually emitted; `ls dist` first.)

Expected: window appears. If Gatekeeper blocks a locally built app, that is unexpected for ad-hoc local builds — report the exact dialog.

- [ ] **Step 3:** Confirm bundled louis with PATH that hides Homebrew:

```bash
APP="dist/mac-arm64/Omniya Core.app"
BIN="$APP/Contents/Resources/liblouis/bin/lou_translate"
TABLES="$APP/Contents/Resources/liblouis/tables"
PATH=/usr/bin:/bin LOUIS_TABLEPATH="$TABLES" "$BIN" -f unicode.dis,en-ueb-g1.ctb <<< 'hello'
```

Expected: Unicode braille on stdout; command not using `/opt/homebrew`.

- [ ] **Step 4:** If anything failed, fix in the relevant file and commit. If it passed, no extra commit required.

Do not claim Windows was launched. Note in the task report that Windows is CI-only.
