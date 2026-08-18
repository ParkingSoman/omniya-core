import assert from 'node:assert/strict';
import test from 'node:test';

import { format } from '../../../src/domain/nemeth/ast.js';
import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';
import { NemethUnsupportedError } from '../../../src/domain/nemeth/errors.js';
import { lex } from '../../../src/domain/nemeth/lexer.js';
import { resolveLevels } from '../../../src/domain/nemeth/levels.js';
import { parse } from '../../../src/domain/nemeth/parser.js';

const treeOf = (ascii) => parse(resolveLevels(lex(asciiToCells(ascii))));

// A resolved token, as `resolveLevels` hands them to `parse`. Used only where the
// slice's symbol table cannot produce the token stream under test.
const token = ({ kind, value, offset, level = '' }) => ({
  kind,
  value,
  cells: '?',
  offset,
  len: 1,
  level,
  afterBaseline: false
});

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

test('Rule 14.6: the digit run promoted by levels.js attaches as an ordinary subscript', () => {
  // Nothing in `x1` marks the subscript. The parser needs no rule of its own for
  // that -- levels.js labels the digit '_' and the existing prefix test does the
  // rest, which is what keeps the Code's implicit subscript out of the grammar.
  assert.equal(format(treeOf('x1')), "Subscript(Identifier('x'), Number('1'))");
});

test('Rule 14.11.1: a subscript then a superscript with no baseline between them is simultaneous', () => {
  // Example 14-123, `x1~2`: one base carrying both at once, an msubsup.
  assert.equal(
    format(treeOf('x1^2')),
    "SubSuperscript(Identifier('x'), Number('1'), Number('2'))"
  );
});

test('Rule 14.11.2: a baseline indicator before the second script makes it non-simultaneous', () => {
  // Example 14-128, `x1"~2`: the same two scripts at the same two levels as the
  // test above -- only the baseline indicator separates (x sub 1) sup 2 from
  // x sub 1 sup 2, and it is the sole carrier of that distinction.
  assert.equal(
    format(treeOf('x1"^2')),
    "Superscript(Subscript(Identifier('x'), Number('1')), Number('2'))"
  );
  // Example 14-124, `a~n";m`, mirrored: the superscript is closer to the a.
  assert.equal(
    format(treeOf('a^n";m')),
    "Subscript(Superscript(Identifier('a'), Identifier('n')), Identifier('m'))"
  );
});

test('Rule 14.11.1 puts the subscript first, so a superscript then a subscript needs a baseline indicator', () => {
  // `a^n;m` has both scripts and no baseline indicator, but in the order the
  // Code reserves for the non-simultaneous reading. Pairing them into an
  // msubsup anyway would answer a question the cells did not settle.
  assert.throws(() => treeOf('a^n;m'), NemethUnsupportedError);
});

test('a script fenced by baseline indicators belongs to what follows it, and is refused', () => {
  // Example 24-7, `p~b"~c"x`: c is a LEFT superscript to x, not a second right
  // superscript on p. Rule 14.11.2 alone would re-base it onto p and emit
  // (p^b)^c x, which is wrong mathematics -- the one-token lookahead past the
  // script is what tells the two apart.
  try {
    treeOf('p^b"^c"q');
    assert.fail('expected an unsupported construct');
  } catch (error) {
    assert(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /left script/u);
  }
});

test('Rule 24.1.b: a multipurpose indicator leaves the numeral juxtaposed on the baseline', () => {
  assert.equal(format(treeOf('x"5')), "Sequence([ Identifier('x'), Number('5') ])");
});

test('a script must be exactly one level deeper than its base, not merely below it', () => {
  // 'n' sits at '' and 'x' at '^^'. '^^' has '' as a prefix, but the superscript
  // it belongs to was never opened, so attaching x to n would invent a level.
  assert.throws(() => treeOf('n^^x'), NemethUnsupportedError);
});

test('juxtaposition of two terms is a Sequence, which asserts nothing about multiplication', () => {
  assert.equal(format(treeOf('ab')), "Sequence([ Identifier('a'), Identifier('b') ])");
});

test('an expression is one flat Sequence in source order, never nested by precedence', () => {
  // Two operators that a precedence grammar would have split into tiers. Nemeth
  // states structure, not binding: it says a fraction has this numerator, never
  // that this is division over the reals. Presentation MathML is flat for the
  // same reason, and `Sequence` is documented as asserting no semantics -- so
  // nesting `b x c` inside `a + ...` would assert binding in the one node whose
  // contract is that it asserts none. Built as tokens because the slice's symbol
  // table carries a single operator.
  const tree = parse([
    token({ kind: 'letter', value: 'a', offset: 0 }),
    token({ kind: 'op', value: '+', offset: 1 }),
    token({ kind: 'letter', value: 'b', offset: 2 }),
    token({ kind: 'op', value: '*', offset: 3 }),
    token({ kind: 'letter', value: 'c', offset: 4 })
  ]);
  assert.equal(
    format(tree),
    "Sequence([ Identifier('a'), Operator('+'), Identifier('b'), Operator('*'), Identifier('c') ])"
  );
});

test('an operator at another level is not read as an operator of this one', () => {
  // `a^^+"b` puts `+` at level '^^' with no base ever opened there. Without the
  // level test on the operator, it is consumed as a baseline operator and `b`
  // becomes its right operand: `a+b`, a wrong answer that looks like a right one.
  assert.throws(() => treeOf('a^^+"b'), NemethUnsupportedError);
});

test('a term at another level is not juxtaposed into this one, and is reported where it sits', () => {
  // The primary's own level check refuses this either way, so what the level test
  // on the juxtaposition loop buys today is that the refusal names the token that
  // is actually stranded, at the level it is stranded at.
  try {
    treeOf('a^^b');
    assert.fail('expected an unsupported construct');
  } catch (error) {
    assert(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /unparsed letter token at level "\^\^"/u);
    assert.equal(error.offset, 3);
  }
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

test('Rule 14.11.2: a baseline indicator ends the digit run instead of merging two scripts into one numeral', () => {
  // `x1";2` is x sub 1, baseline, subscript indicator, 2. The baseline indicator
  // re-bases, so the 2 is a subscript OF the subscripted x -- (x sub 1) sub 2.
  // Without the guard the digit walk swallows both digits at the same level and
  // silently answers x sub 12: two script events merged into one wrong number,
  // and nothing refused. Same shape on the superscript side.
  assert.equal(
    format(treeOf('x1";2')),
    "Subscript(Subscript(Identifier('x'), Number('1')), Number('2'))"
  );
  assert.equal(
    format(treeOf('x^1"^2')),
    "Superscript(Superscript(Identifier('x'), Number('1')), Number('2'))"
  );
});

test('Rule 14.6: without a baseline indicator a digit run is still ONE numeral (Example 14-37)', () => {
  // The guard above must not split every multi-digit subscript: `x11` is x sub 11,
  // not (x sub 1) sub 1. Only an explicit baseline indicator breaks the run.
  assert.equal(format(treeOf('x11')), "Subscript(Identifier('x'), Number('11'))");
});
