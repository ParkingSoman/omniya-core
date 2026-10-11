import assert from 'node:assert/strict';
import test from 'node:test';

import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { Node as PMNode } from 'prosemirror-model';

import { backspaceSelectsMath, deleteSelectsMath } from '../../src/renderer/editor/commands.js';
import { editorSchema } from '../../src/renderer/editor/schema.js';
import { docPlainText, itemsToDoc, validateDoc } from '../../src/domain/document.js';

const XSQ = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math>';

// "a" is at 1-2, the equation at 2-3, "b" at 3-4.
const doc = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [
      { type: 'text', text: 'a' },
      { type: 'math', attrs: { mathml: XSQ, source: 'x^2', sourceKind: 'latex' } },
      { type: 'text', text: 'b' }
    ]
  }]
};

// What is written to disk: JSON text. (ProseMirror's own objects have a different
// prototype, which `deepEqual` would report even when the content is the same.)
const asSaved = (node) => JSON.parse(JSON.stringify(node.toJSON()));

function stateWith(selection) {
  const base = EditorState.create({ schema: editorSchema, doc: PMNode.fromJSON(editorSchema, doc) });
  return selection(base);
}

const caretAt = (pos) => (state) => state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));

function run(command, state) {
  let dispatched = null;
  const handled = command(state, (tr) => { dispatched = tr; });
  return { handled, selection: dispatched?.selection ?? null };
}

test('the editor schema and the saved document shape agree', () => {
  // Domain JSON -> editor -> JSON comes back identical, so nothing is added or lost on save.
  const roundTripped = asSaved(PMNode.fromJSON(editorSchema, doc));
  assert.deepEqual(roundTripped, doc);
  assert.deepEqual(validateDoc(roundTripped), []);
  assert.equal(docPlainText(roundTripped), 'ax^2b');
});

test('a document upgraded from items is a document the editor accepts', () => {
  const upgraded = itemsToDoc([
    { id: 't', type: 'text', source: 'one\ntwo', note: 'a note', mathml: null },
    { id: 'e', type: 'equation', note: '', math: { formatVersion: 2, mathml: XSQ, focus: null } }
  ]);
  const node = PMNode.fromJSON(editorSchema, upgraded);
  node.check();
  assert.deepEqual(asSaved(node), upgraded);
});

test('the editor refuses a document the domain would refuse', () => {
  assert.throws(() => PMNode.fromJSON(editorSchema, { type: 'doc', content: [] }).check());
  assert.throws(() => PMNode.fromJSON(editorSchema, { type: 'doc', content: [{ type: 'heading' }] }));
});

test('Backspace right after an equation selects it first, as in Word', () => {
  const { handled, selection } = run(backspaceSelectsMath, stateWith(caretAt(3)));
  assert.equal(handled, true);
  assert.ok(selection instanceof NodeSelection);
  assert.deepEqual([selection.from, selection.to], [2, 3]);
});

test('Delete right before an equation selects it first', () => {
  const { handled, selection } = run(deleteSelectsMath, stateWith(caretAt(2)));
  assert.equal(handled, true);
  assert.ok(selection instanceof NodeSelection);
  assert.deepEqual([selection.from, selection.to], [2, 3]);
});

test('Backspace and Delete leave ordinary text and a selected equation to the default keys', () => {
  // Next to text, not an equation.
  assert.equal(run(backspaceSelectsMath, stateWith(caretAt(2))).handled, false);
  assert.equal(run(deleteSelectsMath, stateWith(caretAt(3))).handled, false);
  // With the equation already selected, the default key deletes it. That is the second press.
  const selected = stateWith((state) => state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 2))));
  assert.equal(run(backspaceSelectsMath, selected).handled, false);
  // A text range is also left alone.
  const range = stateWith((state) => state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 3))));
  assert.equal(run(backspaceSelectsMath, range).handled, false);
});
