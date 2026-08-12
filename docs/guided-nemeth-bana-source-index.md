# Guided Nemeth source index

This index explains how the registry's three local input policies are applied
to BANA constructions. BANA 2022 and its October 2025 errata are normative;
APH is used only for instructional terminology, and MathCAT/SRE are
independent projection and regression checks. The registry stores the exact
section reference on each row. The generated
[`guided-nemeth-conformance.json`](guided-nemeth-conformance.json) exposes
those rows, their cells, action, policy, context, and errata references for
machine review.

## How to read a registry row

Each row is one local operation, not a passage parser:

| Registry field | Meaning |
| --- | --- |
| `cells` | Exact Unicode Braille cells transcribed from the BANA notation. |
| `banaRefs` | Normative BANA section(s) defining the sign or transition. |
| `errataRefs` | October 2025 corrections applied to this row, when applicable. |
| `commitPolicy` | `immediate`, `atomic-sequence`, or `structural-followup`. |
| `action` | A small MathML operation such as inserting one token, opening one structure, or moving one slot. |

The same policy applies to every family. A standalone BANA sign is
`immediate`. A sign whose meaning depends on a complete bounded construction
is `atomic-sequence`; Enter commits only that registered construction. A code
that fills or changes a structure already in the draft is a
`structural-followup`. If an immediate sign is also a prefix of a longer
atomic sign, the registry marks it `preferLonger` and the dispatcher holds the
short sign only long enough to see whether the bounded local code continues.
Enter can still commit the short sign. This is registry-wide lookahead, not a
special arrow or integral rule.

## BANA coverage map

The source links below are the review index for the rows in
`src/domain/guided-nemeth/index.js`.

| BANA source | Registry families | Policy examples |
| --- | --- | --- |
| Rules 1–4 | Input normalization, passage boundaries, indicators, numeric and punctuation context | Immediate cells and bounded indicator sequences; passage layout remains outside an equation tree. |
| Rules 5–6 and Appendices C–D | English, Greek, German Fraktur, Hebrew, Russian, capitalization, Roman numerals | Literal one-letter atoms and atomic alphabet constructions. |
| Rule 7 | Typeforms and numeric typeforms | Immediate mode/decorator followed by one local atom. |
| Rule 8 | Mathematical punctuation | Literal punctuation or a bounded punctuation-indicator plus mark. |
| Rules 9–10 | Reference signs and abbreviations | One local reference or abbreviation construction; no word buffer. |
| Rules 11–12 | Omissions and cancellation | One local omission/cancellation transition. |
| Rule 13 | Simple, complex, hypercomplex, and mixed fractions | Opening, slot movement, and terminator are separate structural follow-ups. |
| Rule 14 | Superscripts, subscripts, compound scripts, primes, contracted commas, and baseline return | Script structures are opened once; each later code targets an existing slot. |
| Rule 15 | Over/under modifiers, simultaneous sides, higher-order modifiers, parallel bars, binomials, and superposition | Modifier indicators are follow-ups on the focused node or bounded sibling range. |
| Rule 16 | Square, indexed, cube, and fourth roots | Root opening and index/radicand movement are separate local transitions. |
| Rule 17 | Shapes and shape interiors/modifications | A complete shape sign is an atom; a multi-cell shape construction is bounded atomic. |
| Rule 18 | Abbreviated functions and upper/lower limit forms | Function names are bounded local atoms, not an expression or word parser. |
| Rule 19 | Grouping signs | Each multi-cell grouping sign is one bounded atom; grouping contents are edited separately. |
| Rule 20 | Operators and compound operators | Standalone operators are immediate; modifiers and compounds use local follow-ups or bounded codes. |
| Rule 21 | Comparisons and relations | Relation signs are local tokens; horizontal/modified relations are bounded follow-ups. |
| Rule 22 | Arrows and arrowheads | Complete registered arrow constructions are atomic sequences; component meanings are never inferred from arbitrary passage text. |
| Rule 23 | Integral signs, symbols, quantifiers, currencies, and reference symbols | Ordinary integral is immediate; repeated, bounded, and superposed forms are local follow-ups or registered bounded codes. |
| Rule 24 and Appendices A–B | Multipurpose indicator combinations | The indicator selects one next local context; it never opens a global parser mode. |
| Rule 25 | Spatial arrangements | Deferred design work; no claim is made by the current equation tree. |
| Rule 26 | Document formatting | Outside equation-node semantics unless a provision changes mathematical meaning. |

## External validation

The accuracy suite uses three distinct evidence sources:

1. BANA source-linked fixtures are the normative expected cells.
2. MathCAT cases are imported as an independent regression corpus and are
   compared after MathML normalization, not used to invent mappings.
3. MathJax/SRE generates a Braille projection for whole expressions and exact
   focused subexpressions. It checks rendering and scope consistency, but it
   does not decide whether a BANA cell sequence is correct.

An operation is not considered reviewed merely because SRE agrees. It needs a
BANA section reference, an exact cell fixture, a structural transition test,
and a review record from a qualified Nemeth transcriber. The generated report
therefore remains `development` until those human review gates are complete.
