import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMathML, structuralEquivalent } from '../../../src/domain/math-tree.js';
import {
  inlineSoleMrowChild,
  mathmlEquivalent,
  normalizeMinusOperator,
  stripInvisibleOperators,
  stripXmlnsAttribute
} from '../../helpers/mathml-compare.js';

// -- Rule 1: stripInvisibleOperators -----------------------------------------

test('stripInvisibleOperators removes an <mo> whose sole content is invisible-times (U+2062) as a NODE, not just its text', () => {
  const tree = parseMathML('<math><mn>2</mn><mo>&#x2062;</mo><mi>x</mi></math>');
  const stripped = stripInvisibleOperators(tree);
  assert.equal(stripped.children.length, 2, 'the <mo> element itself must be gone, not merely emptied to <mo/>');
  assert.deepEqual(stripped.children.map((c) => c.name), ['mn', 'mi']);
});

test('stripInvisibleOperators removes an <mo> whose sole content is invisible function application (U+2061)', () => {
  const tree = parseMathML('<math><mi>sin</mi><mo>&#x2061;</mo><mi>x</mi></math>');
  const stripped = stripInvisibleOperators(tree);
  assert.deepEqual(stripped.children.map((c) => c.name), ['mi', 'mi']);
});

test('stripInvisibleOperators does NOT remove a visible <mo> -- proves the rule does not mask a real operator difference', () => {
  const plus = stripInvisibleOperators(parseMathML('<math><mi>x</mi><mo>+</mo><mi>y</mi></math>'));
  const minus = stripInvisibleOperators(parseMathML('<math><mi>x</mi><mo>-</mo><mi>y</mi></math>'));
  assert.equal(structuralEquivalent(plus, minus), false);
});

test('stripInvisibleOperators does NOT touch an <mo> where the invisible codepoint is not its ENTIRE content', () => {
  const tree = parseMathML('<math><mo>x⁢</mo></math>');
  const stripped = stripInvisibleOperators(tree);
  assert.equal(stripped.children.length, 1, 'only a pure invisible-operator <mo> is dropped, not one that happens to contain the codepoint');
});

test('stripInvisibleOperators does NOT strip an invisible codepoint from a non-<mo> element -- scoped narrowly, not broadened to "invisible characters" generally', () => {
  const tree = parseMathML('<math><mtext>⁢</mtext></math>');
  const stripped = stripInvisibleOperators(tree);
  assert.equal(stripped.children.length, 1);
  assert.equal(stripped.children[0].name, 'mtext');
});

// -- Rule 2: normalizeMinusOperator -------------------------------------------

test('normalizeMinusOperator rewrites a sole ASCII hyphen-minus inside <mo> to U+2212', () => {
  const tree = parseMathML('<math><mi>x</mi><mo>-</mo><mi>y</mi></math>');
  const normalized = normalizeMinusOperator(tree);
  assert.equal(normalized.children[1].children[0].text, '−');
});

test('normalizeMinusOperator leaves an already-Unicode minus untouched (idempotent)', () => {
  const tree = parseMathML('<math><mo>−</mo></math>');
  const normalized = normalizeMinusOperator(tree);
  assert.equal(normalized.children[0].children[0].text, '−');
});

test('normalizeMinusOperator does NOT rewrite a hyphen inside <mn> -- scoped to <mo> only, since a literal hyphen elsewhere could be real content', () => {
  const tree = parseMathML('<math><mn>-5</mn></math>');
  assert.equal(normalizeMinusOperator(tree).children[0].children[0].text, '-5');
});

test('normalizeMinusOperator does NOT touch a different operator -- proves the rule does not mask a real operator difference', () => {
  const plus = normalizeMinusOperator(parseMathML('<math><mo>+</mo></math>'));
  const minus = normalizeMinusOperator(parseMathML('<math><mo>-</mo></math>'));
  assert.equal(structuralEquivalent(plus, minus), false);
});

// -- Rule 3: stripXmlnsAttribute ----------------------------------------------

test('stripXmlnsAttribute drops xmlns from the root <math> element', () => {
  const tree = parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>');
  const stripped = stripXmlnsAttribute(tree);
  assert.equal('xmlns' in stripped.attrs, false);
});

test('stripXmlnsAttribute does not remove other attributes', () => {
  const tree = parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML" displaystyle="true"><mi>x</mi></math>');
  const stripped = stripXmlnsAttribute(tree);
  assert.equal(stripped.attrs.displaystyle, 'true');
});

test('stripXmlnsAttribute makes an xmlns-bearing tree structurally equivalent to an otherwise-identical bare one -- the friction this rule fixes', () => {
  const withNs = stripXmlnsAttribute(parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>'));
  const bare = stripXmlnsAttribute(parseMathML('<math><mi>x</mi></math>'));
  assert.equal(structuralEquivalent(withNs, bare), true);
});

test('stripXmlnsAttribute does NOT mask a real content difference merely because one side declares xmlns', () => {
  const x = stripXmlnsAttribute(parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>'));
  const y = stripXmlnsAttribute(parseMathML('<math><mi>y</mi></math>'));
  assert.equal(structuralEquivalent(x, y), false);
});

// -- Rule 4: inlineSoleMrowChild ----------------------------------------------

test('inlineSoleMrowChild flattens an unannotated mrow that is its parent\'s only child', () => {
  const tree = parseMathML('<math><msqrt><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></msqrt></math>');
  const inlined = inlineSoleMrowChild(tree);
  const msqrt = inlined.children[0];
  assert.deepEqual(msqrt.children.map((c) => c.name), ['mi', 'mo', 'mi']);
});

test('inlineSoleMrowChild makes the wrapped and unwrapped msqrt forms structurally equivalent -- the friction this rule fixes, proven by a real corpus inconsistency (mathcat-rules:sqrt_103_a_2 vs sqrt_103_a_4)', () => {
  const wrapped = inlineSoleMrowChild(parseMathML('<math><msqrt><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></msqrt></math>'));
  const unwrapped = inlineSoleMrowChild(parseMathML('<math><msqrt><mi>x</mi><mo>+</mo><mi>y</mi></msqrt></math>'));
  assert.equal(structuralEquivalent(wrapped, unwrapped), true);
});

test('inlineSoleMrowChild does NOT fire on a fixed-arity element like msup, whose exponent slot legitimately holds a multi-item mrow', () => {
  // msup always has exactly 2 children (base, exponent). The mrow here is
  // one of those two children, not msup's ONLY child, so inlining it into
  // msup's own children would corrupt msup's arity (base would vanish into
  // a 4-child msup). This is the scope guard that keeps the rule from
  // firing on fixed-arity elements.
  const tree = parseMathML('<math><msup><mi>x</mi><mrow><mn>2</mn><mo>+</mo><mn>1</mn></mrow></msup></math>');
  const inlined = inlineSoleMrowChild(tree);
  const msup = inlined.children[0];
  assert.equal(msup.children.length, 2);
  assert.equal(msup.children[1].name, 'mrow');
});

test('inlineSoleMrowChild does NOT discard an mrow that carries its own semantic attribute -- proves the rule does not mask a real difference', () => {
  const tree = parseMathML('<math><msqrt><mrow intent=":unit"><mi>x</mi><mo>+</mo><mi>y</mi></mrow></msqrt></math>');
  const inlined = inlineSoleMrowChild(tree);
  const msqrt = inlined.children[0];
  assert.equal(msqrt.children.length, 1);
  assert.equal(msqrt.children[0].name, 'mrow');
});

test('inlineSoleMrowChild does NOT mask a genuine content difference inside the inlined expression', () => {
  const a = inlineSoleMrowChild(parseMathML('<math><msqrt><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></msqrt></math>'));
  const b = inlineSoleMrowChild(parseMathML('<math><msqrt><mi>x</mi><mo>+</mo><mi>z</mi></msqrt></math>'));
  assert.equal(structuralEquivalent(a, b), false);
});

// -- mathmlEquivalent (integration; exercises real MathJax conversion) -------

test('mathmlEquivalent reports "equal" for the same mathematics differing only by the four normalization rules', async () => {
  const result = await mathmlEquivalent('x-y', '<math><mi>x</mi><mo>-</mo><mi>y</mi></math>');
  assert.equal(result.outcome, 'equal');
  assert.equal(result.error, null);
});

test('mathmlEquivalent reports "different" for genuinely different mathematics', async () => {
  const result = await mathmlEquivalent('x+y', '<math><mi>x</mi><mo>-</mo><mi>y</mi></math>');
  assert.equal(result.outcome, 'different');
});

test('mathmlEquivalent reports "conversion-error", not "different", when our LaTeX does not survive MathJax', async () => {
  const result = await mathmlEquivalent('\\bogus{unclosed', '<math><mi>x</mi></math>');
  assert.equal(result.outcome, 'conversion-error');
  assert.ok(result.error instanceof Error);
  assert.equal(result.ourMathml, null);
});

test('mathmlEquivalent still returns the case\'s own canonical MathML on a conversion error, for reporting', async () => {
  const result = await mathmlEquivalent('\\bogus{unclosed', '<math><mi>x</mi></math>');
  assert.match(result.theirMathml, /<mi[^>]*>x<\/mi>/);
});
