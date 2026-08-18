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

test('a level indicator after a baseline indicator clears afterBaseline', () => {
  // In `"^a` the baseline indicator is superseded before it governs anything, so
  // no baseline immediately precedes `a`. Rule 14.11.2 makes this field the sole
  // carrier of `x_1^2` vs `(x_1)^2`, and it cannot be recovered once the
  // indicators are stripped, so a stale `true` here would be unfixable later.
  const tokens = resolveLevels(lex(asciiToCells('"^a')));
  assert.deepEqual(
    tokens.map((token) => [token.value, token.level, token.afterBaseline]),
    [['a', '^', false]]
  );
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
