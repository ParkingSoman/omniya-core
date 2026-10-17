import assert from 'node:assert/strict';
import test from 'node:test';

import { NemethUnsupportedError, parseNemeth } from '../../../src/domain/nemeth/index.js';

// Issue #64. BANA 21.1 (Nemeth_2022.txt lines 10559-10575, symbol list line
// 10293) negates a comparison sign by placing `/` (dots 3-4) unspaced before
// it. "Is not equal to" is therefore `/.k` = U+280C U+2828 U+2805, and it is a
// comparison sign: 21.13 leaves a space on either side of it.
test('BANA 21.1: a ≠ 0 is read', () => {
  assert.equal(parseNemeth('⠁⠀⠌⠨⠅⠀⠼⠴').latex, 'a≠0');
});

test('BANA 21.1: 1 ≠ 2 is read', () => {
  assert.equal(parseNemeth('⠼⠂⠀⠌⠨⠅⠀⠼⠆').latex, '1≠2');
});

test('the not-equal sign needs its spaces, like equals', () => {
  assert.throws(() => parseNemeth('⠁⠌⠨⠅⠃'), NemethUnsupportedError);
});
