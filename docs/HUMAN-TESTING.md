# Human testing gate (`testing` branch)

This branch is the unbroken product build humans should run before anything
lands on `main`. It is **not** a BANA conformance release.

Freeze tip: `testing-freeze-20260814` (tag is behind tip `2ef0efb`).
Current tip includes the Nemeth engineering-gate coverage refresh at
`011f226` (944 official examples with Electron creation/editing
evidence), plus a Word-style document editor with inline equations
([`word-editor.md`](word-editor.md)), judged for feel in [`judging.md`](judging.md).

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

- **The napkin is one document, edited like Word.** Type, Enter for a new
  paragraph, Ctrl+Z / Ctrl+Y to undo and redo (Cmd+Z / Cmd+Shift+Z on Mac).
  Equations sit inside sentences. The design and the reason for every key are in
  [`word-editor.md`](word-editor.md).
- **Alt+= (Windows) or Control+= (Mac) inserts an equation** at the caret. A
  small field opens. Type Nemeth or LaTeX. Ctrl+E / Ctrl+L pick the method while
  the field is empty. Enter inserts the equation and returns to the document,
  caret after it. Escape cancels. The field no longer stays open for the next
  equation.
- **An equation is one unit.** An arrow key selects it, the next moves past it.
  Backspace next to it selects it, a second Backspace deletes it. Undo brings it
  back.
- **MathJax explorer:** with an equation selected, Enter reads it by parts. Arrows
  go through the hierarchy. **r** replaces the focused part, **a** inserts after
  it, **o** inserts before it. Escape returns to the document.
- Old napkins open as documents: each text item becomes paragraphs, each
  equation becomes an equation, and each note becomes a paragraph of its own.
  A copy of the old file is kept beside it (`napkins.before-v3-<time>.json`).
- Braille: the Nemeth field reads raw cells and computer-braille text alike,
  detected from the input itself with nothing to configure. Command mode is
  gone; there is no Ctrl+[, no Command n/i/t/x, and no Add item.
- Application menu: Insert → Equation (Alt+= / Control+=), Equation (Nemeth),
  Equation (LaTeX); Format → UEB G2 / G1 (Ctrl+T); Help → Keyboard shortcuts.
- Notes are gone; literary UEB G1 / G2 via Ctrl+T on text
- Literary UEB G1 / G2 text via native liblouis (`lou_translate`)
- Backspace deletes the last cell in the Nemeth field, as in any text field
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

## Sighted PM checklist

1. Launch the packaged app or `npm start`. The note has focus. There is no
   equation panel on screen. The toolbar has Undo, Redo, Insert equation and
   Shortcuts. The status bar says Saved and shows the UEB grade button. An
   empty note says "Start writing".
2. Type two paragraphs, with Enter between them. Ctrl+Z (Cmd+Z) undoes. Ctrl+Y
   (Cmd+Shift+Z) redoes. Do the same from the Edit menu and from the Undo and
   Redo buttons. Each must work, and a button with nothing to do must look dim
   but keep focus.
3. Put the caret in the middle of a sentence. Press Alt+= (Windows) or Control+=
   (Mac), or press the Insert equation button. The equation panel opens under
   the toolbar with focus in the field. Choose LaTeX (Ctrl+L), type `x^2`, press
   Enter. The equation appears at the caret, the panel closes, and the caret is
   after the equation. Keep typing: the sentence goes on after the equation.
4. Nemeth: Alt+= / Control+=, Ctrl+E, then type the computer-braille spelling
   `?a/b#` (a fraction). The line under the field names the reading it used.
   Enter inserts it. An empty field refuses with a message. Escape cancels and
   leaves the note unchanged.
5. Arrow onto an equation: the first press selects it as one unit, the next
   moves past it. With a screen reader, the equation is spoken once, by name,
   as the caret arrives. The status bar tells a sighted person what Enter and
   Backspace will do.
6. Backspace right after an equation selects it. A second Backspace deletes it.
   Undo brings it back as one step, separate from typing.
7. Select an equation and press Enter, or double-click it: the explorer takes
   focus. Arrow to a term and press **r**. The panel opens, and its heading
   names the part being replaced. Escape cancels and leaves the equation
   unchanged. **a** and **o** insert after and before the focused part. After
   Enter, the explorer is back on the part you edited. Arrow keys never stop on
   a spot with no name (the invisible sign between 2 and y). Escape returns to
   the note with the equation still selected. Undo restores the equation as it
   was before the edit.
8. While reading an equation, press **Backspace**: the equation is deleted, and
   undo restores it. Then press **New note** and type a name containing an
   `a`, `o` or `r`. Every letter must reach the name field, and focus must stay
   in it. This failed in alpha 14: r / a / o were claimed as explorer shortcuts
   wherever focus happened to be.
9. Notes: Ctrl+N (Cmd+N) starts a new note. Rename and Delete beside the title
   act on the open note, and Delete asks first. Tab from the top reaches "Skip
   to note" first. Press Enter on it and focus lands in the note.
10. Help → Copy braille input diagnostics after typing in both the note-name
    field and the equation field. The report must carry a `-- typing into:`
    line for each, and must not say `read as none` for a session that decoded
    cells.
11. Type print text. Confirm each paragraph has a UEB `aria-braillelabel`
    (inspect or AT). Ctrl+T, or the UEB grade button, switches grade 2 and
    grade 1. Hover or focus the button: it explains what it changes.
12. Shortcuts (toolbar button or Help menu) opens a short table of keys:
    Alt+= / Control+=, Ctrl+E / Ctrl+L, Ctrl+T, undo and redo, and the explorer
    keys. It opens at the top, on its title. Escape closes it and focus returns
    to the button.
13. Equation preview: in the equation panel type `\frac{a}{b}+\sqrt{x}` as LaTeX.
    After a short pause the equation is drawn under the field. With a screen
    reader, the field's description says "Reads as: a over b plus the square
    root of x". Type `\frac{a` and nothing is drawn, and nothing is announced.
14. Find: press Ctrl+F (Cmd+F). The find bar opens with focus in its field.
    Type a word that appears twice. Every match is highlighted, and the count
    says "1 of 2". Enter goes to the next, Shift+Enter to the previous, and both
    wrap. A screen reader says the count as it changes. Escape closes the bar and
    leaves the match selected. The word inside an equation you typed is found too.
15. Export and print: press Export and choose Web page. Save it, open it in a
    browser, and read the equation with a screen reader. Do the same with LaTeX
    document and Plain text. Press Ctrl+P (Cmd+P): the print window shows only
    the title and the note. Save as PDF from there.
16. Dark mode and a narrow window: switch the system to dark, and narrow the
    window. Nothing is cut off, and the toolbar shows icons only when narrow.
17. Quit, reopen, confirm the notes persisted. Open a note made before this
    build: its text and equations are there as paragraphs and equations, its
    old notes are paragraphs, and `napkins.before-v3-<time>.json` is in the
    data folder.

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
2. Press Alt+= (Windows) or Control+= (Mac) to insert an equation. Type Nemeth or
   LaTeX. Ctrl+E picks Nemeth and Ctrl+L picks LaTeX while the field is empty.
   Enter inserts it and returns you to the document. Escape cancels.
3. Arrow across the equation. **Tell us exactly what your screen reader says**
   as the caret arrives, as it passes, and when you arrow back. Say which screen
   reader and which browser engine you used. This is the most useful report we
   can get for this build.
4. Ctrl+T toggles UEB grade on text. Insert / Format / Help menus (Alt on
   Windows; menu bar on Mac) do the same.
5. For an equation: author cells in the field from the braille display; submit
   with Enter. If your display sends translated text rather than cells, that is
   expected to work too — the status line will say "read as computer braille".
   If it does not, send Help → Copy braille input diagnostics.
6. Select an equation and press Enter to read it by parts. Arrow to a
   subexpression; press **r**; author the replacement; submit. **a** / **o**
   insert after / before that part.
7. Confirm the focused braille matches the **subtree**, not only the whole
   expression.
8. Backspace next to an equation, twice. Undo. Redo. Save; quit; reopen.

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
  shipped build. Use Alt+= / Control+= then Ctrl+E, or Insert → Equation (Nemeth).
- The equation field no longer stays open after Enter. An alpha tester asked for
  that in August 2026, because they wrote several equations in a row. In a
  document, text follows an equation, so the caret now returns to the document.
  Tell us if this slows you down.
- Screen readers differ on equations inside a sentence. NVDA names the equation
  as the caret arrives. VoiceOver has not been confirmed. See the open questions
  in [`word-editor.md`](word-editor.md).
- If braille input does not behave, **Help → Copy braille input diagnostics** captures
  the build, the input table in force, and everything the equation field received
  **since the app was opened** — not a tail of it. Text typed in the document itself
  is not recorded. Three things changed after an alpha
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

UEB authoring e2e on this branch is green. Full BANA Electron corpus is
evidence grind, not a human-gate blocker.

## Deferred (not on this tip)

Older `state-handoff` / `submit-refactor` lanes were not retargeted; the
Replace `allowAtomicSubmit` path is already present on the assembled tip.
Uncommitted mid-grind evidence on the Nemeth worktree (e.g. Rule 11 JSON
WIP) was left out until it is committed there and merged forward.
