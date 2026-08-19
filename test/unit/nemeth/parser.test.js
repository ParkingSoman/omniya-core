import assert from 'node:assert/strict';
import test from 'node:test';

import { format } from '../../../src/domain/nemeth/ast.js';
import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';
import { NemethUnsupportedError } from '../../../src/domain/nemeth/errors.js';
import { lex } from '../../../src/domain/nemeth/lexer.js';
import { resolveLevels } from '../../../src/domain/nemeth/levels.js';
import { toLatex } from '../../../src/domain/nemeth/latex.js';
import { parse } from '../../../src/domain/nemeth/parser.js';

const treeOf = (ascii) => parse(resolveLevels(lex(asciiToCells(ascii))));
const toLatexOf = (ascii) => toLatex(treeOf(ascii));

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
  // The indicator-less case has to be a numeral that is legitimately written
  // without one. BANA Rule 3.3.1 requires it only at the start of a line or
  // after a space, so `#2+3` carries exactly one and the `3` after the operator
  // is bare and correct. A bare `7` standing alone was the previous fixture and
  // is not legal Nemeth -- it refuses now, which is what `⠦` being both the
  // digit 8 and an opening quotation mark demands.
  assert.deepEqual(treeOf('#2+3').items[2].marks, { numericIndicator: false });
});

test('BANA Rule 3.3.1: a numeral at the start or after a space needs the numeric indicator', () => {
  // Lower-cell digits share their dots with punctuation -- `⠦` is the digit 8
  // AND an opening quotation mark -- so reading a bare one as a number invents a
  // value the cells do not carry. Scoped as 3.3.1 scopes it: only line start and
  // after a space, never a bare digit following an operator.
  assert.throws(() => treeOf('8'), NemethUnsupportedError);
  assert.throws(() => treeOf('#2 8'), NemethUnsupportedError);
  assert.equal(treeOf('#2+3').items[2].value, '3');
  assert.equal(treeOf('x8').kind, 'Subscript');
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
  // `x y` -- two letters with a blank between them. Nothing in the Code writes a
  // blank there that this parser reads: 21.13's spaces belong to a comparison
  // sign and 20.1.1's to an operation sign beside a function name, an
  // abbreviation, an ellipsis or a dash. What must NOT happen is the blank being
  // dropped, which would silently answer `xy`.
  //
  // The input used to be `sin x`, chosen when function names were out of scope.
  // Rule 18 shipped in Task 5f and that string now parses correctly, so the
  // example no longer demonstrates anything; the principle it was written for --
  // an unaccounted-for blank refuses rather than vanishing -- is what is kept.
  assert.throws(() => treeOf('x y'), (error) => {
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

// -- Rule 19: signs and symbols of grouping ----------------------------------

test('a pair of grouping symbols becomes one Fenced node (BANA Example 19-1)', () => {
  // `(s4a4s4 .k s4a4s4)` is Example 19-1 (Nemeth_2022.txt lines 9374-9375); the
  // periods are out of scope, so this is the same shape with letters. What the
  // node must carry is the two signs themselves -- Rule 19.1.1 (line 9369)
  // "Symbols of grouping are transcribed wherever they appear in print".
  assert.equal(format(treeOf('(a+b)')), "Fenced('(', Sequence([ Identifier('a'), Operator('+'), Identifier('b') ]), ')')");
});

test('the body of a fence is a whole expression, spaces and relation included (Example 3-31)', () => {
  // `(0 .k x)` is Example 3-31 verbatim (Nemeth_2022.txt lines 1019-1020). If
  // the body were only a `terms` production the relation would be left unparsed
  // and the case would refuse; it is the reason `parseFenced` recurses into
  // `parseExpression`, and the reason the numeral needs no numeric indicator
  // (3.4.1, lines 1164-1167: a number "preceded unspaced by a symbol").
  assert.equal(
    format(treeOf('(0 .k x)')),
    "Fenced('(', Sequence([ Number('0'), Operator('='), Identifier('x') ]), ')')"
  );
});

test('nesting is the call stack: no depth counter anywhere', () => {
  assert.equal(
    format(treeOf('((12)(4))')),
    "Fenced('(', Sequence([ Fenced('(', Number('12'), ')'), Fenced('(', Number('4'), ')') ]), ')')"
  );
});

test('the open and close signs need not match -- Example 19-12 is a bracket closed by a paren', () => {
  // `` `(a, +,=) `` (Nemeth_2022.txt lines 9436-9437) is "[a, +∞)". The comma
  // and infinity are out of scope, so this pins the mismatched pair alone: a
  // parser that required a matching partner would refuse the Code's own example.
  assert.equal(format(treeOf('@(a)')), "Fenced('[', Identifier('a'), ')')");
});

test('a left grouping symbol with no right one refuses, per BANA 19.1.2', () => {
  // 19.1.2 (lines 9438-9443) preserves an unpaired grouping sign in the
  // transcription. `Fenced` has no way to spell half a fence, so the honest
  // answer is a refusal that says so -- never dropping the sign, and never
  // pairing it with a later one that belongs to something else.
  assert.throws(() => treeOf('(a'), (error) => {
    assert.ok(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /has no right grouping symbol/u);
    return true;
  });
});

test('a right grouping symbol with no left one refuses too', () => {
  assert.throws(() => treeOf('a)'), NemethUnsupportedError);
});

test('a script after a right grouping symbol belongs to the group (Example 19-4)', () => {
  // `(seven)^2"+1` (Nemeth_2022.txt lines 9393-9394) prints as "(seven)2 + 1" --
  // the exponent is on the whole parenthesised group, not on the parenthesis.
  assert.equal(format(treeOf('(x)^2')), "Superscript(Fenced('(', Identifier('x'), ')'), Number('2'))");
});

test('a fence closed at a different level is not this fence\'s partner', () => {
  // `x^(y")` -- the group opens at the SUPERSCRIPT level and the only right
  // grouping sign is at the baseline, put there by the baseline indicator of
  // Rule 2. It closes some baseline group, not this one. Without the level test
  // the exponent silently becomes `(y)`, a right sign borrowed from another
  // level -- and nothing refuses, because every token was consumed.
  assert.throws(() => treeOf('x^(y")'), (error) => {
    assert.ok(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /has no right grouping symbol at level "\^"/u);
    return true;
  });
});

test('only a right GROUPING symbol closes a fence, not whatever the body stopped at', () => {
  // `(a/b)` -- `parseExpression` stops at the fraction line, which is at this
  // fence's own level. Without the kind test that line is taken as the closing
  // sign and the answer is a fence spelled `(a/`, with the `b)` unparsed: a
  // wrong node built out of a symbol from a different rule entirely.
  assert.throws(() => treeOf('(a/b)'), (error) => {
    assert.ok(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /has no right grouping symbol/u);
    return true;
  });
});

// -- Rule 3.2: the decimal point and the numeric comma -----------------------

test('a decimal point interior to a numeral is part of it (Example 3-6)', () => {
  // `#3.14` is Example 3-6 verbatim (Nemeth_2022.txt lines 836-837).
  assert.equal(format(treeOf('#3.14')), "Number('3.14')");
});

test('a decimal point may OPEN a numeral (Example 3-5)', () => {
  // `#.35` is Example 3-5 verbatim (line 828). 3.2.3 (lines 818-819) makes the
  // decimal point numeric "only when it is followed by a number", not when it
  // is preceded by one.
  assert.equal(format(treeOf('#.35')), "Number('.35')");
});

test('a numeric comma partitions a numeral (Example 3-4)', () => {
  // `#1,478.00` is Example 3-4 verbatim (line 815); 3.2.2 (lines 808-810) calls
  // this comma "interior to a modified numeral".
  assert.equal(format(treeOf('#1,478.00')), "Number('1,478.00')");
});

test('a comma that is not interior to a numeral is not part of one', () => {
  // 3.2.2's "interior" is both sides. `,478` has no digits before the comma, so
  // it is Rule 8's mark of punctuation (its table, line 3887, spells the two
  // identically) and this parser has no grammar for it. The reading that must
  // NOT happen is the numeral `,478`.
  assert.throws(() => treeOf(',478'), NemethUnsupportedError);
});

test('a decimal point with no numeral after it is not a decimal point at all (3.2.3)', () => {
  // 3.2.3 (lines 818-819) makes `⠨` numeric "only when it is followed by a
  // number", and the Code's own way of writing `1.` followed by non-numeric
  // material is Example 3-8's `#1."a1a2a3` (line 847) -- the multipurpose
  // indicator, not a bare decimal point. So `#3.x` is the OTHER reading of the
  // cell: Rule 6's Greek indicator on x, which is xi. The answer that must not
  // appear is a numeral with a trailing point.
  assert.equal(format(treeOf('#3.x')), "Sequence([ Number('3'), Identifier('x') ])");
});

test('a numeric mark at another level does not join a numeral at this one', () => {
  // `#1;,478` -- the comma carries a subscript indicator, so it is not interior
  // to the baseline numeral. Merging it would answer `1,478` for cells that say
  // 1 with something else hung under it.
  assert.throws(() => treeOf('#1;,478'), NemethUnsupportedError);
});

test('BANA 3.2.2/3.2.3 are checked on the TOKEN stream, not assumed from the lexer', () => {
  // `lex` already refuses to emit a numeric mark that the rules do not license:
  // `⠨` is only the decimal point when a numeral follows it, and `⠼` demotes
  // itself to a fraction close when a comma follows. But `parse` is a separately
  // callable stage (Task 6 feeds it token streams), so it re-derives the two
  // conditions rather than trusting an invariant from upstream -- and each
  // stream below, unguarded, produces a WRONG numeral rather than a refusal.
  const num = token({ kind: 'numeric', value: '#', offset: 0 });
  const three = token({ kind: 'digit', value: '3', offset: 1 });
  const parseAll = (tokens) => parse(tokens);

  // 3.2.2: "interior to a modified numeral" is both sides, so a comma with no
  // digits before it does not open one. Unguarded this answers `,4`.
  assert.throws(
    () => parseAll([num, token({ kind: 'comma', value: ',', offset: 1 }), token({ kind: 'digit', value: '4', offset: 2 })]),
    NemethUnsupportedError
  );
  // 3.2.3: numeric "only when it is followed by a number". Unguarded: `3.x`.
  assert.throws(
    () =>
      parseAll([
        num,
        three,
        token({ kind: 'decimal', value: '.', offset: 2 }),
        token({ kind: 'letter', value: 'x', offset: 3 })
      ]),
    NemethUnsupportedError
  );
  // The mark itself must be at the numeral's own level. Unguarded: `3.4`, with a
  // decimal point borrowed from a superscript.
  assert.throws(
    () =>
      parseAll([
        num,
        three,
        token({ kind: 'decimal', value: '.', offset: 2, level: '^' }),
        token({ kind: 'digit', value: '4', offset: 3 })
      ]),
    NemethUnsupportedError
  );
  // And so must the numeral it is followed by. Unguarded: `3.^{4}` -- a numeral
  // ending in a point, with the exponent hung off it.
  assert.throws(
    () =>
      parseAll([
        num,
        three,
        token({ kind: 'decimal', value: '.', offset: 2 }),
        token({ kind: 'digit', value: '4', offset: 3, level: '^' })
      ]),
    NemethUnsupportedError
  );
});

test('BANA Rule 8: the punctuation indicator with a colon is an infix sign, not a letter', () => {
  // `_3` = the punctuation indicator (Nemeth_2022.txt line 3879, and the Rule 2
  // summary at line 688) with the colon (line 3882). `x_3y` is the shape inside
  // `sre-aata:AataExpression_267`, "{y in X : y ~ x}". It must land in the tree
  // as an Operator between its two operands: as an Identifier the LaTeX would
  // come out the same and the tree would silently say the colon is a name.
  assert.equal(format(treeOf('x_3y')), "Sequence([ Identifier('x'), Operator(':'), Identifier('y') ])");
});

test('Rule 19: braces are escaped for LaTeX, brackets and parentheses are not', () => {
  // `.(`/`.)` are the curly brackets of Rule 19's table (lines 9333-9334) and
  // `@(`/`@)` the square ones (lines 9328-9329). A bare `{` is LaTeX grouping,
  // not a brace, so the row carries the escape.
  assert.equal(toLatexOf('.(a.)'), '\\{a\\}');
  assert.equal(toLatexOf('@(a@)'), '[a]');
  assert.equal(toLatexOf('(a)'), '(a)');
});

// -- BANA Rule 18: function names --------------------------------------------

test('Rule 18: a function name applies to the postfix after 18.4.1\'s space', () => {
  // BANA Example 18-2 (test/corpus/sources/Nemeth_2022.txt lines 9138-9141).
  assert.equal(format(treeOf('sin x')), "FunctionCall('\\\\sin', Identifier('x'))");
  assert.equal(toLatexOf('sin x'), '\\sin x');
});

test('Rule 18.4.3: the argument is one term, so an operation sign after it stays in the sequence', () => {
  // Example 18-14 (lines 9243-9247) is `sin x+y` for print "sin x + y": the name
  // applies to x, and `+y` is not swallowed into the argument.
  assert.equal(
    format(treeOf('sin x+y')),
    "Sequence([ FunctionCall('\\\\sin', Identifier('x')), Operator('+'), Identifier('y') ])"
  );
});

test('Rule 18: a function token with no blank after it refuses rather than taking the next term', () => {
  // Unreachable through `lex()` -- the lexer only reads these cells as a
  // function name when 18.4.1's space is there -- so it is driven through
  // `parse` directly. Without the check the name would silently apply to
  // whatever followed, which is the one wrong answer this production can give.
  assert.throws(
    () => parse([token({ kind: 'function', value: '\\sin', offset: 0 }), token({ kind: 'letter', value: 'x', offset: 1 })]),
    (error) => {
      assert.ok(error instanceof NemethUnsupportedError);
      assert.match(error.detail, /BANA 18\.4\.1 leaves a space/u);
      return true;
    }
  );
});

// -- BANA Rule 16.2: index of radical ----------------------------------------

test('Rule 16.2: an indexed radical becomes Root with its index', () => {
  // Example 16-10 (lines 8256-8259) `<3>2]`, Example 16-12 (lines 8266-8269)
  // `<n>a]`, Example 16-13 (lines 8271-8273) `<m+n>p+q]`.
  assert.equal(format(treeOf('<3>2]')), "Root(Number('2'), Number('3'))");
  assert.equal(toLatexOf('<n>a]'), '\\sqrt[n]{a}');
  assert.equal(toLatexOf('<m+n>p+q]'), '\\sqrt[m+n]{p+q}');
  // Example 16-11 (lines 8261-8264) `#3<3>x+y]`: the indexed radical is a term
  // like any other, so it juxtaposes with the numeral before it.
  assert.equal(toLatexOf('#3<3>x+y]'), '3\\sqrt[3]{x+y}');
});

test('Rule 16.2: the index ends at the radical sign, so the radical is not eaten as part of it', () => {
  // Without the `stop`, `parseTerms` reads `>2]` as a further term of the index
  // (a radical opens a term) and the radical sign that 16.2 step (c) requires is
  // then missing, so a correct expression refuses.
  assert.equal(format(treeOf('<3>2]')), "Root(Number('2'), Number('3'))");
  // An index-of-radical indicator with no index at all is refused rather than
  // reading the radical itself as the index.
  assert.throws(() => treeOf('<>x]'), (error) => {
    assert.match(error.detail, /not followed by an index/u);
    return true;
  });
  assert.throws(() => treeOf('<3x]'), (error) => {
    assert.match(error.detail, /not followed by a radical sign/u);
    return true;
  });
  assert.throws(() => treeOf('<3>x'), (error) => {
    assert.match(error.detail, /indexed radical has no termination indicator/u);
    return true;
  });
});

// -- BANA Rule 13: fraction indicators pair by order --------------------------

test('Rule 13.6: a complex fraction encloses a simple one, and the orders pair', () => {
  // Example 13-23 (lines 5757-5762) `,??3/8#,/5,#`.
  assert.equal(toLatexOf(',??3/8#,/5,#'), '\\frac{\\frac{3}{8}}{5}');
  assert.equal(treeOf(',??3/8#,/5,#').marks.fractionOrder, 'complex');
  assert.equal(treeOf('?a/b#').marks.fractionOrder, 'simple');
});

test('Rule 13: a fraction opened at one order is not closed at another', () => {
  // Without the order test, `expect(state, "fracLine")` matches the INNER simple
  // fraction's line and the outer complex fraction is re-parented onto it.
  assert.throws(() => treeOf(',??3/8#/5,#'), (error) => {
    assert.ok(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /has no complex fraction line/u);
    return true;
  });
  assert.throws(() => treeOf(',?3,/5#'), (error) => {
    assert.match(error.detail, /has no complex closing indicator/u);
    return true;
  });
});

// -- BANA Rule 20/21: the new operation and comparison signs ------------------

test('Rules 20 and 21: the new signs are items in the flat sequence, like the old ones', () => {
  assert.equal(toLatexOf('a@*b'), 'a×b');
  assert.equal(toLatexOf('a*b'), 'a⋅b');
  assert.equal(toLatexOf('x "k: #5'), 'x≤5');
  assert.equal(toLatexOf('x .1: #5'), 'x≥5');
});
