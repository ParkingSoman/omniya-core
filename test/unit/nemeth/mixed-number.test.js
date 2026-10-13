import assert from 'node:assert/strict';
import test from 'node:test';

import { NemethUnsupportedError, parseNemeth } from '../../../src/domain/nemeth/index.js';

// Issue #62. BANA 13.4 (Nemeth_2022.txt lines 5702-5712) writes the fractional
// part of a mixed number between the mixed-number indicators `_?` (U+2838
// U+2839, dots 456 + 1456) and `_#` (U+2838 U+283C, dots 456 + 3456); the whole
// number before it carries the numeric indicator. Example 13-18 is `#4_?3/8_#`
// (horizontal line `⠌`). The diagonal line of Example 13-19 is not in the table for any
// fraction yet, so it stays refused.
test('BANA 13.4, Example 13-18: a mixed number with a horizontal fraction line is read', () => {
  assert.equal(parseNemeth('⠼⠲⠸⠹⠒⠌⠦⠸⠼').latex, '4\\frac{3}{8}');
});

test('BANA 13.4: the contributor\'s 1 and 3 fourths', () => {
  assert.equal(parseNemeth('⠼⠂⠸⠹⠒⠌⠲⠸⠼').latex, '1\\frac{3}{4}');
});

test('BANA 13.4: a mixed number needs a whole number before it and whole numbers inside', () => {
  for (const cells of ['⠸⠹⠒⠌⠲⠸⠼', '⠭⠸⠹⠒⠌⠲⠸⠼', '⠼⠂⠸⠹⠭⠌⠲⠸⠼', '⠼⠂⠸⠹⠒⠌⠲⠼', '⠼⠂⠸⠹⠒⠌⠲⠸⠼⠼']) {
    assert.throws(() => parseNemeth(cells), NemethUnsupportedError, cells);
  }
});
