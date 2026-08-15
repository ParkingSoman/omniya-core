# BANA guided Nemeth coverage report

Generated from `docs/bana-coverage.json`.

- Source rows: 1846
- Numbered provisions: 509
- Applicable rows: 1546
- Fully implemented rows: 1546
- Qualified-transcriber reviewed rows: 0
- Blind-contributor reviewed rows: 0
- Official examples: 1229
- Official examples with extracted source blocks: 1229
- Official examples with Electron creation evidence: 944
- Official examples with Electron editing evidence: 944
- Appendix rows: 66 (63 Appendix D symbols plus A–C policy rows)
- Electron creation-linked rows: 1197
- Electron editing-linked rows: 1196
- Missing Electron creation evidence: 103
- Missing Electron editing evidence: 103
- Missing navigation evidence: 103
- Missing whole-expression Braille evidence: 103
- Missing focused-node Braille evidence: 103
- Missing undo/redo evidence: 103
- Missing persistence evidence: 103
- Missing visual evidence: 107
- Pending independent transcriber review: 1546
- Pending blind-contributor review: 1546

| Rule | Total | Applicable | Implemented | Electron creation | Electron editing | Excluded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 17 | 17 | 17 | 0 | 0 | 0 |
| 2 | 2 | 2 | 2 | 0 | 0 | 0 |
| 3 | 155 | 150 | 150 | 117 | 117 | 5 |
| 4 | 116 | 114 | 114 | 2 | 2 | 2 |
| 5 | 14 | 14 | 14 | 10 | 10 | 0 |
| 6 | 85 | 85 | 85 | 73 | 73 | 0 |
| 7 | 45 | 45 | 45 | 31 | 31 | 0 |
| 8 | 104 | 101 | 101 | 93 | 93 | 3 |
| 9 | 16 | 15 | 15 | 11 | 11 | 1 |
| 10 | 72 | 67 | 67 | 57 | 57 | 5 |
| 11 | 34 | 34 | 34 | 25 | 25 | 0 |
| 12 | 9 | 9 | 9 | 8 | 8 | 0 |
| 13 | 62 | 62 | 62 | 46 | 46 | 0 |
| 14 | 181 | 179 | 179 | 169 | 169 | 2 |
| 15 | 116 | 116 | 116 | 102 | 102 | 0 |
| 16 | 22 | 22 | 22 | 22 | 22 | 0 |
| 17 | 83 | 81 | 81 | 79 | 79 | 2 |
| 18 | 30 | 29 | 29 | 27 | 27 | 1 |
| 19 | 60 | 45 | 45 | 43 | 43 | 15 |
| 20 | 64 | 63 | 63 | 63 | 63 | 1 |
| 21 | 54 | 54 | 54 | 53 | 53 | 0 |
| 22 | 67 | 67 | 67 | 63 | 62 | 0 |
| 23 | 81 | 81 | 81 | 77 | 77 | 0 |
| 24 | 27 | 27 | 27 | 26 | 26 | 0 |
| 25 | 131 | 0 | 0 | 0 | 0 | 131 |
| 26 | 131 | 0 | 0 | 0 | 0 | 131 |
| 27 | 1 | 1 | 1 | 0 | 0 | 0 |
| 32 | 1 | 0 | 0 | 0 | 0 | 1 |
| other | 66 | 66 | 66 | 0 | 0 | 0 |

Status: **implementation-complete; evidence-incomplete**. The release gate remains open until every applicable row has full evidence and both independent reviews.

## Visual evidence

The real Electron corpus also performs one-source-root, one-container, non-zero-geometry, and hidden-source-blank checks for every executable creation and editing case. PNG screenshots are captured for rule review when `BANA_ELECTRON_SCREENSHOTS=1`; the resulting JSON artifact records each `visualCreation` and `visualEditing` path. See [bana-electron-visual-evidence.md](bana-electron-visual-evidence.md).
