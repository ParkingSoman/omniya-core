# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Omniya Core is an experimental local-first Electron app exploring screen-reader-first
mathematical workspaces (research prototype, not a production product). Users write
"napkins" — local JSON documents containing a sequence of text and equation items —
and can author math in LaTeX or Nemeth braille, explore equation structure via MathJax,
and read/write literary UEB via liblouis. No network access, no accounts, no cloud.

You are almost always working on **`testing`**, the active alpha branch. `main` is the
last human-signed-off snapshot; large parts of `testing` (Nemeth authoring, unified
composer, UEB command mode) are not on `main`. Check `git branch` if in doubt — do not
assume `main`'s behavior applies here.

Accessibility work in this repo is evidence-driven, not sighted-developer guesswork.
Don't make UX decisions "for blind users" without a cited rationale (BANA rule, prior
audit note, or explicit user testing). See `docs/guided-nemeth-bana-audit-notes.md` and
`docs/nemeth-v2/HANDOFF.md` for the standing rules this project has already learned the
hard way.

## Commands

```bash
npm start                 # run the Electron app (never open src/renderer/index.html in a browser — no preload bridge)
npm test                  # unit tests only (node --test test/unit/**/*.test.js)
npm run test:e2e          # Electron/Playwright e2e tests (test-concurrency=1)
npm run test:all          # unit + e2e
npm run test:inspect      # generate an editable example napkin and open it in the app
npm run open:napkin -- /path/to/file.napkin.json   # open an arbitrary napkin file in the app
npm run nemeth:coverage   # Nemeth correctness gate against the BANA corpus (test/corpus/nemeth-v1.json)
npm run nemeth:utility    # Nemeth utility gate ("can a student do their homework")
```

Run a single unit test file directly, e.g.:
```bash
node --test test/unit/nemeth/parser.test.js
```

Run a single e2e test file (still needs concurrency=1):
```bash
node --test --test-concurrency=1 test/e2e/nemeth-composer.test.js
```

Headed/demo run of the thought-stream flow: `npm run test:demo:thought`
(`OMNIYA_HEADLESS=0 OMNIYA_THOUGHT_DEMO=1`).

Notes on the test setup:
- e2e tests run the Electron browser context **offline** and record unexpected external
  HTTP requests — don't add network fallbacks to fix a failure.
- On macOS, run GUI (e2e) tests from a normal logged-in terminal, not a restricted GUI
  sandbox — the sandbox can kill the app before its JS starts.
- `OMNIYA_TEST_USER_DATA_DIR` isolates persisted state for automated tests.
- Local MathJax assets are vendored/installed, not CDN-loaded. If they're missing,
  `npm install` — do not add a network fallback.
- As of the last Nemeth-v2 handoff: `npm test` 382/382 green; `npm run test:e2e` has
  11 pre-existing `enterCommand` timeout failures unrelated to Nemeth (see
  `docs/nemeth-v2/HANDOFF.md`, "Known rot") — don't assume you broke something if you
  see exactly those failures reproduce on a clean checkout too.

### Auto-commit hook

`.claude/hooks/commit-on-task-complete.sh` runs on `TaskUpdate` → `completed` and
auto-commits a checkpoint **only if `npm test` is green**; it never pushes and never
commits a red tree. Keep the unit suite passing as you go rather than batching fixes
for the end, or your in-progress task checkpoints silently stop happening.

## Architecture

### Process boundary (Electron security model)

- `src/main.js` — main process. Owns the `BrowserWindow` (sandboxed, context-isolated,
  `nodeIntegration: false`), the application menu, and all `ipcMain.handle` endpoints.
  Every handler calls `assertTrustedSender(event)` first, which checks
  `event.senderFrame.url` against the loaded renderer file's URL — do not add an IPC
  handler without this check.
- `src/preload.cjs` — the *only* bridge between renderer and main, via
  `contextBridge.exposeInMainWorld('omniya', …)`. The renderer never gets Node/Electron
  APIs directly; every capability it needs (state load/save, settings, LaTeX↔MathML,
  UEB translate) must be added here explicitly.
- `src/main/` — main-process services behind that bridge: `storage.js` (queued atomic
  napkin JSON persistence under `app.getPath('userData')`, or `OMNIYA_NAPKIN_FILE` when
  set), `settings-storage.js`, `mathml.js` (LaTeX→MathML via MathJax), `math-service.js`
  (import/export), `ueb-service.js` (liblouis translate/back-translate).
- `src/renderer/` — the semantic HTML page and its behavior (`app.js`, largest file in
  the repo), MathJax explorer wiring, braille input/display simulation, and styling. No
  Node access; everything goes through `window.omniya`.

### The `src/domain` boundary — the rule that matters most

**`src/domain/` must never import from `src/main/`.** This is enforced by convention
(see `docs/nemeth-v2/INTERFACES.md`) and is why the Nemeth parser emits LaTeX rather
than MathML directly — MathML generation stays centralized in `src/main/mathml.js`, one
path (`convertLatexToMathML` → `canonicalizeMathML` → `parseMathML`) for both
LaTeX-authored and Nemeth-authored equations, so they can never silently drift apart. If
you're adding domain logic that seems to need something from `src/main`, that's a signal
the boundary belongs somewhere else, not a reason to add the import.

`src/domain/model.js` holds napkin/item state factories, validation, and immutable
operations (`SCHEMA_VERSION` / `MATH_SCHEMA_VERSION` for migrations — see
`src/domain/migration.js`). `src/domain/math-tree.js` handles MathML canonicalization
used by both the model and the Nemeth pipeline.

### Nemeth (braille math authoring)

`src/domain/nemeth/` is a clean-room Nemeth-braille → LaTeX pipeline:
`lexer.js → levels.js → parser.js → latex.js`, orchestrated by `index.js`'s
`parseNemeth(input) -> { ast, latex, diagnostics }`. It's pure and synchronous, no I/O.

- Input is Unicode braille cells (`U+2800`–`U+28FF`) only — Braille-ASCII and QWERTY
  text are rejected by design, not accepted and mistranslated. `symbols.json` is the
  data authority for what cells/kinds exist (not the design doc in
  `docs/nemeth-v2/INTERFACES.md`, which is explicitly marked historical/superseded in
  several places — read the inline superseded-notes there before trusting a section).
  `kinds.js` and `levels.js` similarly carry doc-comments explaining why the shipped
  model differs from the original design (e.g. `levels.js` uses absolute-path level
  strings, not signed integers, because the signed model silently mis-parsed `x_a^n`).
- Unsupported constructs throw `NemethUnsupportedError` with one fixed user-facing
  message (`UNSUPPORTED_MESSAGE`) — never a partial/guessed parse. `ERROR` in the
  correctness gate must stay 0; `REFUSE` (honest unsupported) and `DISAGREE` (silently
  wrong) are not interchangeable, and reducing DISAGREE by weakening a check or deleting
  a test/corpus row is considered gaming the gate.
- Two separate gates measure different things — **never plan Nemeth work from the
  correctness corpus**, it measures rule coverage, not real usage; `nemeth:utility`'s
  core set (currently 26/26) is the one that must not regress. See
  `docs/nemeth-v2/HANDOFF.md` for the full standing-rules list before touching this code.
- `src/domain/nemeth-input.js` is the correct accumulator for cells feeding the Nemeth
  parser. **Do not** reuse `src/domain/ueb-cell-buffer.js` for this — it flushes on
  `U+2800`, which Nemeth uses as a significant token (comparison-sign spacing), so
  reusing it truncates expressions at the first space.
- Optional "computer braille" keyboard input (a braille keyboard configured to send
  translated text instead of raw cells) is opt-in only, off by default, and decoded
  through `src/domain/nemeth/computer-braille-en-us.js` for the one verified table
  (`en-us-comp8`) — never guessed, since decoding through the wrong table would silently
  produce the wrong symbol.

### Document model

A napkin is a named local document with a linear sequence of items (`text` or
`equation`, each with an optional note). State round-trips through `storage.js` as
JSON; migrations live in `src/domain/migration.js` keyed off `SCHEMA_VERSION`.

## Repository structure

- `src/main.js`, `src/preload.cjs`, `src/main/` — Electron boundary, IPC, MathML
  conversion, local persistence.
- `src/domain/` — state model, validation, immutable operations, Nemeth parser (no
  Electron/DOM dependency; must stay importable standalone).
- `src/renderer/` — semantic page, styling, app behavior, MathJax config.
- `scripts/` — corpus import, coverage/utility gates, liblouis staging for packaged
  builds, `open-napkin.mjs`.
- `test/unit/` — model, persistence, MathML, Nemeth pipeline (mirrors `src/domain/nemeth/`).
- `test/e2e/` — Electron workflow + accessibility (axe-core) tests via Playwright.
- `test/corpus/` — the externally-sourced BANA Nemeth corpus graded by `nemeth:coverage`.
- `test/inspect.mjs` — generates the gitignored example napkin at
  `test/artifacts/latest/test.napkin.json` (not a permanent test report).
- `docs/nemeth-v2/` — design record and handoff notes for the Nemeth rewrite; read
  `HANDOFF.md` before `INTERFACES.md` (the latter is superseded in several places).
- `docs/HUMAN-TESTING.md` — the manual human-testing checklist gating `testing` → `main`.
