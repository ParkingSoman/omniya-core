# Human testing gate (`testing` branch)

This branch is the unbroken product build humans should run before anything
lands on `main`. It is **not** a BANA conformance release.

Freeze tip: `testing-freeze-20260814` (tag is behind tip `2ef0efb`).
Current tip includes the Nemeth engineering-gate coverage refresh at
`011f226` (944 official examples with Electron creation/editing
evidence), plus notepad-with-equation-islands authoring, unified composer,
and paper-writing UX.

## Branch convention

| Branch | Role |
| --- | --- |
| Feature / `codex/…` | Experimental lanes and BANA audit shards |
| `codex/persistent-math-tree-nemeth` | Active Nemeth / BANA integration + evidence grind |
| **`testing`** | Unbroken product assembly for humans; only branch humans should run |
| `main` | Signed-off releases only |

After a successful human round: open a PR from `testing` → `main`. After
meaningful Nemeth evidence batches: merge Nemeth → `testing` and re-smoke
(do not auto-promote).

## What changed vs `main`

Already on `main`: napkin read / add / edit shell, local MathJax, LaTeX
equations, offline autosave.

**New on `testing`:**

- One unified composer field for text, new equations, and subtree **r** replace
  (Nemeth / LaTeX in `#composer-source`; no separate replacement-dock chrome)
- MathJax explorer: Enter to explore, arrows through hierarchy, **r** to
  replace the focused subtree, **a** to insert after it, **o** to insert
  before it — same captured node, same composer.
- Type in the document. Ctrl+E inserts a Nemeth equation island; Ctrl+L
  inserts LaTeX. Enter commits the equation and returns to text. Escape
  discards an unfinished equation.
- Braille: with no pending UEB cells, full cell ⠿ inserts Nemeth (same as
  Ctrl+E). The UEB word “for” is also ⠿ at the start of a word and will do
  the same; use Ctrl+E or Insert → Equation (Nemeth) if that collides.
  Command mode is gone; there is no Ctrl+[, no Command n/i/t/x, and no Add
  item.
- Application menu: Insert → Equation (Nemeth / LaTeX); Format → UEB G2 / G1
  (Ctrl+T); Help → Keyboard shortcuts.
- Notes UI hidden; literary UEB G1 / G2 via Ctrl+T on text
- Literary UEB G1 / G2 text via native liblouis (`lou_translate`)
- Backspace deletes the last cell in the Nemeth field, as in any text field
- Headed thought-stream demo scripts (`npm run test:demo:thought`)
- BANA audit ledger, Electron evidence shards, and coverage reports as of
  merge `2ef0efb` (Nemeth gate pass `011f226`)

**Explicit non-claim:** coverage status is **implementation-complete;
evidence-incomplete**. Human review ledgers are empty (0 transcriber / 0
blind-contributor reviews). Rules 25–26 are excluded. Screenshots and
automated passes are not AT or transcriber evidence. See
[`bana-coverage-report.md`](bana-coverage-report.md) and
[`bana-human-review-workflow.md`](bana-human-review-workflow.md).

## Run the build

Prefer the unsigned zip on the
[testing-app prerelease](https://github.com/ParkingSoman/omniya-core/releases/tag/testing-app)
(Apple Silicon Mac arm64 zip, or Windows x64 zip). Unzip and open **Omniya
Core** (macOS) or **Omniya Core.exe** (Windows). The packaged app includes
liblouis; you do not need Homebrew or Node for that path.

`npm start` remains for contributors. Do **not** open
`src/renderer/index.html` in a browser. When you run from source, literary
UEB labels need Homebrew liblouis (`lou_translate` at `/opt/homebrew/bin` or
`/usr/local/bin`, or set `OMNIYA_LOU_TRANSLATE`).

```bash
git fetch origin
git checkout testing
npm install
npm start
```

Optional headed writing demo:

```bash
npm run test:demo:thought
```

## Sighted PM checklist

1. Launch the packaged app or `npm start`. Confirm notes / type radios are not visible chrome.
2. Type in the document. `#mode-panel` shows Text · UEB G2 (or G1). Ctrl+E
   inserts Nemeth; Ctrl+L inserts LaTeX. Enter commits the equation, then
   type text again. Escape discards an unfinished equation.
3. Type print text; confirm the article has a UEB `aria-braillelabel`
   (inspect or AT). Ctrl+T toggles UEB G2 / G1.
4. Ctrl+E → author Nemeth cells in `#composer-source` → Enter. Non-cell
   QWERTY shows a field error. Empty equation submit refuses (no second dock).
5. Enter explorer → arrow to a term → **r** → same composer opens (status
   shows replacing scope); Escape cancels unchanged. **a** / **o** insert
   after / before the focused node.
6. Cmd/Ctrl+Z undoes a submitted replacement; Shift+Z redoes.
7. Backspace in an open Nemeth draft undoes the last accepted step.
8. Keyboard help (button, Help menu, or the dialog) lists Ctrl+E / L / T,
   Enter, Escape, braille ⠿, and the application menu. No Ctrl+[, Command
   keys, or Add item.
9. Quit, reopen, confirm the napkin persisted.

More detail: [`guided-nemeth-user-guide.md`](guided-nemeth-user-guide.md).

## Blind-contributor brief (shareable)

**Prerequisites:** Apple Silicon Mac or Windows x64 zip from
[testing-app](https://github.com/ParkingSoman/omniya-core/releases/tag/testing-app)
(Node is not required for that path); VoiceOver (or another screen reader) +
a braille display. Contributors who run from source still need Node +
`npm install`, and Homebrew `lou_translate` for literary UEB labels.

**How tasks should be framed** (coordinator → tester): give only the **user
task**, the **exact Nemeth cells** to enter, and the **BANA citation**. Do
**not** share registry IDs, expected pass/fail output, or implementation
source before the task. Full protocol:
[`bana-human-review-workflow.md`](bana-human-review-workflow.md).

**Core AT path to try:**

1. Create a napkin; type in the document.
2. Ctrl+E inserts Nemeth; Ctrl+L inserts LaTeX. Enter commits the equation
   then returns to text. Escape discards an unfinished equation.
3. On a braille display, with no pending UEB cells, full cell ⠿ inserts
   Nemeth. The UEB word “for” collides; use Ctrl+E or the Insert menu.
   Ctrl+T toggles UEB grade on text. Insert / Format / Help menus (Alt on
   Windows; menu bar on Mac) do the same.
4. For an equation: author cells in the unified composer from the braille
   display; Nemeth rejects non-cell keys with a field error; submit with
   Enter.
5. Enter explorer; arrow to a subexpression; press **r**; author in the same
   composer; submit. **a** / **o** insert after / before that node.
6. Confirm the focused braille matches the **subtree**, not only the whole
   expression.
7. Undo / redo; save; quit; reopen.

**Honest limits for this gate:**

- Six-key SDF/JKL simulation is **off** in `npm start` (test-flag only). Use
  a real display (or type Unicode / ASCII braille into the field).
- This is usability / workflow feedback, **not** a BANA certification session.
- Grade preference (`uebGrade`) is session-only and not persisted yet.

## Known inherited gaps (not introduced by the gate merge)

These already fail on the pure Nemeth tip and remain on `testing`:

- 2 unit cases (Rule 15.12 hollow arrow modifier; Rule 21.12 superposition
  choice vs applied)
- A few `inline-editing` e2e cases (Replace-button MathML id assertion,
  some bound / spacing projection mismatches)

UEB authoring e2e on this branch is green. Full BANA Electron corpus is
evidence grind, not a human-gate blocker.

## Deferred (not on this tip)

Older `state-handoff` / `submit-refactor` lanes were not retargeted; the
Replace `allowAtomicSubmit` path is already present on the assembled tip.
Uncommitted mid-grind evidence on the Nemeth worktree (e.g. Rule 11 JSON
WIP) was left out until it is committed there and merged forward.
