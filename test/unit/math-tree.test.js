import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeMathML, completionReport, findMathNode, mathAddressForNode, parseMathML, replaceMathTarget, serializeMathML, structuralEquivalent } from '../../src/domain/math-tree.js';

test('canonical MathML assigns stable IDs and strips runtime attributes', () => {
  const source = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow data-semantic-id="2"><mi data-omniya-id="keep">x</mi><mo data-latex="+">+</mo></mrow></math>';
  const first = canonicalizeMathML(source);
  const second = canonicalizeMathML(first);
  assert.match(first, /data-omniya-id="keep"/);
  assert.doesNotMatch(first, /data-semantic/);
  assert.equal(first, second);
});

test('node replacement inherits the focused stable ID', () => {
  const tree = parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math>');
  const row = tree.children[0];
  const target = mathAddressForNode(row.children[0]);
  const replacement = parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>z</mi></math>');
  const next = replaceMathTarget(tree, target, replacement.children[0]);
  assert.equal(next.children[0].children[0].attrs['data-omniya-id'], target.nodeId);
  assert.equal(next.children[0].children[0].children[0].text, 'z');
  assert.ok(structuralEquivalent(tree, parseMathML(serializeMathML(tree))));
});

test('ranges replace exact contiguous siblings', () => {
  const tree = parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math>');
  const row = tree.children[0];
  const replacement = parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>q</mi></mrow></math>');
  const next = replaceMathTarget(tree, { kind: 'range', parentNodeId: row.attrs['data-omniya-id'], firstNodeId: row.children[0].attrs['data-omniya-id'], lastNodeId: row.children[1].attrs['data-omniya-id'] }, replacement.children[0]);
  assert.equal(next.children[0].children.length, 2);
  assert.equal(next.children[0].children[0].children[0].children[0].text, 'q');
  assert.ok(findMathNode(next, row.attrs['data-omniya-id']));
});

test('range replacement inherits the first selected identity as its focus anchor', () => {
  const tree = parseMathML('<math><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow></math>');
  const row = tree.children[0];
  const first = row.children[0].attrs['data-omniya-id'];
  const last = row.children[2].attrs['data-omniya-id'];
  const replacement = parseMathML('<math><mrow><mi>x</mi><mo>−</mo><mi>y</mi></mrow></math>').children[0];
  const next = replaceMathTarget(tree, {
    kind: 'range',
    parentNodeId: row.attrs['data-omniya-id'],
    firstNodeId: first,
    lastNodeId: last
  }, replacement);
  assert.equal(next.children[0].children[0].attrs['data-omniya-id'], first);
  assert.equal(next.children[0].children[0].children[0].children[0].text, 'x');
});

test('canonical tree preserves multiscript vocabulary and derives required holes', () => {
  const tree = parseMathML('<math><mmultiscripts><mi>x</mi><mrow data-omniya-hole="true"><mspace width="1em"/></mrow><none/><mprescripts/><mrow data-omniya-hole="true"><mspace width="1em"/></mrow><mi>i</mi></mmultiscripts></math>');
  assert.equal(tree.children[0].name, 'mmultiscripts');
  assert.equal(completionReport(tree).complete, false);
  assert.ok(completionReport(tree).holes.some((hole) => hole.role === 'content'));
});

test('canonical parser removes formatting whitespace text nodes', () => {
  const tree = parseMathML('<math>\n  <mfrac>\n    <mrow><mi>a</mi></mrow>\n    <mrow><mi>b</mi></mrow>\n  </mfrac>\n</math>');
  assert.deepEqual(tree.children.map((child) => child.name), ['mfrac']);
  assert.deepEqual(tree.children[0].children.map((child) => child.name), ['mrow', 'mrow']);
});
