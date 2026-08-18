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
