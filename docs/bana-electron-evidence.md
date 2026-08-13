# BANA Electron evidence contract

The official BANA corpus is exercised at the application boundary by
`test/e2e/bana-official-corpus.test.js`. This is deliberately separate from
registry unit tests: the runner launches the real Electron application, waits
for the loaded renderer, enters each Nemeth cell through the visible
replacement control, and records an evidence artifact only after the UI has
performed the operation.

For each executable source case, the runner verifies:

1. Creation from an empty equation using one-cell Nemeth input.
2. Whole-expression Braille against the authored source cells.
3. MathJax Explorer navigation to a descendant, followed by `E` and a frozen
   canonical target ID.
4. One exact focused replacement, with focused Braille read from MathJax's
   semantic Braille channel (`data-semantic-braille` when the transient node
   does not expose `data-braille`).
5. Undo and redo after re-entering Explorer, so the keyboard command is sent
   through the same reading workflow as a user.
6. Relaunch from the same data directory and persistence of the committed
   whole-expression Braille.

When screenshots are enabled, the same run records four labeled visual
phases: `input` (Nemeth cells and bounded local status before submission),
`creation` (the complete committed expression), `focused` (the MathJax scope
immediately before `E`), and `editing` (the exact replacement with its
surrounding expression). These are evidence claims, not ornamental snapshots.
The canonical audit table links each available phase separately. The visual
contract is relaxed only for source-policy/document rows that have no equation
rendering to show; executable equation rows may not be closed by a post-edit
glyph alone.

Run one reviewed case and retain its result outside the repository:

```text
BANA_ELECTRON_OFFICIAL=1 \
BANA_ELECTRON_EXAMPLE=3-2 \
BANA_ELECTRON_RESULTS=/tmp/bana-3-2.json \
node --test test/e2e/bana-official-corpus.test.js
```

Run a rule shard in the logged-in macOS environment:

```text
BANA_ELECTRON_OFFICIAL=1 \
BANA_RULE=3 \
BANA_ELECTRON_RESULTS=/tmp/bana-rule-3.json \
npm run test:bana:electron -- --rule 3
```

The result artifact is intentionally not treated as evidence merely because a
case exists in the static corpus. `scripts/bana-coverage-enrich.mjs` overlays
only an explicit Electron result, and the coverage gate requires every
creation, editing, navigation, whole-Braille, focused-Braille, undo/redo, and
persistence field. A skipped corpus test therefore cannot silently make a
source row pass.

Recent logged-in macOS Electron evidence has been retained for the corrected
Rule 3 currency/decimal cases, Rule 4 fraction and abbreviation cases,
Rule 6 examples, Rule 10 nested-fraction abbreviation, Rule 11 scripted
relation, and Rule 12 nested cancellation. Each recorded pass includes
creation, MathJax navigation, exact Nemeth replacement, whole/focused Braille,
undo/redo, and relaunch. The corpus remains source-ordered and the coverage
gate remains open: unexecuted rows and any later failing case are not credited
merely because a registry mapping exists.

Rule 16 verification note (2026-08-13): the real Electron shard now passes
the executable square, cube, fourth-root, nested-root, indexed-number, and
nested-cube-root cases for whole-expression Braille, MathJax navigation, exact
Nemeth replacement, focused Braille, undo, and redo. The source cases for the
bare opener and open letter-index examples remain explicitly incomplete drafts
and therefore do not receive editing or persistence credit. The compound
`<m+n>p+q]` case still fails the local structural-composition gate and remains
open. No Rule 16 report is marked complete until that case is implemented and
its Electron creation and editing evidence is recorded.

Rule 19 verification note (2026-08-13): isolated real-Electron cases 19.4,
19.7, and 19.9 pass and are retained in `docs/electron-evidence/`; 19.7 has
four-phase visual evidence in `docs/electron-screenshots/rule-19-7/`. The
full shard remains open at 19.10. Its failure is a concrete Braille mismatch
in a nested numeric/grouping/division construction, not a launch failure, so
the row is intentionally still open in the canonical table until corrected
and rerun.
