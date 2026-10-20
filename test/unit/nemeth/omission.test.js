import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNemeth } from '../../../src/domain/nemeth/index.js';

// BANA Rule 11.1.1 (Nemeth_2022.pdf, Rule 11, p. 11-1): one general omission
// symbol, the full cell dots 1-2-3-4-5-6, stands for a question mark, a blank
// space, or either with hyphens or dashes. Examples 11-1, 11-4, 11-6, 11-7, 11-8.
// Reported in issue #39.

test('a lone full cell is read as the general omission symbol', () => {
  assert.equal(parseNemeth('⠿').latex, '?');
});

test('Example 11-4: ? + ? = 10', () => {
  assert.equal(parseNemeth('⠿⠬⠿⠀⠨⠅⠀⠼⠂⠴').latex, '?+?=10');
});

test('Example 11-1: (?)^3 = 27', () => {
  assert.equal(parseNemeth('⠷⠿⠾⠘⠒⠀⠨⠅⠀⠼⠆⠶').latex, '{(?)}^{3}=27');
});

test('Example 11-6: an omission symbol may stand alone after the equals sign', () => {
  assert.equal(parseNemeth('⠼⠔⠤⠢⠀⠨⠅⠀⠿').latex, '9-5=?');
});

test('Example 11-8: 5 x 25 = ?', () => {
  assert.equal(parseNemeth('⠼⠢⠈⠡⠆⠢⠀⠨⠅⠀⠿').latex, '5×25=?');
});

// Example 11-7 (an omission inside a pair, after a comma) is not covered: the
// comma as Rule 8 punctuation is a separate, pre-existing refusal in this parser.
