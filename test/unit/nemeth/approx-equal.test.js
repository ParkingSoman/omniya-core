import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNemeth } from '../../../src/domain/nemeth/index.js';

// Issue #66. BANA 21-7 (Nemeth_2022.txt line 17447) writes the double tilde,
// "is approximately equal to", as `@:@:` (U+2808 U+2831 twice): the simple tilde
// (dot 4, dots 1-5-6) written twice. It is a comparison sign, so it is spaced
// like the others, and must not be read as two simple tildes.
const SPACE = '⠀';

test('BANA 21-7: double tilde between numbers reads as approximately equal', () => {
  const cells = `⠼⠢⠨⠒${SPACE}⠈⠱⠈⠱${SPACE}⠼⠢⠨⠲`;
  assert.equal(parseNemeth(cells).latex, '5.3≈5.4');
});

test('BANA 21-7: double tilde between variables', () => {
  assert.equal(parseNemeth(`⠁${SPACE}⠈⠱⠈⠱${SPACE}⠃`).latex, 'a≈b');
});

test('BANA 21-2: the single tilde still reads as a single tilde', () => {
  assert.equal(parseNemeth(`⠁${SPACE}⠈⠱${SPACE}⠃`).latex, 'a∼b');
});
