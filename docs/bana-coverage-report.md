# BANA guided Nemeth coverage report

Generated from `docs/bana-coverage.json`.

- Source rows: 1846
- Numbered provisions: 509
- Applicable rows: 1568
- Fully implemented rows: 1508
- Official examples: 1229
- Official examples with extracted source blocks: 1229
- Official examples with Electron creation evidence: 120
- Official examples with Electron editing evidence: 120
- Appendix rows: 66 (63 Appendix D symbols plus A–C policy rows)
- Electron creation-linked rows: 178
- Electron editing-linked rows: 176

| Rule | Total | Applicable | Implemented | Electron creation | Electron editing | Excluded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 17 | 17 | 17 | 0 | 0 | 0 |
| 2 | 2 | 2 | 1 | 0 | 0 | 0 |
| 3 | 155 | 155 | 151 | 24 | 24 | 0 |
| 4 | 116 | 116 | 110 | 0 | 0 | 0 |
| 5 | 14 | 14 | 14 | 10 | 10 | 0 |
| 6 | 85 | 85 | 84 | 13 | 13 | 0 |
| 7 | 45 | 45 | 44 | 2 | 2 | 0 |
| 8 | 104 | 104 | 100 | 0 | 0 | 0 |
| 9 | 16 | 16 | 14 | 11 | 11 | 0 |
| 10 | 72 | 72 | 66 | 12 | 12 | 0 |
| 11 | 34 | 34 | 33 | 0 | 0 | 0 |
| 12 | 9 | 9 | 9 | 1 | 1 | 0 |
| 13 | 62 | 62 | 62 | 1 | 1 | 0 |
| 14 | 181 | 181 | 158 | 3 | 3 | 0 |
| 15 | 116 | 116 | 114 | 1 | 1 | 0 |
| 16 | 22 | 22 | 22 | 2 | 2 | 0 |
| 17 | 83 | 83 | 82 | 79 | 79 | 0 |
| 18 | 30 | 29 | 29 | 2 | 2 | 1 |
| 19 | 60 | 45 | 45 | 11 | 11 | 15 |
| 20 | 64 | 64 | 63 | 1 | 1 | 0 |
| 21 | 54 | 54 | 54 | 1 | 1 | 0 |
| 22 | 67 | 67 | 67 | 2 | 0 | 0 |
| 23 | 81 | 81 | 77 | 2 | 2 | 0 |
| 24 | 27 | 27 | 26 | 0 | 0 | 0 |
| 25 | 131 | 0 | 0 | 0 | 0 | 131 |
| 26 | 131 | 0 | 0 | 0 | 0 | 131 |
| 27 | 1 | 1 | 0 | 0 | 0 | 0 |
| 32 | 1 | 1 | 0 | 0 | 0 | 0 |
| other | 66 | 66 | 66 | 0 | 0 | 0 |

Status: **development**. The release gate remains intentionally open until every applicable row has implementation and full Electron/Braille evidence.

## Visual evidence

The real Electron corpus also performs one-source-root, one-container, non-zero-geometry, and hidden-source-blank checks for every executable creation and editing case. PNG screenshots are captured for rule review when `BANA_ELECTRON_SCREENSHOTS=1`; the resulting JSON artifact records each `visualCreation` and `visualEditing` path. See [bana-electron-visual-evidence.md](bana-electron-visual-evidence.md).
