import assert from 'node:assert/strict';
import test from 'node:test';

import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';
import { parseNemeth } from '../../../src/domain/nemeth/index.js';

// BANA Nemeth 2022, Rule 19.6 and the Rule 19 table (Nemeth_2022.txt lines
// 9323-9325): an enlarged parenthesis is the ordinary one with dot 6 in front,
// `,(` and `,)` in Braille-ASCII. Issue #69. The LaTeX is \bigl( and \bigr), so
// the enlarged sign stays distinguishable from an ordinary one in the equation.
const CASES = [
  { ascii: ',(x,)', latex: '\\bigl(x\\bigr)' },
  { ascii: ',(x+y,)', latex: '\\bigl(x+y\\bigr)' },
  { ascii: ',(,(x,),)', latex: '\\bigl(\\bigl(x\\bigr)\\bigr)' },
  // Ordinary parentheses are unchanged.
  { ascii: '(x)', latex: '(x)' }
];

for (const { ascii, latex } of CASES) {
  test(`enlarged parentheses: ${ascii} reads as ${latex}`, () => {
    assert.equal(parseNemeth(asciiToCells(ascii)).latex, latex);
  });
}

test('enlarged parenthesis cells are dot 6 then dots 1-2-3-5-6 / 2-3-4-5-6', () => {
  assert.equal(asciiToCells(',('), '⠠⠷');
  assert.equal(asciiToCells(',)'), '⠠⠾');
});

test('an enlarged open parenthesis with no close is still refused', () => {
  assert.throws(() => parseNemeth(asciiToCells(',(x')), { name: 'NemethUnsupportedError' });
});
