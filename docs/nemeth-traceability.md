# Nemeth compiler traceability

The compiler’s normative source is the [BANA Nemeth Braille Code for Mathematics and Science Notation 2022](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf). BANA describes this publication as a reference for transcribers, proofreaders, and translation-software developers, and says its rules must be accepted literally. The [official Nemeth Code page](https://www.brailleauthority.org/nemeth-code) is the source of the current PDF/BRF and later errata.

The current compiler is deliberately labeled **not conformant**. Its traceability manifest is evidence of what has and has not been implemented; it is not a claim that the small initial lexer is a complete Nemeth translator. A rule row may move to `implemented` only after strict, incremental, source-map, malformed-input, and LaTeX→MathML round-trip fixtures exist for every applicable construction in that row. The official page currently lists [Nemeth 2022 errata approved October 2025](https://www.brailleauthority.org/sites/default/files/2026-08/Errata%20Nemeth%20Code%202022%20Approved%2010-2025.pdf), which must be incorporated before a current-conformance claim.

## Current token decisions

| Compiler family | BANA authority | Current decision | Status |
| --- | --- | --- | --- |
| Latin Braille cells | Rule 6, §§6.3–6.4, [PDF p. 85](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf#page=85) | Preserve the standard six-dot English-letter cell values. Do not infer that an English-letter indicator is optional in every context. | Partial |
| `+`, `-` | Rule 20, §§20.1, 20.6, [PDF p. 279](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf#page=279) | Tokenize as operators only. Spacing, compound plus/minus signs, and context are not yet implemented. | Partial |
| `<`, `>` | Rule 21, §§21.7, 21.13, [PDF p. 298](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf#page=298) | Tokenize the basic comparison cells only. Modified, negated, compounded, and spacing variants remain pending. | Partial |
| `/` | Rule 20 §20.8 and Rule 13 §§13.1–13.2, [PDF pp. 154 and 289](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf#page=154) | Treat slash as an operator token. Do not call it a fraction translation; fraction indicators are not implemented. | Partial |
| Parentheses | Rule 19 §19.1, [PDF p. 252](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf#page=252) | Maintain a delimiter stack for editor recovery. This does not authorize square/braced/vertical/enlarged grouping until their entries are implemented. | Partial |
| Numeric sign `⠼` | Rule 3 §§3.1–3.3, [PDF p. 27](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf#page=27) | **Not translated yet.** The current `#` mapping is only an input-table placeholder and must not be treated as numeric parsing. | Not implemented |
| Superscript/subscript indicators | Rule 14 §§14.3–14.10, [PDF p. 170](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf#page=170) | **Not translated yet.** A caret-like cell is not sufficient; level state, termination, hierarchy, and numeric subscripts are required. | Not implemented |
| Fraction indicators | Rule 2 and Rule 13 §§13.1–13.10, [PDF pp. 22 and 154](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf#page=22) | **Not translated yet.** Simple, complex, hypercomplex, mixed-number, continued, and spatial fractions need separate productions. | Not implemented |
| Whitespace | Rules 4, 8, 19, and 20 | The current parser drops blanks after normalization. That is an explicit known non-conformance because spacing can carry code-switching, punctuation, grouping, and operation meaning. | Not implemented |

## Policy decisions that are not BANA rules

- Unicode six-dot/expanded-cell normalization is an input-transport concern. It must preserve cell offsets; it must not change the mathematical meaning of a cell.
- Incremental EOF delimiter recovery is an editor policy. It may synthesize only a missing closer for preview; strict mode must reject the same incomplete passage. It must never invent an operand, operator, indicator, or number.
- MathML/LaTeX printing is an interoperability projection. It must preserve the AST and source-cell ranges; a LaTeX spelling is not a substitute for a BANA transcription rule.
- Page margins, runovers, pagination, transcriber notes, and tactile-graphic layout belong to document formatting. BANA Rule 26 is therefore tracked but intentionally outside the equation AST.

## Release gate

`TRACEABILITY_MANIFEST` and `SYMBOL_TRACEABILITY` in `src/domain/nemeth/index.js` are machine-readable copies of this table. A conformance report must fail if any applicable row is `not-implemented`, `partial`, or lacks independently authored examples and malformed/incomplete fixtures. The implementation must also be checked against the [BANA 2022 errata listed on the official page](https://www.brailleauthority.org/nemeth-code) before claiming current conformance.

`TOKEN_TRACEABILITY` is the lower-level audit table: every cell currently accepted by the Unicode lexer appears there with its emitted projection, BANA rule/section, source link, and a `verified` or `placeholder` status. `verified` applies only to the identity of the basic alphabet cell; the operator, punctuation, indicator, and delimiter entries are marked `placeholder` until their contextual grammar and neighboring rules are implemented. The unit test `test/unit/nemeth-traceability.test.js` fails if a lexer mapping is added without a corresponding citation.
