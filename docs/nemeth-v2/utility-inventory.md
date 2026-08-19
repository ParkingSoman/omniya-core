# Utility inventory — what a student can actually write

The corpus gate (`coverage.md`) measures **correctness** against 613 externally-verified cases.
It does not measure **usefulness**, and the two came apart badly: at PASS 177 / ERROR 0 the parser
still could not write `a - b`. This file is the second gate. It asks a different question — can a
person do their homework — and it is ordered by what people actually type, not by corpus frequency.

Measured at commit `c6f5216`: **18 of 30 = 60%.**

## Supported

| Area | Works |
|---|---|
| Arithmetic | addition, division, implicit product (`3x`), decimals |
| Relations | `=`, `<`, `>`, `∼` |
| Structure | parentheses, brackets, fractions, **nested fractions**, `√` |
| Powers | exponent, subscript, simultaneous sub+sup, non-simultaneous scripts |
| Greek | π, α (via the Task 5c prefix pass), capitals, German/Fraktur |

**Nesting is not a limitation.** `\frac{\frac{a}{b}}{c}` parses, `(x+1)(x+2)` parses,
`x^{2}+3x+2=0` parses. The parser is a real tokenizer plus recursive descent, so expression
*complexity* costs nothing — only missing *symbols* do. Every failure below is a missing row or a
missing name, not a structural limit.

## Missing, in priority order

| # | Gap | Kind of work |
|---:|---|---|
| 1 | **minus / negation** | one symbol row (Rule 20 sign of operation) |
| 2 | **× / · multiplication** | one symbol row |
| 3 | **≤ ≥** | two comparison rows |
| 4 | **function names** — `sin`, `cos`, `tan`, `log`, `ln` | **not a row**: a multi-cell *sequence* of letter cells needing longest-match over a name list. Same shape as `word_77_4_12` ("seven"), which refuses today for exactly this reason. The trie already does longest-match on cells, so this is small — but it is grammar, not data. |
| 5 | **∫ integral** | row, plus limits-as-scripts grammar |
| 6 | **∞, prime `′`, `\|x\|`, nth root** | rows |
| 7 | θ and other Greek letters whose cells are not plain letter rows | rows |

Some "missing" entries above were probed with hand-written Braille-ASCII and may be **my encoding
error rather than a parser gap** — each must be checked against the BANA symbol tables before being
treated as work.

## The standing lesson

Task 5's whole ordering came from corpus refusal counts. That measured what MathCAT's and SRE's
rule-test corpora exercise, not what a student types: `⠤` ranked ~5th and was deferred as
"if budget remains". **Corpus coverage is not utility.** This file exists so that never recurs —
it must be re-measured whenever the symbol table changes.

## Caution that is NOT optional

Adding rows is cheap, and that is the trap. Task 5a added digits and letters as pure data: PASS
+68, and **11 wrong answers**, because the data reached grammar that did not exist yet. The
standing ruling from that task applies to every row added here: **data ships with the grammar it
exposes, or it does not ship.** The corpus gate is what catches the difference — run both gates.
