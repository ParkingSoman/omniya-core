import assert from 'node:assert/strict';
import test from 'node:test';

import { convertLatexToMathML } from '../../src/main/mathml.js';
import { importLatex } from '../../src/main/math-service.js';
import { parseMathML } from '../../src/domain/math-tree.js';
import {
  previewDraftMathML,
  setLatexSource,
  setNemethSource,
  startReplacementSession
} from '../../src/domain/replacement-session.js';

async function sessionOver(latex, method) {
  const document = await importLatex(latex);
  const tree = parseMathML(document.mathml);
  return {
    document,
    session: startReplacementSession({
      document,
      target: { kind: 'node', nodeId: tree.children[2].attrs['data-omniya-id'] },
      explorerFocus: null,
      method
    })
  };
}

const newSession = (method) => startReplacementSession({
  document: null,
  target: { kind: 'node', nodeId: 'omniya-preview' },
  method
});

test('a LaTeX draft previews as the MathML of the new part only', async () => {
  const { session } = await sessionOver('x+x', 'latex');
  const draft = setLatexSource(session, 'a^2+b');
  const mathml = await previewDraftMathML(draft, { convertLatexToMathML });
  const tree = parseMathML(mathml);
  assert.equal(tree.name, 'math');
  assert.equal(tree.children[0].name, 'msup');
  assert.equal(tree.children.length, 3, 'a^2, +, b');
  assert.ok(!/>x</.test(mathml), 'nothing of the original equation');
});

test('a Nemeth draft previews through the same converter', async () => {
  const draft = setNemethSource(newSession('nemeth'), '?a/b#');
  const seen = [];
  const mathml = await previewDraftMathML(draft, {
    convertLatexToMathML: (latex) => { seen.push(latex); return convertLatexToMathML(latex); },
    brailleInputTable: 'en-us-comp8'
  });
  assert.equal(seen.length, 1);
  assert.match(seen[0], /frac/);
  assert.equal(parseMathML(mathml).children[0].name, 'mfrac');
});

test('an empty draft throws, for LaTeX and for Nemeth', async () => {
  await assert.rejects(
    () => previewDraftMathML(newSession('latex'), { convertLatexToMathML }), /empty/i);
  await assert.rejects(
    () => previewDraftMathML(setLatexSource(newSession('latex'), '   '), { convertLatexToMathML }), /empty/i);
  await assert.rejects(
    () => previewDraftMathML(newSession('nemeth'), { convertLatexToMathML }), /empty/i);
});

test('an unfinished LaTeX draft rejects when the converter rejects', async () => {
  const draft = setLatexSource(newSession('latex'), '\\frac{a');
  const failing = async () => { throw new Error('Missing close brace'); };
  await assert.rejects(() => previewDraftMathML(draft, { convertLatexToMathML: failing }), /Missing close brace/);
});

test('previewing never changes the session or its document', async () => {
  const { document, session } = await sessionOver('x+x', 'latex');
  const draft = setLatexSource(session, 'a^2+b');
  const sessionBefore = structuredClone(draft);
  const documentBefore = structuredClone(document);
  await previewDraftMathML(draft, { convertLatexToMathML });
  await previewDraftMathML(draft, { convertLatexToMathML });
  assert.deepEqual(draft, sessionBefore);
  assert.deepEqual(document, documentBefore);
});
