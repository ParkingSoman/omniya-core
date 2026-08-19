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
