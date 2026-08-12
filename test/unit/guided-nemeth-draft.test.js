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
    const committed = result.status === 'pending'
      ? commitNemethLocalCode({ document, focus, inputState: result.inputState })
      : result;
    assert.equal(committed.status, 'applied');
    ({ document, focus, inputState } = committed);
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

test('Rule 13.8.2 higher-order hypercomplex opening keeps order in canonical MathML', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠠', '⠠', '⠠', '⠹']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'mfrac');
  assert.equal(tree.children[0].attrs['data-omniya-fraction-kind'], 'hypercomplex');
  assert.equal(tree.children[0].attrs['data-omniya-fraction-order'], '3');
});

test('Rule 17.6 multi-interior shapes remain atomic until Enter', () => {
  for (const id of ['shape.circle.interior-arrows-horizontal', 'shape.circle.interior-arrows-vertical']) {
    const code = operationRegistry().find((entry) => entry.id === id).cells;
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    const initialMathML = document.mathml;
    for (const cell of code) {
      const result = applyNemethCell({ document, focus, inputState, cell });
      assert.ok(result);
      assert.notEqual(result.status, 'rejected', result.announcement);
      ({ document, focus, inputState } = result);
    }
    assert.equal(document.mathml, initialMathML, `${id} mutated before Enter`);
    assert.equal(inputState.prefix.length > 0, true);
    const committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', committed.announcement);
    assert.match(committed.document.mathml, /data-omniya-shape-modification="interior-arrows-/);
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

test('Rule 8.7 short dash waits for its complete local code', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = cell(document, focus, inputState, '⠤');
  assert.equal(result.status, 'pending');
  const before = result.document.mathml;
  result = cell(result.document, result.focus, result.inputState, '⠤');
  assert.equal(result.status, 'pending');
  assert.equal(result.document.mathml, before);
  const committed = commitNemethLocalCode({ document: result.document, focus: result.focus, inputState: result.inputState });
  assert.equal(committed.status, 'applied');
  assert.equal(parseMathML(committed.document.mathml).children[0].children[0].text, '–');
});

test('Rule 11.1.2 omission long dash is a bounded local construction', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const [index, value] of ['⠤', '⠤', '⠤', '⠤'].entries()) {
    const result = cell(document, focus, inputState, value);
    assert.equal(result.status, index === 3 ? 'choice' : 'pending');
    ({ document, focus, inputState } = result);
  }
  const committed = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(committed.status, 'choice');
  const omission = applyNemethChoice({
    document: committed.document,
    focus: committed.focus,
    inputState: committed.inputState,
    operationId: 'omission.long-dash'
  });
  assert.equal(omission.status, 'applied', omission.announcement);
  assert.match(omission.document.mathml, /data-omniya-nemeth-intent="omission-long-dash"/);
});

test('Rule 8.4 plural and possessive endings append to the focused local expression', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠭', '⠘', '⠁', '⠸', '⠄', '⠎']) {
    let result = cell(document, focus, inputState, value);
    if (result.status === 'choice') {
      const selected = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: 'script.possessive' });
      assert.equal(selected.status, 'applied', selected.announcement);
      ({ document, focus, inputState } = selected);
      continue;
    }
    if (result.status === 'pending' && result.inputState.prefix === '⠸⠄⠎') {
      result = commitNemethLocalCode({ document: result.document, focus: result.focus, inputState: result.inputState });
    }
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  let tree = parseMathML(document.mathml);
  assert.equal(tree.children.at(-2).name, 'mo');
  assert.equal(tree.children.at(-2).children[0].text, '′');
  assert.equal(tree.children.at(-1).name, 'mi');
  assert.equal(tree.children.at(-1).children[0].text, 's');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const value of ['⠭']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  let plural = cell(document, focus, inputState, '⠎');
  if (plural.status === 'choice') {
    plural = applyNemethChoice({ document: plural.document, focus: plural.focus, inputState: plural.inputState, operationId: 'plural.s' });
  }
  if (plural.status === 'pending' && plural.inputState.prefix === '⠎') {
    plural = commitNemethLocalCode({ document: plural.document, focus: plural.focus, inputState: plural.inputState });
  }
  if (plural.status === 'choice') {
    plural = applyNemethChoice({ document: plural.document, focus: plural.focus, inputState: plural.inputState, operationId: 'plural.s' });
  }
  assert.equal(plural.status, 'applied', plural.announcement);
  tree = parseMathML(plural.document.mathml);
  assert.equal(tree.children.at(-1).children[0].text, 's');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const value of ['⠭', '⠘', '⠁']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  plural = cell(document, focus, inputState, '⠎');
  if (plural.status === 'pending') plural = commitNemethLocalCode({ document: plural.document, focus: plural.focus, inputState: plural.inputState });
  if (plural.status === 'choice') plural = applyNemethChoice({ document: plural.document, focus: plural.focus, inputState: plural.inputState, operationId: 'plural.s' });
  assert.equal(plural.status, 'applied', plural.announcement);
  tree = parseMathML(plural.document.mathml);
  assert.equal(tree.children.at(-1).name, 'mi');
  assert.equal(tree.children.at(-1).children[0].text, 's');
  assert.equal(tree.children.at(-2).name, 'msup');
});

test('Rule 16.3 nested radical order builds and closes a local inner radical', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠜', '⠭', '⠬']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  let result = cell(document, focus, inputState, '⠨');
  assert.equal(result.status, 'pending');
  result = cell(result.document, result.focus, result.inputState, '⠜');
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠽');
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠨');
  assert.equal(result.status, 'pending');
  result = cell(result.document, result.focus, result.inputState, '⠻');
  assert.equal(result.status, 'applied', result.announcement);
  const root = parseMathML(result.document.mathml);
  assert.equal(root.children[0].name, 'msqrt');
  assert.equal(root.children[0].children[0].name, 'mrow');
});

test('indexed radicals preserve MathML child order while following Nemeth entry order', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠣', '⠼', '⠆', '⠌', '⠁', '⠻']) {
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
  const committed = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(committed.status, 'applied', committed.announcement);
  ({ document, focus, inputState } = committed);
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'msubsup');
  assert.equal(tree.children[0].children.length, 3);
  const move = cell(document, focus, inputState, '⠰');
  assert.equal(move.status, 'applied');
  assert.equal(parseMathML(move.document.mathml).children[0].attrs['data-omniya-id'], tree.children[0].attrs['data-omniya-id']);
});

test('Rule 14.4.4 four-level script chains compose through the same bounded operation', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠭']) {
    const result = cell(document, focus, inputState, value);
    assert.equal(result.status, 'applied');
    ({ document, focus, inputState } = result);
  }
  for (const value of ['⠘', '⠘', '⠘', '⠘']) {
    const result = cell(document, focus, inputState, value);
    assert.equal(result.status, 'pending');
    ({ document, focus, inputState } = result);
  }
  const committed = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(committed.status, 'applied', committed.announcement);
  const tree = parseMathML(committed.document.mathml);
  let depth = 0;
  let node = tree.children[0];
  while (node?.name === 'msup') {
    depth += 1;
    node = node.children[0];
  }
  assert.equal(depth, 4);
  assert.equal(committed.focus.kind, 'node');
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

test('BANA 7.3.5 expression typeforms use bounded MathML scope operations', () => {
  const cases = [
    ['⠠⠄⠸', '⠸⠠⠄', 'bold'],
    ['⠠⠄⠨', '⠨⠠⠄', 'italic']
  ];
  for (const [open, close, mathvariant] of cases) {
    let document = createEmptyDraftMathDocument();
    let focus = focusOf(document);
    let inputState = { prefix: '', mode: null };
    for (const currentCell of [...open]) {
      const result = cell(document, focus, inputState, currentCell);
      assert.notEqual(result.status, 'rejected', result.announcement);
      ({ document, focus, inputState } = result);
    }
    let committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', committed.announcement);
    ({ document, focus, inputState } = committed);
    for (const currentCell of ['⠁', '⠬', '⠃']) {
      const result = cell(document, focus, inputState, currentCell);
      assert.notEqual(result.status, 'rejected', result.announcement);
      ({ document, focus, inputState } = result);
    }
    const tree = parseMathML(document.mathml);
    assert.equal(tree.children[0].name, 'mstyle');
    assert.equal(tree.children[0].attrs.mathvariant, mathvariant);
    assert.equal(tree.children[0].children[0].name, 'mrow');
    for (const currentCell of [...close]) {
      const result = cell(document, focus, inputState, currentCell);
      assert.notEqual(result.status, 'rejected', result.announcement);
      ({ document, focus, inputState } = result);
    }
    committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied');
    const closed = parseMathML(committed.document.mathml);
    assert.equal(closed.children[0].name, 'mstyle');
    assert.equal(closed.children[0].children[0].children[0].children[0].text, 'a');
    assert.equal(closed.children[0].children[0].children[2].children[0].text, 'b');
  }
});

test('typeform scope terminators reject outside a marked scope without mutation', () => {
  const document = createEmptyDraftMathDocument();
  const result = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠸' });
  assert.equal(result.status, 'pending');
  const next = applyNemethCell({ document, focus: document.focus, inputState: result.inputState, cell: '⠠' });
  assert.equal(next.status, 'pending');
  const close = applyNemethCell({ document, focus: document.focus, inputState: next.inputState, cell: '⠄' });
  assert.equal(close.status, 'rejected');
  assert.equal(close.document.mathml, document.mathml);
});

test('numeric and capital indicators are local modes, not passage parsing', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠼', '⠂', '⠆']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  // A new local token starts a separate indicator context. This is deliberate:
  // the guided editor never tries to infer a complete passage-level numeric
  // run from an unrestricted input buffer.
  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  let result = cell(document, focus, inputState, '⠠');
  assert.equal(result.status, 'pending');
  const choice = commitNemethLocalCode({ document, focus, inputState: result.inputState });
  assert.equal(choice.status, 'choice');
  const capital = choice.choices.find((item) => item.operationId === 'indicator.capital');
  assert.ok(capital, 'capital indicator must remain an explicit local choice when its cell is also punctuation');
  result = applyNemethChoice({ document, focus, inputState: choice.inputState, operationId: capital.operationId });
  assert.notEqual(result.status, 'rejected', result.announcement);
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠉');
  assert.notEqual(result.status, 'rejected', result.announcement);
  ({ document, focus, inputState } = result);
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.filter((node) => node.name !== 'mspace').map((node) => node.children[0].text), ['C']);
});

test('Rule 3 uses lower-cell Nemeth digits and keeps a numeric run local', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠼', '⠂', '⠒', '⠨', '⠲']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'mn');
  assert.equal(tree.children[0].children[0].text, '13.4');
  assert.equal(inputState.mode, 'numeric');
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
  assert.equal(registry.get('arrow.right').commitPolicy, 'immediate');
  assert.equal(registry.get('arrow.right.uncontracted').commitPolicy, 'atomic-sequence');
  assert.equal(registry.get('script.superscript').commitPolicy, 'immediate');
  assert.equal(registry.get('fraction.next.denominator').commitPolicy, 'structural-followup');
  assert.ok(operationRegistry().every((entry) => ['immediate', 'atomic-sequence', 'structural-followup'].includes(entry.commitPolicy)));

  // The policy is a registry property, not an arrow/integral special case.
  // Check representative rows from notation families that use each local
  // behavior, so adding a new BANA mapping cannot silently bypass the shared
  // input contract.
  for (const id of [
    'letter.a', 'operator.plus', 'radical.square', 'script.superscript',
    'arrow.right', 'shape.diamond', 'punctuation.period', 'function.sin',
    'fraction.next.denominator', 'fraction.end.simple', 'integral.superpose.circle',
    'modifier.directly-over'
  ]) assert.ok(registry.get(id), `missing representative registry row: ${id}`);
  assert.ok(operationRegistry().some((entry) => entry.commitPolicy === 'immediate' && entry.action === 'insert-token'));
  assert.ok(operationRegistry().some((entry) => entry.commitPolicy === 'atomic-sequence' && entry.action === 'insert-token'));
  assert.ok(operationRegistry().some((entry) => entry.commitPolicy === 'structural-followup' && ['move-slot', 'close-structure', 'superpose-integral', 'simultaneous-modifier'].includes(entry.action)));
});

test('an atomic local code waits for Enter and then applies exactly once', () => {
  const document = createEmptyDraftMathDocument();
  let state = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus: document.focus, inputState: state, cell: '⠫' });
  assert.equal(result.status, 'pending');
  assert.equal(result.document.mathml, document.mathml);
  state = result.inputState;
  for (const cell of ['⠒', '⠒', '⠕']) result = applyNemethCell({ document, focus: document.focus, inputState: result.inputState, cell });
  assert.equal(result.status, 'pending');
  assert.equal(result.document.mathml, document.mathml);
  const committed = commitNemethLocalCode({ document, focus: document.focus, inputState: result.inputState });
  assert.equal(committed.status, 'applied');
  assert.match(committed.document.mathml, />→</);
  assert.equal(committed.inputState.prefix, '');
});

test('a complete ordinary arrow is immediate while a compound arrow remains bounded', () => {
  const document = createEmptyDraftMathDocument();
  let result = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠫' });
  assert.equal(result.status, 'pending');
  result = applyNemethCell({ document: result.document, focus: result.focus, inputState: result.inputState, cell: '⠕' });
  assert.equal(result.status, 'applied');
  assert.equal(parseMathML(result.document.mathml).children[0].children[0].text, '→');

  let state = { prefix: '', mode: null };
  const compound = createEmptyDraftMathDocument();
  result = applyNemethCell({ document: compound, focus: compound.focus, inputState: state, cell: '⠫' });
  for (const cell of ['⠒', '⠒', '⠕']) {
    result = applyNemethCell({ document: result.document, focus: result.focus, inputState: result.inputState, cell });
    assert.equal(result.status, 'pending');
  }
  assert.equal(result.document.mathml, compound.mathml);
  const committed = commitNemethLocalCode({ document: result.document, focus: result.focus, inputState: result.inputState });
  assert.equal(committed.status, 'applied');
  assert.equal(parseMathML(committed.document.mathml).children[0].children[0].text, '→');
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
  // ⠁ now correctly begins the BANA 17.1 arc construction ($a). Use a cell
  // that is neither a continuation nor a completed local code instead.
  const badNext = applyNemethCell({ document, focus: document.focus, inputState: pending.inputState, cell: '⠼' });
  assert.equal(badNext.status, 'rejected');
  assert.equal(badNext.document.mathml, document.mathml);
  assert.equal(badNext.inputState.prefix, pending.inputState.prefix);
});

test('punctuation and Greek symbols remain declarative token mappings', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const [index, value] of ['⠨', '⠏', '⠸', '⠲'].entries()) {
    let result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    if (index === 3 && result.status === 'pending' && result.inputState.prefix) {
      result = commitNemethLocalCode({ document, focus, inputState: result.inputState });
    }
    if (result.status === 'applied') ({ document, focus, inputState } = result);
    else inputState = result.inputState;
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].children[0].text, 'π');
  assert.equal(tree.children[1].children[0].text, '.');
});
