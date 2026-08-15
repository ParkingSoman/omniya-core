# Human testing gate (`testing` branch)

This branch is the unbroken product build humans should run before anything
lands on `main`. It is **not** a BANA conformance release.

Freeze tip: `testing-freeze-20260814` (tag is behind tip `2ef0efb`).
Current tip includes the Nemeth engineering-gate coverage refresh at
`011f226` (944 official examples with Electron creation/editing
evidence), plus UEB command-mode, unified composer, and paper-writing UX.

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

- One unified composer field for text, new equations, and subtree **r** / **a** / **p** edits
  (Nemeth / LaTeX in `#composer-source`; no separate replacement-dock chrome)
- MathJax explorer: Enter to explore, arrows through hierarchy, **r** to
  replace the focused subtree in that same composer (**a** appends after,
  **p** prepends before)
- Insert / Command: `Ctrl+[` → Command; Escape cancels;
  `i` / Enter → Insert
- Notes UI hidden; Text / Equation / Nemeth / LaTeX via Command `t` / `x`
- Literary UEB G1 / G2 text via native liblouis (`lou_translate`)
- Backspace undoes the last Nemeth draft step (not the whole equation)
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

```bash
git fetch origin
git checkout testing
npm install
npm start
```

Do **not** open `src/renderer/index.html` in a browser. Literary UEB labels
need Homebrew liblouis (`lou_translate` at `/opt/homebrew/bin` or
`/usr/local/bin`, or set `OMNIYA_LOU_TRANSLATE`).

Optional headed writing demo:

```bash
npm run test:demo:thought
```

## Sighted PM checklist

1. Launch with `npm start`. Confirm notes / type radios are not visible chrome.
2. Add item → `Ctrl+[` enters Command; Escape cancels
   authoring. `#mode-panel` shows Command / Insert / Text / Equation / UEB /
   Nemeth (focus with Command `s`; not a live region).
3. Command `t` → Insert → type print text → `Ctrl+[` → `n` to submit. Confirm
   the article has a UEB `aria-braillelabel` (inspect or AT).
4. Add item → Command `x` for Equation / Nemeth → Insert → author cells in the
   same `#composer-source` → `Ctrl+[` → `n`. Non-cell QWERTY shows a field
   error. Empty equation submit refuses (no second dock).
5. Enter explorer → arrow to a term → **r** → same composer opens (status
   shows replacing scope); Command `t` is refused; Escape cancels unchanged.
6. Cmd/Ctrl+Z undoes a submitted replacement; Shift+Z redoes.
7. Backspace in an open Nemeth draft undoes the last accepted step.
8. `?` in Command opens contextual help for the current state.
9. Quit, reopen, confirm the napkin persisted.

More detail: [`guided-nemeth-user-guide.md`](guided-nemeth-user-guide.md).

## Blind-contributor brief (shareable)

**Prerequisites:** macOS; Node + `npm install`; VoiceOver (or another screen
reader) + a braille display; optional `lou_translate` for literary UEB labels.
There is no installer yet.

**How tasks should be framed** (coordinator → tester): give only the **user
task**, the **exact Nemeth cells** to enter, and the **BANA citation**. Do
**not** share registry IDs, expected pass/fail output, or implementation
source before the task. Full protocol:
[`bana-human-review-workflow.md`](bana-human-review-workflow.md).

**Core AT path to try:**

1. Create a napkin; Add item.
2. `Ctrl+[` enters Command; Escape cancels. Command `s`
   focuses the authoring mode panel on demand (not live).
3. Command `t` / `x` to choose Text vs Equation (not radios).
4. For an equation: author cells in the unified composer from the braille
   display; Nemeth rejects non-cell keys with a field error; submit with
   Command `n` (or Enter when ready).
5. Enter explorer; arrow to a subexpression; press **r**; author in the same
   composer; submit.
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

UEB command-mode e2e on this branch is green. Full BANA Electron corpus is
evidence grind, not a human-gate blocker.

## Deferred (not on this tip)

Older `state-handoff` / `submit-refactor` lanes were not retargeted; the
Replace `allowAtomicSubmit` path is already present on the assembled tip.
Uncommitted mid-grind evidence on the Nemeth worktree (e.g. Rule 11 JSON
WIP) was left out until it is committed there and merged forward.
