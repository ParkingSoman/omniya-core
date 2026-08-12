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
| Letters and numerals | Rules 3, 5, 6 | English, Greek, German Fraktur, Hebrew aleph, Russian ell/sha, lower-cell Nemeth numerals, capitalization, and bounded alphabet indicators implemented; broader alphabet/table contexts pending | number indicator, capitalization, non-English alphabet, and invalid-context fixtures |
| Typeforms and punctuation | Rules 7, 8 | local letter/number typeform modes and reviewed punctuation tokens implemented; phrase-level typeform boundaries and word/expression scope remain pending | exact official examples and source-linked diagnostics |
| Reference signs and abbreviations | Rules 9, 10 | reference-sign tokens implemented; abbreviation context pending | compound-symbol fixtures |
| Omissions and cancellation | Rules 11, 12 | general omission and diagonal cancellation transitions implemented; remaining omission/cancellation variants pending | deletion and cancellation fixtures |
| Fractions | Rule 13 | simple, complex, hypercomplex, and mixed structural openings implemented | nested fraction depths 2, 8, 32 and terminators |
| Scripts | Rule 14 | superscript/subscript, numeric script operands, first compound msubsup transitions, and context-safe baseline promotion to MathML multiscripts/mprescripts implemented; deeper level combinations and full prescript fixture corpus pending | scripts, prescripts, multiscripts and baseline return |
| Modifiers | Rule 15 | five-step directly-over/under transitions, bounded multi-token modifier scopes, modifier catalog, simultaneous under/over conversion, and integral superposition follow-ups implemented; remaining higher-order combinations remain pending | modifiers on atoms, grouped expressions, and nested scopes |
| Radicals | Rule 16 | square, indexed, cube, and fourth-root transitions implemented | nested radicals and index slots |
| Shapes and functions | Rules 17, 18 | source-listed abbreviated function names and upper/lower limit forms are bounded atomic rows; open-ended unlisted names remain ordinary compositional letters | named and abbreviated functions |
| Grouping | Rule 19 | round grouping core operation implemented | paired boundaries and exact focus restoration |
| Operators | Rule 20 | core and compound operator tokens implemented | official operator examples |
| Comparisons and arrows | Rules 21, 22 | core relations, quantifier relations, directional/diagonal arrows, short/long shafts, and double-shaft arrows implemented; arbitrary arrowhead combinations pending | ambiguity and compound comparison fixtures |
| Miscellaneous symbols | Rule 23 | reviewed literal symbols include single, repeated, lower, and upper integrals, integral superposition follow-ups, monetary units, at/crossed symbols, quantifiers, relation symbols, and Greek variants; additional symbol-index and shape constructions remain pending | symbol-index fixtures, focused integral fixtures, and errata rows |
| Multipurpose indicator | Rule 24 | local baseline/multipurpose context selection implemented; modifier entry, baseline numerals, numeric script return, and numeral/typeform contexts covered; operation/comparison and decimal-return combinations pending; erratum 24.1.e applied (deleted) | Appendix B combinations |
| Spatial arrangements | Rule 25 | deferred | separate design session |
| Format | Rule 26 | document concern | excluded unless mathematical meaning changes |

## Local input policy

Every registry row is classified by the same three-way rule, across all
mathematical families:

- `immediate`: a complete local code applies as soon as it is recognized.
- `atomic-sequence`: the bounded code stays in the local prefix buffer until
  Enter commits that one registered construction. Invalid or incomplete input
  never mutates the draft.
- `structural-followup`: a complete local code moves between or modifies an
  existing MathML structure, such as a fraction separator, script-slot move,
  or modifier terminator.

Arrows are a prominent atomic-sequence family. An ordinary integral is an
immediate token; its bounds and modifiers are follow-up operations.
Simultaneous under/over modifiers are also follow-ups: the first side creates
a one-sided MathML object, and the second-side indicator upgrades that object
locally. These are examples of the general registry decision, not special
cases. Every new BANA row, whether it is a letter indicator, shape, operator,
function, modifier, radical, comparison, or arrow, must choose one policy
before it is added to the interpreter.

This ledger is not a conformance claim. Release requires every applicable
Rules 1–24 row to move from “pending” to “reviewed” with independently authored
fixtures and qualified Nemeth-transcriber review.

## Registry policy review

The registry applies the three local input policies to every construction
family, rather than hard-coding special handling for arrows or integrals. A
machine diagnostic reports any atomic row whose prefix is an immediate row;
the immediate row must explicitly opt into longer-code lookahead. This keeps
the local buffer reachable without making it an expression parser. The
diagnostic is exercised by `test/unit/guided-nemeth-bana-mappings.test.js`.

When a BANA construction begins with a code that is already a complete
immediate symbol, it is not registered as an unreachable atomic sequence. For
example, ordinary `⠮` inserts `∫` immediately. Bounds, repeated-integral
meaning, and superposed marks are represented by subsequent structural
follow-ups. This avoids claiming support for a compound code that the input
policy could never receive.
