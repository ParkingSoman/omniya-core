import assert from 'node:assert/strict';
import test from 'node:test';

import { NemethUnsupportedError, parseNemeth } from '../../../src/domain/nemeth/index.js';

// Issue #38. BANA 6.1.4 (Nemeth_2022.txt lines 3023-3048) writes eta with the
// cell `:` (U+2831, dots 1-5-6) and chi with `&` (U+282F, dots 1-2-3-4-6), after
// the Greek-letter indicator `.` (dots 4-6) and, for a capital, the capital
// indicator `,` (dot 6).
const CASES = [
  ['lowercase eta', '⠨⠱', 'η'],
  ['capital eta', '⠨⠠⠱', 'Η'],
  ['lowercase chi', '⠨⠯', 'χ'],
  ['capital chi', '⠨⠠⠯', 'Χ']
];

for (const [name, cells, glyph] of CASES) {
  test(`BANA 6.1.4: ${name} is read`, () => {
    assert.equal(parseNemeth(cells).latex, glyph);
  });
}

test('eta and chi take part in an expression like any other Greek letter', () => {
  assert.equal(parseNemeth('⠨⠯⠬⠨⠱').latex, 'χ+η');
});

test('the eta and chi cells are Greek letters only: bare, or after another alphabet, they are refused', () => {
  for (const cells of ['⠱', '⠯', '⠠⠱', '⠠⠯', '⠸⠱', '⠰⠯']) {
    assert.throws(() => parseNemeth(cells), NemethUnsupportedError, cells);
  }
});
