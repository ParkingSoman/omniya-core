import assert from 'node:assert/strict';
import test from 'node:test';

import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';
import { NemethUnsupportedError, parseNemeth } from '../../../src/domain/nemeth/index.js';

// BANA Rule 23.13 Monetary Units (Nemeth_2022.txt lines 11655-11700, printed
// page 23-9): the dollar sign is dot 4 then dots 2-3-4 (@s`), it is unspaced
// from what it applies to, and "a numeric indicator is not inserted between a
// monetary symbol and the number which immediately follows it". Issue #52.
const CASES = [
  // Example 23-25: $2.98
  { ascii: '@s2.98', latex: '\\$2.98' },
  // Example 23-26: $x
  { ascii: '@sx', latex: '\\$x' },
  // Example 4-11: $20
  { ascii: '@s20', latex: '\\$20' },
  // Example 25-10 style: a dollar sign on each term of a sum
  { ascii: '@s2+@s3', latex: '\\$2+\\$3' }
];

for (const { ascii, latex } of CASES) {
  test(`dollar sign: ${ascii} reads as ${latex}`, () => {
    assert.equal(parseNemeth(asciiToCells(ascii)).latex, latex);
  });
}

test('the dollar sign alone, with nothing to apply to, is still refused', () => {
  assert.throws(() => parseNemeth(asciiToCells('@s')), NemethUnsupportedError);
});
