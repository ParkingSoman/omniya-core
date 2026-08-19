import assert from 'node:assert/strict';
import test from 'node:test';

import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';
import { NemethUnsupportedError } from '../../../src/domain/nemeth/errors.js';
import { lex } from '../../../src/domain/nemeth/lexer.js';
import { resolveLevels } from '../../../src/domain/nemeth/levels.js';

const levelled = (ascii) =>
  resolveLevels(lex(asciiToCells(ascii))).map((token) => [token.value, token.level]);

test('levels are absolute paths: n^x^^y gives levels "", "^", "^^"', () => {
  // mathcat-rules:nested_sup_74_b_1. '^^' extends '^', which is what makes y
  // nest inside x rather than sit beside it.
  assert.deepEqual(levelled('n^x^^y'), [
    ['n', ''],
    ['x', '^'],
    ['y', '^^']
  ]);
});

test('a subscript then a superscript are two depth-1 siblings, not a return to baseline', () => {
  // The counterexample to signed increments: -1 + 1 = 0 would read x;a^n as
  // "x sub a, then n on the baseline", a wrong answer that looks like a right one.
  assert.deepEqual(levelled('x;a^n'), [
    ['x', ''],
    ['a', '_'],
    ['n', '^']
  ]);
});

test('resolveLevels removes the level-indicator tokens themselves', () => {
  const tokens = resolveLevels(lex(asciiToCells('n^x^^y')));
  assert.equal(tokens.length, 3);
  assert.equal(
    tokens.some((token) => token.kind === 'level' || token.kind === 'baseline'),
    false
  );
});

test('an explicit baseline indicator returns to level "" and marks the next token', () => {
  const tokens = resolveLevels(lex(asciiToCells('x^2"+7')));
  assert.deepEqual(
    tokens.map((token) => [token.value, token.level, token.afterBaseline]),
    [
      ['x', '', false],
      ['2', '^', false],
      ['+', '', true],
      ['7', '', false]
    ]
  );
});

test('afterBaseline applies only to the token immediately after the indicator', () => {
  const tokens = resolveLevels(lex(asciiToCells('"ab')));
  assert.deepEqual(
    tokens.map((token) => token.afterBaseline),
    [true, false]
  );
});

test('afterBaseline survives an intervening level indicator, which is the Rule 14.11.2 shape', () => {
  // `"^a` is a baseline indicator followed by a level indicator, and that is
  // precisely how Rule 14.11.2 writes a non-simultaneous script: Example 14-124
  // is `a~n";m` -- baseline indicator, subscript indicator, subscript. Clearing
  // the mark at the level indicator would destroy it in the one case it exists
  // for, and it cannot be recovered once the indicators are stripped.
  const tokens = resolveLevels(lex(asciiToCells('"^a')));
  assert.deepEqual(
    tokens.map((token) => [token.value, token.level, token.afterBaseline]),
    [['a', '^', true]]
  );
});

// -- Rule 14.6: numeric subscripts written with no subscript indicator --------

test('Rule 14.6: a bare digit run after a letter is a subscript, with nothing in the cells to say so', () => {
  // Example 14-36 (`x1` is x sub 1) and Example 14-37 (`x11` is x sub 11): the
  // whole run is one first-order subscript, not one subscript per digit.
  assert.deepEqual(levelled('x1'), [
    ['x', ''],
    ['1', '_']
  ]);
  assert.deepEqual(levelled('x11'), [
    ['x', ''],
    ['1', '_'],
    ['1', '_']
  ]);
});

test('Rule 14.6(d) makes the run self-delimiting: what follows it is back at the base level', () => {
  // Condition (d) is that the subscript is numeric symbols only, so the digits
  // end it. Promoting the level itself instead of just the run would drag `y`
  // into the subscript and silently produce x sub 1y.
  assert.deepEqual(levelled('x1y'), [
    ['x', ''],
    ['1', '_'],
    ['y', '']
  ]);
});

test('Rule 24.1.b: a multipurpose indicator between the letter and the digits blocks the promotion', () => {
  // Example 24-1 is this exact input: `x"5` is x then 5 on the baseline, where
  // `x5` would have been x sub 5. Without the `afterBaseline` test the two are
  // indistinguishable and the numeral silently becomes a subscript.
  assert.deepEqual(levelled('x"5'), [
    ['x', ''],
    ['5', '']
  ]);
});

test('Rule 14.6 needs a bare numeral: a digit behind a numeric indicator stays on the baseline', () => {
  assert.deepEqual(levelled('x#5'), [
    ['x', ''],
    ['#', ''],
    ['5', '']
  ]);
});

test('Rule 14.6 needs the letter to be adjacent: an explicit level indicator wins', () => {
  // `x^1` states the level, so the digit is a superscript. Testing only "the
  // previous token is a letter" without testing that it sits at the SAME level
  // would read this as a subscript of a superscripted nothing.
  assert.deepEqual(levelled('x^1'), [
    ['x', ''],
    ['1', '^']
  ]);
});

test('Rule 14.6(b): first order only, so a bare digit inside a subscript is not promoted again', () => {
  // Example 14-40 (`x;i;;1`, x sub i sub 1) writes the second-order subscript
  // out in full, so a bare digit at level '_' cannot be one.
  assert.deepEqual(levelled('x;a1'), [
    ['x', ''],
    ['a', '_'],
    ['1', '_']
  ]);
});

test('Rule 14.6 never invents a level deeper than BANA Rule 2 enumerates', () => {
  assert.deepEqual(levelled('n^^^x1'), [
    ['n', ''],
    ['x', '^^^'],
    ['1', '^^^']
  ]);
});

test('a subscript indicator Rule 14.6 says is not used means the base was misread, so it is refused', () => {
  // Example 14-45: `seven;3` carries the indicator "because condition c does not
  // hold" -- the base is the word "seven", not the letter `n` against the
  // indicator. Reading it as that letter yields s e v e (n sub 3), which is
  // wrong mathematics dressed as a right answer.
  assert.throws(() => resolveLevels(lex(asciiToCells('seven;3'))), NemethUnsupportedError);
});

test('a subscript indicator that Rule 14.6 does require is left alone', () => {
  // Condition (d) fails once the subscript carries a script of its own
  // (Example 14-46), so the indicator belongs there and nothing is refused.
  assert.deepEqual(levelled('x;2^n'), [
    ['x', ''],
    ['2', '_'],
    ['n', '^']
  ]);
  // Condition (c) is about the base, so a non-numeric subscript is untouched too.
  assert.deepEqual(levelled('x;a'), [
    ['x', ''],
    ['a', '_']
  ]);
});

test('a level path deeper than the three components BANA Rule 2 enumerates is unsupported', () => {
  assert.throws(() => resolveLevels(lex(asciiToCells('n^^^^x'))), NemethUnsupportedError);
});

test('a three-component level path is accepted', () => {
  assert.deepEqual(levelled('n^^^x'), [
    ['n', ''],
    ['x', '^^^']
  ]);
});

test('a Rule 14.6 promotion marks its digits `implicit`; explicitly indicated ones are not', () => {
  // `x1` is Example 14-36: the subscript indicator is not used, so this pass
  // supplies the level and says so.
  const promoted = resolveLevels(lex(asciiToCells('x1')));
  assert.deepEqual(promoted.map((token) => [token.value, token.level, Boolean(token.implicit)]), [
    ['x', '', false],
    ['1', '_', true]
  ]);
  // `x;1+2` is one of the shapes where 14.6's condition (d) fails and the
  // indicator is genuinely required, so it survives the contrapositive guard --
  // and its digits carry no `implicit` mark, because nothing was promoted.
  const explicit = resolveLevels(lex(asciiToCells('x;1+2')));
  assert.deepEqual(explicit.map((token) => [token.value, token.level, Boolean(token.implicit)]), [
    ['x', '', false],
    ['1', '_', false],
    ['+', '_', false],
    ['2', '_', false]
  ]);
});

test('Rule 14.8.7: a space before a comparison sign returns the level to the baseline', () => {
  // "The space ... which is followed by a comparison symbol terminates the
  // effect of a level indicator already in effect and initiates the baseline
  // level. The space after a comparison symbol preserves the level that is
  // already in effect." (Nemeth_2022.txt lines 6907-6911.)
  //
  // Example 14-92 (lines 6923-6929), `#2~x "k #3~x` = 2^x < 3^x, is also the
  // corpus case mathcat-rules:comparison_79_g_2. Nothing but the space returns
  // the less-than sign to the baseline: there is no baseline indicator in the
  // cells, and the `"` of `"k` belongs to the comparison sign itself.
  assert.deepEqual(levelled('#2^x "k #3^x'), [
    ['#', ''],
    ['2', ''],
    ['x', '^'],
    [' ', ''],
    ['<', ''],
    [' ', ''],
    ['#', ''],
    ['3', ''],
    ['x', '^']
  ]);
});

test('Rule 14.8.8: a space NOT followed by a comparison sign preserves the level', () => {
  // "Any other symbol or situation preserves the level that is already in
  // effect" (line 6947). Example 14-85 (line 6856) is a space inside a numeral
  // at the superscript level, and 14.8.5 (line 6852) says it preserves it.
  assert.deepEqual(levelled('e^2 3'), [
    ['e', ''],
    ['2', '^'],
    [' ', '^'],
    ['3', '^']
  ]);
});

test('Rule 14.8.7: a level indicator between the space and the sign wins (Example 14-94)', () => {
  // `!;u ;.k a` (lines 6939-6945): "the subscript indicator before the equals
  // sign keeps this symbol at the subscript level". The reset is a no-op there
  // because the indicator sets the level itself, which is why 14.8.7 is read off
  // the token immediately after the space and not through the indicators.
  assert.deepEqual(levelled('x;u ;.k a'), [
    ['x', ''],
    ['u', '_'],
    [' ', '_'],
    ['=', '_'],
    [' ', '_'],
    ['a', '_']
  ]);
});
