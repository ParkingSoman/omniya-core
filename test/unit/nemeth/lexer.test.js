import assert from 'node:assert/strict';
import test from 'node:test';

import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';
import { NemethUnsupportedError, UNSUPPORTED_MESSAGE } from '../../../src/domain/nemeth/errors.js';
import { lex } from '../../../src/domain/nemeth/lexer.js';
import { buildTrie, matchAt } from '../../../src/domain/nemeth/symbols.js';

const shape = (tokens) => tokens.map((token) => `${token.kind}:${token.value}`);

test('lex reads a simple fraction as one token per symbol', () => {
  assert.deepEqual(shape(lex(asciiToCells('?a+b/c#'))), [
    'fracOpen:?',
    'letter:a',
    'op:+',
    'letter:b',
    'fracLine:/',
    'letter:c',
    'fracClose:#'
  ]);
});

test('a numeric indicator followed by a digit lexes as the numeric indicator', () => {
  assert.deepEqual(shape(lex(asciiToCells('#27'))), ['numeric:#', 'digit:2', 'digit:7']);
});

test('the same cell lexes as a fraction close when no numeral follows', () => {
  const tokens = lex(asciiToCells('?a/b#'));
  assert.equal(tokens.at(-1).kind, 'fracClose');
});

test('a blank (U+2800) survives lexing as its own token and is never trimmed', () => {
  const tokens = lex(asciiToCells(' a '));
  assert.deepEqual(shape(tokens), ['blank: ', 'letter:a', 'blank: ']);
});

test('tokens carry the cell offset and length they were matched from', () => {
  const tokens = lex(asciiToCells('#27'));
  assert.deepEqual(
    tokens.map((token) => [token.offset, token.len]),
    [
      [0, 1],
      [1, 1],
      [2, 1]
    ]
  );
});

test('8-dot cells are reduced to their 6-dot form', () => {
  const eightDot = String.fromCodePoint(0x2800 + 0x80 + (asciiToCells('a').codePointAt(0) - 0x2800));
  assert.deepEqual(shape(lex(eightDot)), ['letter:a']);
});

test('a codepoint outside U+2800-U+28FF raises NemethUnsupportedError', () => {
  assert.throws(() => lex('A'), NemethUnsupportedError);
});

test('the user-facing message of a lex failure is the shared constant and leaks no detail', () => {
  try {
    lex('A');
    assert.fail('expected lex to throw');
  } catch (error) {
    assert.equal(error.message, UNSUPPORTED_MESSAGE);
    assert.notEqual(error.detail, '');
    assert.equal(error.message.includes(error.detail), false);
    assert.equal(error.offset, 0);
  }
});

test('a braille cell with no symbol row raises NemethUnsupportedError', () => {
  assert.throws(() => lex(asciiToCells('%')), NemethUnsupportedError);
});

test('a symbol table that defines the same cells twice is refused when it is built', () => {
  const row = { cells: asciiToCells('a'), kind: 'letter', value: 'a', banaRef: null };
  assert.throws(() => buildTrie([row, { ...row, value: 'other' }]), /defines ".*" more than once/u);
});

test('the longest symbol wins when one symbol is a prefix of another', () => {
  // No row in this slice is multi-cell, so the property is proved on a table that
  // has one. `.` and `./` are the real pair this protects: the decimal point is a
  // prefix of the division sign.
  const trie = buildTrie([
    { cells: asciiToCells('.'), kind: 'decimal', value: '.', banaRef: null },
    { cells: asciiToCells('./'), kind: 'op', value: '\\div', banaRef: null }
  ]);
  const cells = asciiToCells('./a');
  assert.deepEqual(
    [matchAt(cells, 0, trie).kind, matchAt(cells, 0, trie).len],
    ['op', 2]
  );
  assert.deepEqual([matchAt(asciiToCells('.a'), 0, trie).kind, matchAt(asciiToCells('.a'), 0, trie).len], [
    'decimal',
    1
  ]);
});

test('matchAt is pure: repeated calls at the same index give the same answer', () => {
  const cells = asciiToCells('#27');
  const first = matchAt(cells, 0);
  const second = matchAt(cells, 0);
  assert.deepEqual(first, second);
  assert.equal(matchAt(cells, 3), null);
});

// -- the prefix pass: Rules 5, 6 and 7 ---------------------------------------
//
// Every expectation below is a shape the BANA text writes out, cited by line in
// test/corpus/sources/Nemeth_2022.txt. The pass composes indicators onto ONE
// governed sign; the marks it produces are what latex.js renders.

const marksOf = (tokens) => tokens.map((token) => token.marks ?? null);

test('a capitalization indicator composes onto the letter it precedes (Rule 5.1.1, line 2898)', () => {
  const tokens = lex(asciiToCells(',a'));
  assert.deepEqual(shape(tokens), ['letter:a']);
  assert.deepEqual(marksOf(tokens), [{ capitalization: 'single' }]);
  // The token spans BOTH cells, so `src` offsets still cover the indicator.
  assert.deepEqual([tokens[0].offset, tokens[0].len], [0, 2]);
});

test('a Greek indicator composes onto its letter, and is repeated per letter (Example 6-6, line 3117)', () => {
  const tokens = lex(asciiToCells('.a.b'));
  assert.deepEqual(shape(tokens), ['letter:a', 'letter:b']);
  assert.deepEqual(marksOf(tokens), [{ alphabet: 'greek' }, { alphabet: 'greek' }]);
});

test('Appendix C order: alphabet then capitalization, never the reverse (Example 5-2, line 2912)', () => {
  assert.deepEqual(marksOf(lex(asciiToCells('.,g'))), [{ alphabet: 'greek', capitalization: 'single' }]);
  // `,.` is the sans serif indicator, so the reversed spelling is not even the
  // same cells -- and `;` after a capitalization indicator is out of order.
  assert.throws(() => lex(asciiToCells(',;a')), NemethUnsupportedError);
});

test('a dual-role indicator is a typeform when an alphabetic indicator follows it (Rule 7.2.1, line 3605)', () => {
  // `_` is boldface AND the German-letter indicator; `.` is italic AND Greek.
  assert.deepEqual(marksOf(lex(asciiToCells('_a'))), [{ alphabet: 'german' }]);
  assert.deepEqual(marksOf(lex(asciiToCells('__a'))), [{ typeform: 'bold', alphabet: 'german' }]);
  assert.deepEqual(marksOf(lex(asciiToCells('_;a'))), [{ typeform: 'bold', alphabet: 'english' }]);
  assert.deepEqual(marksOf(lex(asciiToCells('_.a'))), [{ typeform: 'bold', alphabet: 'greek' }]);
  assert.deepEqual(marksOf(lex(asciiToCells('..a'))), [{ typeform: 'italic', alphabet: 'greek' }]);
});

test('a capitalization indicator does not make a dual-role indicator a typeform (Example 5-2, line 2912)', () => {
  // `.,g` is capital Greek gamma. If `,` counted as "an alphabetic indicator
  // follows", `.` would be read as italic with no alphabet and this would refuse.
  assert.deepEqual(marksOf(lex(asciiToCells('.,g'))), [{ alphabet: 'greek', capitalization: 'single' }]);
});

test('sans serif and barred are single indicators of their own (Examples 7-5 line 3642, 7-2 line 3619)', () => {
  assert.deepEqual(marksOf(lex(asciiToCells(',.;,h'))), [
    { typeform: 'sans-serif', alphabet: 'english', capitalization: 'single' }
  ]);
  assert.deepEqual(marksOf(lex(asciiToCells(',_;,r'))), [
    { typeform: 'barred', alphabet: 'english', capitalization: 'single' }
  ]);
});

test('a typeform indicator governs a numeral through the numeric indicator (Rule 7.2.2, line 3656)', () => {
  const tokens = lex(asciiToCells('_#345'));
  assert.deepEqual(shape(tokens), ['numeric:#', 'digit:3', 'digit:4', 'digit:5']);
  assert.deepEqual(tokens[0].marks, { typeform: 'bold' });
});

test('a typeform indicator with no alphabetic or numeric indicator after it refuses (Rule 7.2.1, line 3605)', () => {
  // `,.` (sans serif) can only be a typeform, so `,.a` has no alphabetic
  // indicator where 7.2.1 requires one.
  assert.throws(() => lex(asciiToCells(',.a')), (error) => {
    assert.ok(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /typeform indicator governs a letter/u);
    return true;
  });
});

test('an alphabetic or capitalization indicator governing a non-letter refuses (Rules 5.1.1/6.2.3)', () => {
  // `,` before a blank is the mathematical comma of Rule 8, not a capitalization
  // indicator -- and this pass has no grammar for it, so it must not guess.
  assert.throws(() => lex(asciiToCells(', ')), (error) => {
    assert.match(error.detail, /governs a blank/u);
    return true;
  });
  assert.throws(() => lex(asciiToCells(',')), (error) => {
    assert.match(error.detail, /governs nothing/u);
    return true;
  });
});

test('the double capitalization indicator refuses rather than becoming a mode (Rule 5.3.2, line 2942)', () => {
  // 5.3.2's effect "extends to all of the letters which immediately follow it".
  // That is run-scoped, i.e. a mode, and out of scope here.
  assert.throws(() => lex(asciiToCells(',,iii')), (error) => {
    assert.match(error.detail, /Appendix C's order/u);
    return true;
  });
});

test('a comparison sign wins over the prefix reading when it is blank-surrounded (Rule 21.13, line 10775)', () => {
  // `.k` is both the equals sign (Rule 21 list, line 10291) and Greek kappa.
  assert.deepEqual(shape(lex(asciiToCells('x .k y'))), [
    'letter:x',
    'blank: ',
    'comparison:=',
    'blank: ',
    'letter:y'
  ]);
  // The ends of the input are spaces too: `_l` alone is the identity sign,
  // which is what sre-aata:AataExpression_330 records.
  assert.deepEqual(shape(lex(asciiToCells('_l'))), ['comparison:≡']);
});

test('an unspaced comparison homograph falls back to its first cell as an indicator', () => {
  // Greek letters are never blank-surrounded, so `.k` written against its
  // neighbours is kappa, not "equals".
  const tokens = lex(asciiToCells('a.kb'));
  assert.deepEqual(shape(tokens), ['letter:a', 'letter:k', 'letter:b']);
  assert.deepEqual(tokens[1].marks, { alphabet: 'greek' });
  // Same cell pair, same rule, for capital R vs the relation sign of 21.5.
  assert.deepEqual(marksOf(lex(asciiToCells(',rx'))), [{ capitalization: 'single' }, null]);
});

// -- BANA Rule 21.13: spacing is what tells a comparison sign from its homograph

test('Rule 21.13: blank-surrounded comparison cells lex as comparison signs', () => {
  // "A space must be left on either side of a comparison symbol"
  // (Nemeth_2022.txt line 10776). Each of these cell pairs is BOTH a Rule 21
  // comparison sign and something else entirely, and only the spacing separates
  // them: `.k` = / Greek kappa (line 10291), `_l` = / German ell (10298),
  // `,r` = R / capital R (10318), `;2` = / a subscript 2 (10314),
  // `"1` = / a baseline indicator and the digit 1 (10316),
  // `"k` = < / a baseline indicator and the letter k (10302).
  const signOf = (ascii) => lex(asciiToCells(ascii)).map((token) => `${token.kind}:${token.value}`);
  assert.deepEqual(signOf('a .k b'), ['letter:a', 'blank: ', 'comparison:=', 'blank: ', 'letter:b']);
  assert.deepEqual(signOf('a _l b'), ['letter:a', 'blank: ', 'comparison:≡', 'blank: ', 'letter:b']);
  assert.deepEqual(signOf('a ,r b'), ['letter:a', 'blank: ', 'comparison:R', 'blank: ', 'letter:b']);
  assert.deepEqual(signOf('a ;2 b'), ['letter:a', 'blank: ', 'comparison:∷', 'blank: ', 'letter:b']);
  assert.deepEqual(signOf('a "1 b'), ['letter:a', 'blank: ', 'comparison:∶', 'blank: ', 'letter:b']);
  assert.deepEqual(signOf('a "k b'), ['letter:a', 'blank: ', 'comparison:<', 'blank: ', 'letter:b']);
});

test('Rule 21.13: the same cells unspaced fall back to the other reading', () => {
  const signOf = (ascii) => lex(asciiToCells(ascii)).map((token) => `${token.kind}:${token.value}`);
  // `.k` becomes the Greek-letter indicator composed onto k, i.e. kappa.
  assert.deepEqual(signOf('.kx'), ['letter:k', 'letter:x']);
  assert.equal(lex(asciiToCells('.kx'))[0].marks.alphabet, 'greek');
  // `;2` becomes the subscript indicator and the digit 2.
  assert.deepEqual(signOf('x;2y'), ['letter:x', 'level:_', 'digit:2', 'letter:y']);
  // `"k` becomes the baseline indicator and the letter k.
  assert.deepEqual(signOf('x"ky'), ['letter:x', 'baseline:', 'letter:k', 'letter:y']);
});

test('a comparison row carries its Rule 20/21 spacing class onto the token', () => {
  // `role` is what `levels.js` and `parser.js` read; without it on the token the
  // Rule 14.8.7 level reset and the Rule 21.13 seam have nothing to test.
  const tokens = lex(asciiToCells('a .k b+c'));
  assert.equal(tokens[2].role, 'comparison');
  assert.equal(tokens[5].role, 'binary');
  assert.equal(tokens[0].role, undefined);
});

test('Rule 7.1: the script-type indicator is read as a typeform on a numeral', () => {
  // Rule 7's indicator list writes script `@` = `⠈` (line 3563) and 7.1 lists
  // script among the Code's six typeforms (lines 3596-3598).
  // `mathcat-rules:boldface_32_b_2` is `@#2` and targets mathvariant='script'.
  const tokens = lex(asciiToCells('@#2'));
  assert.deepEqual(tokens.map((token) => token.kind), ['numeric', 'digit']);
  assert.equal(tokens[0].marks.typeform, 'script');
});

test('Rule 21.13 sentence two: an indicator sits inside the space, not outside it', () => {
  // "a space is not left between the comparison symbol and any punctuation
  // symbol, grouping symbol, or indicator which applies to it" (lines
  // 10777-10779). Example 14-94 (lines 6939-6945) writes `!;u ;.k a`, an equals
  // sign held at the subscript level by the indicator against it. Reading the
  // spacing off the immediately preceding CELL would find `;`, call the sign
  // unspaced, and answer a Greek kappa.
  const signOf = (ascii) => lex(asciiToCells(ascii)).map((token) => `${token.kind}:${token.value}`);
  assert.deepEqual(signOf('x;u ;.k a'), [
    'letter:x', 'level:_', 'letter:u', 'blank: ', 'level:_', 'comparison:=', 'blank: ', 'letter:a'
  ]);
  // The walk must not manufacture a space that is not there: with the indicator
  // run reached from a letter rather than from a space, the sign is unspaced and
  // stays the Greek reading.
  assert.deepEqual(signOf('x;.ka'), ['letter:x', 'level:_', 'letter:k', 'letter:a']);
});

// -- Rule 3.2: two Rule 2 indicator cells that are numeric marks first --------

test('BANA 3.2.3: `.` before a digit is the decimal point, before a letter the Greek indicator', () => {
  // 3.2.3 (test/corpus/sources/Nemeth_2022.txt lines 818-819): the decimal
  // point "is regarded as a numeric symbol only when it is followed by a
  // number". `.a` is Example 6-6's Greek alpha (line 3117), the same cell.
  assert.deepEqual(shape(lex(asciiToCells('#3.14'))), [
    'numeric:#',
    'digit:3',
    'decimal:.',
    'digit:1',
    'digit:4'
  ]);
  assert.deepEqual(shape(lex(asciiToCells('.a'))), ['letter:a']);
  assert.deepEqual(lex(asciiToCells('.a'))[0].marks, { alphabet: 'greek' });
});

test('BANA 3.2.2: `,` before a digit is the mathematical comma, before a letter the capitalization indicator', () => {
  // 3.2.2 (lines 808-810), Example 3-4 `#1,478.00` (line 815), against Rule
  // 5.1.1's capitalization indicator on the very same cell.
  assert.deepEqual(shape(lex(asciiToCells('#1,478'))), [
    'numeric:#',
    'digit:1',
    'comma:,',
    'digit:4',
    'digit:7',
    'digit:8'
  ]);
  assert.deepEqual(shape(lex(asciiToCells(',a'))), ['letter:a']);
});

test('the fraction-close test reads the next SYMBOL, not the next cell', () => {
  // `#.13`: the cells after `#` longest-match as `.1`, Rule 21's greater-than
  // sign (line 10295), and only 21.13's spacing test turns that back into the
  // decimal point that makes the leading `#` a numeric indicator. A raw trie
  // hit at the next cell answers `comparison`, which is not a numeral start, and
  // the `#` would be read as a fraction close.
  assert.deepEqual(shape(lex(asciiToCells('#.13'))), ['numeric:#', 'decimal:.', 'digit:1', 'digit:3']);
});

test('`?4/9#./?1/6#` -- the shape the whole-symbol lookahead exists for (BANA line 1662)', () => {
  // The cells after the closing fraction indicator are `./`, Rule 20's division
  // sign (line 9857). `.` alone is the decimal point, so a one-cell peek would
  // read that `#` as opening a numeral instead of closing the fraction.
  assert.deepEqual(shape(lex(asciiToCells('?4/9#./?1/6#'))), [
    'fracOpen:?',
    'digit:4',
    'fracLine:/',
    'digit:9',
    'fracClose:#',
    'op:÷',
    'fracOpen:?',
    'digit:1',
    'fracLine:/',
    'digit:6',
    'fracClose:#'
  ]);
});

test('a refusal on `,` or `.` names the reading the table leads with, not just Rule 5', () => {
  // `(0, 1, 2)` is Example 8-34 verbatim (lines 4229-4230), and 8.3.3 (lines
  // 4224-4225) is why the comma carries no punctuation indicator. This pipeline
  // has no grammar for a mark of punctuation, so it refuses -- but blaming
  // Rule 5's capitalization indicator alone would point the next reader at the
  // wrong chapter for what is a comma before a space.
  assert.throws(() => lex(asciiToCells('(0, 1, 2)')), (error) => {
    assert.ok(error instanceof NemethUnsupportedError);
    assert.match(error.detail, /the comma of BANA 3\.2\.2/u);
    return true;
  });
  // The note appears only for a row that declares an alternative reading: `_`
  // is a typeform indicator and nothing else, so its message is unchanged.
  assert.throws(() => lex(asciiToCells('_ ')), (error) => {
    assert.equal(/the table leads with/u.test(error.detail), false);
    return true;
  });
});

// -- Rule 21.13 again: the tilde, where both readings are the SAME two cells --

test('the simple tilde is a comparison sign spaced and an operation sign unspaced', () => {
  // The Code lists Simple Tilde twice on the cells `@:` (the book prints them
  // as `` `: ``, the Duxbury font's rendering alias for the same byte): as a symbol of
  // OPERATION, U+301C, in Rule 20's table (line 9910), and as a symbol of
  // COMPARISON, U+223C "is related to; is similar to", in Rule 21's (line
  // 10325). 20.1.2 (line 9964) leaves no space beside an operation sign and
  // 21.13 (line 10776) requires one on both sides of a comparison sign, so the
  // spacing is the Code's own discriminator -- the same one that separates
  // `.k` the equals sign from `.k` the Greek kappa.
  const spaced = lex(asciiToCells('x @: y'));
  assert.deepEqual(shape(spaced), ['letter:x', 'blank: ', 'comparison:∼', 'blank: ', 'letter:y']);
  assert.equal(spaced[2].role, 'comparison');
  const unspaced = lex(asciiToCells('x@:y'));
  assert.deepEqual(shape(unspaced), ['letter:x', 'op:〜', 'letter:y']);
  assert.equal(unspaced[1].role, 'binary');
});

test('the tilde needs the OTHER unspaced resolution: truncation cannot reach its twin', () => {
  // `.k` unspaced is two symbols (the Greek indicator and the letter k), so its
  // row declares `maxLen` and the trie is re-run against a truncated string.
  // `@:` unspaced is still ONE symbol, a different one, so no truncation can
  // reach it -- truncating to one cell would land on the script-type indicator
  // of Rule 7 (line 3563) and lose the tilde entirely. The row declares fields
  // instead, and this pins that the two rows really do take different paths.
  const tilde = lex(asciiToCells('x@:y'))[1];
  assert.deepEqual([tilde.kind, tilde.value, tilde.cells], ['op', '〜', asciiToCells('@:')]);
  // Same two cells, same "unspaced" verdict, a structurally different outcome:
  // the truncating row leaves an indicator governing a letter, not a sign.
  const kappa = lex(asciiToCells('x.ky'))[1];
  assert.deepEqual([kappa.kind, kappa.value, kappa.marks], ['letter', 'k', { alphabet: 'greek' }]);
});

// -- BANA Rule 18: function names, and the space that identifies one ---------

test('Rule 18.4.1: a name from Rule 18\'s table followed by a space is one function token', () => {
  // `sin x` -- BANA Example 18-2 (test/corpus/sources/Nemeth_2022.txt lines
  // 9138-9141). The name is written with the plain letter cells of Rule 18's
  // own table (`sin` is `SIN`, line 9113).
  assert.deepEqual(shape(lex(asciiToCells('sin x'))), ['function:\\sin', 'blank: ', 'letter:x']);
});

test('Rule 18.4.1: with no space after, the same cells are the letters they are spelled with', () => {
  // The oracle carries both readings of `⠇⠝`: `sre-aata:AataExpression_281`
  // (`s-t .k ln`, input ends there) targets <mi>l</mi><mi>n</mi>, while
  // `AataExpression_284` (`f(x) .k ln x`) targets <mi>ln</mi>. 18.4.1's space is
  // the whole difference, so the end of the input does NOT satisfy it.
  assert.deepEqual(shape(lex(asciiToCells('ln'))), ['letter:l', 'letter:n']);
  assert.deepEqual(shape(lex(asciiToCells('ln x'))), ['function:\\ln', 'blank: ', 'letter:x']);
});

test('Rule 18.4.1: a name followed by an indicator rather than a space is not a function name', () => {
  // 18.4.1's second sentence (the space follows a superscript, subscript or
  // modifier carried by the name) is out of scope, so `cos^2 x`
  // (mathcat-rules:nested_super_space_79_d_3) falls back to letters rather than
  // being guessed at.
  assert.deepEqual(shape(lex(asciiToCells('cos^2'))).slice(0, 3), ['letter:c', 'letter:o', 'letter:s']);
});

test('Rule 20: the multiplication cross and dot are their own rows, not the indicator plus a sign', () => {
  // Cross `@*` and dot `*`, Nemeth_2022.txt lines 9884 and 9885. The cross
  // shares its first cell with the script-type typeform indicator of Rule 7, so
  // longest match is what keeps `@*` one symbol.
  assert.deepEqual(shape(lex(asciiToCells('a@*b'))), ['letter:a', 'op:×', 'letter:b']);
  assert.deepEqual(shape(lex(asciiToCells('a*b'))), ['letter:a', 'op:⋅', 'letter:b']);
});

test('Rule 21: the vertically compounded comparison signs lex whole when 21.13 spaces them', () => {
  // `"k:` line 10429 and `.1:` line 10407; each extends a sign already in the
  // table by one cell, so only longest match separates `x "k: #5` from `x "k`.
  assert.deepEqual(shape(lex(asciiToCells('x "k: #5'))).slice(1, 3), ['blank: ', 'comparison:≤']);
  assert.deepEqual(shape(lex(asciiToCells('x .1: #5'))).slice(1, 3), ['blank: ', 'comparison:≥']);
  assert.deepEqual(shape(lex(asciiToCells('x "k #5'))).slice(1, 3), ['blank: ', 'comparison:<']);
});

test('Rule 13: each order of fraction indicator carries its own order', () => {
  const complex = lex(asciiToCells(',??3/8#,/5,#'));
  assert.deepEqual(
    complex.map((t) => `${t.kind}:${t.order ?? '-'}`).filter((s) => s.startsWith('frac')),
    ['fracOpen:complex', 'fracOpen:simple', 'fracLine:simple', 'fracClose:simple', 'fracLine:complex', 'fracClose:complex']
  );
});
