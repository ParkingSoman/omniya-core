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

test('a blank is not silently dropped: `a b` is not `ab`', () => {
  // Rule 20.1.2 (line 9964) leaves no space between juxtaposed letters, so this
  // blank is one of 20.1.1's spaced circumstances -- a function name, an
  // abbreviation, an ellipsis or a dash -- and none of those is in scope.
  // Dropping it would answer `ab`, which is different mathematics.
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

test('an indicated digit does not continue a Rule 14.6 promoted run (Nemeth_2022.txt lines 6420-6439)', () => {
  // `,p1;2",q` is mathcat-rules:sub_ind_mmultiscripts_80_b_3: P with the
  // unindicated numeric subscript 1, then a subscript indicator whose 2 is a
  // LEFT subscript of Q. Where Rule 14.6's conditions hold the indicator "is
  // not used", so the indicated 2 cannot be more of the promoted run -- reading
  // it as one numeral gives the wrong answer `P_{12}Q` with nothing refused.
  assert.throws(() => treeOf(',p1;2",q'), (error) => {
    assert.ok(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /script on a base already carrying/u);
    return true;
  });
  // The counter-case that keeps the break from splitting every multi-digit
  // subscript: Example 14-37, `x11` = x sub 11, promoted throughout.
  assert.equal(format(treeOf('x11')), "Subscript(Identifier('x'), Number('11'))");
});

// -- BANA Rule 21.13, the blank-delimited comparison seam ---------------------

test('Rule 21.13: a blank-surrounded comparison sign joins two expressions, flat', () => {
  // "A space must be left on either side of a comparison symbol"
  // (Nemeth_2022.txt line 10776). Example 21-26 (lines 10786-10789) is `x .k y`
  // verbatim. The relation is one FLAT Sequence -- a comparison sign is an item
  // beside its operands, never a node that binds them, for the same reason the
  // operation signs are flat.
  assert.equal(
    format(treeOf('x .k y')),
    "Sequence([ Identifier('x'), Operator('='), Identifier('y') ])"
  );
  assert.equal(
    format(treeOf('a+b .k c')),
    "Sequence([ Identifier('a'), Operator('+'), Identifier('b'), Operator('='), Identifier('c') ])"
  );
});

test('Rule 21.13: without its blanks the same cells are not a comparison sign', () => {
  // `.k` unspaced is the Greek-letter indicator followed by k, i.e. kappa --
  // which the lexer's `unlessUnspaced` fallback produces and which is NOT a
  // comparison, so no relation is built out of it.
  assert.equal(format(treeOf('.kx')), "Sequence([ Identifier('k'), Identifier('x') ])");
  // Only one of the two required blanks is not enough either.
  assert.throws(() => treeOf('x .ky'), NemethUnsupportedError);
});

test('Rule 21.13: a comparison sign needs a term on each side', () => {
  // The same discipline the operation-sign loop applies. `sre-aata:
  // AataExpression_330` is the bare cells `_l` for the identity sign; 21.13's
  // outer space is real but there is no relation to build, so it refuses.
  assert.throws(() => treeOf('_l'), NemethUnsupportedError);
  assert.throws(() => treeOf('x .k '), NemethUnsupportedError);
});

test('Rule 20.1.2: a blank beside an operation sign refuses, and names that rule', () => {
  // "A space is not left on either side of a symbol of operation in any other
  // situation" (line 9964) -- other than the five circumstances of 20.1.1 (lines
  // 9916-9963), none of which this parser reads. The refusal names the sign,
  // which it can only do by reading the `role: 'binary'` its symbol row carries.
  assert.throws(() => treeOf('a +b'), (error) => {
    assert.ok(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /Rule 20\.1\.2 leaves no space beside the operation sign "\+"/u);
    return true;
  });
});

test('a blank that delimits nothing refuses, citing Rules 21.13 and 20.1.1', () => {
  // `sin x` (mathcat-rules:num_indicator_9_a_5 shape). Function names are out of
  // scope, so this blank is 20.1.1.b's and unreadable here. What must NOT happen
  // is the blank being dropped: that would silently answer `sinx`.
  assert.throws(() => treeOf('sin x'), (error) => {
    assert.ok(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /BANA Rule 21\.13 does not put one/u);
    return true;
  });
});

test('Rule 21.13: the seam only matches a comparison sign at the expression\'s own level', () => {
  // `x ^.k "y` -- the superscript indicator puts the equals sign at the
  // superscript level (Example 14-113, lines 7137-7142: "the superscript
  // indicator before the equals symbol keeps this symbol at the superscript
  // level"), and the baseline indicator puts y back at the baseline. The
  // baseline expression must NOT reach up and take that equals sign as its own:
  // doing so answers `x=y` for an expression whose relation sign is an exponent.
  assert.throws(() => treeOf('x ^.k "y'), NemethUnsupportedError);
});

test('Rule 21.13: only a comparison SIGN opens the seam, not any blank-flanked token', () => {
  // Three consecutive blanks put a blank in the seam's middle slot. Without the
  // `role` test the middle one would be read as the relation sign and emitted as
  // an operator, silently answering `a b` for cells that say nothing of the sort.
  assert.throws(() => treeOf('a   b'), NemethUnsupportedError);
});

test('the seam is a shape in the TOKEN stream, not an assumption about the lexer', () => {
  // `lex` never emits a comparison token that is not blank-flanked -- Rule 21.13
  // is enforced there too, by `unlessUnspaced`. But `parse` is a separately
  // callable stage (Task 6 feeds it token streams), so it checks the shape
  // itself rather than trusting an invariant from upstream. Both mis-shapes
  // below would otherwise SKIP a token: `b` on the left, `b` on the right.
  const tok = (kind, value, extra = {}) =>
    Object.freeze({ kind, value, level: '', cells: '', offset: 0, len: 1, ...extra });
  const equals = tok('comparison', '=', { role: 'comparison' });
  const blank = tok('blank', ' ');
  assert.throws(
    () => parse([tok('letter', 'a'), tok('radClose', ']'), equals, blank, tok('letter', 'c')]),
    NemethUnsupportedError
  );
  assert.throws(
    () => parse([tok('letter', 'a'), blank, equals, tok('letter', 'b'), tok('letter', 'c')]),
    NemethUnsupportedError
  );
});

test('Rule 21.13 with the ratio and proportion signs (Example 21-34)', () => {
  // `#1 "1 #2 ;2 #3 "1 #6` is Nemeth_2022.txt line 10843 verbatim (Example
  // 21-34), and is `mathcat-rules:ratio_151_10`. `;2` unspaced is a subscript 2 and `"1`
  // unspaced is a baseline indicator with the digit 1; the blanks are the only
  // thing that makes them the proportion and ratio signs (lexer.test.js pins the
  // unspaced readings).
  assert.equal(
    format(treeOf('#1 "1 #2 ;2 #3 "1 #6')),
    "Sequence([ Number('1'), Operator('∶'), Number('2'), Operator('∷'), " +
      "Number('3'), Operator('∶'), Number('6') ])"
  );
});
