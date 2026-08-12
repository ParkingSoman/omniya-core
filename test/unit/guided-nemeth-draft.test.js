import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMathML } from '../../src/domain/math-tree.js';
import {
  applyNemethCell,
  applyNemethChoice,
  commitNemethLocalCode,
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
    assert.notEqual(result.status, 'rejected', result.announcement);
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

test('complex and hypercomplex fraction indicators keep their BANA distinction locally', () => {
  for (const [kind, opening, separator, closing] of [
    ['complex', ['⠠', '⠹'], ['⠠', '⠌'], ['⠠', '⠼']],
    ['hypercomplex', ['⠠', '⠠', '⠹'], ['⠠', '⠠', '⠌'], ['⠠', '⠠', '⠼']]
  ]) {
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    for (const value of [...opening, '⠁', ...separator, '⠃', ...closing]) {
      const result = cell(document, focus, inputState, value);
      assert.notEqual(result.status, 'rejected', `${kind}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    const root = parseMathML(document.mathml);
    assert.equal(root.children[0].name, 'mfrac');
    assert.equal(root.children[0].attrs['data-omniya-fraction-kind'], kind);
    assert.equal(root.children[0].children[0].children[0].text, 'a');
    assert.equal(root.children[0].children[1].children[0].text, 'b');
  }
});

test('fixed-index roots create canonical mroot structure one code at a time', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠣', '⠒', '⠜', '⠁', '⠻']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const root = parseMathML(document.mathml);
  assert.equal(root.children[0].name, 'mroot');
  assert.equal(root.children[0].children[0].children[0].text, 'a');
  assert.equal(root.children[0].children[1].children[0].text, '3');
});

test('omission and cancellation indicators become local MathML constructs', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  const omission = cell(document, focus, inputState, '⠿');
  assert.equal(omission.status, 'applied');
  const omissionTree = parseMathML(omission.document.mathml);
  assert.equal(omissionTree.children[0].children[0].text, '?');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const value of ['⠪', '⠭', '⠻']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'menclose');
  assert.equal(tree.children[0].attrs.notation, 'updiagonalstrike');
  assert.equal(tree.children[0].children[0].children[0].text, 'x');
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

test('compound Rule 14 level indicators build one msubsup with navigable slots', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠘', '⠰']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'msubsup');
  assert.equal(tree.children[0].children.length, 3);
  const move = cell(document, focus, inputState, '⠰');
  assert.equal(move.status, 'applied');
  assert.equal(parseMathML(move.document.mathml).children[0].attrs['data-omniya-id'], tree.children[0].attrs['data-omniya-id']);
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

test('the shared baseline and multipurpose cell is selected by valid local context', () => {
  const document = createEmptyDraftMathDocument();
  const rootResult = cell(document, document.focus, { prefix: '', mode: null }, '⠐');
  assert.equal(rootResult.status, 'pending');
  assert.equal(rootResult.inputState.prefix, '⠐');

  let nested = document;
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠘', '⠁', '⠐']) {
    const result = cell(nested, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document: nested, focus, inputState } = result);
  }
  assert.equal(inputState.mode, null);
  assert.match(nested.mathml, /<msup/);
});

test('local input policies are declarative and apply across construction families', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  assert.equal(registry.get('operator.integral').commitPolicy, 'immediate');
  assert.equal(registry.get('arrow.right').commitPolicy, 'atomic-sequence');
  assert.equal(registry.get('script.superscript').commitPolicy, 'immediate');
  assert.equal(registry.get('fraction.next.denominator').commitPolicy, 'structural-followup');
  assert.ok(operationRegistry().every((entry) => ['immediate', 'atomic-sequence', 'structural-followup'].includes(entry.commitPolicy)));
});

test('an atomic local code waits for Enter and then applies exactly once', () => {
  const document = createEmptyDraftMathDocument();
  let state = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus: document.focus, inputState: state, cell: '⠫' });
  assert.equal(result.status, 'pending');
  assert.equal(result.document.mathml, document.mathml);
  state = result.inputState;
  for (const cell of ['⠒', '⠕']) result = applyNemethCell({ document, focus: document.focus, inputState: state, cell });
  assert.equal(result.status, 'pending');
  assert.equal(result.document.mathml, document.mathml);
  const committed = commitNemethLocalCode({ document, focus: document.focus, inputState: result.inputState });
  assert.equal(committed.status, 'applied');
  assert.match(committed.document.mathml, />→</);
  assert.equal(committed.inputState.prefix, '');
});

test('a standalone immediate code can coexist with longer atomic codes', () => {
  const document = createEmptyDraftMathDocument();
  const result = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠮' });
  assert.equal(result.status, 'applied');
  assert.match(result.document.mathml, />∫</);
});

test('incomplete or invalid atomic input never mutates the draft', () => {
  const document = createEmptyDraftMathDocument();
  const pending = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠫' });
  const invalid = commitNemethLocalCode({ document, focus: document.focus, inputState: pending.inputState });
  assert.equal(invalid.status, 'rejected');
  assert.equal(invalid.document.mathml, document.mathml);
  const badNext = applyNemethCell({ document, focus: document.focus, inputState: pending.inputState, cell: '⠁' });
  assert.equal(badNext.status, 'rejected');
  assert.equal(badNext.document.mathml, document.mathml);
  assert.equal(badNext.inputState.prefix, pending.inputState.prefix);
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
