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
| Letters and numerals | Rules 3, 5, 6 | English, Greek, the German glyphs printed in the BANA 6.1.1 table, Hebrew aleph, Russian ell/sha, lower-cell Nemeth numerals, bounded non-decimal-base digits (3.6), uppercase Roman numeral local mode (3.11), capitalization, and bounded alphabet indicators implemented; ordinal and table/diagram contexts remain document or context-policy work; ordinary plural and possessive suffixes now operate after the focused complete expression, including scripts | number indicator, base digits, Roman sequence, capitalization, non-English alphabet, suffix scope, and invalid-context fixtures |
| Typeforms and punctuation | Rules 7, 8 | local letter/number typeform modes, reviewed punctuation tokens including the two-cell short dash (8.7), bounded plural `s`, and the bounded punctuation-indicator + apostrophe + s suffix used after a script (8.4/14.13) implemented; ordinary plural letters remain an explicit local choice against the letter `s`; phrase-level typeform boundaries, punctuation-indicator placement after every required indicator, and word/expression scope remain pending | exact official examples, focused whole/subexpression Braille projections, and source-linked diagnostics |
| Reference signs and abbreviations | Rules 9, 10 | Rule 9 asterisk/dagger/double-dagger and the general reference indicator are local mappings; Rule 10 English-letter indicator and abbreviated function atoms are bounded operations; literary abbreviation context, contractions, punctuation, and spacing policies remain pending | compound-symbol fixtures |
| Omissions and cancellation | Rules 11, 12 | general omission and diagonal cancellation transitions implemented; remaining omission/cancellation variants pending | deletion and cancellation fixtures |
| Fractions | Rule 13 | simple, complex, hypercomplex, and mixed structural openings, horizontal and diagonal fraction-line transitions, and terminators are source-linked to the published indicators; continued-fraction and spatial-fraction forms are pending/deferred with Rule 25 | nested fraction depths 2, 8, 32; horizontal-versus-diagonal line fixtures; and terminators |
| Scripts | Rule 14 | one-level scripts, all two- and three-component level-indicator chains from Rules 14.4.2–14.4.3, all 16 four-component chains from Rule 14.4.4, numeric script operands, first compound msubsup transitions, context-safe baseline promotion to MathML multiscripts/mprescripts, Rule 14.7 contracted script commas, Rule 14.12 prime-before-script ordering, and bounded Rule 14.13 possessive suffixes implemented; five-or-more-level combinations and the full prescript fixture corpus remain pending | scripts, two/three/four-level direction chains, contracted commas, primes, possessive suffix, prescripts, multiscripts and baseline return |
| Modifiers | Rule 15 | five-step directly-over/under transitions, bounded multi-token modifier scopes, simultaneous under/over conversion, same-side higher-order wrapping (15.3), parallel-bar local rows (15.5), binomial table construction (15.6), the complete published Rule 15.12 arrow-modifier catalog as bounded local sequences, modifier catalog, and integral superposition follow-ups implemented; modified-script combinations remain pending | modifiers on atoms, grouped expressions, every Rule 15.12 arrow variant, higher-order nesting, parallel bars, binomial, and nested scopes |
| Radicals | Rule 16 | square, indexed, cube, and fourth-root transitions retain the published `>`, `<n>`, `/`, and `]` local codes; Rule 16.3 repeated order indicators and matching local terminators now compose nested square radicals with bounded order modes and stable attributes | nested radicals at multiple depths, index slots, and independent SRE whole/focused Braille fixtures |
| Shapes and functions | Rules 17, 18 | source-listed abbreviated function names and upper/lower limit forms are bounded atomic rows; drawn-in shapes, full function spacing/punctuation, numeric function subscripts, and open-ended unlisted names remain ordinary compositional or pending context policies | named and abbreviated functions |
| Grouping | Rule 19 | round, enlarged, half, barred, bold, angle, and vertical grouping signs are local tokens; Rule 19.2 transcribed horizontal brace/bracket signs reuse the Rule 15.2.1 modifier workflow as structural follow-ups, while drawn-only signs remain document graphics | paired boundaries, horizontal modifier scope, and exact focus restoration |
| Operators | Rule 20 | core and compound operator tokens implemented | official operator examples |
| Comparisons and arrows | Rules 21, 22 | source-backed core relations, modified/vertically/horizontally compounded comparisons, Rule 15.9 comparison superposition, and official directional/diagonal/shaft examples use bounded local rows; any unlisted compound remains a standards-review item | direct BANA source fixtures, ambiguity and compound comparison fixtures |
| Miscellaneous symbols | Rule 23 | reviewed literal symbols include single, repeated, lower, and upper integrals, the four Rule 23 listed circle/infinity/rectangle/square integral superpositions, monetary units, at/crossed symbols, quantifiers, relation symbols, Greek variants, and the transcriber-defined QED shape; serializer-only integral glyph aliases were removed; remaining symbol-index and context/spacing constructions remain pending | symbol-index fixtures, focused integral fixtures, and errata rows |
| Multipurpose indicator | Rule 24 | local baseline/multipurpose context selection implemented; modifier entry, baseline numerals, numeric script return, decimal-return (24.1.g), comparison-horizontal (24.1.f), tally/punctuation (24.1.h), adjacent-bar (24.1.i), horizontal-tilde (24.1.k), and polygon/numeral (24.1.j) one-symbol follow-ups covered; operation-spacing was deleted by the October 2025 errata; erratum 24.1.e is applied | Appendix B combinations |
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
