import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';

import { applyNemethSourceIntentToBraille } from '../../src/renderer/nemeth-braille-projection.js';

const parse = (source) => new DOMParser().parseFromString(source, 'text/xml').documentElement;

test('example 17-25 restores keystroke wrappers over SRE calculator glyphs', () => {
  const source = parse(`<math>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠷⠻" data-omniya-projection-cells="⠷">(</mo>
    <mn data-omniya-nemeth-intent="lower-cell-numeric">2</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠈⠡⠻" data-omniya-projection-cells="⠡">·</mo>
    <mn data-omniya-nemeth-intent="lower-cell-numeric">3</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠬⠻" data-omniya-projection-cells="⠬">+</mo>
    <mn data-omniya-nemeth-intent="lower-cell-numeric">4</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠾⠻" data-omniya-projection-cells="⠾">)</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠈⠡⠻" data-omniya-projection-cells="⠡">·</mo>
    <mn data-omniya-nemeth-intent="lower-cell-numeric">5</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠨⠅⠻" data-omniya-projection-cells="⠨⠅">=</mo>
  </math>`);
  assert.equal(
    applyNemethSourceIntentToBraille('⠷⠆⠡⠒⠬⠲⠾⠡⠢⠀⠨⠅', source),
    '⠫⠅⠷⠻⠆⠫⠅⠈⠡⠻⠒⠫⠅⠬⠻⠲⠫⠅⠾⠻⠫⠅⠈⠡⠻⠢⠫⠅⠨⠅⠻'
  );
});

test('example 17-27 restores decimal and power keystrokes without leaked Unicode', () => {
  const source = parse(`<math>
    <mn data-omniya-nemeth-intent="numeric-start">2</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠨⠻" data-omniya-projection-cells="⠨">.</mo>
    <mn data-omniya-nemeth-intent="lower-cell-numeric">75</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠽⠘⠭⠐⠻" data-omniya-projection-cells="⠽ˣ">yˣ</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠨⠻" data-omniya-projection-cells="⠨">.</mo>
    <mn data-omniya-nemeth-intent="lower-cell-numeric">34</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠬⠸⠌⠤⠻" data-omniya-projection-cells="⠬⠤">±</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠨⠅⠻" data-omniya-projection-cells="⠨⠅">=</mo>
  </math>`);
  assert.equal(
    applyNemethSourceIntentToBraille('⠼⠆⠨⠐⠼⠶⠢⠽ˣ⠨⠐⠼⠒⠲⠬⠤⠀⠨⠅', source),
    '⠼⠆⠫⠅⠨⠻⠶⠢⠫⠅⠽⠘⠭⠐⠻⠫⠅⠨⠻⠒⠲⠫⠅⠬⠸⠌⠤⠻⠫⠅⠨⠅⠻'
  );
});

test('example 17-26 restores mixed calculator-program keystroke cells', () => {
  const source = parse(`<math>
    <mi>n</mi>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠈⠡⠻" data-omniya-projection-cells="⠡">·</mo>
    <mi data-omniya-nemeth-cells="⠠⠏">P</mi>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠈⠡⠻" data-omniya-projection-cells="⠡">·</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠷⠻" data-omniya-projection-cells="⠷">(</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠷⠻" data-omniya-projection-cells="⠷">(</mo>
    <mn data-omniya-nemeth-intent="lower-cell-numeric">1</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠤⠻" data-omniya-projection-cells="⠤">−</mo>
    <mn data-omniya-nemeth-intent="lower-cell-numeric">1</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠷⠻" data-omniya-projection-cells="⠷">(</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠬⠻" data-omniya-projection-cells="⠬">+</mo>
    <mi>i</mi>
    <mspace data-omniya-nemeth-intent="explicit-space"/>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠈⠴⠻" data-omniya-projection-cells="⠼⠴">0</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠾⠻" data-omniya-projection-cells="⠾">)</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠽⠘⠭⠐⠻" data-omniya-projection-cells="⠽ˣ">yˣ</mo>
    <mi>n</mi>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠬⠸⠌⠤⠻" data-omniya-projection-cells="⠬⠤">±</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠾⠻" data-omniya-projection-cells="⠾">)</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠨⠌⠻" data-omniya-projection-cells="⠨⠌">÷</mo>
    <mi>i</mi>
    <mspace data-omniya-nemeth-intent="explicit-space"/>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠈⠴⠻" data-omniya-projection-cells="⠼⠴">0</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠾⠻" data-omniya-projection-cells="⠾">)</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠽⠘⠭⠐⠻" data-omniya-projection-cells="⠽ˣ">yˣ</mo>
    <mn data-omniya-nemeth-intent="lower-cell-numeric">1</mn>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠬⠸⠌⠤⠻" data-omniya-projection-cells="⠬⠤">±</mo>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠤⠻" data-omniya-projection-cells="⠤">−</mo>
    <mi data-omniya-nemeth-cells="⠠⠏">P</mi>
    <mo data-omniya-shape-kind="keystroke" data-omniya-nemeth-cells="⠫⠅⠨⠅⠻" data-omniya-projection-cells="⠨⠅">=</mo>
  </math>`);
  assert.equal(
    applyNemethSourceIntentToBraille('⠝⠡⠠⠏⠡⠷⠷⠂⠤⠂⠷⠬⠊⠀⠼⠴⠾⠽ˣ⠝⠬⠤⠾⠨⠌⠊⠀⠼⠴⠾⠽ˣ⠂⠬⠤⠤⠠⠏⠀⠨⠅', source),
    '⠝⠫⠅⠈⠡⠻⠠⠏⠫⠅⠈⠡⠻⠫⠅⠷⠻⠫⠅⠷⠻⠂⠫⠅⠤⠻⠂⠫⠅⠷⠻⠫⠅⠬⠻⠊⠀⠫⠅⠈⠴⠻⠫⠅⠾⠻⠫⠅⠽⠘⠭⠐⠻⠝⠫⠅⠬⠸⠌⠤⠻⠫⠅⠾⠻⠫⠅⠨⠌⠻⠊⠀⠫⠅⠈⠴⠻⠫⠅⠾⠻⠫⠅⠽⠘⠭⠐⠻⠂⠫⠅⠬⠸⠌⠤⠻⠫⠅⠤⠻⠠⠏⠫⠅⠨⠅⠻'
  );
});
