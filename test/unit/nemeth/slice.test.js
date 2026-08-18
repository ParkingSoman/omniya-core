import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { asciiToCells } from '../../../src/domain/nemeth/braille-ascii.js';
import {
  NemethUnsupportedError,
  UNSUPPORTED_MESSAGE,
  parseNemeth
} from '../../../src/domain/nemeth/index.js';

// The corpus is the oracle. Cases are looked up in it by id rather than copied,
// so a case that changes upstream cannot quietly stop being the case under test.
const corpusPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../test/corpus/nemeth-v1.json'
);
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));

const caseById = (id) => {
  const found = corpus.cases.find((entry) => entry.id === id);
  assert(found, `corpus has no case "${id}"`);
  return found;
};

// `ascii` is the same cells written in Braille-ASCII, which a sighted reader can
// check; the test asserts the two agree before parsing either.
const TARGETS = [
  { id: 'mathcat-rules:num_indicator_9_a_1', ascii: '#27', latex: '27' },
  { id: 'mathcat-rules:simple_frac_62_a_3', ascii: '?a+b/c#', latex: '\\frac{a+b}{c}' },
  { id: 'mathcat-rules:sqrt_103_a_2', ascii: '>x+y]', latex: '\\sqrt{x+y}' },
  { id: 'mathcat-rules:nested_sup_74_b_1', ascii: 'n^x^^y', latex: 'n^{x^{y}}' }
];

for (const target of TARGETS) {
  test(`${target.id} parses end to end to ${target.latex}`, () => {
    const entry = caseById(target.id);
    assert.equal(entry.cells, asciiToCells(target.ascii));
    const result = parseNemeth(entry.cells);
    assert.equal(result.latex, target.latex);
  });
}

test('parseNemeth returns an AST alongside the LaTeX', () => {
  const result = parseNemeth(caseById('mathcat-rules:simple_frac_62_a_3').cells);
  assert.equal(result.ast.kind, 'Fraction');
  assert.equal(result.ast.denominator.name, 'c');
});

test('parseNemeth collects diagnostics into an array the caller can read', () => {
  const result = parseNemeth(asciiToCells('#27'));
  assert(Array.isArray(result.diagnostics));
});

test('parseNemeth is pure: the same input yields the same LaTeX every time', () => {
  const cells = caseById('mathcat-rules:nested_sup_74_b_1').cells;
  assert.equal(parseNemeth(cells).latex, parseNemeth(cells).latex);
});

test('a construct outside this slice is refused rather than parsed into a wrong answer', () => {
  assert.throws(() => parseNemeth(asciiToCells('.k')), NemethUnsupportedError);
});

test('every failure reaches the user as the same message, with detail kept for developers', () => {
  try {
    parseNemeth('A');
    assert.fail('expected parseNemeth to throw');
  } catch (error) {
    assert.equal(error.message, UNSUPPORTED_MESSAGE);
    assert.equal(error.message.includes(error.detail), false);
  }
});
