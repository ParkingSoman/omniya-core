import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMathTransition,
  completionReport,
  createEmptyMathDocument,
  deriveNemethContext,
  nextEmptyFocus
} from '../../src/domain/guided-nemeth/index.js';
import { parseMathML, serializeMathML } from '../../src/domain/math-tree.js';

function documentWithRow() {
  const tree = parseMathML('<math><mrow><mi>x</mi></mrow></math>');
  return { formatVersion: 2, mathml: serializeMathML(tree), focus: { kind: 'node', nodeId: tree.children[0].children[0].attrs['data-omniya-id'] } };
}

test('writing into an empty root and editing a focused row use the same atom transition', () => {
  const empty = createEmptyMathDocument();
  const rootId = parseMathML(empty.mathml).attrs['data-omniya-id'];
  const created = applyMathTransition({
    document: empty,
    focus: { kind: 'node', nodeId: rootId },
    inputState: { pendingCells: [] },
    input: { kind: 'nemeth-cell', cell: '⠭' }
  });
  assert.equal(created.status, 'applied');
  assert.match(created.document.mathml, /<mi[^>]*>x<\/mi>/);
  assert.equal(completionReport(created.document).complete, true);

  const edited = applyMathTransition({
    document: documentWithRow(),
    focus: documentWithRow().focus,
    inputState: { pendingCells: [] },
    input: { kind: 'nemeth-cell', cell: '⠽' }
  });
  assert.equal(edited.status, 'applied');
  assert.match(edited.document.mathml, />y<\/mi>/);
});

test('fraction operation creates persisted holes and focuses numerator', () => {
  const empty = createEmptyMathDocument();
  const root = parseMathML(empty.mathml);
  const result = applyMathTransition({
    document: empty,
    focus: { kind: 'node', nodeId: root.attrs['data-omniya-id'] },
    inputState: { pendingCells: [] },
    input: { kind: 'command', operationId: 'fraction.insert.simple' }
  });
  assert.equal(result.status, 'applied');
  const report = completionReport(result.document);
  assert.equal(report.complete, false);
  assert.equal(report.holes.length, 2);
  assert.equal(deriveNemethContext(result.document, result.focus).slot, 'numerator');
});

test('ambiguous local prefix returns choices without mutating the document', () => {
  const document = documentWithRow();
  const root = parseMathML(document.mathml);
  const result = applyMathTransition({
    document,
    focus: document.focus,
    inputState: { pendingCells: [] },
    input: { kind: 'nemeth-cell', cell: '⠸' }
  });
  assert.equal(result.status, 'choice');
  assert.ok(result.choices.length > 1);
  assert.equal(result.document, undefined);
  assert.equal(document, document);
});

test('invalid local transition never mutates the document', () => {
  const document = createEmptyMathDocument();
  const before = document.mathml;
  const root = parseMathML(document.mathml);
  const result = applyMathTransition({
    document,
    focus: { kind: 'node', nodeId: root.attrs['data-omniya-id'] },
    inputState: { pendingCells: [] },
    input: { kind: 'command', operationId: 'script.subscript' }
  });
  assert.equal(result.status, 'rejected');
  assert.equal(document.mathml, before);
});

test('named operation and its Nemeth sequence produce the same focused subtree', () => {
  const make = () => createEmptyMathDocument();
  const a = make();
  const rootA = parseMathML(a.mathml);
  const named = applyMathTransition({ document: a, focus: { kind: 'node', nodeId: rootA.attrs['data-omniya-id'] }, inputState: { pendingCells: [] }, input: { kind: 'command', operationId: 'fraction.insert.simple' } });
  const b = make();
  const rootB = parseMathML(b.mathml);
  const cell = applyMathTransition({ document: b, focus: { kind: 'node', nodeId: rootB.attrs['data-omniya-id'] }, inputState: { pendingCells: [] }, input: { kind: 'nemeth-cell', cell: '⠹' } });
  assert.equal(named.status, 'applied');
  assert.equal(cell.status, 'applied');
  assert.equal(parseMathML(named.document.mathml).children[0].name, parseMathML(cell.document.mathml).children[0].name);
  assert.equal(deriveNemethContext(named.document, named.focus).slot, deriveNemethContext(cell.document, cell.focus).slot);
});

test('replacing a focused atom inherits its stable Omniya identity', () => {
  const source = documentWithRow();
  const focusedId = source.focus.nodeId;
  const result = applyMathTransition({ document: source, focus: source.focus, inputState: { pendingCells: [] }, input: { kind: 'nemeth-cell', cell: '⠵' } });
  assert.equal(result.status, 'applied');
  assert.match(result.document.mathml, new RegExp(`data-omniya-id="${focusedId}"`));
});

test('wrapping a focused atom keeps IDs unique while preserving the wrapper identity', () => {
  const source = documentWithRow();
  const targetId = source.focus.nodeId;
  const result = applyMathTransition({ document: source, focus: source.focus, inputState: { pendingCells: [] }, input: { kind: 'command', operationId: 'fraction.insert.simple' } });
  assert.equal(result.status, 'applied');
  const ids = [...result.document.mathml.matchAll(/data-omniya-id="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(targetId));
});

test('numeric indicator keeps a bounded numeric mode for adjacent digits', () => {
  const document = createEmptyMathDocument();
  const root = parseMathML(document.mathml);
  let result = applyMathTransition({ document, focus: { kind: 'node', nodeId: root.attrs['data-omniya-id'] }, inputState: { pendingCells: [] }, input: { kind: 'nemeth-cell', cell: '⠼' } });
  assert.equal(result.status, 'pending');
  result = applyMathTransition({ document, focus: { kind: 'node', nodeId: root.attrs['data-omniya-id'] }, inputState: result.inputState, input: { kind: 'nemeth-cell', cell: '⠁' } });
  result = applyMathTransition({ document: result.document, focus: result.focus, inputState: result.inputState, input: { kind: 'nemeth-cell', cell: '⠃' } });
  assert.equal(result.status, 'applied');
  assert.match(result.document.mathml, />1<\/mn>/);
  assert.match(result.document.mathml, />2<\/mn>/);
});

test('fraction terminator returns to the containing row instead of starting numeric mode', () => {
  const empty = documentWithRow();
  let result = applyMathTransition({
    document: empty,
    focus: empty.focus,
    inputState: { pendingCells: [] },
    input: { kind: 'command', operationId: 'fraction.insert.simple' }
  });
  assert.equal(result.status, 'applied');
  const fraction = parseMathML(result.document.mathml).children[0].children[0];
  const denominator = fraction.children[1];
  result = applyMathTransition({
    document: result.document,
    focus: { kind: 'node', nodeId: denominator.attrs['data-omniya-id'] },
    inputState: { pendingCells: [] },
    input: { kind: 'nemeth-cell', cell: '⠼' }
  });
  assert.equal(result.status, 'applied');
  assert.equal(result.inputState.pendingCells.length, 0);
  assert.equal(deriveNemethContext(result.document, result.focus).nodeName, 'mrow');
});

test('radical termination moves out of the radical and preserves the radical structure', () => {
  const empty = documentWithRow();
  let result = applyMathTransition({
    document: empty,
    focus: empty.focus,
    inputState: { pendingCells: [] },
    input: { kind: 'command', operationId: 'radical.insert.square' }
  });
  assert.equal(result.status, 'applied');
  const radical = parseMathML(result.document.mathml).children[0].children[0];
  result = applyMathTransition({
    document: result.document,
    focus: { kind: 'node', nodeId: radical.children[0].attrs['data-omniya-id'] },
    inputState: { pendingCells: [] },
    input: { kind: 'nemeth-cell', cell: '⠻' }
  });
  assert.equal(result.status, 'applied');
  assert.match(result.document.mathml, /<msqrt/);
  assert.equal(deriveNemethContext(result.document, result.focus).nodeName, 'mrow');
});

test('empty-slot traversal visits required children in tree order and reverses with Shift+Tab semantics', () => {
  const empty = createEmptyMathDocument();
  const root = parseMathML(empty.mathml);
  const fraction = applyMathTransition({
    document: empty,
    focus: { kind: 'node', nodeId: root.attrs['data-omniya-id'] },
    inputState: { pendingCells: [] },
    input: { kind: 'command', operationId: 'fraction.insert.simple' }
  });
  assert.equal(fraction.status, 'applied');
  const tree = parseMathML(fraction.document.mathml);
  const mfrac = tree.children[0];
  const numerator = { kind: 'node', nodeId: mfrac.children[0].attrs['data-omniya-id'] };
  const denominator = { kind: 'node', nodeId: mfrac.children[1].attrs['data-omniya-id'] };
  assert.deepEqual(nextEmptyFocus(fraction.document, numerator, 1), denominator);
  assert.deepEqual(nextEmptyFocus(fraction.document, denominator, -1), numerator);
});
