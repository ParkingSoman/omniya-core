# Guided Nemeth registry audit notes

This file records decisions made while auditing the local-operation registry
against the normative sources:

- BANA, *The Nemeth Braille Code for Mathematics and Science Notation 2022*,
  Rules 1–24 and Appendix D: [official PDF](https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf).
- BANA, *Errata Nemeth Code 2022*, approved October 2025: the errata PDF named
  by the project ledger.

MathJax/SRE and MathCAT are independent projection and regression checks. They
do not establish that a Nemeth input sequence is valid. A row is accepted only
when its `banaRefs` points to the rule/table/example that defines the code.

## Corrections made in this audit

| Registry area | Normative decision | Implementation consequence |
| --- | --- | --- |
| Rule 19 bold brackets | BANA 19.3 uses `_@(` and `_@)`. | `group.bold-bracket-*` uses cells `⠸⠈⠷` / `⠸⠈⠾`. |
| Rule 19 barred brackets | BANA’s barred brackets use `@_(` and `@_)`, distinct from bold brackets. | `group.barred-bracket-*` uses cells `⠈⠸⠷` / `⠈⠸⠾`. |
| Rule 19 half brackets | Half-brackets are Rule 19.4, including lower halves. | Lower-half rows cite 19.4 rather than 19.1. |
| Rules 21.7 and 23.20 vertical bar | The “such that” and ordinary vertical-bar signs use the bar cell `|` (`⠳`); context selects the meaning. | The registry no longer uses `⠡` for a vertical bar. `⠡` remains the dot/asterisk family where BANA defines it. |
| Rule 23.17 unique existence | BANA writes “there exists uniquely” as `` `=| ``. | The bounded code is `⠈⠿⠳`; it creates an `<mrow>` containing `∃` and `|`, allowing the normal MathJax tree to expose both pieces. |
| Rule 23.8 end of proof | BANA defines the local QED icon as `@$qed`, preceded by an empty cell. | The registry records `@$qed` as the source notation and keeps the spacing/passage boundary outside the equation-local token. |
| Rule 23.10 degree | BANA's worked degree example uses the direct-over indicator before the hollow dot: `~.*`. | `misc.degree` is source-linked to 23.10 and is kept distinct from the standalone hollow-dot `.*` token. |
| Rule 23.18 negated therefore | The symbol index explicitly gives the negated construction as `/,*`. | `misc.not-therefore` is a bounded local token with the exact cells `⠌⠠⠡` and a retained `negated-therefore` intent. |
| Rule 23.16 primes, Rule 23.17 quantifiers, Rule 23.20 does-not-divide, Rule 11.1.1 omission | The source mnemonics are literal local codes: apostrophe, repeated apostrophe, backtick-plus-ampersand, backtick-plus-equals, slash-plus-backtick-plus-equals, slash-plus-vertical-bar, and equals. | The registry now retains each source notation alongside its cells; tests assert the mapping instead of relying only on projected glyphs. |
| Rule 22 expansion | The standard specifies component order and examples, but not every Unicode arrow-name guess. | Unsupported guessed arrow rows were deleted. Retained rows are exact source examples; further combinations require a separately reviewed bounded component registry. |
| Rule 22.3 and 22.7.2 constructions | The six-step arrow examples and the upper/lower-half barb examples are complete local codes, not a passage grammar. | The registry now carries the published source notation for the bold vertical arrow, northwest blunted spear, and all Examples 22-40 through 22-52. Their MathML glyph is only a projection; `data-omniya-nemeth-intent` retains the exact BANA head/shaft distinction. |
| Rules 17 and 18 basic shapes and functions | The printed tables define the local source forms directly, such as `$c`, `$4`, `$t`, `$hx`, `sin`, `<lim`, and `%lim`. | Those rows now retain the exact table notation in `args.sourceNotation`; the generated six-dot cells are checked against the same source row. |
| Rule 20.6 combined plus/minus signs | BANA lists each regular/bold combination explicitly (`+-`, `-+`, `-"-`, and the `_`/`"` variants). | The registry uses those printed local codes rather than undocumented cell literals. |
| Rules 21.1, 21.3–21.5, and 21.8 | Negated, identical, membership, and less/greater-or-equal signs have exact Appendix D forms such as `/.k`, `/_l`, `` `5``, `"k:`, and `.1:`. | The corresponding rows now carry those source forms and tests assert them. |
| Rule 23.12 integral symbol table | The current equation scope exposes the table's single, double, triple, lower, upper, and circle/infinity/rectangle/square forms. Clockwise, finite-part, double-stroke, times, intersection, and union integral glyphs are not listed in the 2022 Rule 23 table. | Unsupported superposition rows were deleted rather than retained as serializer-derived aliases. MathJax/SRE fixtures for those glyphs remain projection evidence only. |
| Rule 9.1 checkmark erratum | The erratum does not create a fixed checkmark symbol. It recommends the transcriber-defined shape construction `.=`$cm`, including the backtick before the shape indicator. | `reference.checkmark` now consumes `⠨⠿⠈⠫⠉⠍`, records the erratum reference, and inserts one local checkmark shape. |
| Rule 13 fraction lines | BANA distinguishes the ordinary horizontal line `/` from the diagonal line `_/` for simple and mixed fractions, and likewise `,/` from `,_/` and `,,/` from `,,_/` for complex and hypercomplex forms. | Fraction follow-up rows retain a `bevelled` MathML attribute: horizontal rows set `false`, diagonal rows set `true`; tests exercise every supported fraction kind without changing the local three-policy input model. |
| Rules 14.4.2–14.4.3 level chains | A two- or three-component level indicator describes successive positions relative to the prior script, not a passage-level parse. | The registry has one atomic row per published direction sequence. A single reusable chain operation composes nested `msup`/`msub` nodes and opens the next required slot; no parser stack or operand inference is persisted. |
| Rule 8.7 short dash, Rule 8.4 endings, Rule 16.3 radical order | The short dash is the complete two-cell dots-36 construction; plural and possessive endings are local suffix operations; repeated dots-46 order indicators apply only to the next nested radical and matching terminator. | The registry uses an atomic two-cell dash, a context-filtered plural follow-up with explicit choice against the letter `s`, a bounded apostrophe-s sequence, and radical-order modes capped at three cells. Accuracy fixtures compare whole and nested output with pinned SRE while BANA remains authoritative for input meaning. |

## Three local input policies

The policy is applied to every construction family, not only arrows and
integrals:

1. **Immediate**: a complete BANA sign can be applied now. An ordinary
   integral, a comparison sign, or a fraction opener may create MathML holes
   and move focus immediately.
2. **Atomic sequence**: the prefix is not itself a complete local sign. The
   dispatcher collects only the registered cells for that one construction and
   commits it on Enter. Invalid or incomplete input cannot mutate the draft.
3. **Structural follow-up**: a later local sign operates on an existing tree
   object, for example adding a bound or a modifier to an integral.

This is bounded input recognition, not a passage parser. There is no
precedence grammar, operand inference, delimiter stack, AST, or arbitrary
expression buffer.

## Evidence status

The generated conformance report intentionally remains `development`. Unit
fixtures prove registry integrity and local transitions; SRE and MathCAT tests
prove projection agreement; neither substitutes for a complete subsection and
Appendix D ledger review by a qualified Nemeth transcriber. Rule 25 spatial
arrangements, chemistry, and Rule 26 document formatting remain outside the
equation-tree claim.

## Source-notation evidence added in this pass

The registry now carries `args.sourceNotation` for audited composite rows, in
addition to the Unicode cells and BANA rule reference. This is deliberately
small and explicit rather than generated by a reverse translator. Current
examples include BANA 20.7's cross (`` `*``), BANA 23.11 infinity (`,=`), the
Rule 22.5.2 spear examples (``$77o``, ``$[77``, ``$[77o``), Rule 17 regular
polygons (``$6`` and ``$5``), and the Rule 17.6.1 angle-with-interior-arc
construction (``$[_$$a}``). The report generator exposes this field so a
reviewer can compare source notation, six-dot cells, resulting MathML, and
the independent SRE/MathCAT projection without treating the projection as the
standard.

Generated alphabet rows, punctuation modes, and structural transitions now also
carry their exact printed BANA construction where one exists. A row that is
contextual rather than a standalone printed symbol carries `sourceKind` instead
of pretending that a projection glyph is a normative input code. The report and
tests reject rows with neither form of source evidence.

The source-notation helper has two explicit BANA arrow aliases: `~` means the
superscript direction indicator (raise the nearer head) and `;` means the
subscript direction indicator (lower the nearer head). They are converted to
the corresponding six-dot cells only while constructing one registry row;
they are not accepted as a user passage encoding and do not add parser state.
