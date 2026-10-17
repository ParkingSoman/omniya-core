import assert from 'node:assert/strict';
import test from 'node:test';

import { spokenCurrency } from '../../src/domain/currency-speech.js';

// Issue #52: the contributor's own examples, and what MathJax says today.
const CASES = [
  ['dollars 1', '1 dollar'],
  ['dollar 1', '1 dollar'],
  ['dollars 2', '2 dollars'],
  ['dollars x', 'x dollars'],
  ['dollars 100 point 99', '100 dollars and 99 cents'],
  ['dollar 10.99', '10 dollars and 99 cents'],
  ['dollars 2 plus dollars 3', '2 dollars plus 3 dollars'],
  ['dollars 1 point 5', '1 dollar point 5'],
  ['x plus 3', 'x plus 3']
];

for (const [heard, said] of CASES) {
  test(`"${heard}" is said "${said}"`, () => {
    assert.equal(spokenCurrency(heard), said);
  });
}
