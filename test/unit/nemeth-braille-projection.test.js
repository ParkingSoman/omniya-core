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

test('Rule 19.10 restores the leading number sign when SRE omits every isolated <mn> prefix', () => {
  const source = new DOMParser().parseFromString(
    '<math><mn data-omniya-nemeth-intent="lower-cell-numeric">4</mn><mo data-omniya-nemeth-cells="⠤">−</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn><mo data-omniya-nemeth-cells="⠈⠷">[</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">4</mn><mo data-omniya-nemeth-cells="⠤">−</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn><mo data-omniya-nemeth-cells="⠈⠾">]</mo><mo data-omniya-nemeth-cells="⠨⠌">÷</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠲⠤⠒⠈⠷⠲⠤⠆⠷⠖⠤⠒⠾⠈⠾⠨⠌⠒', source),
    '⠼⠲⠤⠒⠈⠷⠲⠤⠆⠷⠖⠤⠒⠾⠈⠾⠨⠌⠒'
  );
});

test('horizontal bracket over restores the authored grouping cell SRE dropped from the overscript', () => {
  const source = new DOMParser().parseFromString(
    '<math><mi mathvariant="italic">x</mi><mo data-omniya-nemeth-cells="⠬">+</mo><mi mathvariant="italic">y</mi><mo data-omniya-nemeth-cells="⠈⠷" data-omniya-nemeth-intent="horizontal-bracket-over" data-omniya-role="overscript">⏜</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠐⠭⠬⠽⠣⠻', source),
    '⠐⠭⠬⠽⠣⠈⠷⠻'
  );
});

test('horizontal bracket under restores the authored grouping cell SRE dropped from the underscript', () => {
  const source = new DOMParser().parseFromString(
    '<math><mi mathvariant="italic">x</mi><mo data-omniya-nemeth-cells="⠬">+</mo><mi mathvariant="italic">y</mi><mo data-omniya-nemeth-cells="⠈⠾" data-omniya-nemeth-intent="horizontal-bracket-under" data-omniya-role="underscript">⏝</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠐⠭⠬⠽⠩⠻', source),
    '⠐⠭⠬⠽⠩⠈⠾⠻'
  );
});

test('bold enlarged fences restore the bold prefix SRE dropped from grouping signs', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠸⠈⠷">[</mo><mi data-omniya-nemeth-cells="⠭">x</mi><mo data-omniya-nemeth-cells="⠸⠈⠾">]</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠈⠷⠭⠈⠾', source),
    '⠸⠈⠷⠭⠸⠈⠾'
  );
});

test('bold vertical bars restore the bold prefix SRE dropped from each authored bar', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠸⠳⠸⠳">||</mo><mi data-omniya-nemeth-cells="⠋">f</mi><mo data-omniya-nemeth-cells="⠸⠳⠸⠳">||</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠳⠳⠋⠳⠳', source),
    '⠸⠳⠸⠳⠋⠸⠳⠸⠳'
  );
});

test('transcriber grouping after then/and restores fence cells SRE omitted around the identifier', () => {
  const source = new DOMParser().parseFromString(
    '<math><mi data-omniya-nemeth-cells="⠭">x</mi><mspace data-omniya-nemeth-intent="explicit-space"/><mo data-omniya-nemeth-cells="⠨⠅">=</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mn data-omniya-nemeth-intent="lower-cell-numeric">3.5</mn><mspace data-omniya-nemeth-intent="explicit-space"/><mtext data-omniya-nemeth-cells="⠠⠄⠮⠝" data-omniya-nemeth-intent="then-word">then</mtext><mspace data-omniya-nemeth-intent="explicit-space"/><mo data-omniya-nemeth-cells="⠈⠰⠷">⎣</mo><mi data-omniya-nemeth-cells="⠭">x</mi><mo data-omniya-nemeth-cells="⠈⠰⠾">⎦</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mo data-omniya-nemeth-cells="⠨⠅">=</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn><mspace data-omniya-nemeth-intent="explicit-space"/><mtext data-omniya-nemeth-cells="⠠⠄⠯" data-omniya-nemeth-intent="and-word">and</mtext><mspace data-omniya-nemeth-intent="explicit-space"/><mo data-omniya-nemeth-cells="⠈⠘⠷">⎡</mo><mi data-omniya-nemeth-cells="⠭">x</mi><mo data-omniya-nemeth-cells="⠈⠘⠾">⎤</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠭⠀⠨⠅⠀⠼⠒⠨⠢⠠⠀⠠⠄⠮⠝⠀⠭⠀⠨⠅⠀⠼⠒⠀⠠⠄⠯⠀⠭', source),
    '⠭⠀⠨⠅⠀⠼⠒⠨⠢⠠⠀⠠⠄⠮⠝⠀⠈⠰⠷⠭⠈⠰⠾⠀⠨⠅⠀⠼⠒⠀⠠⠄⠯⠀⠈⠘⠷⠭⠈⠘⠾'
  );
});

test('an omitted transcriber close is restored between adjacent authored letter cells', () => {
  const source = new DOMParser().parseFromString(
    '<math><msub><mi data-omniya-nemeth-cells="⠠⠁">A</mi><mi data-omniya-nemeth-intent="english-letter" data-omniya-nemeth-cells="⠰⠝">n</mi></msub><mo data-omniya-nemeth-cells="⠈⠘⠾">⎤</mo><mi data-omniya-nemeth-cells="⠠⠊">I</mi></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠠⠁⠰⠝⠠⠊', source),
    '⠠⠁⠰⠝⠈⠘⠾⠠⠊'
  );
});

test('an omitted upper-half close inside a subscript is restored before the following capital', () => {
  const source = new DOMParser().parseFromString(
    '<math><msub><mi data-omniya-nemeth-cells="⠠⠁">A</mi><mrow><mi>n</mi><mo data-omniya-nemeth-cells="⠈⠘⠾">⎤</mo><mi data-omniya-nemeth-cells="⠠⠊">I</mi></mrow></msub></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠠⠁⠰⠝⠠⠊', source),
    '⠠⠁⠰⠝⠈⠘⠾⠠⠊'
  );
});

test('mixed transcriber grouping restores omitted open and close around a flat sequence', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠈⠘⠷">⎡</mo><mi data-omniya-nemeth-cells="⠁">a</mi><mn data-omniya-nemeth-intent="single-letter-number">1</mn><mspace data-omniya-nemeth-intent="explicit-space"/><mi data-omniya-nemeth-cells="⠁">a</mi><mn data-omniya-nemeth-intent="single-letter-number">2</mn><mspace data-omniya-nemeth-intent="explicit-space"/><mo data-omniya-nemeth-cells="⠄⠄⠄">…</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mi data-omniya-nemeth-cells="⠁">a</mi><mi data-omniya-nemeth-intent="english-letter" data-omniya-nemeth-cells="⠰⠝">n</mi><mo data-omniya-nemeth-cells="⠈⠰⠾">⎦</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠁⠂⠀⠁⠆⠀⠄⠄⠄⠀⠁⠰⠝⠐', source),
    '⠈⠘⠷⠁⠂⠀⠁⠆⠀⠄⠄⠄⠀⠁⠰⠝⠐⠈⠰⠾'
  );
});

test('an evaluation bar with scripts drops SRE\'s terminal baseline return', () => {
  const source = new DOMParser().parseFromString(
    '<math><mi>f</mi><mrow data-omniya-group="round" data-omniya-role="closed-group"><mo data-omniya-role="open-fence" data-omniya-nemeth-cells="⠷">(</mo><mi>x</mi><mo data-omniya-role="close-fence" data-omniya-nemeth-cells="⠾">)</mo></mrow><msubsup><mo data-omniya-nemeth-cells="⠳">|</mo><mi>b</mi><mi>a</mi></msubsup></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠋⠷⠭⠾⠳⠰⠃⠘⠁⠐', source),
    '⠋⠷⠭⠾⠳⠰⠃⠘⠁'
  );
});

test('capital enlarged grouping restores the capital prefix SRE dropped from each fence', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠈⠠⠷">{</mo><mi>c</mi><mi>o</mi><mi>s</mi><mo data-omniya-nemeth-cells="⠈⠠⠾">}</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠈⠷⠉⠕⠎⠈⠾', source),
    '⠈⠠⠷⠉⠕⠎⠈⠠⠾'
  );
});

test('less-than-or-equal restores the two authored comparison cells SRE collapsed to one glyph', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠐⠅">＜</mo><mo data-omniya-nemeth-cells="⠨⠅">=</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠐⠅⠱', source),
    '⠐⠅⠨⠅'
  );
});

test('Rule 19.10 restores the inner round close when SRE duplicates the enlarged terminator', () => {
  const source = new DOMParser().parseFromString(
    '<math><mn data-omniya-nemeth-intent="lower-cell-numeric">4</mn><mo data-omniya-nemeth-cells="⠤">−</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn><mo data-omniya-nemeth-cells="⠈⠷">[</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">4</mn><mo data-omniya-nemeth-cells="⠤">−</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn><mrow data-omniya-group="round" data-omniya-role="closed-group"><mo data-omniya-role="open-fence" data-omniya-nemeth-cells="⠷">(</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">6</mn><mo data-omniya-nemeth-cells="⠤">−</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn><mo data-omniya-role="close-fence" data-omniya-nemeth-cells="⠾">)</mo></mrow><mo data-omniya-nemeth-cells="⠈⠾">]</mo><mo data-omniya-nemeth-cells="⠨⠌">÷</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠲⠤⠒⠈⠷⠲⠤⠆⠷⠖⠤⠒⠈⠾⠈⠾⠨⠌⠒', source),
    '⠼⠲⠤⠒⠈⠷⠲⠤⠆⠷⠖⠤⠒⠾⠈⠾⠨⠌⠒'
  );
});

test('repeated capital enlarged fences restore every remaining unprefixed pair', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠈⠠⠷">{</mo><mi>c</mi><mo data-omniya-nemeth-cells="⠈⠠⠾">}</mo><mo data-omniya-nemeth-cells="⠈⠠⠷">{</mo><mi>s</mi><mo data-omniya-nemeth-cells="⠈⠠⠾">}</mo><mo data-omniya-nemeth-cells="⠈⠠⠷">{</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">0</mn><mo data-omniya-nemeth-cells="⠈⠠⠾">}</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠈⠠⠷⠉⠈⠠⠾⠀⠈⠷⠎⠈⠾⠀⠈⠷⠼⠴⠈⠾', source),
    '⠈⠠⠷⠉⠈⠠⠾⠈⠠⠷⠎⠈⠠⠾⠈⠠⠷⠴⠈⠠⠾'
  );
});

test('an explicit blank after a superscript drops SRE\'s extra baseline return before plus', () => {
  const source = new DOMParser().parseFromString(
    '<math><mn data-omniya-nemeth-intent="numeric-start">3</mn><mspace data-omniya-nemeth-intent="explicit-space"/><mi data-omniya-nemeth-cells="⠋">f</mi><msup><mi data-omniya-nemeth-cells="⠞">t</mi><mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn></msup><mspace data-omniya-nemeth-intent="explicit-space"/><mo data-omniya-nemeth-cells="⠬">+</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠒⠀⠋⠞⠘⠆⠀⠐⠬⠒', source),
    '⠼⠒⠀⠋⠞⠘⠆⠀⠬⠒'
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

test('trigonometric coefficients and degree scripts preserve their authored numeric levels', () => {
  const sourceMath = new DOMParser().parseFromString('<math><mrow data-omniya-group="round"><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn><mi data-omniya-nemeth-intent="function-name" data-omniya-nemeth-cells="⠎⠊⠝">sin</mi><mspace data-omniya-nemeth-intent="explicit-space"/><msup><mn data-omniya-nemeth-intent="lower-cell-numeric">30</mn><mrow><mo data-omniya-nemeth-cells="⠘⠨⠡">°</mo><mo data-omniya-nemeth-intent="punctuation-comma" data-omniya-nemeth-cells="⠠">,</mo></mrow></msup><mspace data-omniya-nemeth-intent="explicit-space"/><mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn><mi data-omniya-nemeth-intent="function-name" data-omniya-nemeth-cells="⠉⠕⠎">cos</mi><mspace data-omniya-nemeth-intent="explicit-space"/><msup><mn data-omniya-nemeth-intent="lower-cell-numeric">60</mn><mo data-omniya-nemeth-cells="⠘⠨⠡">°</mo></msup></mrow></math>', 'text/xml');
  assert.equal(
    applyNemethSourceIntentToBraille('⠷⠼⠒⠎⠊⠝⠀⠼⠒⠴⠘⠨⠡⠠⠐⠀⠼⠒⠉⠕⠎⠀⠼⠖⠴⠘⠨⠡⠾', sourceMath),
    '⠷⠒⠎⠊⠝⠀⠼⠒⠴⠘⠨⠡⠠⠀⠒⠉⠕⠎⠀⠼⠖⠴⠘⠨⠡⠐⠾'
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

test('Rule 20.1.1 does not move the first number sign onto a plus continuation', () => {
  const source = new DOMParser().parseFromString(
    `<math>
      <mn data-omniya-nemeth-intent="numeric-start">3</mn>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mi data-omniya-nemeth-cells="⠋">f</mi>
      <msup>
        <mi data-omniya-nemeth-cells="⠞">t</mi>
        <mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn>
      </msup>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mo data-omniya-nemeth-cells="⠬">+</mo>
      <mn data-omniya-nemeth-intent="numeric-start">3</mn>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mi data-omniya-nemeth-cells="⠋">f</mi>
      <msup>
        <mi data-omniya-nemeth-cells="⠞">t</mi>
        <mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn>
      </msup>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mo data-omniya-nemeth-cells="⠨⠅">=</mo>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mn data-omniya-nemeth-intent="numeric-start">6</mn>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mi data-omniya-nemeth-cells="⠋">f</mi>
      <msup>
        <mi data-omniya-nemeth-cells="⠞">t</mi>
        <mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn>
      </msup>
    </math>`,
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠒⠀⠋⠞⠘⠆⠀⠬⠼⠒⠀⠋⠞⠘⠆⠀⠨⠅⠀⠼⠖⠀⠋⠞⠘⠆', source),
    '⠼⠒⠀⠋⠞⠘⠆⠀⠬⠒⠀⠋⠞⠘⠆⠀⠨⠅⠀⠼⠖⠀⠋⠞⠘⠆'
  );
});

test('function-name cells drop SRE baseline returns between letters', () => {
  const source = new DOMParser().parseFromString(
    '<math><mn data-omniya-nemeth-intent="numeric-start">5</mn><mo data-omniya-nemeth-cells="⠷">(</mo><mi data-omniya-nemeth-intent="function-name" data-omniya-nemeth-cells="⠍⠕⠙">mod</mi><mn data-omniya-nemeth-intent="numeric-start">3</mn><mo data-omniya-nemeth-cells="⠾">)</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠢⠷⠍⠐⠕⠐⠙⠀⠼⠒⠾', source),
    '⠼⠢⠷⠍⠕⠙⠀⠼⠒⠾'
  );
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

test('lower-cell numeric with leading decimal restores BANA dot-4 cell', () => {
  const sourceMath = { querySelectorAll: (selector) => selector.includes('lower-cell-numeric') ? [{ textContent: '.2a1a2a3' }] : [] };
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠲⠆⠁⠂⠁⠆⠁⠒', sourceMath),
    '⠼⠨⠆⠁⠂⠁⠆⠁⠒'
  );
});

test('general-reference source cells restore the indicator and letter prefix', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠈⠎">$</mo><mn data-omniya-nemeth-intent="ueb-numeric">4</mn><mo>,</mo><mn data-omniya-nemeth-intent="ueb-numeric">265</mn><mspace data-omniya-nemeth-intent="explicit-space"/><mi data-omniya-nemeth-intent="general-reference" data-omniya-nemeth-cells="⠈⠻⠰⠙">d</mi></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠈⠎⠲⠠⠆⠖⠢⠀⠙', source),
    '⠈⠎⠲⠠⠆⠖⠢⠀⠈⠻⠰⠙'
  );
});

test('general-reference source cells restore the indicator before a numbered footnote', () => {
  const source = new DOMParser().parseFromString(
    '<math><mspace data-omniya-nemeth-intent="explicit-space"/><mn data-omniya-nemeth-intent="general-reference" data-omniya-nemeth-cells="⠈⠻⠼⠂">1</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠀⠼⠂', source),
    '⠀⠈⠻⠼⠂'
  );
});

test('Rule 9.4 pencil icons restore authored cells, numeric indicators, and punctuation periods', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-intent="transcriber-defined-pencil-icon" data-omniya-nemeth-cells="⠈⠫⠏">✎</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mn data-omniya-nemeth-intent="numeric-start">75</mn><mo data-omniya-nemeth-intent="punctuation-period" data-omniya-nemeth-cells="⠸⠲">.</mo><mspace data-omniya-nemeth-intent="explicit-space"/><msup><mi data-omniya-nemeth-cells="⠭">x</mi><mn data-omniya-nemeth-intent="lower-cell-numeric">4</mn></msup><mo data-omniya-nemeth-cells="⠤">−</mo><msup><mi data-omniya-nemeth-cells="⠽">y</mi><mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn></msup><mspace data-omniya-nemeth-intent="explicit-space"/><mo data-omniya-nemeth-intent="transcriber-defined-pencil-icon-capital" data-omniya-nemeth-cells="⠈⠫⠠⠏">✎</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mn data-omniya-nemeth-intent="numeric-start">76</mn><mo data-omniya-nemeth-intent="punctuation-period" data-omniya-nemeth-cells="⠸⠲">.</mo><mspace data-omniya-nemeth-intent="explicit-space"/><msup><mi data-omniya-nemeth-cells="⠭">x</mi><mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn></msup><mo data-omniya-nemeth-cells="⠬">+</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">5</mn><mi data-omniya-nemeth-cells="⠽">y</mi><mo data-omniya-nemeth-cells="⠤">−</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">112</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('✎⠀⠶⠢⠨⠀⠭⠘⠲⠐⠤⠽⠘⠆⠀✎⠀⠶⠖⠸⠲⠀⠭⠘⠆⠐⠬⠢⠽⠤⠂⠂⠆', source),
    '⠈⠫⠏⠀⠼⠶⠢⠸⠲⠀⠭⠘⠲⠐⠤⠽⠘⠆⠀⠈⠫⠠⠏⠀⠼⠶⠖⠸⠲⠀⠭⠘⠆⠐⠬⠢⠽⠤⠂⠂⠆'
  );
});

test('Rule 22 standalone arrows keep authored cells instead of the SRE glyph spelling', () => {
  const fixtures = [
    ['arrow-two-way-vertical-bold-barbed', '⠫⠣⠸⠪⠒⠒⠕', '↕', '⠫⠣⠩⠪⠒⠒⠕'],
    [null, '⠫⠯⠒⠒⠽', '⇝', '⠫⠢⠤⠔⠒⠢⠕'],
    ['arrow-northwest-blunted-double-shaft', '⠫⠘⠿⠶⠶', '↖', '⠫⠘⠪⠒⠒']
  ];
  for (const [intent, cells, glyph, sre] of fixtures) {
    const intentAttr = intent ? ` data-omniya-nemeth-intent="${intent}"` : '';
    const source = new DOMParser().parseFromString(
      `<math><mo${intentAttr} data-omniya-nemeth-cells="${cells}">${glyph}</mo></math>`,
      'text/xml'
    ).documentElement;
    assert.equal(applyNemethSourceIntentToBraille(sre, source), cells, cells);
  }
});

test('Rule 22 does not replace a larger expression with a single arrow node\'s cells', () => {
  const source = new DOMParser().parseFromString(
    '<math><mi>x</mi><mo data-omniya-nemeth-intent="arrow-right" data-omniya-nemeth-cells="⠫⠒⠒⠕">→</mo><mi>y</mi></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠭⠫⠒⠒⠕⠽', source), '⠭⠫⠒⠒⠕⠽');
});

const cancelledGroup = (inner) =>
  `<menclose notation="updiagonalstrike" data-omniya-nemeth-cells="⠪⠻"><mrow data-omniya-group="round" data-omniya-role="closed-group"><mo data-omniya-role="open-fence" data-omniya-nemeth-cells="⠷">(</mo><mrow>${inner}</mrow><mo data-omniya-role="close-fence" data-omniya-nemeth-cells="⠾">)</mo></mrow></menclose>`;
const roundGroup = (inner) =>
  `<mrow data-omniya-group="round" data-omniya-role="closed-group"><mo data-omniya-role="open-fence" data-omniya-nemeth-cells="⠷">(</mo><mrow>${inner}</mrow><mo data-omniya-role="close-fence" data-omniya-nemeth-cells="⠾">)</mo></mrow>`;

test('cancelled grouped factors do not grow a fence before a following fraction terminator', () => {
  const xy = '<mi data-omniya-nemeth-cells="⠭">x</mi><mo data-omniya-nemeth-cells="⠬">+</mo><mi data-omniya-nemeth-cells="⠽">y</mi>';
  const yz = '<mi data-omniya-nemeth-cells="⠽">y</mi><mo data-omniya-nemeth-cells="⠬">+</mo><mi data-omniya-nemeth-cells="⠵">z</mi>';
  const source = new DOMParser().parseFromString(
    `<math>${cancelledGroup(xy)}<mspace data-omniya-nemeth-intent="explicit-space"/><mfrac data-omniya-fraction-kind="simple"><mn data-omniya-nemeth-intent="lower-cell-numeric">333333333333</mn><mrow><mspace width="1em"/></mrow></mfrac><mspace data-omniya-nemeth-intent="explicit-space"/><mo data-omniya-nemeth-cells="⠨⠅">=</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mfrac data-omniya-fraction-kind="simple"><mn data-omniya-nemeth-intent="numeric-start">1</mn><mrow>${yz}</mrow></mfrac><mspace data-omniya-nemeth-intent="explicit-space"/>${cancelledGroup(xy)}${roundGroup(yz)}</math>`,
    'text/xml'
  ).documentElement;
  const expected = '⠪⠷⠭⠬⠽⠾⠻⠀⠹⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠼⠀⠨⠅⠀⠹⠂⠌⠽⠬⠵⠼⠀⠪⠷⠭⠬⠽⠾⠻⠷⠽⠬⠵⠾';
  assert.equal(applyNemethSourceIntentToBraille(expected, source), expected);
  assert.equal(
    applyNemethSourceIntentToBraille(
      '⠪⠷⠭⠬⠽⠾⠀⠹⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠼⠀⠨⠅⠀⠹⠂⠌⠽⠬⠵⠼⠀⠪⠷⠭⠬⠽⠾⠻⠻⠻⠷⠽⠬⠵⠾',
      source
    ),
    expected
  );
});

test('adjacent letter cancellations keep one terminator each', () => {
  const source = new DOMParser().parseFromString(
    '<math><menclose notation="updiagonalstrike" data-omniya-nemeth-cells="⠪⠻"><mi data-omniya-nemeth-cells="⠭">x</mi></menclose><menclose notation="updiagonalstrike" data-omniya-nemeth-cells="⠪⠻"><mi data-omniya-nemeth-cells="⠽">y</mi></menclose></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠪⠭⠻⠪⠽⠻', source), '⠪⠭⠻⠪⠽⠻');
  assert.equal(applyNemethSourceIntentToBraille('⠪⠭⠻⠻⠻⠪⠽⠻⠻', source), '⠪⠭⠻⠪⠽⠻');
});

test('a cancelled letter followed by an uncancelled letter keeps a single terminator', () => {
  const source = new DOMParser().parseFromString(
    '<math><menclose notation="updiagonalstrike" data-omniya-nemeth-cells="⠪⠻"><mi data-omniya-nemeth-cells="⠭">x</mi></menclose><mi data-omniya-nemeth-cells="⠽">y</mi></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠪⠭⠻⠽', source), '⠪⠭⠻⠽');
  assert.equal(applyNemethSourceIntentToBraille('⠪⠭⠻⠻⠻⠽', source), '⠪⠭⠻⠽');
});

test('Rule 23.1 diagonal thousand-comma keeps the authored comma and no extra number sign', () => {
  const source = new DOMParser().parseFromString(
    '<math><mfrac bevelled="true" data-omniya-nemeth-cells="⠼⠂⠸⠌"><mn data-omniya-nemeth-intent="numeric-start">1</mn><mn data-omniya-nemeth-intent="numeric-start">10,000</mn></mfrac><mspace data-omniya-nemeth-intent="explicit-space"/><mi data-omniya-nemeth-cells="⠨⠍">μ</mi><mspace data-omniya-nemeth-intent="explicit-space"/><mo data-omniya-nemeth-cells="⠨⠅">=</mo><mspace data-omniya-nemeth-intent="explicit-space"/><mn data-omniya-nemeth-intent="numeric-start">1</mn><mspace data-omniya-nemeth-intent="explicit-space"/><mi data-omniya-nemeth-cells="⠈⠠⠁">Å</mi></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠂⠸⠌⠼⠂⠴⠴⠴⠴⠀⠨⠍⠀⠨⠅⠀⠼⠂⠀⠈⠠⠁', source),
    '⠼⠂⠸⠌⠂⠴⠠⠴⠴⠴⠀⠨⠍⠀⠨⠅⠀⠼⠂⠀⠈⠠⠁'
  );
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠂⠸⠌⠂⠴⠠⠴⠴⠴⠼⠀⠨⠍⠀⠨⠅⠀⠼⠂⠀⠈⠠⠁', source),
    '⠼⠂⠸⠌⠂⠴⠠⠴⠴⠴⠀⠨⠍⠀⠨⠅⠀⠼⠂⠀⠈⠠⠁'
  );
});

test('Rule 24.1 letter or largeop followed by a baseline number keeps the multipurpose indicator', () => {
  const letter = new DOMParser().parseFromString(
    '<math><mi data-omniya-nemeth-cells="⠠⠭">X</mi><mn data-omniya-nemeth-intent="lower-cell-numeric">5</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠠⠭⠢', letter), '⠠⠭⠐⠢');
  assert.equal(applyNemethSourceIntentToBraille('⠠⠭⠐⠢', letter), '⠠⠭⠐⠢');

  const sigma = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠨⠠⠎">∑</mo><mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠨⠠⠎⠆', sigma), '⠨⠠⠎⠐⠆');

  const decimal = new DOMParser().parseFromString(
    '<math><mi data-omniya-nemeth-cells="⠠⠭">X</mi><mn data-omniya-nemeth-intent="lower-cell-numeric">.6</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠠⠭⠨⠖', decimal), '⠠⠭⠐⠨⠖');
  assert.equal(applyNemethSourceIntentToBraille('⠠⠭⠐⠨⠼⠖', decimal), '⠠⠭⠐⠨⠖');
});

test('Rule 15.9 standalone superposed comparisons keep authored cells over SRE glyphs', () => {
  const subset = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-intent="comparison.superposed.equals-subset" data-omniya-nemeth-cells="⠨⠅⠈⠸⠐⠅⠻">⊆</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠸⠐⠅⠱', subset), '⠨⠅⠈⠸⠐⠅⠻');

  const dotEquals = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-intent="comparison.superposed.dot-equals" data-omniya-nemeth-cells="⠡⠈⠨⠅⠻">≐</mo></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠐⠨⠅⠣⠡⠻', dotEquals), '⠡⠈⠨⠅⠻');
});

test('Rule 20.3 asterisk and number-sign restore the following numeric indicator', () => {
  const asterisk = new DOMParser().parseFromString(
    '<math><mn data-omniya-nemeth-intent="numeric-start">3</mn><mo data-omniya-nemeth-cells="⠈⠼">∗</mo><mn data-omniya-nemeth-intent="numeric-start">4</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠼⠒⠈⠼⠲', asterisk), '⠼⠒⠈⠼⠼⠲');

  const crosshatch = new DOMParser().parseFromString(
    '<math><mn data-omniya-nemeth-intent="numeric-start">2</mn><mo data-omniya-nemeth-cells="⠨⠼">#</mo><mn data-omniya-nemeth-intent="numeric-start">3</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠼⠆⠨⠼⠒', crosshatch), '⠼⠆⠨⠼⠼⠒');
});

test('Rule 20.9 consecutive tildes keep a multipurpose separator', () => {
  const source = new DOMParser().parseFromString(
    '<math><mo data-omniya-nemeth-cells="⠈⠱">∼</mo><mo data-omniya-nemeth-cells="⠈⠱">∼</mo><mi data-omniya-nemeth-cells="⠠⠞">T</mi><mo data-omniya-nemeth-cells="⠈⠬">∨</mo><mi data-omniya-nemeth-cells="⠠⠗">R</mi></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠈⠱⠈⠱⠠⠞⠈⠬⠠⠗', source), '⠈⠱⠐⠈⠱⠠⠞⠈⠬⠠⠗');
});

test('Rule 14.11 degree returns to baseline before a following hyphen', () => {
  const source = new DOMParser().parseFromString(
    '<math><msup><mn data-omniya-nemeth-intent="numeric-start">360</mn><mo data-omniya-nemeth-cells="⠘⠨⠡">°</mo></msup><mo data-omniya-nemeth-cells="⠤">−</mo><mi>i</mi></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠼⠒⠖⠴⠘⠨⠡⠤⠊', source), '⠼⠒⠖⠴⠘⠨⠡⠐⠤⠊');
});

test('Rule 14.11 non-simultaneous scripts restore the multipurpose separator', () => {
  const subThenSup = new DOMParser().parseFromString(
    '<math><msubsup data-omniya-nemeth-intent="non-simultaneous-scripts:sub-sup"><mi>a</mi><mi>m</mi><mi>n</mi></msubsup></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠁⠰⠍⠘⠝', subThenSup), '⠁⠰⠍⠐⠘⠝');
  const primed = new DOMParser().parseFromString(
    '<math><msubsup data-omniya-nemeth-intent="non-simultaneous-scripts:sub-sup"><mrow><mi>x</mi><mo>′</mo></mrow><mi>a</mi><mi>b</mi></msubsup></math>',
    'text/xml'
  ).documentElement;
  assert.equal(applyNemethSourceIntentToBraille('⠭⠄⠰⠁⠘⠃', primed), '⠭⠄⠰⠁⠐⠘⠃');
});

test('Rule 8 simple fractions drop interior number signs and keep indicated periods', () => {
  const source = new DOMParser().parseFromString(
    `<math>
      <mfrac data-omniya-fraction-kind="simple"><mn data-omniya-nemeth-intent="numeric-start">1</mn><mn data-omniya-nemeth-intent="numeric-start">2</mn></mfrac>
      <mo data-omniya-nemeth-intent="punctuation-comma" data-omniya-nemeth-cells="⠠">,</mo>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mfrac data-omniya-fraction-kind="simple"><mn data-omniya-nemeth-intent="numeric-start">2</mn><mn data-omniya-nemeth-intent="numeric-start">4</mn></mfrac>
      <mo data-omniya-nemeth-intent="punctuation-comma" data-omniya-nemeth-cells="⠠">,</mo>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mtext data-omniya-nemeth-intent="and-word" data-omniya-nemeth-cells="⠠⠄⠯">and</mtext>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mfrac data-omniya-fraction-kind="simple"><mn data-omniya-nemeth-intent="numeric-start">3</mn><mn data-omniya-nemeth-intent="numeric-start">4</mn></mfrac>
      <mo data-omniya-nemeth-intent="punctuation-period" data-omniya-nemeth-cells="⠸⠲">.</mo>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mfrac data-omniya-fraction-kind="simple"><mn data-omniya-nemeth-intent="numeric-start">2</mn><mn data-omniya-nemeth-intent="numeric-start">3</mn></mfrac>
    </math>`,
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠹⠂⠌⠆⠼⠠⠀⠹⠼⠆⠌⠼⠲⠼⠠⠀⠠⠄⠯⠀⠹⠼⠒⠌⠼⠲⠼⠸⠼⠲⠀⠹⠼⠆⠌⠼⠒⠼', source),
    '⠹⠂⠌⠆⠼⠠⠀⠹⠆⠌⠲⠼⠠⠀⠠⠄⠯⠀⠹⠒⠌⠲⠼⠸⠲⠀⠹⠆⠌⠒⠼'
  );
});

test('Rule 8 literary periods and bevelled fractions keep bare period cells', () => {
  const source = new DOMParser().parseFromString(
    `<math>
      <mn data-omniya-nemeth-intent="numeric-start">2</mn>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mfrac data-omniya-fraction-kind="simple" bevelled="true">
        <mrow>
          <mi data-omniya-nemeth-cells="⠍">m</mi>
          <mi data-omniya-nemeth-cells="⠊">i</mi>
          <mo data-omniya-nemeth-intent="punctuation-literary-period" data-omniya-nemeth-cells="⠲">.</mo>
        </mrow>
        <mrow>
          <mi data-omniya-nemeth-intent="function-name" data-omniya-nemeth-cells="⠍⠊⠝">min</mi>
          <mo data-omniya-nemeth-intent="punctuation-literary-period" data-omniya-nemeth-cells="⠲">.</mo>
        </mrow>
      </mfrac>
    </math>`,
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠆⠀⠍⠊⠹⠲⠸⠌⠍⠊⠝⠀⠲', source),
    '⠼⠆⠀⠍⠊⠲⠸⠌⠍⠊⠝⠲'
  );
});

test('Rule 8 quotes restore indicated openers, or-words, and quoted decimals', () => {
  const quotes = new DOMParser().parseFromString(
    `<math>
      <mo data-omniya-nemeth-intent="punctuation-left-double-quote" data-omniya-nemeth-cells="⠦">“</mo>
      <mo data-omniya-nemeth-cells="⠐⠅">&lt;</mo>
      <mo data-omniya-nemeth-intent="punctuation-right-double-quote" data-omniya-nemeth-cells="⠸⠴">”</mo>
      <mo data-omniya-nemeth-intent="punctuation-comma" data-omniya-nemeth-cells="⠠">,</mo>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mo data-omniya-nemeth-intent="punctuation-left-double-quote" data-omniya-nemeth-cells="⠦">“</mo>
      <mo data-omniya-nemeth-cells="⠨⠅">=</mo>
      <mo data-omniya-nemeth-intent="punctuation-right-double-quote" data-omniya-nemeth-cells="⠸⠴">”</mo>
      <mo data-omniya-nemeth-intent="punctuation-comma" data-omniya-nemeth-cells="⠠">,</mo>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mtext data-omniya-nemeth-intent="or-word" data-omniya-nemeth-cells="⠠⠄⠕⠗">or</mtext>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mo data-omniya-nemeth-intent="punctuation-left-double-quote" data-omniya-nemeth-cells="⠦">“</mo>
      <mo data-omniya-nemeth-cells="⠨⠂">&gt;</mo>
      <mo data-omniya-nemeth-intent="punctuation-right-double-quote" data-omniya-nemeth-cells="⠸⠴">”</mo>
    </math>`,
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠦⠐⠅⠸⠴⠠⠀⠼⠦⠨⠅⠸⠴⠠⠀⠕⠗⠀⠼⠦⠨⠂⠸⠴', quotes),
    '⠦⠐⠅⠸⠴⠠⠀⠦⠨⠅⠸⠴⠠⠀⠠⠄⠕⠗⠀⠦⠨⠂⠸⠴'
  );

  const decimal = new DOMParser().parseFromString(
    `<math>
      <mrow data-omniya-group="round" data-omniya-role="closed-group">
        <mo data-omniya-role="open-fence" data-omniya-nemeth-cells="⠷">(</mo>
        <mrow>
          <mo data-omniya-nemeth-intent="punctuation-left-double-quote" data-omniya-nemeth-cells="⠸⠦">“</mo>
          <mn data-omniya-nemeth-intent="numeric-decimal">.8</mn>
          <mo data-omniya-nemeth-intent="punctuation-right-double-quote" data-omniya-nemeth-cells="⠸⠴">”</mo>
        </mrow>
        <mo data-omniya-role="close-fence" data-omniya-nemeth-cells="⠾">)</mo>
      </mrow>
      <mo data-omniya-nemeth-intent="punctuation-period" data-omniya-nemeth-cells="⠸⠲">.</mo>
      <mspace data-omniya-nemeth-intent="explicit-space"/>
      <mo data-omniya-nemeth-cells="⠄⠄⠄">…</mo>
    </math>`,
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠷⠿⠨⠼⠦⠸⠴⠾⠸⠲⠀⠄⠄⠄', decimal),
    '⠷⠸⠦⠼⠨⠦⠸⠴⠾⠸⠲⠀⠄⠄⠄'
  );
});

test('Rule 15.4 munderover drops SRE nested terminators and the extra multipurpose', () => {
  const source = new DOMParser().parseFromString(
    '<math><munderover><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow><mo data-omniya-role="underscript">¯</mo><mo data-omniya-role="overscript">¯</mo></munderover></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠐⠐⠭⠬⠽⠩⠱⠻⠣⠱⠻', source),
    '⠐⠭⠬⠽⠩⠱⠣⠱⠻'
  );
});

test('Rule 15.5 simultaneous parallel bars keep one terminator', () => {
  const source = new DOMParser().parseFromString(
    '<math><munderover><mi>x</mi><mrow><mo data-omniya-role="underscript">¯</mo><mo data-omniya-role="underscript">¯</mo></mrow><mrow><mo data-omniya-role="overscript">¯</mo><mo data-omniya-role="overscript">¯</mo></mrow></munderover></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠐⠐⠭⠩⠱⠱⠻⠣⠱⠱⠻', source),
    '⠐⠭⠩⠱⠱⠣⠱⠱⠻'
  );
});

test('Rule 23 restores the authored close before an unspaced differential', () => {
  const source = new DOMParser().parseFromString(
    '<math><mi>f</mi><mrow data-omniya-group="round" data-omniya-role="closed-group"><mo data-omniya-role="open-fence" data-omniya-nemeth-cells="⠷">(</mo><mi>x</mi><mo data-omniya-role="close-fence" data-omniya-nemeth-cells="⠾">)</mo></mrow><mi>d</mi><mi>x</mi></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠋⠷⠭⠙⠭⠾', source),
    '⠋⠷⠭⠾⠙⠭'
  );
});

test('Rule 23 restores a displaced integral close before dx and a following equality', () => {
  const source = new DOMParser().parseFromString(
    '<math><msubsup><mo>∫</mo><mi>a</mi><mi>b</mi></msubsup><mi>f</mi><mrow data-omniya-group="round" data-omniya-role="closed-group"><mo data-omniya-role="open-fence" data-omniya-nemeth-cells="⠷">(</mo><mi>x</mi><mo data-omniya-role="close-fence" data-omniya-nemeth-cells="⠾">)</mo></mrow><mi>d</mi><mi>x</mi><mspace/><mo data-omniya-nemeth-cells="⠨⠅">=</mo><mn data-omniya-nemeth-intent="numeric-start">0</mn></math>',
    'text/xml'
  ).documentElement;
  assert.equal(
    applyNemethSourceIntentToBraille('⠣⠮⠰⠁⠘⠃⠐⠋⠷⠭⠙⠭⠀⠨⠅⠀⠼⠴⠾', source),
    '⠣⠮⠰⠁⠘⠃⠐⠋⠷⠭⠾⠙⠭⠀⠨⠅⠀⠼⠴'
  );
});
