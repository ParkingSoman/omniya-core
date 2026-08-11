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

test('structural holes persist with the wrapper owner identity', () => {
  const source = documentWithRow();
  const targetId = source.focus.nodeId;
  const result = applyMathTransition({ document: source, focus: source.focus, inputState: { pendingCells: [] }, input: { kind: 'command', operationId: 'fraction.insert.simple' } });
  assert.equal(result.status, 'applied');
  const tree = parseMathML(result.document.mathml);
  const fraction = tree.children[0].children[0];
  assert.equal(fraction.attrs['data-omniya-id'], targetId);
  for (const child of fraction.children.filter((node) => node.attrs['data-omniya-hole'] === 'true')) assert.equal(child.attrs['data-omniya-owner'], targetId);
});

test('deleting focused required content creates a hole and keeps its owner', () => {
  const source = documentWithRow();
  const result = applyMathTransition({ document: source, focus: source.focus, inputState: { pendingCells: [] }, input: { kind: 'command', operationId: 'fraction.insert.simple' } });
  const tree = parseMathML(result.document.mathml);
  const numerator = result.focus;
  const filled = applyMathTransition({ document: result.document, focus: numerator, inputState: result.inputState, input: { kind: 'nemeth-cell', cell: '⠵' } });
  const deleted = applyMathTransition({ document: filled.document, focus: filled.focus, inputState: filled.inputState, input: { kind: 'command', operationId: 'delete.focused' } });
  assert.equal(deleted.status, 'applied');
  const next = parseMathML(deleted.document.mathml);
  const fraction = next.children[0].children[0];
  assert.equal(fraction.children[0].attrs['data-omniya-hole'], 'true');
  assert.equal(fraction.children[0].attrs['data-omniya-owner'], fraction.attrs['data-omniya-id']);
  assert.equal(deleted.focus.nodeId, fraction.children[0].attrs['data-omniya-id']);
});

test('numeric indicator keeps a bounded numeric mode for adjacent digits', () => {
  const document = createEmptyMathDocument();
  const root = parseMathML(document.mathml);
  let result = applyMathTransition({ document, focus: { kind: 'node', nodeId: root.attrs['data-omniya-id'] }, inputState: { pendingCells: [] }, input: { kind: 'nemeth-cell', cell: '⠼' } });
  assert.equal(result.status, 'pending');
  result = applyMathTransition({ document, focus: { kind: 'node', nodeId: root.attrs['data-omniya-id'] }, inputState: result.inputState, input: { kind: 'nemeth-cell', cell: '⠁' } });
  result = applyMathTransition({ document: result.document, focus: result.focus, inputState: result.inputState, input: { kind: 'nemeth-cell', cell: '⠃' } });
  assert.equal(result.status, 'applied');
  assert.match(result.document.mathml, />12<\/mn>/);
});

test('computer-Braille ASCII builds a complete numeric expression without splitting the number', () => {
  let document = createEmptyMathDocument();
  let focus = parseMathML(document.mathml).children[0];
  let inputState = { pendingCells: [] };
  for (const cell of ['#', 'a', 'b', '+', '#', 'c']) {
    const result = applyMathTransition({ document, focus: { kind: 'node', nodeId: focus.attrs['data-omniya-id'] }, inputState, input: { kind: 'nemeth-cell', cell } });
    if (result.status === 'pending') { inputState = result.inputState; continue; }
    assert.equal(result.status, 'applied', result.announcement);
    document = result.document;
    focus = parseMathML(document.mathml).children.find((node) => node.attrs['data-omniya-id'] === result.focus.nodeId) ?? parseMathML(document.mathml).children[0];
    inputState = result.inputState;
  }
  assert.match(document.mathml, /<mn[^>]*>12<\/mn><mo[^>]*>\+<\/mo><mn[^>]*>3<\/mn>/);
});

test('BANA multi-cell comparisons and Greek indicators resolve to their MathML symbols', () => {
  const empty = createEmptyMathDocument();
  const root = parseMathML(empty.mathml).children[0];
  let result = applyMathTransition({ document: empty, focus: { kind: 'node', nodeId: root.attrs['data-omniya-id'] }, inputState: { pendingCells: [] }, input: { kind: 'nemeth-cell', cell: '⠨' } });
  assert.equal(result.status, 'pending');
  result = applyMathTransition({ document: empty, focus: { kind: 'node', nodeId: root.attrs['data-omniya-id'] }, inputState: result.inputState, input: { kind: 'nemeth-cell', cell: '⠏' } });
  assert.equal(result.status, 'applied');
  assert.match(result.document.mathml, />π<\/mi>/);

  const greater = applyMathTransition({ document: result.document, focus: result.focus, inputState: result.inputState, input: { kind: 'nemeth-cell', cell: '⠨' } });
  assert.equal(greater.status, 'pending');
  const completed = applyMathTransition({ document: result.document, focus: result.focus, inputState: greater.inputState, input: { kind: 'nemeth-cell', cell: '⠂' } });
  assert.equal(completed.status, 'applied');
  assert.match(completed.document.mathml, />&gt;<\/mo>/);
});

test('capital indicator remains distinct from the capital-sigma operator sequence', () => {
  const empty = createEmptyMathDocument();
  const rootId = parseMathML(empty.mathml).children[0].attrs['data-omniya-id'];
  let capital = applyMathTransition({ document: empty, focus: { kind: 'node', nodeId: rootId }, inputState: { pendingCells: [] }, input: { kind: 'nemeth-cell', cell: '⠠' } });
  assert.equal(capital.status, 'pending');
  capital = applyMathTransition({ document: empty, focus: { kind: 'node', nodeId: rootId }, inputState: capital.inputState, input: { kind: 'nemeth-cell', cell: '⠁' } });
  assert.equal(capital.status, 'applied');
  assert.match(capital.document.mathml, />A<\/mi>/);

  let sigma = applyMathTransition({ document: empty, focus: { kind: 'node', nodeId: rootId }, inputState: { pendingCells: [] }, input: { kind: 'nemeth-cell', cell: '⠠' } });
  sigma = applyMathTransition({ document: empty, focus: { kind: 'node', nodeId: rootId }, inputState: sigma.inputState, input: { kind: 'nemeth-cell', cell: '⠎' } });
  assert.equal(sigma.status, 'applied');
  assert.match(sigma.document.mathml, />∑<\/mo>/);
});

test('baseline indicator closes a script while less-than remains a separate multi-cell sequence', () => {
  const source = documentWithRow();
  let script = applyMathTransition({ document: source, focus: source.focus, inputState: { pendingCells: [] }, input: { kind: 'command', operationId: 'script.superscript' } });
  assert.equal(script.status, 'applied');
  const exponentId = script.focus.nodeId;
  script = applyMathTransition({ document: script.document, focus: { kind: 'node', nodeId: exponentId }, inputState: script.inputState, input: { kind: 'nemeth-cell', cell: '⠐' } });
  assert.equal(script.status, 'applied');
  assert.equal(deriveNemethContext(script.document, script.focus).nodeName, 'mrow');
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
