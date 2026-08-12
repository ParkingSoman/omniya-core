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
| Rule 19.2 horizontal grouping signs | BANA says a transcribed horizontal grouping sign is a Rule 15.2.1 modifier, using the left grouping sign over and the right grouping sign under. Drawn-only signs point to labels or explanatory text and are outside equation MathML. | Four context-filtered structural-followup rows reuse the existing modifier scope and terminator path for horizontal braces and brackets. No delimiter parser or graphics object is introduced. |

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

## Rule 3.7 ordinal endings (current audit)

BANA Rule 3.7 says that an unmodified digit with an ordinal ending is written
in UEB except when it occurs in a mathematical expression, where the ending is
Nemeth. The editor represents `st`, `nd`, `rd`, and `th` as four declarative
two-cell `atomic-sequence` rows. They append one `<mi>` suffix to the focused
numeric `<mn>` and are rejected everywhere else. This is an editor-local
construction, not an ordinal-word parser: the number itself is already a
completed local numeric atom, and the suffix is the only subsequent bounded
operation. The exact BANA reference is retained on every row; whole and
focused Nemeth output is checked through the pinned SRE projection while the
standard remains authoritative for the input meaning.

## Rule 7.3.5 mathematical-expression typeforms (current audit)

BANA Rule 7.3.5 uses an opening bold or italic expression indicator and a
matching closing indicator when mathematical typeform is significant. The
registry represents each pair as a bounded local sequence. The opening action
creates an `mstyle` subtree with one ordinary MathML expression hole when the
writer is at an empty root, or wraps the exact populated focus when editing.
The closing action is valid only inside that marked subtree and returns focus
to its surrounding row. It does not collect words, infer a phrase boundary, or
maintain a hidden scope stack. BANA's October 2025 correction to Example 7-19
is retained in `errataRefs` on the bold rows. SRE is used only to inspect the
resulting projection; MathML styling and the BANA cells remain the normative
contract.

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

Rule 14.4.4 explicitly permits more than three level-indicator components.
The registry now contains all 16 four-component direction combinations as
declarative atomic rows. They call the same local script-chain operation as
the two- and three-component rows; five-or-more-component combinations remain
an explicit ledger item rather than being inferred by a general level parser.

Rule 13.8.2 likewise permits higher-order hypercomplex fractions by repeating
the dot-6 prefix. The implementation registers the published order-three
local family and preserves its order in `data-omniya-fraction-order`; the
ordinary fraction slots and line/terminator follow-ups remain unchanged.

## Rule 21.9 modified-comparison catalogue

The published Rule 21.9 table is represented as finite source-linked atomic
rows. Each row contains one exact BANA construction, such as `".k<.*]` for
the degree-over equality or `:%*` for the bar-under intersection form. The
editor buffers only that registered local sequence and creates one `mo` token
on Enter; it does not infer a comparison from arbitrary operators. Where a
Unicode glyph is shared by several constructions, the canonical node retains
`data-omniya-nemeth-intent` so the authored BANA form remains inspectable.
Independent SRE Braille fixtures cover representative equality, bar, logical,
and tilde forms; BANA remains normative for the source cells and meaning.

## Rule 21.12 comparison superposition

The finite Rule 21.12 table is also represented as bounded local mappings.
Published constructions such as `*`._k] (dot through equals), `.1`.`.1]`
(nested greater-than), and `|`.$33o] (through-shaft arrow) are collected as
one registered code and committed as one MathML operator. The operator keeps
the BANA source intent when a Unicode projection is shared or unavailable.
This uses the generic superposition action and does not add a comparison
grammar or infer operands. Representative rows are checked against the
independent SRE projection; cells and meanings remain grounded in BANA Rules
15.9 and 21.12.
## Rule 17.6.2 and 17.6.3 multiple-interior constructions

The BANA 2022 examples for Rule 17.6.2 and Rule 17.6.3 are represented as
two bounded `atomic-sequence` registry entries. The horizontal example
`$c_$$%33o"$<33o]` and vertical example `$c_$$33o$[33]` are collected only
until their published terminator and are committed by Enter as one local
circle construction. They do not create a passage buffer or infer an
arbitrary interior expression. The canonical MathML token carries the source
intent (`interior-arrows-horizontal` or `interior-arrows-vertical`) while SRE
provides the independent projected Nemeth for the resulting mathematical
symbol. See BANA 2022 Rule 17.6.2 and 17.6.3 and the corresponding accuracy
fixture in `test/unit/nemeth-braille-accuracy.test.js`.
