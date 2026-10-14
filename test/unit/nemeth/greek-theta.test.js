import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNemeth } from '../../../src/domain/nemeth/index.js';

/**
 * Greek theta (BANA Nemeth 2022, Rule 6.1.4, Greek Alphabet (Standard)): the
 * Code writes it with the cell of Braille-ASCII `?`, dots 1-4-5-6, behind the
 * Greek-letter indicator (dots 4-6). That cell is also the simple-fraction
 * opener (Rule 13.2.1), and `⠠⠹` the complex-fraction opener (13.6), so the
 * cell is a letter ONLY directly behind the Greek indicator. Reported in
 * issue #51.
 */

test('lowercase Greek theta is the Greek indicator plus dots 1-4-5-6', () => {
  assert.equal(parseNemeth('⠨⠹').latex, 'θ');
});

test('capital Greek theta puts the capital indicator between them', () => {
  assert.equal(parseNemeth('⠨⠠⠹').latex, 'Θ');
});

test('theta works inside an expression and beside a fraction opener', () => {
  assert.equal(parseNemeth('⠨⠹⠬⠁').latex, 'θ+a');
  assert.equal(parseNemeth('⠹⠁⠌⠃⠼').latex, '\\frac{a}{b}');
});
