import assert from 'node:assert/strict';
import test from 'node:test';

import { applyNemethSourceIntentToBraille } from '../../src/renderer/nemeth-braille-projection.js';

test('decimal nonnumeric intent restores BANA dot-5 in whole-expression Braille', () => {
  const sourceMath = {
    querySelectorAll(selector) {
      return selector.includes('decimal-nonnumeric') ? [{}] : [];
    }
  };
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠂⠨⠁⠂⠁⠆⠁⠒', sourceMath),
    '⠼⠂⠨⠐⠁⠂⠁⠆⠁⠒'
  );
});

test('decimal intent does not duplicate an already-present transition cell', () => {
  const sourceMath = { querySelectorAll: (selector) => selector.includes('decimal-nonnumeric') ? [{}] : [] };
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠂⠨⠐⠁', sourceMath),
    '⠼⠂⠨⠐⠁'
  );
});

test('decimal intent is scoped to a decimal marker, not an unrelated numeric expression', () => {
  const sourceMath = { querySelectorAll: (selector) => selector.includes('decimal-nonnumeric') ? [{}] : [] };
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠂⠁⠨⠃', sourceMath),
    '⠼⠂⠁⠨⠐⠃'
  );
});

test('without source intent the independent MathJax Braille projection is unchanged', () => {
  const sourceMath = { querySelectorAll: () => [] };
  assert.equal(applyNemethSourceIntentToBraille('⠼⠂⠨⠁', sourceMath), '⠼⠂⠨⠁');
});

test('numeric decimal intent restores the BANA dot-4 decimal cell', () => {
  const sourceMath = { querySelectorAll: (selector) => selector.includes('numeric-decimal') ? [{ textContent: '.35' }] : [] };
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠨⠆', sourceMath),
    '⠼⠨⠆'
  );
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠲⠆', sourceMath),
    '⠼⠨⠆'
  );
});

test('numeric decimal intent does not rewrite an ordinary decimal after digits', () => {
  const sourceMath = { querySelectorAll: (selector) => selector.includes('numeric-decimal') ? [{ textContent: '1,478.00' }] : [] };
  assert.equal(applyNemethSourceIntentToBraille('⠼⠂⠠⠲⠶⠦⠨⠴⠴', sourceMath), '⠼⠂⠠⠲⠶⠦⠨⠴⠴');
});
