import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BigOperator,
  Fenced,
  Fraction,
  FunctionCall,
  Hole,
  Identifier,
  Number,
  Operator,
  Root,
  Sequence,
  SubSuperscript,
  Subscript,
  Superscript,
  Text
} from '../../../src/domain/nemeth/ast.js';
import { defineBackend } from '../../../src/domain/nemeth/backend.js';
import { NemethUnsupportedError } from '../../../src/domain/nemeth/errors.js';
import { KIND_NAMES } from '../../../src/domain/nemeth/kinds.js';
import { toLatex } from '../../../src/domain/nemeth/latex.js';

test('leaves render as themselves', () => {
  assert.equal(toLatex(Number('27')), '27');
  assert.equal(toLatex(Identifier('x')), 'x');
  assert.equal(toLatex(Operator('+')), '+');
});

test('a Sequence is juxtaposition, so its items are concatenated with nothing between them', () => {
  assert.equal(toLatex(Sequence([Identifier('a'), Operator('+'), Identifier('b')])), 'a+b');
});

test('a Fraction renders as \\frac', () => {
  assert.equal(toLatex(Fraction(Number('2'), Identifier('y'))), '\\frac{2}{y}');
});

test('a Root renders with or without its index', () => {
  assert.equal(toLatex(Root(Identifier('x'), null)), '\\sqrt{x}');
  assert.equal(toLatex(Root(Identifier('x'), Number('2'))), '\\sqrt[2]{x}');
});

test('scripts render with braces so nesting survives', () => {
  assert.equal(
    toLatex(Superscript(Identifier('n'), Superscript(Identifier('x'), Identifier('y')))),
    'n^{x^{y}}'
  );
  assert.equal(toLatex(Subscript(Identifier('x'), Number('2'))), 'x_{2}');
  assert.equal(
    toLatex(SubSuperscript(Identifier('x'), Identifier('a'), Identifier('n'))),
    'x_{a}^{n}'
  );
});

test('a script standing on another script is braced, so the nesting is not flattened', () => {
  // `x_{1}^{2}` is LaTeX for the SIMULTANEOUS msubsup, so it is the wrong string
  // for the non-simultaneous (x sub 1) sup 2 of BANA Rule 14.11.2. Emitting it
  // unbraced would throw away the distinction the parser just recovered.
  assert.equal(
    toLatex(Superscript(Subscript(Identifier('x'), Number('1')), Number('2'))),
    '{x_{1}}^{2}'
  );
  assert.equal(
    toLatex(SubSuperscript(Identifier('x'), Number('1'), Number('2'))),
    'x_{1}^{2}'
  );
  assert.equal(
    toLatex(Subscript(Superscript(Identifier('a'), Identifier('n')), Identifier('m'))),
    '{a^{n}}_{m}'
  );
});

test('a superscript standing on a superscript is braced, which LaTeX requires outright', () => {
  // `x^{y}^{z}` is a double superscript, which LaTeX rejects -- an emitted
  // string MathJax cannot convert is an ERROR, strictly worse than a refusal.
  assert.equal(
    toLatex(Superscript(Superscript(Identifier('x'), Identifier('y')), Identifier('z'))),
    '{x^{y}}^{z}'
  );
});

test('a macro-valued item followed by a letter is separated, so the control word ends', () => {
  // `\\times` runs to the first non-letter, so plain concatenation would emit the
  // undefined control sequence `\\timesb`. This is what the next scope area (x,
  // Greek letters) will hit on its first row.
  assert.equal(
    toLatex(Sequence([Identifier('a'), Operator('\\times'), Identifier('b')])),
    'a\\times b'
  );
  assert.equal(toLatex(Sequence([Identifier('\\alpha'), Identifier('x')])), '\\alpha x');
});

test('no separator is added where the control word already ends', () => {
  assert.equal(toLatex(Sequence([Identifier('a'), Operator('+'), Identifier('b')])), 'a+b');
  assert.equal(toLatex(Sequence([Operator('\\times'), Number('27')])), '\\times27');
  assert.equal(
    toLatex(Sequence([Operator('\\times'), Fraction(Number('2'), Identifier('y'))])),
    '\\times\\frac{2}{y}'
  );
});

test('a control symbol is not a control word, so it needs no separator', () => {
  assert.equal(toLatex(Sequence([Operator('\\%'), Identifier('x')])), '\\%x');
});

test('a Fenced node renders between the delimiters it carries', () => {
  assert.equal(toLatex(Fenced('(', Identifier('x'), ')')), '(x)');
  assert.equal(toLatex(Fenced('\\lbrace', Identifier('x'), '\\rbrace')), '\\lbrace x\\rbrace');
});

test('kinds this backend has no evidence for throw instead of guessing', () => {
  assert.throws(() => toLatex(Text('hello')), NemethUnsupportedError);
  assert.throws(() => toLatex(Hole('radicand')), NemethUnsupportedError);
  assert.throws(
    () => toLatex(BigOperator('sum', null, null, Identifier('x'))),
    NemethUnsupportedError
  );
});

// `FunctionCall` used to sit in the list above, because nothing had settled
// whether an abbreviated function name renders as `\sin` or
// `\operatorname{sin}`. BANA Rule 18 settles it: the Code's own table is the
// abbreviated names (`sin` is `SIN`, test/corpus/sources/Nemeth_2022.txt line
// 9113), and LaTeX names those five with control words that produce a single
// <mi>. The throw was a placeholder for missing evidence, not a claim that the
// kind is unrenderable, so it goes when the evidence arrives -- the principle
// above (no guessing) is untouched, and Text, Hole and BigOperator still throw.
test('a FunctionCall renders as its name applied to its argument', () => {
  assert.equal(toLatex(FunctionCall('\\sin', Identifier('x'))), '\\sin x');
  // The argument is not a letter, so no separator is needed and none is added.
  assert.equal(toLatex(FunctionCall('\\sin', Number('1'))), '\\sin1');
});

test('defineBackend refuses a table that is missing a node kind', () => {
  assert.throws(
    () => defineBackend({ Number: (node) => node.value }, { name: 'throwaway' }),
    /throwaway is missing handlers for node kinds/u
  );
});

test('defineBackend refuses a table that handles a kind the registry does not have', () => {
  const complete = Object.fromEntries(KIND_NAMES.map((kind) => [kind, () => kind]));
  assert.throws(
    () => defineBackend({ ...complete, NotAKind: () => '' }, { name: 'throwaway' }),
    /throwaway defines handlers for unknown node kinds: NotAKind/u
  );
});

// -- marks composed by the lexer's prefix pass (Rules 5, 6 and 7) -------------

test('a capitalization mark uppercases the letter (Rule 5.1.1)', () => {
  assert.equal(toLatex(Identifier('a', { marks: { capitalization: 'single' } })), 'A');
  assert.equal(toLatex(Identifier('a')), 'a');
});

test('a Greek mark selects the Greek letter, in the case the mark asks for (BANA 6.1.4)', () => {
  assert.equal(toLatex(Identifier('a', { marks: { alphabet: 'greek' } })), 'α');
  assert.equal(toLatex(Identifier('g', { marks: { alphabet: 'greek', capitalization: 'single' } })), 'Γ');
  // Uppercase Greek that LaTeX has no macro for is still the right codepoint.
  assert.equal(toLatex(Identifier('a', { marks: { alphabet: 'greek', capitalization: 'single' } })), 'Α');
});

test('a Greek letter the Code writes with a non-English cell is refused, not guessed', () => {
  // BANA 6.1.4 gives eta, theta and chi the cells `:`, `?` and `&`, which are
  // not letter rows -- so `alphabets.json` has no entry keyed by them.
  assert.throws(() => toLatex(Identifier('j', { marks: { alphabet: 'greek' } })), NemethUnsupportedError);
});

test('a German mark renders as Fraktur (BANA 6.1.1)', () => {
  assert.equal(toLatex(Identifier('v', { marks: { alphabet: 'german' } })), '\\mathfrak{v}');
  assert.equal(toLatex(Identifier('v', { marks: { alphabet: 'german', capitalization: 'single' } })), '\\mathfrak{V}');
});

test('each typeform renders as its LaTeX macro, on letters and on numerals alike (Rule 7.2)', () => {
  const english = (typeform) => toLatex(Identifier('t', { marks: { typeform, alphabet: 'english' } }));
  assert.equal(english('bold'), '\\mathbf{t}');
  assert.equal(english('italic'), '\\mathit{t}');
  assert.equal(english('sans-serif'), '\\mathsf{t}');
  assert.equal(english('barred'), '\\mathbb{t}');
  assert.equal(toLatex(Number('345', { marks: { typeform: 'bold' } })), '\\mathbf{345}');
  assert.equal(toLatex(Number('345')), '345');
});

test('a typeform on a non-English alphabet is refused rather than rendered wrong', () => {
  // Example 7-3's boldface Greek alpha. `\boldsymbol` is not in this pipeline's
  // TeX packages, and `noundefined` would turn it into red literal text.
  assert.throws(
    () => toLatex(Identifier('a', { marks: { typeform: 'bold', alphabet: 'greek' } })),
    NemethUnsupportedError
  );
  assert.throws(
    () => toLatex(Identifier('a', { marks: { typeform: 'bold', alphabet: 'german' } })),
    NemethUnsupportedError
  );
});

test('a typeformed sign keeps macro spacing correct against what follows it', () => {
  assert.equal(
    toLatex(Sequence([Identifier('x', { marks: { typeform: 'bold', alphabet: 'english' } }), Identifier('y')])),
    '\\mathbf{x}y'
  );
});

test('Rule 7.1: script type renders on a numeral, where Code and oracle agree', () => {
  // 7.1 (Nemeth_2022.txt lines 3596-3598) makes provision for six typeforms
  // including script; Rule 7's indicator list writes it `@` = `⠈` (line 3563).
  // `mathcat-rules:boldface_32_b_2` is `⠈⠼⠆` and targets
  // <mn mathvariant='script'>2</mn>, which is what \mathscr{2} round-trips to.
  assert.equal(toLatex(Number('2', { marks: { typeform: 'script' } })), '\\mathscr{2}');
});

test('script type on a LETTER refuses: the Code and the oracle contradict each other there', () => {
  // Appendix C spells script English `@;` = `⠈⠰` (line 16446), but all 20 corpus
  // cases written `⠈⠰` target mathvariant="double-struck", which Rule 7 writes
  // `,_` = `⠠⠸` (line 3564) and which no corpus case uses as a typeform
  // indicator. Emitting either would assert a resolution nobody has established.
  assert.throws(
    () => toLatex(Identifier('z', { marks: { typeform: 'script', alphabet: 'english' } })),
    (error) => {
      assert.ok(error instanceof NemethUnsupportedError);
      assert.match(error.detail, /targets double-struck/u);
      return true;
    }
  );
});

test('a typeform with no LaTeX macro refuses instead of emitting \\undefined{...}', () => {
  // `noundefined` renders an undefined control sequence as red literal text
  // rather than rejecting it, so an unmapped typeform would otherwise become a
  // wrong answer that survives the corpus gate as a PASS-shaped string.
  assert.throws(
    () => toLatex(Number('2', { marks: { typeform: 'rococo' } })),
    (error) => {
      assert.ok(error instanceof NemethUnsupportedError);
      assert.match(error.detail, /no macro for the rococo typeform/u);
      return true;
    }
  );
});

test('a numeric comma is braced so the numeral survives the round trip (BANA 3.2.2)', () => {
  // MathJax reads `46,388` as <mn>46</mn><mo>,</mo><mn>388</mn> and `46{,}388`
  // as the single <mn>46,388</mn> that 3.2.2's numeric comma
  // (test/corpus/sources/Nemeth_2022.txt lines 808-810) describes. Corroborated
  // end to end by `sre-aata:AataExpression_190`, whose target is that <mn>.
  assert.equal(toLatex(Number('46,388')), '46{,}388');
  // The decimal point needs no such help, and nothing else is touched.
  assert.equal(toLatex(Number('1,478.00')), '1{,}478.00');
  assert.equal(toLatex(Number('3.14')), '3.14');
});

test('a script on a fenced base is braced, so the group keeps the script (BANA Example 19-4)', () => {
  // `(seven)^2"+1` (Nemeth_2022.txt lines 9393-9394) prints "(seven)2 + 1": the
  // exponent is on the group. Unbraced, `(x)^{2}` round-trips through MathJax as
  // <mo>(</mo><mi>x</mi><msup><mo>)</mo>… -- the script on the parenthesis, not
  // on what the tree says it is on.
  assert.equal(toLatex(Superscript(Fenced('(', Identifier('x'), ')'), Number('2'))), '{(x)}^{2}');
  // A fence that is NOT a script base is untouched.
  assert.equal(toLatex(Fenced('(', Identifier('x'), ')')), '(x)');
});
