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
  inserts LaTeX. Enter commits the equation and **stays in equation mode**, in
  the same method, ready for the next expression. Escape returns to text (and
  discards an unfinished equation).
- Braille: the Nemeth field reads raw cells and computer-braille text alike,
  detected from the input itself with nothing to configure. Command mode is
  gone; there is no Ctrl+[, no Command n/i/t/x, and no Add item.
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
(`Omniya-Core-mac-arm64.zip` for Apple Silicon, or `Omniya-Core-Setup-x64.exe`
for Windows x64 — an installer, not a zip). Unzip and open **Omniya Core** on
macOS; run the installer on Windows, after which it auto-updates itself. The
packaged app includes liblouis; you do not need Homebrew or Node for that path.

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
   inserts Nemeth; Ctrl+L inserts LaTeX. Enter commits the equation and the
   composer stays in equation mode — type a second expression with no Ctrl+E
   in between, and check `#composer-status` says so. Escape returns to text;
   it also discards an unfinished equation. `#mode-panel` must say `editing`,
   not `empty`, once there are cells in the field.
3. Type print text; confirm the article has a UEB `aria-braillelabel`
   (inspect or AT). Ctrl+T toggles UEB G2 / G1.
4. Ctrl+E → author Nemeth in `#composer-source` → Enter. With no braille
   hardware, type the computer-braille spelling: `?a/b#` is a fraction. The
   status line names the reading it used. Empty equation submit refuses (no
   second dock).
5. Enter explorer → arrow to a term → **r** → same composer opens (status
   shows replacing scope); Escape cancels unchanged. **a** / **o** insert
   after / before the focused node.
6. Still in the explorer, press **Backspace**: the equation you are reading is
   deleted, as it is for any other focused item. Then press **+ New napkin**
   and type a name containing an `a`, `o` or `r` — every letter must reach the
   name field, and focus must stay in it. Both failed in alpha 14: r / a / o
   were claimed as explorer shortcuts wherever focus happened to be, so the
   name went into the writing field instead and the form kept asking for one.
7. Cmd/Ctrl+Z undoes a submitted replacement; Shift+Z redoes.
8. Backspace in an open Nemeth draft undoes the last accepted step.
9. Keyboard help (button, Help menu, or the dialog) lists Ctrl+E / L / T,
   Enter, Escape, and the application menu. No Ctrl+[, Command keys, or Add
   item.
10. Quit, reopen, confirm the napkin persisted.

More detail: [`guided-nemeth-user-guide.md`](guided-nemeth-user-guide.md).

## Blind-contributor brief (shareable)

**Prerequisites:** from
[testing-app](https://github.com/ParkingSoman/omniya-core/releases/tag/testing-app),
either `Omniya-Core-mac-arm64.zip` (Apple Silicon) or `Omniya-Core-Setup-x64.exe`
(Windows x64 — an installer, **not** a zip; there is no Windows zip asset). Node is
not required for that path. Plus VoiceOver (or another screen reader); a braille
display is ideal but not required — without one, type the computer-braille
spelling (`?a/b#`). Contributors who run from source still need Node +
`npm install`, and Homebrew `lou_translate` for literary UEB labels.

**How tasks should be framed** (coordinator → tester): give only the **user
task**, the **exact Nemeth cells** to enter, and the **BANA citation**. Do
**not** share registry IDs, expected pass/fail output, or implementation
source before the task. Full protocol:
[`bana-human-review-workflow.md`](bana-human-review-workflow.md).

**Core AT path to try:**

1. Create a napkin; type in the document.
2. Ctrl+E inserts Nemeth; Ctrl+L inserts LaTeX. Enter commits the equation
   and keeps the equation editor up in the same method. Escape returns to
   text; it also discards an unfinished equation.
3. Ctrl+T toggles UEB grade on text. Insert / Format / Help menus (Alt on
   Windows; menu bar on Mac) do the same.
4. For an equation: author cells in the unified composer from the braille
   display; submit with Enter. If your display sends translated text rather than
   cells, that is expected to work too — the status line will say "read as
   computer braille". If it does not, send Help → Copy braille input diagnostics.
5. Enter explorer; arrow to a subexpression; press **r**; author in the same
   composer; submit. **a** / **o** insert after / before that node.
6. Confirm the focused braille matches the **subtree**, not only the whole
   expression.
7. Undo / redo; save; quit; reopen.

**Honest limits for this gate:**

- There is no input-table setting and no six-key chording. Both were removed:
  the table is detected (cells and computer-braille text occupy disjoint code
  point ranges, so it is measured, not guessed), and chording made `s d f j k l`
  ambiguous — `f` was either dot 1 or the letter f, which silently corrupted
  `f(x)` and the Nemeth equals sign `.k`.
- Consequence worth naming: `8bc05ae`'s outright refusal of letter keys is gone
  with it, since there is no cells-only mode left to fall back to. A typed
  letter is read as the cell it spells. What replaces the guarantee is
  disclosure — the status line names the reading on every keystroke, so nothing
  is reinterpreted silently.
- ⠿ as a shortcut for "insert Nemeth" does **not** work and never did in a
  shipped build: its only code path sat behind a simulation flag that was never
  set. Use Ctrl+E or Insert → Equation (Nemeth).
- If braille input does not behave, **Help → Copy braille input diagnostics** captures
  the build, the input table in force, and everything the writing field received
  **since the app was opened** — not a tail of it. Three things changed after an alpha
  report on 2026-08-23 arrived with a log that could not contain the answer:
  - it holds the whole session, where it used to keep 50 entries and print 20;
  - it records text mode as well as Nemeth, with a `-- mode:` line at each change,
    so "I thought I was in equation mode" is visible rather than indistinguishable
    from having typed nothing;
  - it records what Enter did (`commit verdict=accepted` / `verdict=refused`, with
    the message), which the old capture could never reach because it stopped the
    moment Enter left equation mode.

  The report is long by design and states its own size. Paste it into the report
  rather than describing the symptom, which historically took several rounds.
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
