import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeEnUsComp8 } from '../../../src/domain/nemeth/computer-braille-en-us.js';
import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';

function cellFor(dotsStr) {
  let value = 0;
  for (const dotChar of dotsStr) value += 1 << (Number(dotChar) - 1);
  return String.fromCodePoint(0x2800 + value);
}

test('lowercase letters decode to their dot-1..6 cell', () => {
  assert.equal(decodeEnUsComp8('a'), cellFor('1'));
  assert.equal(decodeEnUsComp8('x'), cellFor('1346'));
  assert.equal(decodeEnUsComp8('z'), cellFor('1356'));
});

test('uppercase letters decode to the lowercase cell plus dot 7, distinct from lowercase', () => {
  assert.equal(decodeEnUsComp8('x'), cellFor('1346'));
  assert.equal(decodeEnUsComp8('X'), cellFor('13467'));
  assert.notEqual(decodeEnUsComp8('x'), decodeEnUsComp8('X'), 'case must not be folded away');
});

test('digits decode to the lowered 6-dot digit patterns', () => {
  assert.equal(decodeEnUsComp8('0'), cellFor('356'));
  assert.equal(decodeEnUsComp8('2'), cellFor('23'));
  assert.equal(decodeEnUsComp8('9'), cellFor('35'));
});

test('digit and basic punctuation cells match braille-ascii.js (shared BANA lineage)', () => {
  // Verified against the real liblouis source: digits and this small set of
  // punctuation happen to use identical dot patterns in both tables. This is
  // NOT true of every character (see the '^' test below) -- it is a
  // coincidence of shared history, not a reason the two tables could be
  // merged.
  for (const character of '0123456789,;:') {
    assert.equal(decodeEnUsComp8(character), asciiToCells(character),
      `expected ${character} to match braille-ascii.js`);
  }
});

test('a character present in both tables with a DIFFERENT dot pattern decodes to the computer-braille value, not braille-ascii.js\'s', () => {
  // '^' is dots 4,5 in the 6-dot Braille-ASCII transcription table but dots
  // 4,5,7 in the real 8-dot computer braille table -- proof the two tables
  // are genuinely different encodings, not reuse in disguise.
  assert.equal(decodeEnUsComp8('^'), cellFor('457'));
  assert.notEqual(decodeEnUsComp8('^'), asciiToCells('^'));
});

test('punctuation and symbols decode correctly', () => {
  assert.equal(decodeEnUsComp8(','), cellFor('6'));
  assert.equal(decodeEnUsComp8('.'), cellFor('46'));
  assert.equal(decodeEnUsComp8('!'), cellFor('2346'));
  assert.equal(decodeEnUsComp8('('), cellFor('12356'));
  assert.equal(decodeEnUsComp8(')'), cellFor('23456'));
  assert.equal(decodeEnUsComp8('='), cellFor('123456'));
  assert.equal(decodeEnUsComp8('+'), cellFor('346'));
  assert.equal(decodeEnUsComp8('*'), cellFor('16'));
});

test('unmapped characters return null rather than guessing', () => {
  assert.equal(decodeEnUsComp8('€'), null);
  assert.equal(decodeEnUsComp8('á'), null);
  assert.equal(decodeEnUsComp8('\t'), null);
});

test('space is not in this table -- callers keep handling it as the blank cell directly', () => {
  assert.equal(decodeEnUsComp8(' '), null);
});
