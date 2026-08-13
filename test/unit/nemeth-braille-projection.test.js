import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';

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

test('horizontal bracket source intent restores the bounded modifier cells SRE omits', () => {
  const source = new DOMParser().parseFromString(
    '<math><mover><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow><mo data-omniya-role="overscript" data-omniya-nemeth-intent="horizontal-bracket-over" data-omniya-nemeth-cells="⠈⠷">⏜</mo></mover></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠐⠭⠬⠽⠣⠻', source),
    '⠐⠭⠬⠽⠣⠈⠷⠻'
  );
});

test('a grouped superscript does not receive a synthetic trailing close fence', () => {
  const source = new DOMParser().parseFromString(
    '<math><msup><mrow data-omniya-group="round" data-omniya-role="closed-group"><mo data-omniya-role="open-fence" data-omniya-nemeth-cells="⠷">(</mo><mrow><mi>s</mi><mi>e</mi><mi>v</mi><mi>e</mi><mi>n</mi></mrow><mo data-omniya-role="close-fence" data-omniya-nemeth-cells="⠾">)</mo></mrow><mn>2</mn></msup><mo>+</mo><mn>1</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠷⠎⠑⠧⠑⠝⠾⠘⠆⠐⠬⠂', source),
    '⠷⠎⠑⠧⠑⠝⠾⠘⠆⠐⠬⠂'
  );
});

test('enlarged grouping preserves Rule 19.10 lower-cell numerals and close fence', () => {
  const source = new DOMParser().parseFromString(
    '<math><mn data-omniya-nemeth-intent="numeric-start">4</mn><mo>−</mo><mn data-omniya-nemeth-intent="numeric-start">3</mn><mo data-omniya-nemeth-cells="⠈⠷">[</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">4</mn><mo>−</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn><mo data-omniya-nemeth-cells="⠈⠾">]</mo><mo data-omniya-nemeth-cells="⠨⠌">÷</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠲⠤⠼⠒⠈⠷⠤⠼⠆⠷⠖⠤⠼⠒⠾⠈⠨⠌⠒', source),
    '⠼⠲⠤⠒⠈⠷⠲⠤⠆⠷⠖⠤⠒⠾⠈⠾⠨⠌⠒'
  );
});

test('angle grouping preserves the Rule 19.11 punctuation indicator before an explicit blank', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠨⠨⠷">⟨</mo><mi>a</mi><mspace data-omniya-nemeth-intent="explicit-space"/><mi>b</mi><mo data-omniya-nemeth-cells="⠨⠨⠾">⟩</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠨⠨⠷⠁⠀⠃⠨⠨⠾', source),
    '⠨⠨⠷⠁⠠⠀⠃⠨⠨⠾'
  );
});

test('enlarged bracket grouping preserves the Rule 19.12 blank before plus', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠈⠷">[</mo><mi>a</mi><mspace data-omniya-nemeth-intent="explicit-space"/><mo>+</mo><mo data-omniya-nemeth-cells="⠾">)</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠈⠷⠁⠠⠬⠾', source),
    '⠈⠷⠁⠠⠀⠬⠾'
  );
});

test('BANA punctuation comma intent binds directly to the following atom', () => {
  const comma = { nextElementSibling: { localName: 'mi' } };
  const sourceMath = {
    querySelectorAll(selector) {
      return selector.includes('punctuation-comma') ? [comma] : [];
    },
    querySelector() { return null; }
  };
  assert.equal(applyNemethSourceIntentToBraille('⠠⠀⠝⠷', sourceMath), '⠠⠝⠷');
});

test('nested multiscripts do not expose SRE presentation baseline before a superscript', () => {
  const sourceMath = {
    querySelectorAll(selector) {
      if (selector.includes('msubsup')) return [{ nextElementSibling: null }];
      return [];
    },
    querySelector() { return null; }
  };
  assert.equal(applyNemethSourceIntentToBraille('⠗⠰⠅⠐⠘⠆', sourceMath), '⠗⠰⠅⠘⠆');
});

test('signed numeric source intent restores the BANA number indicator', () => {
  const sourceMath = {
    querySelectorAll(selector) {
      return selector.includes('signed-numeric-indicator') ? [{}] : [];
    },
    querySelector() { return null; }
  };
  assert.equal(applyNemethSourceIntentToBraille('⠤⠒⠷', sourceMath), '⠤⠼⠒⠷');
});

test('signed numeric intent stays local inside the Rule 3-16 subtraction shape', () => {
  const sourceMath = new DOMParser().parseFromString(
    '<math><mspace data-omniya-nemeth-intent="explicit-space"/><mrow><mo data-omniya-nemeth-cells="⠤">−</mo><mn data-omniya-nemeth-intent="signed-numeric-indicator">3</mn><mo data-omniya-nemeth-cells="⠷">(</mo></mrow></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠀⠤⠒⠷', sourceMath),
    '⠀⠤⠼⠒⠷'
  );
});

test('nested fraction denominator numerals do not expose SRE baseline return', () => {
  const sourceMath = new DOMParser().parseFromString(
    '<math><mfrac><mrow><mi>r</mi><msup><mn data-omniya-nemeth-intent="numeric-start">1</mn><mn data-omniya-nemeth-intent="numeric-start">2</mn></msup></mrow><mrow><mi>n</mi><mn data-omniya-nemeth-intent="numeric-start">1</mn></mrow></mfrac></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠷⠹⠗⠼⠂⠘⠼⠆⠐⠌⠝⠐⠼⠂⠼⠾', sourceMath),
    '⠷⠹⠗⠼⠂⠘⠼⠆⠐⠌⠝⠼⠂⠼⠾'
  );
});


test('decimal-return omission long dash restores BANA punctuation and nonnumeric cells', () => {
  // Keep this test DOM-free in Node by using the smallest querySelectorAll
  // contract consumed by the projection boundary.
  const math = {
    querySelectorAll(selector) {
      return selector.includes('omission-decimal-long-dash')
        ? [{ textContent: '―' }]
        : [];
    },
    querySelector(selector) {
      return selector.includes('omission-decimal-long-dash') ? { textContent: '―' } : null;
    }
  };
  assert.equal(applyNemethSourceIntentToBraille('⠼⠨⠂⠬⠨⠆⠀⠨⠅⠀⠤⠤⠤⠤', math), '⠼⠨⠂⠬⠨⠆⠀⠨⠅⠀⠨⠐⠤⠤⠤⠤');
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
