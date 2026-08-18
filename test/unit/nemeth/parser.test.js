import assert from 'node:assert/strict';
import test from 'node:test';

import { format } from '../../../src/domain/nemeth/ast.js';
import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';
import { NemethUnsupportedError } from '../../../src/domain/nemeth/errors.js';
import { lex } from '../../../src/domain/nemeth/lexer.js';
import { resolveLevels } from '../../../src/domain/nemeth/levels.js';
import { parse } from '../../../src/domain/nemeth/parser.js';

const treeOf = (ascii) => parse(resolveLevels(lex(asciiToCells(ascii))));

test('a numeral is one Number node, not one node per digit', () => {
  assert.equal(format(treeOf('#27')), "Number('27')");
});

test('a simple fraction becomes Fraction, with juxtaposed terms flattened into Sequence', () => {
  assert.equal(
    format(treeOf('?a+b/c#')),
    "Fraction(Sequence([ Identifier('a'), Operator('+'), Identifier('b') ]), Identifier('c'))"
  );
});

test('a square root becomes Root with no index', () => {
  assert.equal(
    format(treeOf('>x+y]')),
    "Root(Sequence([ Identifier('x'), Operator('+'), Identifier('y') ]), null)"
  );
});

test('a script at level "^^" nests inside the script at level "^"', () => {
  assert.equal(
    format(treeOf('n^x^^y')),
    "Superscript(Identifier('n'), Superscript(Identifier('x'), Identifier('y')))"
  );
});

test('a subscript attaches from the level path alone, with no rule of its own', () => {
  assert.equal(format(treeOf('x;a')), "Subscript(Identifier('x'), Identifier('a'))");
});

test('a base carrying both a subscript and a superscript becomes SubSuperscript', () => {
  assert.equal(
    format(treeOf('x;a^n')),
    "SubSuperscript(Identifier('x'), Identifier('a'), Identifier('n'))"
  );
});

test('a script must be exactly one level deeper than its base, not merely below it', () => {
  // 'n' sits at '' and 'x' at '^^'. '^^' has '' as a prefix, but the superscript
  // it belongs to was never opened, so attaching x to n would invent a level.
  assert.throws(() => treeOf('n^^x'), NemethUnsupportedError);
});

test('juxtaposition of two terms is a Sequence, which asserts nothing about multiplication', () => {
  assert.equal(format(treeOf('ab')), "Sequence([ Identifier('a'), Identifier('b') ])");
});

test('a numeric indicator is recorded as a mark, since LaTeX cannot store it', () => {
  assert.deepEqual(treeOf('#27').marks, { numericIndicator: true });
  assert.deepEqual(treeOf('7').marks, { numericIndicator: false });
});

test('a simple fraction records its fraction order', () => {
  assert.equal(treeOf('?a/c#').marks.fractionOrder, 'simple');
});

test('an explicit baseline indicator is recorded as a mark on the term that follows it', () => {
  assert.equal(treeOf('"x').marks.afterBaseline, true);
  assert.equal(treeOf('x').marks.afterBaseline, undefined);
});

test('nodes carry the cell span they were parsed from', () => {
  const tree = treeOf('?a/c#');
  assert.deepEqual(tree.src, [0, 5]);
  assert.deepEqual(tree.numerator.src, [1, 2]);
  assert.deepEqual(tree.denominator.src, [3, 4]);
});

test('an unclosed fraction is unsupported rather than silently parsed', () => {
  assert.throws(() => treeOf('?a/c'), NemethUnsupportedError);
});

test('a fraction with no fraction line is unsupported', () => {
  assert.throws(() => treeOf('?ac#'), NemethUnsupportedError);
});

test('a radical with no termination indicator is unsupported', () => {
  assert.throws(() => treeOf('>x+y'), NemethUnsupportedError);
});

test('a blank is not silently dropped: it has no grammar yet, so it is unsupported', () => {
  assert.throws(() => treeOf('a b'), NemethUnsupportedError);
});

test('a numeric indicator with no numeral after it is unsupported', () => {
  assert.throws(() => treeOf('#a'), NemethUnsupportedError);
});

test('a trailing operator with no right operand is unsupported', () => {
  assert.throws(() => treeOf('a+'), NemethUnsupportedError);
});

test('an empty token stream is unsupported', () => {
  assert.throws(() => parse([]), NemethUnsupportedError);
});
