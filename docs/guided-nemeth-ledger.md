# Guided Nemeth conformance ledger

The ledger is deliberately separate from the transition implementation. Every
accepted sequence must have a BANA 2022 section, an errata review, a context
policy, and a structural test. Rule 25 spatial arrangements and chemistry are
separate design work and are not release claims for this phase.

Normative sources:

- [BANA Nemeth Code 2022](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf)
- [October 2025 errata](https://www.brailleauthority.org/sites/default/files/2026-08/Errata%20Nemeth%20Code%202022%20Approved%2010-2025.pdf)
- [APH Nemeth Tutorial](https://tech.aph.org/nemeth/), used for progression and terminology only.

| Family | BANA coverage | Registry status | Required evidence |
| --- | --- | --- | --- |
| Cell normalization and passage boundaries | Rules 1, 2, 4 | implemented as input policy | Unicode, Braille ASCII, expanded ASCII, eight-dot reduction tests |
| Letters and numerals | Rules 3, 5, 6 | basic transitions implemented | number indicator, capitalization, alphabet and invalid-context fixtures |
| Typeforms and punctuation | Rules 7, 8 | punctuation token families implemented; typeform modes pending | exact official examples and source-linked diagnostics |
| Reference signs and abbreviations | Rules 9, 10 | reference-sign tokens implemented; abbreviation context pending | compound-symbol fixtures |
| Omissions and cancellation | Rules 11, 12 | general omission and diagonal cancellation transitions implemented; remaining omission/cancellation variants pending | deletion and cancellation fixtures |
| Fractions | Rule 13 | simple, complex, hypercomplex, and mixed structural openings implemented | nested fraction depths 2, 8, 32 and terminators |
| Scripts | Rule 14 | superscript/subscript core operations implemented | scripts, prescripts, multiscripts and baseline return |
| Modifiers | Rule 15 | ledgered, transition families pending | modifiers on atoms and grouped expressions |
| Radicals | Rule 16 | square, indexed, cube, and fourth-root transitions implemented | nested radicals and index slots |
| Shapes and functions | Rules 17, 18 | atomic shape tokens implemented; function context pending | named and abbreviated functions |
| Grouping | Rule 19 | round grouping core operation implemented | paired boundaries and exact focus restoration |
| Operators | Rule 20 | core and compound operator tokens implemented | official operator examples |
| Comparisons and arrows | Rules 21, 22 | core relations, quantifier relations, and cardinal arrows implemented; compound arrows pending | ambiguity and compound comparison fixtures |
| Miscellaneous symbols | Rule 23 | quantifier, proof, relation, punctuation-adjacent, and Greek-variant literal symbols implemented | symbol-index fixtures |
| Multipurpose indicator | Rule 24 | local baseline/multipurpose context selection implemented; modifier composition pending | Appendix B combinations |
| Spatial arrangements | Rule 25 | deferred | separate design session |
| Format | Rule 26 | document concern | excluded unless mathematical meaning changes |

This ledger is not a conformance claim. Release requires every applicable
Rules 1–24 row to move from “pending” to “reviewed” with independently authored
fixtures and qualified Nemeth-transcriber review.
