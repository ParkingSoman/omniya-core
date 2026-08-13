# BANA source coverage status

This file records the measured source inventory and the current engineering
gate. It is intentionally not a conformance claim while any row remains
unimplemented or unevidenced.

## Source measurements

The inventory is generated from the rendered-text extraction of the exact
source PDFs whose SHA-256 hashes are stored in
`docs/bana-source-inventory.json`. The BANA PDF contains 508 actual numbered
provision labels plus the 4.6.8.c provision explicitly targeted by the errata,
for 509 source provision rows after numeric example lines and cross-reference
text are removed. The earlier planning baseline of 516 included seven numeric
example lines and is retained in the inventory as `planBaselineNumberedRows`
only to make the discrepancy auditable. The inventory also contains 1,229 official
worked-example headings and 42 effective October 2025 errata anchors. Of the
errata anchors, 34 are equation-applicable, five are Rule 25 spatial, and
three are Rule 26 document-format anchors.

The source parser records both the printed manual page (for example `14-18`)
and the extracted PDF page. It does not infer a source row from a registry
mapping. Every registry row must cite a real numbered source provision, with
the Rule 2 symbol-page operation attributed to its numbered 2.1 section.
Appendices A-C are represented as context-policy rows, and Appendix D is
represented by all 63 entries in its published symbol-order index. Appendix D
entries link to reusable registry families; they do not create a second parser
or a symbol-specific dispatch path.

## Engineering gates

Run these commands from the persistent-tree worktree:

```text
npm run bana:inventory
npm run bana:registry-coverage
npm run bana:audit
```

`bana:registry-coverage` currently reports 681 declarative operations, 146
distinct BANA references, and 363 numbered provisions with no registry
operation yet. That is a failing implementation gate, not “representative
coverage.” `bana:audit` additionally requires every applicable row to have
implementation, creation, editing, navigation, whole-expression Braille,
focused Braille, undo/redo, persistence, and qualified transcriber-review
evidence. It must remain red until those rows are actually implemented and
exercised through Electron.

For the longer renderer-bound mapping pass, run
`npm run test:bana:electron-mappings`. It sets `BANA_ELECTRON_REGISTRY=1`,
launches one loaded Electron session, and feeds every distinct declarative
Nemeth code through the visible replacement control. It is intentionally
separate from the 30-test workflow suite so a fast smoke run cannot be
mistaken for the full mapping corpus.

The loaded Electron suite is real evidence: `npm run test:e2e` currently passes
30/30 tests in the logged-in macOS renderer, including one-cell Nemeth input,
all three local input policies, MathJax arrow navigation, E-scoped exact
replacement, whole/focused Braille, and persistence. Those tests are linked to
source rows incrementally; the 30 tests do not by themselves satisfy the
1,229-example gate.

## Required completion state

The final generated report must contain no `unclassified`, `pending`, `gap`,
`unknown`, or unsupported applicable rows. The only exclusions permitted are
Rule 25 spatial arrangements, chemistry, and equation-inapplicable document
formatting. The coverage script is deliberately strict so a family-level
ledger or a unit-only fixture cannot close an individual source row.
