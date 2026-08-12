import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMathML } from '../../src/domain/math-tree.js';
import {
  applyNemethCell,
  applyNemethChoice,
  createEmptyDraftMathDocument,
  operationRegistry
} from '../../src/domain/guided-nemeth/index.js';

function focusOf(document) {
  const tree = parseMathML(document.mathml);
  return { kind: 'node', nodeId: tree.attrs['data-omniya-id'] };
}

function cell(document, focus, inputState, value) {
  return applyNemethCell({ document, focus, inputState, cell: value });
}

test('sequential Nemeth cells build a plain MathML row one token at a time', () => {
  let document = createEmptyDraftMathDocument();
  let focus = focusOf(document);
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠁', '⠬', '⠃']) {
    const result = cell(document, focus, inputState, value);
    assert.equal(result.status, 'applied');
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.map((node) => [node.name, node.children[0].text]), [
    ['mi', 'a'], ['mo', '+'], ['mi', 'b']
  ]);
});

test('fraction cells create and traverse structural slots without parsing a passage', () => {
  let document = createEmptyDraftMathDocument();
  let focus = focusOf(document);
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠹', '⠁']) {
    const result = cell(document, focus, inputState, value);
    assert.equal(result.status, 'applied');
    ({ document, focus, inputState } = result);
  }
  let result = cell(document, focus, inputState, '⠌');
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠃');
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠼');
  assert.equal(result.status, 'applied');
  const tree = parseMathML(result.document.mathml);
  assert.equal(tree.children[0].name, 'mfrac');
  assert.equal(tree.children[0].children[0].children[0].text, 'a');
  assert.equal(tree.children[0].children[1].children[0].text, 'b');
});

test('indexed radicals preserve MathML child order while following Nemeth entry order', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠣', '⠼', '⠃', '⠌', '⠁', '⠻']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const root = parseMathML(document.mathml);
  const radical = root.children[0];
  assert.equal(radical.name, 'mroot');
  assert.equal(radical.children[0].children[0].text, 'a');
  assert.equal(radical.children[1].children[0].text, '2');
});

test('every registered Nemeth mapping is declarative and source-linked', () => {
  const entries = operationRegistry();
  assert.ok(entries.length > 20);
  for (const entry of entries) {
    assert.ok(entry.id);
    assert.ok(entry.action);
    assert.ok(entry.banaRefs?.length, entry.id);
    assert.ok(Array.isArray(entry.cells), entry.id);
  }
});

test('locally ambiguous grouping cells wait for an explicit operation choice', () => {
  const document = createEmptyDraftMathDocument();
  const pending = cell(document, document.focus, { prefix: '', mode: null }, '⠷');
  assert.equal(pending.status, 'choice');
  assert.equal(pending.document.mathml, document.mathml);
  const chosen = applyNemethChoice({
    document,
    focus: document.focus,
    inputState: pending.inputState,
    operationId: 'group.round'
  });
  assert.equal(chosen.status, 'applied');
  assert.match(chosen.document.mathml, /data-omniya-group="round"/);
});

test('computer-Braille and Unicode blanks create the same explicit MathML space', () => {
  for (const blank of [' ', '⠀']) {
    const document = createEmptyDraftMathDocument();
    const result = cell(document, document.focus, { prefix: '', mode: null }, blank);
    assert.equal(result.status, 'applied');
    assert.match(result.document.mathml, /<mspace width="0\.3em"/);
  }
});

test('numeric and capital indicators are local modes, not passage parsing', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠼', '⠁', '⠃', '⠠', '⠉']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.filter((node) => node.name !== 'mspace').map((node) => node.children[0].text), ['1', '2', 'C']);
});

test('punctuation and Greek symbols remain declarative token mappings', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠨', '⠏', '⠸', '⠲']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    if (result.status === 'applied') ({ document, focus, inputState } = result);
    else inputState = result.inputState;
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].children[0].text, 'π');
  assert.equal(tree.children[1].children[0].text, '.');
});
