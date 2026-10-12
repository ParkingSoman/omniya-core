import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, itemsToDoc, mathNode, validateDoc, docPlainText } from '../../src/domain/document.js';

const XSQ = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math>';
const eq = (id) => ({ id, type: 'equation', note: '', math: { formatVersion: 2, mathml: XSQ, focus: null } });
const txt = (id, source, note = '') => ({ id, type: 'text', source, note, mathml: null });

test('an empty list becomes one empty paragraph, and that is valid', () => {
  assert.deepEqual(itemsToDoc([]), emptyDoc());
  assert.deepEqual(validateDoc(emptyDoc()), []);
});

test('a text item becomes a paragraph, one per line', () => {
  const doc = itemsToDoc([txt('a', 'one\ntwo')]);
  assert.deepEqual(doc.content.map((p) => p.content[0].text), ['one', 'two']);
  assert.deepEqual(validateDoc(doc), []);
});

test('an equation item becomes a paragraph with one math node', () => {
  const doc = itemsToDoc([eq('e')]);
  assert.equal(doc.content.length, 1);
  assert.equal(doc.content[0].content.length, 1);
  assert.equal(doc.content[0].content[0].type, 'math');
  assert.match(doc.content[0].content[0].attrs.mathml, /^<math/);
  assert.equal(doc.content[0].content[0].attrs.sourceKind, 'latex');
  assert.deepEqual(validateDoc(doc), []);
});

test('order is kept, and a note becomes its own paragraph after its item', () => {
  const doc = itemsToDoc([txt('a', 'Solve', 'remember this'), eq('e'), txt('b', 'Done')]);
  assert.deepEqual(
    doc.content.map((p) => (p.content[0].type === 'text' ? p.content[0].text : 'MATH')),
    ['Solve', 'remember this', 'MATH', 'Done'],
  );
});

test('an empty note adds nothing', () => {
  assert.equal(itemsToDoc([txt('a', 'Solve', '   ')]).content.length, 1);
});

test('an equation that cannot be read is kept as a visible placeholder, not dropped', () => {
  const doc = itemsToDoc([{ id: 'x', type: 'equation', note: '', math: { formatVersion: 2, mathml: 'not mathml' } }]);
  assert.match(doc.content[0].content[0].text, /could not be converted/);
  assert.deepEqual(validateDoc(doc), []);
});

test('mathNode rejects input that is not MathML', () => {
  assert.throws(() => mathNode({ mathml: 'x^2' }), TypeError);
});

test('validateDoc names what is wrong', () => {
  assert.match(validateDoc(null)[0], /type doc/);
  assert.match(validateDoc({ type: 'doc', content: [] })[0], /at least one paragraph/);
  assert.match(validateDoc({ type: 'doc', content: [{ type: 'heading' }] })[0], /must be a paragraph/);
  assert.match(validateDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] })[0], /empty text/);
  assert.match(
    validateDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'math', attrs: { mathml: XSQ, source: '', sourceKind: 'braille' } }] }] })[0],
    /sourceKind/,
  );
});

test('docPlainText joins paragraphs with newlines and shows equations by source', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Solve ' }, { type: 'math', attrs: { mathml: XSQ, source: 'x^2', sourceKind: 'latex' } }] },
      { type: 'paragraph' },
    ],
  };
  assert.equal(docPlainText(doc), 'Solve x^2\n');
});
