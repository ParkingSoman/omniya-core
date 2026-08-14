import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';

import { applyNemethSourceIntentToBraille } from '../../src/renderer/nemeth-braille-projection.js';

test('Rule 10.13 replaces each authored blood-type token span without consuming explicit spaces', () => {
  const sourceMath = new DOMParser().parseFromString(
    '<math><mi data-omniya-nemeth-cells="⠰⠠⠁">A</mi><mo data-omniya-nemeth-cells="⠠">,</mo><mspace/><mi data-omniya-nemeth-cells="⠰⠠⠃">B</mi><mo data-omniya-nemeth-cells="⠠">,</mo><mspace/><mi data-omniya-nemeth-cells="⠠⠁">A</mi><mi data-omniya-nemeth-cells="⠠⠃">B</mi><mo data-omniya-nemeth-cells="⠠">,</mo><mspace/><mtext data-omniya-nemeth-cells="⠠⠄⠯">and</mtext><mspace/><mi data-omniya-nemeth-cells="⠰⠠⠕">O</mi></math>', 'text/xml');
  assert.equal(
    applyNemethSourceIntentToBraille('⠠⠁⠠⠠⠃⠠⠰⠠⠰⠠⠰⠠⠰⠠⠰⠠⠰⠠⠀⠁⠰⠠⠃⠠⠰⠠⠠⠄⠯⠀⠰⠠⠕', sourceMath),
    '⠰⠠⠁⠠⠀⠰⠠⠃⠠⠀⠠⠁⠠⠃⠠⠀⠠⠄⠯⠀⠰⠠⠕'
  );
});

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

test('fraction projection restores authored child leaf cells by node identity', () => {
  const source = new DOMParser().parseFromString(
    '<math><mfrac><mrow><mi data-omniya-nemeth-cells="⠠⠺">w</mi><mn data-omniya-nemeth-cells="⠼⠲">4</mn></mrow><mrow><mi data-omniya-nemeth-cells="⠠⠧">v</mi><mn data-omniya-nemeth-cells="⠼⠲">4</mn></mrow></mfrac></math>', 'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠹⠺⠲⠌⠧⠲⠾', source), '⠹⠠⠺⠼⠲⠌⠠⠧⠼⠲⠾');
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

test('authored punctuation series retains comma-space boundaries and lower-cell suffixes', () => {
  const source = new DOMParser().parseFromString(
    '<math><mi data-omniya-nemeth-intent="english-letter" data-omniya-nemeth-cells="⠰⠝">n</mi><mo data-omniya-nemeth-intent="punctuation-comma" data-omniya-nemeth-cells="⠠">,</mo><mrow><mspace data-omniya-nemeth-intent="explicit-space"/><mrow><mi data-omniya-nemeth-cells="⠝">n</mi><mo data-semantic-added="true">⁢</mo><mn data-omniya-nemeth-intent="single-letter-number">1</mn></mrow></mrow><mo data-omniya-nemeth-intent="punctuation-comma" data-omniya-nemeth-cells="⠠">,</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mi data-omniya-nemeth-intent="english-letter" data-omniya-nemeth-cells="⠰⠎">s</mi></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠰⠝⠠⠀⠰⠝⠂⠂⠀⠰⠎', source),
    '⠰⠝⠠⠀⠝⠂⠠⠀⠰⠎'
  );
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

test('Rule 17.10.2 restores a numeric indicator after a new shape and explicit-space boundary', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠫⠪">∠</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mn data-omniya-nemeth-intent="numeric-start">1</mn><mo data-omniya-nemeth-cells="⠬">+</mo><mn data-omniya-nemeth-intent="numeric-start">2</mn><mo data-omniya-nemeth-cells="⠫⠪">∠</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mn data-omniya-nemeth-intent="numeric-start">3</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠫⠪⠀⠼⠂⠬⠆⠫⠪⠀⠒', source),
    '⠫⠪⠀⠼⠂⠬⠆⠫⠪⠀⠼⠒'
  );
});

test('Rule 17.10.1 keeps a denominator shape adjacent to the simple fraction line', () => {
  const source = new DOMParser().parseFromString(
    '<math><mfrac data-omniya-fraction-kind="simple"><mrow><mo data-omniya-nemeth-cells="⠫⠞">△</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mi data-omniya-nemeth-cells="⠠⠁">A</mi></mrow><mrow><mo data-omniya-nemeth-cells="⠫⠞">△</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mi data-omniya-nemeth-cells="⠠⠑">E</mi></mrow></mfrac></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠹⠫⠞⠀⠠⠁⠌⠀⠫⠞⠀⠠⠑⠼', source),
    '⠹⠫⠞⠀⠠⠁⠌⠫⠞⠀⠠⠑⠼'
  );
});

test('Rule 17.10.3 keeps adjacent authored shape and operation cells unspaced', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠫⠲">□</mo><mo data-omniya-nemeth-cells="⠈⠴">%</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠫⠲⠀⠈⠴', source), '⠫⠲⠈⠴');
});

test('Rule 17.10.2 mixed fractions retain their bounded BANA boundaries', () => {
  const source = new DOMParser().parseFromString(
    '<math><mn data-omniya-nemeth-intent="numeric-start">6</mn><mfrac data-omniya-fraction-kind="mixed"><mn data-omniya-nemeth-intent="numeric-start">4</mn><mn data-omniya-nemeth-intent="numeric-start">12</mn></mfrac><mo data-omniya-nemeth-cells="⠨⠅">=</mo><mn data-omniya-nemeth-intent="numeric-start">6</mn><mfrac data-omniya-fraction-kind="mixed"><mo data-omniya-nemeth-cells="⠫⠞">△</mo><mn data-omniya-nemeth-intent="numeric-start">3</mn></mfrac></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠖⠸⠹⠼⠲⠌⠼⠂⠆⠸⠼⠀⠨⠅⠀⠼⠖⠹⠫⠞⠌⠼⠒⠼', source),
    '⠼⠖⠸⠹⠲⠌⠂⠆⠸⠼⠀⠨⠅⠀⠼⠖⠸⠹⠫⠞⠌⠒⠸⠼'
  );
});

test('Rule 17.10.4 keeps shape subscripts attached and restores the authored baseline return', () => {
  const source = new DOMParser().parseFromString(
    '<math><msub><mn data-omniya-nemeth-intent="numeric-start">1101</mn><mo data-omniya-nemeth-cells="⠫⠙">◊</mo></msub><mo data-omniya-nemeth-cells="⠬">+</mo><msub><mn data-omniya-nemeth-intent="lower-cell-numeric">1000</mn><mo data-omniya-nemeth-cells="⠫⠙">◊</mo></msub></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠂⠂⠴⠂⠰⠀⠰⠫⠙⠬⠂⠴⠴⠴⠀⠰⠫⠙', source),
    '⠼⠂⠂⠴⠂⠰⠫⠙⠐⠬⠂⠴⠴⠴⠰⠫⠙'
  );
});

test('Rule 17.10.1 restores the authored baseline after degree before a plus', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠫⠪">∠</mo><mspace data-omniya-nemeth-intent="explicit-space"/><msup><mn data-omniya-nemeth-intent="numeric-start">90</mn><mo data-omniya-nemeth-cells="⠘⠨⠡">°</mo></msup><mo data-omniya-nemeth-cells="⠬">+</mo><mo data-omniya-nemeth-cells="⠫⠪">∠</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠫⠪⠀⠼⠔⠴⠘⠨⠡⠬⠫⠪', source),
    '⠫⠪⠀⠼⠔⠴⠘⠨⠡⠐⠬⠫⠪'
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
