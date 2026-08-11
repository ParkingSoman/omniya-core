import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMathTransition,
  completionReport,
  createEmptyMathDocument,
  deriveNemethContext
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
