import assert from 'node:assert/strict';
import test from 'node:test';

import { convertLatexToMathML } from '../../src/main/mathml.js';
import { importLatex } from '../../src/main/math-service.js';
import { canonicalizeMathML, findMathNode, parseMathML, structuralEquivalent } from '../../src/domain/math-tree.js';
import {
  startReplacementSession,
  submitReplacement,
  setLatexSource,
  setNemethSource
} from '../../src/domain/replacement-session.js';

// An edit must give the tree a fresh parse of the whole expression gives.
// Before, the new part was grafted into the old tree and the explorer's boxes
// followed whatever shape that left (one box round "+ -", for example).

const KEEP = { keepLatex: true };

async function equation(latex, { withLatexAttributes = false } = {}) {
  const document = await importLatex(latex);
  if (!withLatexAttributes) return document;
  return { ...document, mathml: canonicalizeMathML(await convertLatexToMathML(latex), KEEP) };
}

async function edit(document, pick, placement, latex) {
  const tree = parseMathML(document.mathml, KEEP);
  const session = setLatexSource(startReplacementSession({
    document,
    target: { kind: 'node', nodeId: pick(tree).attrs['data-omniya-id'] },
    method: 'latex',
    placement
  }), latex);
  return submitReplacement(session, { convertLatexToMathML });
}

async function assertFresh(committed, expectedLatex) {
  const expected = parseMathML(canonicalizeMathML(await convertLatexToMathML(expectedLatex)));
  const actual = parseMathML(committed.document.mathml);
  assert.ok(
    structuralEquivalent(actual, expected),
    `not the same tree as a fresh parse of ${expectedLatex}:\n${committed.document.mathml}`
  );
}

const last = (tree) => tree.children.at(-1);
const first = (tree) => tree.children[0];

const CASES = [
  ['replace one part with several', 'x+x', (t) => last(t), 'replace', 'a^2+b', 'x+a^2+b'],
  ['replace the whole equation', 'a+b', (t) => t, 'replace', 'x^2+y', 'x^2+y'],
  ['append after the root', 'x^3', (t) => t, 'append', '+3', 'x^3+3'],
  ['prepend before the last part', 'x+y', (t) => last(t), 'prepend', 'z', 'x+zy'],
  ['append inside a superscript', 'x^3', (t) => first(t).children[1], 'append', '+1', 'x^{3+1}'],
  ['prepend inside a fraction part', '\\frac{a}{b}', (t) => first(t).children[1], 'prepend', '2', '\\frac{a}{2b}'],
  ['sign in front of y', 'x+y', (t) => last(t), 'replace', '-y', 'x+-y']
];

for (const withLatexAttributes of [false, true]) {
  const how = withLatexAttributes ? 'stored with data-latex' : 'stored without data-latex';
  for (const [name, start, pick, placement, typed, expected] of CASES) {
    test(`edit gives a fresh parse: ${name} (${how})`, async () => {
      const document = await equation(start, { withLatexAttributes });
      const committed = await edit(document, pick, placement, typed);
      await assertFresh(committed, expected);
    });
  }
}

test('the edit hands back the whole expression as LaTeX', async () => {
  const committed = await edit(await equation('x+y', { withLatexAttributes: true }), last, 'replace', '-y');
  assert.equal(committed.latex.replaceAll(' ', ''), 'x+-y');
});

test('the focus lands on the first thing typed when no box holds all of it', async () => {
  const committed = await edit(await equation('x+y'), last, 'replace', '-y');
  const tree = parseMathML(committed.document.mathml);
  const node = findMathNode(tree, committed.focus.nodeId);
  const text = [];
  const walk = (n) => { if (n.text !== undefined) text.push(n.text); n.children?.forEach(walk); };
  walk(node);
  assert.equal(text.join(''), '−');
});

test('edits can follow one another, and each is a fresh parse', async () => {
  let document = await equation('x+y', { withLatexAttributes: true });
  const replaced = await edit(document, last, 'replace', '-y');
  document = replaced.document;
  const prepended = await edit(document, (t) => findMathNode(t, replaced.focus.nodeId), 'prepend', 'a');
  await assertFresh(prepended, 'x+a-y');
  const appended = await edit(prepended.document, (t) => findMathNode(t, prepended.focus.nodeId), 'append', 'b');
  await assertFresh(appended, 'x+ab-y');
});

test('a Nemeth fragment is placed the same way', async () => {
  const document = await equation('x+y', { withLatexAttributes: true });
  const tree = parseMathML(document.mathml, KEEP);
  // ⠭ is the letter x in Nemeth.
  const session = setNemethSource(startReplacementSession({
    document,
    target: { kind: 'node', nodeId: last(tree).attrs['data-omniya-id'] },
    method: 'nemeth',
    placement: 'append'
  }), '⠭');
  const committed = await submitReplacement(session, { convertLatexToMathML });
  await assertFresh(committed, 'x+yx');
});

test('an expression the writer cannot rebuild still takes the edit', async () => {
  const document = await equation('x+y');
  const rare = { ...document, mathml: document.mathml.replace('<mi', '<mtext').replace('</mi>', '</mtext>') };
  const committed = await edit(rare, last, 'append', '1');
  assert.ok(committed.document.mathml.includes('1'));
});

test('the focus lands on a box that holds exactly what was typed', async () => {
  const committed = await edit(await equation('x+y'), last, 'append', '\\frac{1}{2}');
  const tree = parseMathML(committed.document.mathml);
  assert.equal(findMathNode(tree, committed.focus.nodeId).name, 'mfrac');
});
