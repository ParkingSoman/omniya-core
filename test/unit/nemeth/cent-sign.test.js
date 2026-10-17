import assert from 'node:assert/strict';
import test from 'node:test';

import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';
import { parseNemeth } from '../../../src/domain/nemeth/index.js';

// BANA Nemeth 2022, Rule 23.13 (Monetary Units) and the Special Symbols list
// (Cent = dot 4, then dots 1-4 = @c in Braille-ASCII). Examples 23-23 and
// 23-24: #10@c is 10 cents, x@c is x cents. Issue #54.
const CASES = [
  { ascii: '#1@c', latex: '1¢' },
  { ascii: '#2@c', latex: '2¢' },
  { ascii: '#10@c', latex: '10¢' },
  { ascii: 'x@c', latex: 'x¢' },
  { ascii: '#2@c+3@c', latex: '2¢+3¢' }
];

for (const { ascii, latex } of CASES) {
  test(`cent sign: ${ascii} reads as ${latex}`, () => {
    assert.equal(parseNemeth(asciiToCells(ascii)).latex, latex);
  });
}

test('cent sign cells are dot 4 then dots 1-4', () => {
  assert.equal(asciiToCells('@c'), '⠈⠉');
});

test('a cent sign with nothing before it is still refused', () => {
  assert.throws(() => parseNemeth('⠈⠉'), { name: 'NemethUnsupportedError' });
});
