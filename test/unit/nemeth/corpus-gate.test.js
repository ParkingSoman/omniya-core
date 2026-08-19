import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runCoverage } from '../../../scripts/nemeth-coverage.mjs';
import { NemethUnsupportedError, parseNemeth } from '../../../src/domain/nemeth/index.js';

// The corpus gate: grades the parser against all 613 cases in the Tier-1
// correctness corpus. Every case lands in exactly one of four buckets --
// PASS, REFUSE, DISAGREE, ERROR (see scripts/nemeth-coverage.mjs for the
// exact definitions). Most cases REFUSE today because the parser supports a
// deliberately narrow slice; that is expected and correct.
//
// What this file actually gates is DISAGREE and ERROR, not PASS: a REFUSE
// is an honest "not supported yet", but a DISAGREE is the parser silently
// producing wrong mathematics, and an ERROR is the parser claiming success
// while handing MathJax LaTeX it rejects. Both are bugs. Neither is allowed
// to exist un-looked-at -- each must be named here with a reason, or this
// test fails. Widening either allowlist is a decision for a human to make
// on purpose, not something that should happen as a side effect of an
// unrelated change.
//
// `runCoverage` (imported from scripts/nemeth-coverage.mjs, the same
// function that generates docs/nemeth-v2/coverage.md) is run exactly once
// here so this file's assertions and the committed report are provably
// looking at the same computation.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const corpusPath = path.join(projectRoot, 'test', 'corpus', 'nemeth-v1.json');
const reportPath = path.join(projectRoot, 'docs', 'nemeth-v2', 'coverage.md');

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const coverage = await runCoverage(corpus);

// Every DISAGREE case traces back to one structural fact, not five separate
// mysteries: this corpus was built by running MathML *forward* through
// MathCAT's/SRE's Nemeth rules (MathML -> braille) and recording the
// resulting cells. That forward map is deliberately many-to-one -- braille
// correctly discards non-mathematical detail (a leading/trailing space is
// formatting, not content; more than one MathML encoding can render
// identically), so distinct MathML inputs collapse to identical cells.
// Running the corpus in reverse (cells -> our parsed MathML) is therefore
// inherently ambiguous for any case whose MathML differs from another only
// in such non-mathematical detail: the cells alone underdetermine which of
// several equally-valid source MathML trees produced them, and there is
// nothing a braille-to-MathML parser could do differently. Every entry
// below is one instance of this collapse, verified against the corpus
// itself, not guessed -- and DISAGREE = 0 is therefore not always an
// achievable target. What this gate actually enforces is that every
// DISAGREE has a verified structural reason attached, categorized by which
// side of the collapse it is, never a bare "this looks wrong" guess.
const MANY_TO_ONE_FORWARD_MAP = {
  // Sub-cause: equivalent-encoding. MathCAT accepts more than one MathML
  // shape as correct for the same subscript+superscript combination
  // (<mmultiscripts> vs. <msubsup>/nested <msup>); both forward-map to the
  // same cells. Our parser deterministically emits only the
  // <msubsup>/<msup> form, so for each pair below it matches the corpus
  // twin that chose that encoding and disagrees with the twin that chose
  // <mmultiscripts> -- not because either answer is mathematically wrong.
  'mathcat-rules:mmultiscripts_82_a_1': {
    cause: 'equivalent-encoding',
    reason:
      'Corpus target is <mmultiscripts><mi>x</mi><mi>a</mi><mi>n</mi></mmultiscripts>; our parser ' +
      'always emits <msubsup>. Same cells (`⠭⠰⠁⠘⠝`) are ALSO the corpus case ' +
      '"msubsup_82_a_1", whose target IS <msubsup> and which PASSes -- both MathML trees ' +
      'forward-map to these cells, so reversing the cells alone cannot recover which one ' +
      'the corpus intended.'
  },
  'mathcat-rules:nested_sup_mmultiscripts_74_b_1': {
    cause: 'equivalent-encoding',
    reason:
      'Same situation as mmultiscripts_82_a_1: identical cells (`⠝⠘⠭⠘⠘⠽`) also appear as ' +
      '"nested_sup_74_b_1", whose <msup>-nested target matches our output and PASSes. ' +
      'The <mmultiscripts>-encoded twin does not, because we never emit <mmultiscripts> -- ' +
      'both are valid forward-map preimages of the same cells.'
  },
  'mathcat-rules:as_multiscript_nested_sub_sup_74_c_5': {
    cause: 'equivalent-encoding',
    reason:
      'Same shape again: cells `⠝⠘⠭⠘⠰⠁⠘⠰⠰⠚` also appear as "nested_sub_sup_74_c_5", whose ' +
      '<msup>/<msub>-nested target is exactly our `n^{x_{a_{j}}}` and which PASSes. The ' +
      '<mmultiscripts>-encoded twin cannot, since this pipeline never emits <mmultiscripts>.'
  },
  'mathcat-rules:mmultiscripts_82_a_3': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠭⠂⠘⠆` (BANA Example 14-123, simultaneous subscript 1 and superscript 2). The ' +
      'twin "msubsup_82_a_3" carries the <msubsup> encoding of the same mathematics and ' +
      'PASSes on our `x_{1}^{2}`; this entry carries the <mmultiscripts> encoding of it. The ' +
      'implicit-subscript gap that used to make BOTH twins disagree is fixed -- what is left ' +
      'is the encoding choice alone.'
  },
  'mathcat-rules:mmultiscripts_82_b_1': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠁⠘⠝⠐⠰⠍` (BANA Example 14-124, non-simultaneous: (a^n) sub m). The twin ' +
      '"sub_sup_82_b_1" spells that <msub><msup>...</msup></msub> and PASSes on our ' +
      '`{a^{n}}_{m}`; this entry spells the identical tree as <mmultiscripts> with two ' +
      'postscript pairs. Both twins disagreed before Rule 14.11.2 was implemented; only the ' +
      'encoding difference survives.'
  },
  'mathcat-rules:mmultiscripts_82_b_2': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠁⠰⠍⠐⠘⠝`, the mirror of mmultiscripts_82_b_1 (BANA Example 14-125: (a sub m) ' +
      'sup n). Twin "sub_sup_82_b_2" holds the <msup><msub> encoding and PASSes on our ' +
      '`{a_{m}}^{n}`; this entry holds the <mmultiscripts> one.'
  },
  'mathcat-rules:mmultiscripts_82_b_5': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠭⠂⠐⠘⠆`, BANA Example 14-128 verbatim ((x sub 1) sup 2). Unlike the three ' +
      'entries above this case has NO twin in the corpus, so the claim is verified directly ' +
      'instead: the target is <mmultiscripts><mi>x</mi><mn>1</mn><none/><none/><mn>2</mn>' +
      '</mmultiscripts>, i.e. two postscript pairs, and our `{x_{1}}^{2}` compares EQUAL ' +
      'under this gate\'s own mathmlEquivalent to the nested spelling of that same tree, ' +
      '<msup><msub><mi>x</mi><mn>1</mn></msub><mn>2</mn></msup> -- the identical relationship ' +
      'the 82_b_1/82_b_2 twins make visible. The mathematics matches; only the encoding does not.'
  },
  'mathcat-rules:multipurpose_177_2_1': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠭⠐⠢` (BANA Example 24-1). Rule 24.1.b says only that the multipurpose ' +
      'indicator makes the numeral NOT a subscript; it does not say whether the result is one ' +
      'identifier or two juxtaposed terms, and the corpus itself contains both readings of ' +
      'the same cell shape: this case targets <mi>x5</mi>, while "no_num_ind_11_e_3" targets ' +
      '<mi>r</mi><mn>5</mn> for `⠗⠐⠢` and PASSes on our `r5`. Our parser reads the shape ' +
      'juxtaposed in both, matching one MathCAT case and disagreeing with the other -- the ' +
      'cells cannot settle which was meant. LaTeX also has no way to spell a two-character ' +
      '<mi>, so the identifier reading is not emittable regardless.'
  },
  'mathcat-rules:greek_24_b_1_together': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠨⠁⠨⠃` (BANA Example 6-6, Nemeth_2022.txt line 3117 (`_% .a.b _:`): the Greek indicator is repeated ' +
      'for each letter). This case targets one merged <mi>αβ</mi>; the twin "greek_24_b_1" carries ' +
      'the same cells with <mi>α</mi><mi>β</mi> and PASSes on our `αβ`. The corpus therefore holds ' +
      'BOTH element granularities for one braille string, which is the many-to-one collapse itself ' +
      'made visible -- nothing in the cells says whether the author wrote one <mi> or two.'
  },
  'mathcat-rules:boldface_32_a_14': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠠⠨⠰⠠⠓` = sans serif + English-letter + capitalization + h, BANA Example 7-5 verbatim ' +
      '(Nemeth_2022.txt line 3642, `,.;,h`). Our `\\mathsf{H}` round-trips to ' +
      '<mi mathvariant="sans-serif">H</mi>; the target is <mn mathvariant="sans-serif">H</mn>. Same ' +
      'letter, same typeform, different MathML token type -- and the Code has no cell that says ' +
      '"this letter was tagged a number", so <mi> and <mn> forward-map to identical braille. ' +
      'Verified with this gate\'s own comparison: the <mi> spelling compares equal and the <mn> one ' +
      'different, so the tag is the only difference.'
  },
  'mathcat-rules:german_24_a_7': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠸⠠⠁` = German-letter + capitalization + a, BANA Example 6-2 (line 3082) in its ' +
      'capitalized form. Our `\\mathfrak{A}` round-trips to <mi mathvariant="fraktur">A</mi>; the ' +
      'target is <mi>𝔄</mi> (U+1D504, MATHEMATICAL FRAKTUR CAPITAL A). Those are the two ways ' +
      'MathML spells one Fraktur capital A -- base character plus mathvariant, or the Mathematical ' +
      'Alphanumeric codepoint -- and both forward-map to these cells. Checked directly: ' +
      '`\\mathfrak{A}` compares equal to <mi mathvariant="fraktur">A</mi> and different from ' +
      '<mi>𝔄</mi>, so the encoding is the whole of the disagreement.'
  },
  'mathcat-rules:german_base_77_4_3': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠸⠠⠁⠂`: german_24_a_7 with a Rule 14.6 numeric subscript on it. Identical mathvariant/' +
      'Mathematical-Alphanumeric split as german_24_a_7, with the subscript unaffected.'
  },
  'mathcat-rules:boldface_32_b_6': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠸⠼⠲⠼⠒⠢`, BANA Example 7-12 verbatim (Nemeth_2022.txt line 3703, `_#4#35`): one ' +
      'numeral whose 4 is boldface and whose 35 is regular, per 7.2.2 "If the transition is to ' +
      'regular type, only the numeric indicator is used" (lines 3665-3666). Our `\\mathbf{4}35` says ' +
      'exactly that, as <mn mathvariant="bold">4</mn><mn>35</mn>, which this gate confirms compares ' +
      'EQUAL to that spelling and DIFFERENT once the bold is dropped. The target merges it into one ' +
      '<mn>𝟒35</mn> using the Mathematical Bold Digit codepoint. Element granularity is the same ' +
      'collapse the corpus demonstrates on itself in greek_24_b_1 vs greek_24_b_1_together, and ' +
      'LaTeX has no way to put a per-character typeform inside a single <mn>.'
  },
  'mathcat-rules:num_indicator_9_e_5': {
    cause: 'equivalent-encoding',
    reason: 'Cells `⠸⠼⠲⠒⠼⠢⠖`; the same mixed-typeform numeral as boldface_32_b_6, bold 43 then regular 56.'
  },
  'mathcat-rules:tensor_from_mathml_spec': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠠⠗⠰⠊⠐⠘⠚⠐⠰⠅⠐⠰⠇`: capital R with four successive script positions, each re-based by ' +
      'the baseline indicator of Rule 14.11.2. The target spells them as one <mmultiscripts> with ' +
      'four postscript pairs; we spell the identical tree nested, `{{{R_{i}}^{j}}_{k}}_{l}`. Same ' +
      'family as mmultiscripts_82_b_1/_b_2 with four positions instead of two, and verified the way ' +
      '82_b_5 was: our LaTeX compares EQUAL under this gate to the nested spelling of that ' +
      'mmultiscripts tree, and DIFFERENT to a tree with the sup and one sub transposed.'
  },
  'mathcat-rules:lower_roman_numeral_18_b_4': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠧⠊⠬⠊⠧⠀⠨⠅⠀⠭` are BANA Example 3-104 verbatim (Nemeth_2022.txt lines 1698-1701, ' +
      '`vi+iv .k x`). Rule 3.11.1.b (lines 1663-1667) says a lowercase Roman numeral "is treated ' +
      'as though it were a \'single letter\'" and carries no indicator of its own, so the cells ' +
      'are exactly the letters v and i -- nothing marks `vi` as one <mtext> token rather than two ' +
      '<mi>s. The target is <mtext>vi</mtext><mo>+</mo><mtext>iv</mtext><mo>=</mo><mtext>x</mtext>; ' +
      'checked with this gate\'s own comparison, our `vi+iv=x` compares EQUAL to the same tree ' +
      'spelled with <mi> per character and DIFFERENT once the two operands are transposed, so ' +
      'element granularity and token type are the whole of the difference. Same collapse as ' +
      'greek_24_b_1_together (granularity) and boldface_32_a_14 (token type), combined.'
  },
  'sre-aata:AataExpression_259': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠠⠎⠀⠨⠅⠀⠼⠂⠦` = capital S, equals, 18. The target tags the S <mtext>; we emit <mi>. ' +
      'The Code has no cell that says which MathML token type a letter was carried in -- Rule 5.1.1 ' +
      'writes a capital letter the same way either way -- so both forward-map to these cells. ' +
      'Verified with this gate: our `S=18` compares EQUAL to the <mi> spelling and DIFFERENT once ' +
      'the numeral changes, so the tag is the entire disagreement.'
  },
  'sre-aata:AataExpression_66': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠠⠑⠀⠨⠅⠀⠼⠴⠲` = capital E, equals, 04. Same <mtext>-versus-<mi> collapse as ' +
      'AataExpression_259. Verified the same way: EQUAL to the <mi> spelling, DIFFERENT once the ' +
      'leading zero is dropped, so the token type is all that differs.'
  },
  // Sub-cause: homograph. The Nemeth Code writes two different print signs with
  // one set of cells, and the cells alone cannot say which was meant. This is a
  // many-to-one forward map like the others, but the collapse is in the CODE
  // rather than in the MathML, so it is named separately -- our answer is a
  // legitimate reading of the braille, not the reading this case wanted.
  'mathcat-rules:sum_77_4_23': {
    cause: 'homograph',
    reason:
      'Cells `⠨⠠⠎⠴⠘⠝⠐⠁⠰⠅` are BANA Example 14-55 verbatim (Nemeth_2022.txt line 6597, `.,S0~N"A;K`; title at line 6594), ' +
      'whose title is "Right Numeric Subscript to a GREEK LETTER" and whose gloss (line 6598) reads ' +
      'it as "the summation from zero to n of a sub k". The Code has no separate summation sign: ' +
      'the gloss to Example 15-37 (line 7744) calls that same shape "the Greek capitalized sigma". So ' +
      '<mi>Σ</mi> (U+03A3) and <mo>∑</mo> (U+2211) produce identical cells. We emit the letter. ' +
      'Confirmed with this gate: our LaTeX compares equal to the same tree carrying Σ and different ' +
      'to the one carrying ∑ -- the operator character is the entire disagreement.'
  },
  'mathcat-rules:product_77_4_24': {
    cause: 'homograph',
    reason:
      'Cells `⠨⠠⠏⠴⠘⠝⠐⠁⠰⠅`, the product twin of sum_77_4_23: Greek capitalized pi (BANA 6.1.4, ' +
      'line 3040) against <mo>∏</mo> (U+220F). Same collapse, same reading.'
  },
  // --- Task 5e: BANA Rule 19 grouping symbols, and Rule 3's numeric marks -----
  'mathcat-rules:comma_in_number_in_sup_79_b_3': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠭⠘⠂⠴⠠⠴⠴⠴` = x superscript 10,000, a BANA 3.2.2 numeric comma (Nemeth_2022.txt lines ' +
      '808-810, "interior to a modified numeral ... to partition the numeral into short regular ' +
      'segments"). We emit `x^{10{,}000}`, which MathJax returns as the single <mn>10,000</mn>; ' +
      'the target spells the same numeral as <mn>10</mn><mo>,</mo><mn>000</mn>. Verified with this ' +
      "gate: our LaTeX compares EQUAL to <msup><mi>x</mi><mn>10,000</mn></msup> and DIFFERENT to " +
      'the same tree holding 10,001, so element granularity is the whole of it. The corpus itself ' +
      'holds both granularities -- `sre-aata:AataExpression_190` (`⠼⠲⠖⠠⠒⠦⠦`) targets the merged ' +
      '<mn>46,388</mn> and PASSes on our `46{,}388`.'
  },
  'mathcat-rules:mmultiscripts_77_4_10': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠷⠠⠉⠠⠕⠒⠾⠰⠆` = (CO sub 3) sub 2. Three encoding differences and no mathematical one: ' +
      'the target writes both subscripts as <mmultiscripts> where we write <msub>, tags C and O ' +
      "mathvariant='normal' where the Code has no cell that says a capital letter was upright " +
      '(Rule 5.1.1 writes it the same either way), and omits the stretchy="false" MathJax puts on ' +
      'every non-\\left parenthesis. Verified with this gate: our `{(CO_{3})}_{2}` compares EQUAL ' +
      'to that tree once all three are aligned, and DIFFERENT once the 3 and the 2 are transposed.'
  },
  'mathcat-rules:colon_40_1_mtext': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠼⠒⠸⠒⠼⠒⠴` = 3:30, a Rule 8 punctuation indicator (line 3879) with the colon (line ' +
      '3882). The target is one <mtext>3:30</mtext>; we emit `3:30`, which MathJax returns as ' +
      '<mn>3</mn><mo>:</mo><mn>30</mn>. Nothing in the cells says the three signs were carried in ' +
      'one text token rather than three math tokens -- the same <mtext>-versus-<mi>/<mn> collapse ' +
      'as AataExpression_259, in its granular form. Its cell-twin `colon_40_1` carries the third ' +
      'reading of these identical cells (three tokens, plus an intent annotation), so the corpus ' +
      'holds two spellings of one braille string and neither is the one we emit.'
  },
  'sre-aata:AataExpression_68': {
    cause: 'equivalent-encoding',
    reason:
      'Cells `⠷⠂⠆⠢⠲⠾⠘⠂⠴⠴` = (1254) superscript 100. BANA Example 19-4 (lines 9393-9394, ' +
      '`(seven)^2"+1` printing "(seven)2 + 1") puts a script written after a right grouping symbol ' +
      'on the whole group, which is the tree we build and the reason `latex.js` emits ' +
      '`{(1254)}^{100}` rather than `(1254)^{100}`. MathJax turns the braced form into ' +
      '<msup><mrow>(1254)</mrow>…</msup> and the unbraced one into <msup><mo>)</mo>…</msup>; the ' +
      'target holds the latter. Verified with this gate: our LaTeX compares EQUAL to the ' +
      'mrow-wrapped spelling of the same tree and DIFFERENT once the digits are transposed. The ' +
      'corpus holds both spellings -- mmultiscripts_77_4_10 wraps its fenced base in an <mrow> for ' +
      'the same construct. This is the one case the braces cost, and they are kept because the ' +
      'two typeset identically while only one says what the parser recovered.'
  },
  'sre-aata:AataExpression_50': {
    cause: 'equivalent-encoding',
    reason:
      'Cells end `⠷…⠾⠘⠞` = a bold vector equal to a parenthesised bit string transposed. Two ' +
      'encoding differences, both already named elsewhere in this map: the target tags the ' +
      'transpose <mtext>t</mtext> where we emit <mi>t</mi> (the same collapse as ' +
      'AataExpression_259, since no cell says which token type carried a letter), and it spells ' +
      'the superscript on the closing parenthesis where we brace the group, as Example 19-4 ' +
      '(lines 9393-9394) reads it -- see AataExpression_68 for that half. Verified with this ' +
      'gate: our LaTeX compares EQUAL to the target once both are aligned, DIFFERENT with only ' +
      'the grouping aligned, and DIFFERENT once a digit of the bit string changes.'
  },
  'sre-aata:AataExpression_54': {
    cause: 'equivalent-encoding',
    reason:
      'The same bold-vector-transposed shape as AataExpression_50: <mtext>t</mtext> against our ' +
      '<mi>t</mi>, and the Example 19-4 grouping. Verified the same way.'
  },
  'sre-aata:AataExpression_58': {
    cause: 'equivalent-encoding',
    reason:
      'The same bold-vector-transposed shape as AataExpression_50: <mtext>t</mtext> against our ' +
      '<mi>t</mi>, and the Example 19-4 grouping. Verified the same way.'
  },
  'sre-aata:AataExpression_88': {
    cause: 'equivalent-encoding',
    reason:
      'The same bold-vector-transposed shape as AataExpression_50: <mtext>t</mtext> against our ' +
      '<mi>t</mi>, and the Example 19-4 grouping. Verified the same way.'
  },
  'sre-aata:AataExpression_95': {
    cause: 'equivalent-encoding',
    reason:
      'The same bold-vector-transposed shape as AataExpression_50: <mtext>t</mtext> against our ' +
      '<mi>t</mi>, and the Example 19-4 grouping. Verified the same way.'
  },
  'sre-aata:AataExpression_96': {
    cause: 'equivalent-encoding',
    reason:
      'The same bold-vector-transposed shape as AataExpression_50: <mtext>t</mtext> against our ' +
      '<mi>t</mi>, and the Example 19-4 grouping. Verified the same way.'
  },
  'sre-aata:AataExpression_52': {
    cause: 'formatting-only',
    reason:
      'Eight parenthesised bit strings juxtaposed. The target interleaves <mspace ' +
      'width="thickmathspace"> between them and one <mspace linebreak="newline"> where the print ' +
      'wrapped. Neither is mathematics and neither has a cell: BANA has no symbol for a typeset ' +
      'gap or a line break inside an expression. Verified with this gate: our LaTeX compares EQUAL ' +
      'to the same tree with the <mspace> elements removed and DIFFERENT once a digit changes.'
  },
  'sre-aata:AataExpression_60': {
    cause: 'formatting-only',
    reason: 'Eight seven-bit strings; the same <mspace> layout difference as AataExpression_52, verified the same way.'
  },
  'sre-aata:AataExpression_84': {
    cause: 'formatting-only',
    reason: 'Four six-bit strings; the same <mspace> layout difference as AataExpression_52, verified the same way.'
  },
  'sre-aata:AataExpression_85': {
    cause: 'formatting-only',
    reason: 'Four six-bit strings; the same <mspace> layout difference as AataExpression_52, verified the same way.'
  },
  'sre-aata:AataExpression_238': {
    cause: 'unencoded-boundary',
    reason:
      'Cells `⠠⠁⠥⠞⠷⠠⠛⠾` = the capital letters A, u, t then (G). The target groups the first three ' +
      'as one <mi>Aut</mi> and inserts <mo>&#x2061;</mo> (function application). Neither is in the ' +
      'cells: BANA Rule 18 writes a function name as its plain letters with nothing to mark them ' +
      '(Example 18-2, lines 9138-9141, is `sin x` = the letters s, i, n), `Aut` is not in the ' +
      "Code's own list of abbreviated forms (lines 9075-9118), and there is no cell for an " +
      'invisible operator. Same collapse as AataExpression_271 (`id`). Verified with this gate: ' +
      'our `Aut(G)` compares EQUAL to the letter-by-letter spelling and DIFFERENT once G changes.'
  },
  'sre-aata:AataExpression_246': {
    cause: 'unencoded-boundary',
    reason: 'Cells `⠠⠊⠝⠝⠷⠠⠛⠾` = Inn(G); the same <mi>Inn</mi>-plus-U+2061 collapse as AataExpression_238, verified the same way.'
  },
  'sre-aata:AataExpression_252': {
    cause: 'unencoded-boundary',
    reason: 'Cells `⠠⠝⠥⠇⠇⠷⠠⠓⠾` = Null(H); the same collapse as AataExpression_238, verified the same way.'
  },
  // Sub-cause: unencoded attribute. Element structure and content match exactly;
  // the target carries an <mo> attribute that no braille cell can express and
  // that this pipeline's own serializer (MathJax) either always adds or never
  // adds. Named separately from equivalent-encoding, which is about MathML
  // SHAPE, and from formatting-only, which is about content the braille drops:
  // here nothing is dropped and nothing is reshaped, only annotated. The gate's
  // comparison helper already normalizes four such serialization differences
  // away (xmlns, the minus spelling, invisible operators, a sole <mrow>); these
  // three are candidates for a fifth rule, and are recorded here rather than
  // resolved that way because a task graded by this gate should not be the one
  // that widens it.
  'mathcat-rules:numeric_sub_81_a_1': {
    cause: 'unencoded-attribute',
    reason:
      'Cells `⠷⠭⠂⠬⠂⠾` = (x sub 1 + 1). Element for element identical to the target; MathJax puts ' +
      'stretchy="false" on both parentheses and MathCAT\'s stored MathML omits it. Verified with ' +
      'this gate: our `(x_{1}+1)` compares EQUAL to the target with stretchy="false" added and ' +
      'DIFFERENT once the subscript changes to 2.'
  },
  'sre-aata:AataExpression_268': {
    cause: 'unencoded-attribute',
    reason:
      'Cells `⠠⠋⠈⠷⠭⠈⠾` = F[x], BANA Rule 19\'s square brackets (line 9328, `@(`/`@)`). The target ' +
      'adds fence="false" alongside the stretchy="false" MathJax also emits. Verified with this ' +
      'gate: EQUAL with fence="false" dropped from the target, DIFFERENT once x becomes y.'
  },
  'mathcat-rules:colon_40_1': {
    cause: 'unencoded-attribute',
    reason:
      'Cells `⠼⠒⠸⠒⠼⠒⠴` = 3:30. The target is <mn>3</mn><mo intent=\'time\'>:</mo><mn>30</mn>; our ' +
      'output is the same three elements without the annotation. MathML 4\'s `intent` is an ' +
      'assertion about what the notation MEANS, and nothing in these cells makes it -- Rule 8 ' +
      'writes the punctuation indicator (line 3879) and the colon (line 3882) the same way in a ' +
      'time as anywhere else, which is exactly what `mathcat-rules:not_ratio_nfb_5_7_b_4` and ' +
      '`trilinear_not_ratio` use the same two cells for. Verified with this gate: EQUAL with the ' +
      'attribute dropped, DIFFERENT once 30 becomes 31.'
  },
  // Sub-cause: formatting-only difference. A leading/trailing non-breaking
  // space is print formatting, not mathematics, so Nemeth correctly drops
  // it -- all three MathML inputs below forward-map to the identical cells
  // `⠼⠆` ("2"). Verified directly against the corpus's own MathML for each
  // case (each is a genuinely different <math> input on purpose, not an
  // import artifact -- MathCAT is deliberately asserting that the braille
  // is insensitive to this formatting):
  //   number_space_after            <math><mn>2</mn><mtext>&#xA0;</mtext></math>
  //   number_space_before           <math><mtext>&#xA0;</mtext><mn>2</mn></math>
  //   number_space_before_and_after <math><mtext>&#xA0;</mtext><mn>2</mn><mtext>&#xA0;</mtext></math>
  // From `⠼⠆` alone it is impossible to know whether the source carried a
  // leading space, a trailing space, both, or neither -- our output `2` is
  // the only sensible answer regardless of which of the three this is.
  'mathcat-rules:number_space_after': {
    cause: 'formatting-only',
    reason:
      'Cells are `⠼⠆` (just the numeral "2") -- identical to the cells for ' +
      'number_space_before and number_space_before_and_after. The corpus target adds a ' +
      'trailing <mtext>&#xA0;</mtext> (a non-breaking space) that Nemeth braille correctly ' +
      'drops as formatting, not mathematics; the cells cannot distinguish this from the ' +
      'other two space-placement variants, so our parser producing plain `2` for all three ' +
      'is correct, not a bug.'
  },
  'mathcat-rules:number_space_before': {
    cause: 'formatting-only',
    reason:
      'Same cells (`⠼⠆`) and same situation as number_space_after, mirrored: the target ' +
      'adds a LEADING <mtext>&#xA0;</mtext>, which the cells likewise cannot encode.'
  },
  'mathcat-rules:number_space_before_and_after': {
    cause: 'formatting-only',
    reason: 'Same cells (`⠼⠆`) again; target adds <mtext>&#xA0;</mtext> on both sides, which the cells likewise cannot encode.'
  },
  // Sub-cause: unencoded boundary. The forward map ran two adjacent elements
  // together and the braille has no cell at the seam, so the boundary is not
  // recoverable by anything -- not a different encoding of the same tree, and
  // not non-mathematical detail either. Kept as its own sub-cause rather than
  // stretched into one of the two above, because it is the one kind of collapse
  // where our answer really is different mathematics from the target and the
  // reason is still not a parser bug.
  'sre-aata:AataExpression_97': {
    cause: 'unencoded-boundary',
    reason:
      'Cells `⠼⠂⠂⠆⠂⠒⠢⠆⠢⠴⠒⠆⠲⠲⠆`: one numeric indicator followed by 14 unbroken digit cells. ' +
      'The corpus target is three adjacent numerals, <mn>112135</mn><mn>25032</mn><mn>442</mn>, ' +
      'with no operator, fence or space between them -- and these cells are SRE\'s own recorded ' +
      'output for that input (source `sre-aata`, expected/nemeth/rules/aata.json), so the ' +
      'boundaries genuinely did not survive the forward map. No cell marks 112135|25032|442 ' +
      'rather than 1|1213525032442 or the single numeral we read, so there is nothing for a ' +
      'reverse parser to key on. Verified against the corpus record, not inferred.'
  },
  'sre-aata:AataExpression_271': {
    cause: 'unencoded-boundary',
    reason:
      'Cells `⠨⠁⠨⠃⠀⠨⠅⠀⠊⠙` = Greek alpha, Greek beta, equals, the letters i and d. The target ' +
      'groups the last two as <mrow><mi mathvariant="normal">i</mi><mi mathvariant="normal">d</mi>' +
      '</mrow>, i.e. the identity map written as one upright name. Neither half of that is in the ' +
      'cells: BANA Rule 18 writes a function name as its plain letters with nothing to mark them ' +
      '(Example 18-2, lines 9138-9141, is `sin x` = the letters s, i, n), `id` is not even in the Code\'s ' +
      'own list of abbreviated forms (lines 9075-9118), and Rule 7.4.1 (lines 3775-3776) says ' +
      'regular type carries no typeform indicator, so nothing can say "upright". Verified with ' +
      'this gate: our `αβ=id` compares EQUAL to the same tree flat and unvarianted, DIFFERENT with ' +
      'the <mrow> alone, DIFFERENT with the mathvariant alone, and DIFFERENT once i and d are ' +
      'transposed. Like AataExpression_97 this is a case where our reading really is different ' +
      'mathematics from the target and the braille still cannot tell them apart.'
  },
  // Sub-cause: glyph spelling. The Code and the corpus write the SAME sign with
  // two different Unicode codepoints, so both forward-map to the same cells and
  // the cells cannot say which the source used. Named separately from
  // equivalent-encoding because that sub-cause is about MathML SHAPE, and here
  // the shape is identical and only the character differs. This is the same kind
  // of split the gate's own comparison helper already normalizes away for the
  // minus sign, where the inconsistency happens to sit inside the corpus rather
  // than between the corpus and the Code.
  'mathcat-rules:ratio_151_10': {
    cause: 'glyph-spelling',
    reason:
      'Cells `⠼⠂⠀⠐⠂⠀⠼⠆⠀⠰⠆⠀⠼⠒⠀⠐⠂⠀⠼⠖` are BANA Example 21-34 verbatim (Nemeth_2022.txt lines ' +
      '10840-10843, `#1 "1 #2 ;2 #3 "1 #6`), 1 : 2 :: 3 : 6. Rule 21\'s symbol list prints the ratio ' +
      'sign U+2236 (line 10316) and the proportion sign U+2237 (line 10314); we emit both as the ' +
      'Code writes them. The corpus agrees on U+2237 and spells the ratio U+003A COLON instead. ' +
      'Verified with this gate: substituting ONLY the ratio character into our output makes the ' +
      'two trees compare EQUAL, while transposing the ratio and proportion signs compares ' +
      'DIFFERENT -- so the codepoint is the whole disagreement and the mathematics matches.'
  },
  'mathcat-rules:ratio_151_11': {
    cause: 'glyph-spelling',
    reason:
      'Cells `⠁⠬⠃⠀⠐⠂⠀⠃⠀⠰⠆⠀⠉⠬⠙⠀⠐⠂⠀⠙` are BANA Example 21-35 verbatim (lines 10845-10848, ' +
      '`a+b "1 b ;2 c+d "1 d`). Same U+2236-versus-U+003A ratio spelling as ratio_151_10, verified ' +
      'the same way: EQUAL with only the ratio character swapped, DIFFERENT once the operands b ' +
      'and d are transposed.'
  }
};

const MANY_TO_ONE_CAUSES = new Set([
  'equivalent-encoding',
  'formatting-only',
  'unencoded-boundary',
  'unencoded-attribute',
  'homograph',
  'glyph-spelling'
]);

// No ERROR cases exist today. Kept as a real allowlist (not just an
// `assert.equal(0)`) so the same discipline applies if one ever appears:
// named, with a reason, on purpose.
const ERROR_ALLOWLIST = {};

// Sourced from the coverage run at the time this gate was written -- see
// docs/nemeth-v2/coverage.md. This is a floor, not a target: later tasks
// raise it as the parser's scope grows. It must never silently drop.
const PASS_BASELINE = 177;

test('every corpus case lands in exactly one bucket, and the buckets sum to the corpus size', () => {
  const sum = coverage.totals.PASS + coverage.totals.REFUSE + coverage.totals.DISAGREE + coverage.totals.ERROR;
  assert.equal(sum, corpus.cases.length);
  assert.equal(coverage.results.length, corpus.cases.length);
});

test('DISAGREE: every case is in MANY_TO_ONE_FORWARD_MAP with a categorized reason, and the map has no stale entries', () => {
  const actualIds = new Set(coverage.disagrees.map((r) => r.case.id));
  const allowedIds = new Set(Object.keys(MANY_TO_ONE_FORWARD_MAP));

  for (const id of actualIds) {
    assert.ok(
      allowedIds.has(id),
      `DISAGREE case "${id}" is not in MANY_TO_ONE_FORWARD_MAP -- a parsed-but-wrong result must be looked ` +
        'at and explicitly recorded, not left silent. See docs/nemeth-v2/coverage.md for the full detail.'
    );
    const entry = MANY_TO_ONE_FORWARD_MAP[id];
    assert.ok(
      MANY_TO_ONE_CAUSES.has(entry?.cause),
      `MANY_TO_ONE_FORWARD_MAP entry for "${id}" must have cause one of ${[...MANY_TO_ONE_CAUSES].join(', ')}`
    );
    assert.ok(
      typeof entry?.reason === 'string' && entry.reason.trim().length > 0,
      `MANY_TO_ONE_FORWARD_MAP entry for "${id}" must have a non-empty reason`
    );
  }
  for (const id of allowedIds) {
    assert.ok(actualIds.has(id), `MANY_TO_ONE_FORWARD_MAP lists "${id}" but it no longer disagrees -- remove the stale entry`);
  }
});

test('DISAGREE: the many-to-one sub-causes are represented as expected (28 equivalent-encoding, 7 formatting-only, 5 unencoded-boundary, 3 unencoded-attribute, 2 homograph, 2 glyph-spelling)', () => {
  const byCause = {
    'equivalent-encoding': 0,
    'formatting-only': 0,
    'unencoded-boundary': 0,
    'unencoded-attribute': 0,
    homograph: 0,
    'glyph-spelling': 0
  };
  for (const entry of Object.values(MANY_TO_ONE_FORWARD_MAP)) byCause[entry.cause] += 1;
  assert.equal(byCause['equivalent-encoding'], 28);
  assert.equal(byCause['formatting-only'], 7);
  assert.equal(byCause['unencoded-boundary'], 5);
  assert.equal(byCause['unencoded-attribute'], 3);
  assert.equal(byCause.homograph, 2);
  assert.equal(byCause['glyph-spelling'], 2);
});

// Seven of the equivalent-encoding entries claim a cell-twin that PASSes:
// the same braille appears twice in the corpus under two MathML encodings, we
// match one and disagree with the other. That claim is checkable, so it is
// checked -- an entry whose "twin" stopped passing would otherwise keep
// excusing a DISAGREE that had become a real regression.
const TWINS = {
  'mathcat-rules:mmultiscripts_82_a_1': 'mathcat-rules:msubsup_82_a_1',
  'mathcat-rules:nested_sup_mmultiscripts_74_b_1': 'mathcat-rules:nested_sup_74_b_1',
  'mathcat-rules:as_multiscript_nested_sub_sup_74_c_5': 'mathcat-rules:nested_sub_sup_74_c_5',
  'mathcat-rules:mmultiscripts_82_a_3': 'mathcat-rules:msubsup_82_a_3',
  'mathcat-rules:mmultiscripts_82_b_1': 'mathcat-rules:sub_sup_82_b_1',
  'mathcat-rules:mmultiscripts_82_b_2': 'mathcat-rules:sub_sup_82_b_2',
  'mathcat-rules:greek_24_b_1_together': 'mathcat-rules:greek_24_b_1'
};

test('DISAGREE: every allowlisted entry that claims a PASSing cell-twin actually has one', () => {
  const byId = new Map(corpus.cases.map((c) => [c.id, c]));
  for (const [disagreeId, twinId] of Object.entries(TWINS)) {
    const twin = byId.get(twinId);
    assert.ok(twin, `${disagreeId} names twin "${twinId}", which is not in the corpus`);
    assert.equal(
      twin.cells,
      byId.get(disagreeId).cells,
      `${disagreeId} and ${twinId} must be the SAME cells for the many-to-one argument to hold`
    );
    const classified = coverage.results.find((r) => r.case.id === twinId);
    assert.equal(
      classified.bucket,
      'PASS',
      `${disagreeId} is excused because "${twinId}" carries the encoding we do emit and PASSes -- ` +
        `but ${twinId} is now ${classified.bucket}, so the excuse no longer holds`
    );
  }
});

// Rule 21's "Simple Comparison Signs" list (Nemeth_2022.txt lines 10274-10330)
// is shipped from the Code, not from the oracle, so some rows have no corpus
// case to corroborate them. That is allowed -- the Code is the normative source
// -- but it must be declared, because an uncorroborated row is a row no
// end-to-end test exercises. This pins which ones, so a row silently losing (or
// gaining) corroboration is visible in the diff rather than invisible.
const UNCORROBORATED_COMPARISON_CELLS = [
  '⠈⠢', // reverse membership, line 10321
  '⠨⠐⠅', // less than with curved sides, line 10303
  '⠨⠨⠂' // greater than with curved sides, line 10296
];

test('every comparison symbol row is either exercised by a corpus case or declared uncorroborated', async () => {
  const { lex } = await import('../../../src/domain/nemeth/lexer.js');
  const rows = JSON.parse(readFileSync(path.join(projectRoot, 'src', 'domain', 'nemeth', 'symbols.json'), 'utf8'));
  const comparisons = rows.filter((row) => row.role === 'comparison').map((row) => row.cells);
  const exercised = new Set();
  for (const testCase of corpus.cases) {
    let tokens;
    try {
      tokens = lex(testCase.cells);
    } catch {
      continue;
    }
    for (const token of tokens) if (token.kind === 'comparison') exercised.add(token.cells);
  }
  const uncorroborated = comparisons.filter((cells) => !exercised.has(cells)).sort();
  assert.deepEqual(
    uncorroborated,
    [...UNCORROBORATED_COMPARISON_CELLS].sort(),
    'a comparison row changed corroboration status -- update UNCORROBORATED_COMPARISON_CELLS on purpose, ' +
      'and say in the commit which BANA line the row comes from'
  );
});

test('ERROR: every case is in the allowlist with a reason, and the allowlist has no stale entries', () => {
  const actualIds = new Set(coverage.errors.map((r) => r.case.id));
  const allowedIds = new Set(Object.keys(ERROR_ALLOWLIST));

  for (const id of actualIds) {
    assert.ok(
      allowedIds.has(id),
      `ERROR case "${id}" is not in ERROR_ALLOWLIST -- this is a parser bug (a crash, or LaTeX MathJax ` +
        'rejected), not a legitimate refusal. See docs/nemeth-v2/coverage.md for the full detail.'
    );
    assert.ok(
      typeof ERROR_ALLOWLIST[id] === 'string' && ERROR_ALLOWLIST[id].trim().length > 0,
      `ERROR_ALLOWLIST entry for "${id}" must have a non-empty reason`
    );
  }
  for (const id of allowedIds) {
    assert.ok(actualIds.has(id), `ERROR_ALLOWLIST lists "${id}" but it no longer errors -- remove the stale entry`);
  }
});

test('ERROR count is currently zero', () => {
  // Not redundant with the allowlist test above: this pins today's actual
  // state so a newly-introduced ERROR is loud even before anyone thinks to
  // check the (currently empty) allowlist.
  assert.equal(coverage.totals.ERROR, 0);
});

test(`PASS count has not regressed below the pinned baseline (${PASS_BASELINE})`, () => {
  assert.ok(
    coverage.totals.PASS >= PASS_BASELINE,
    `PASS count dropped to ${coverage.totals.PASS}, below the pinned baseline of ${PASS_BASELINE}`
  );
});

// Soiffer's smoke test: "y = 2 sin x" (mathcat-rules:num_indicator_9_a_4).
// This is the expression MathCAT's maintainer used to reject an AI-written
// Nemeth back-translator -- it is this project's public tripwire. Blanks
// (the braille space cells around "=" and around "sin") are unsupported
// today, so this case REFUSES. It must refuse *cleanly* -- a clean REFUSE is
// the honest, correct outcome for an out-of-scope construct; a crash would
// not be. It must become PASS by the end of Task 5.
test('Soiffer smoke test (mathcat-rules:num_indicator_9_a_4, "y = 2 sin x") refuses cleanly today -- must PASS by end of Task 5', () => {
  const soiffer = corpus.cases.find((c) => c.id === 'mathcat-rules:num_indicator_9_a_4');
  assert.ok(soiffer, 'corpus is missing the Soiffer smoke-test case');

  assert.throws(() => parseNemeth(soiffer.cells), NemethUnsupportedError);

  const classified = coverage.results.find((r) => r.case.id === 'mathcat-rules:num_indicator_9_a_4');
  assert.equal(classified.bucket, 'REFUSE', 'Soiffer smoke test must REFUSE, not ERROR or DISAGREE -- an out-of-scope construct is not a bug');
});

test('committed docs/nemeth-v2/coverage.md summary is current with this run', () => {
  const report = readFileSync(reportPath, 'utf8');
  const bucketRow = (bucket) => {
    const match = report.match(new RegExp(`\\| ${bucket} \\| (\\d+) \\|`));
    assert.ok(match, `coverage.md is missing a summary row for ${bucket}`);
    return Number(match[1]);
  };

  assert.equal(bucketRow('PASS'), coverage.totals.PASS, 'coverage.md PASS count is stale -- run `npm run nemeth:coverage` and commit the result');
  assert.equal(bucketRow('REFUSE'), coverage.totals.REFUSE, 'coverage.md REFUSE count is stale -- run `npm run nemeth:coverage` and commit the result');
  assert.equal(bucketRow('DISAGREE'), coverage.totals.DISAGREE, 'coverage.md DISAGREE count is stale -- run `npm run nemeth:coverage` and commit the result');
  assert.equal(bucketRow('ERROR'), coverage.totals.ERROR, 'coverage.md ERROR count is stale -- run `npm run nemeth:coverage` and commit the result');

  const totalMatch = report.match(/\*\*Total\*\* \| \*\*(\d+)\*\*/);
  assert.ok(totalMatch, 'coverage.md is missing the total row');
  assert.equal(Number(totalMatch[1]), corpus.cases.length);
});
