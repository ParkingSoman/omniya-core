import assert from 'node:assert/strict';
import test from 'node:test';

import { convertLatexToMathML } from '../../src/main/mathml.js';
import { importLatex } from '../../src/main/math-service.js';
import { findMathNode, parseMathML } from '../../src/domain/math-tree.js';
import {
  startReplacementSession,
  cancelReplacement,
  submitReplacement,
  setLatexSource,
  setReplacementMethod
} from '../../src/domain/replacement-session.js';

test('replacement drafts start empty and cancel without mutating the source document', async () => {
  const document = await importLatex('x+x');
  const tree = parseMathML(document.mathml);
  const target = tree.children[2].attrs['data-omniya-id'];
  const session = startReplacementSession({
    document,
    target: { kind: 'node', nodeId: target },
    explorerFocus: { semanticId: '3', speech: 'x', nemeth: '⠭' },
    method: 'latex'
  });

  assert.equal(parseMathML(session.draft.mathml).children.length, 0);
  const cancelled = cancelReplacement(session);
  assert.equal(cancelled.document.mathml, document.mathml);
  assert.deepEqual(cancelled.focus, { kind: 'node', nodeId: target });
});

test('LaTeX replacement spans multiple tokens and commits one exact subtree', async () => {
  const document = await importLatex('x+x');
  const tree = parseMathML(document.mathml);
  const target = tree.children[2].attrs['data-omniya-id'];
  const session = setLatexSource(startReplacementSession({
    document,
    target: { kind: 'node', nodeId: target },
    explorerFocus: null,
    method: 'latex'
  }), 'a^2+b');

  const committed = await submitReplacement(session, { convertLatexToMathML });
  const result = parseMathML(committed.document.mathml);
  assert.equal(result.children[0].children[0].text, 'x');
  assert.equal(result.children[1].children[0].text, '+');
  assert.equal(result.children[2].name, 'mrow');
  assert.equal(result.children[2].children[0].name, 'msup');
  assert.equal(result.children[2].attrs['data-omniya-id'], target);
  assert.deepEqual(committed.focus, { kind: 'node', nodeId: target });
  assert.equal(findMathNode(result, target).name, 'mrow');
});

test('whole-equation replacement preserves the canonical math root identity', async () => {
  const document = await importLatex('a+b');
  const root = parseMathML(document.mathml);
  const target = { kind: 'node', nodeId: root.attrs['data-omniya-id'] };
  const session = setLatexSource(startReplacementSession({ document, target, method: 'latex' }), 'x^2+y');
  const committed = await submitReplacement(session, { convertLatexToMathML });
  const tree = parseMathML(committed.document.mathml);
  assert.equal(tree.attrs['data-omniya-id'], target.nodeId);
  assert.equal(tree.children[0].name, 'msup');
  assert.equal(tree.children.at(-1).children[0].text, 'y');
  assert.deepEqual(committed.focus, target);
});

test('append after the math root keeps the original expression and adds siblings', async () => {
  const document = await importLatex('x^3');
  const root = parseMathML(document.mathml);
  const session = setLatexSource(startReplacementSession({
    document,
    target: { kind: 'node', nodeId: root.attrs['data-omniya-id'] },
    method: 'latex',
    placement: 'append'
  }), '+3');
  const committed = await submitReplacement(session, { convertLatexToMathML });
  const tree = parseMathML(committed.document.mathml);
  assert.equal(tree.attrs['data-omniya-id'], root.attrs['data-omniya-id']);
  assert.equal(tree.children[0].name, 'msup');
  assert.equal(tree.children[0].children[0].children[0].text, 'x');
  assert.equal(tree.children[0].children[1].children[0].text, '3');
  const texts = [];
  const walk = (node) => {
    if (node.text !== undefined) texts.push(node.text);
    node.children?.forEach(walk);
  };
  walk(tree);
  assert.equal(texts.join(''), 'x^3+3'.replace('^', ''));
  assert.ok(texts.includes('+'));
  assert.equal(texts.at(-1), '3');
});

test('prepend before a flexible mrow sibling inserts to the left', async () => {
  const document = await importLatex('x+y');
  const tree = parseMathML(document.mathml);
  const yId = tree.children.at(-1).attrs['data-omniya-id'];
  const session = setLatexSource(startReplacementSession({
    document,
    target: { kind: 'node', nodeId: yId },
    method: 'latex',
    placement: 'prepend'
  }), 'z');
  const committed = await submitReplacement(session, { convertLatexToMathML });
  const next = parseMathML(committed.document.mathml);
  assert.equal(next.children[0].children[0].text, 'x');
  assert.equal(next.children[1].children[0].text, '+');
  assert.equal(next.children[2].children[0].text, 'z');
  assert.equal(next.children[3].children[0].text, 'y');
  assert.equal(next.children[3].attrs['data-omniya-id'], yId);
});

test('append beside a superscript wraps that node instead of breaking msup', async () => {
  const document = await importLatex('x^3');
  const tree = parseMathML(document.mathml);
  const expId = tree.children[0].children[1].attrs['data-omniya-id'];
  const session = setLatexSource(startReplacementSession({
    document,
    target: { kind: 'node', nodeId: expId },
    method: 'latex',
    placement: 'append'
  }), '+1');
  const committed = await submitReplacement(session, { convertLatexToMathML });
  const next = parseMathML(committed.document.mathml);
  const msup = next.children[0];
  assert.equal(msup.name, 'msup');
  assert.equal(msup.children[0].children[0].text, 'x');
  assert.equal(msup.children[1].name, 'mrow');
  assert.equal(msup.children[1].children[0].attrs['data-omniya-id'], expId);
  assert.equal(msup.children[1].children[0].children[0].text, '3');
});

test('an empty LaTeX replacement draft cannot commit', async () => {
  const document = await importLatex('x');
  const tree = parseMathML(document.mathml);
  const target = tree.children[0].attrs['data-omniya-id'];
  const session = startReplacementSession({
    document,
    target: { kind: 'node', nodeId: target },
    explorerFocus: null,
    method: 'latex'
  });

  await assert.rejects(() => submitReplacement(session, { convertLatexToMathML }), /empty/i);
});

test('authoring method can change only before the replacement draft receives input', async () => {
  const document = await importLatex('x');
  const target = parseMathML(document.mathml).children[0].attrs['data-omniya-id'];
  let session = startReplacementSession({ document, target: { kind: 'node', nodeId: target }, method: 'nemeth' });
  session = setReplacementMethod(session, 'latex');
  assert.equal(session.method, 'latex');
  session = setReplacementMethod(session, 'nemeth');
  assert.equal(session.method, 'nemeth');
  session = setReplacementMethod(session, 'latex');
  session = setLatexSource(session, 'x^2');
  assert.throws(() => setReplacementMethod(session, 'nemeth'), /before entering content/i);
});

// Nemeth input authoring was torn out in the nemeth-v2 rewrite (Task 0); Task 5
// re-adds it. `method: 'nemeth'` remains a valid session shape (see the test
// above) so that work does not have to rebuild this plumbing, but a session
// left in Nemeth mode has no way to gather content and must refuse to submit.
test('a Nemeth-mode session refuses to submit: Nemeth input is unavailable on this branch', async () => {
  const document = await importLatex('x');
  const tree = parseMathML(document.mathml);
  const target = tree.children[0].attrs['data-omniya-id'];
  const session = startReplacementSession({
    document,
    target: { kind: 'node', nodeId: target },
    explorerFocus: null,
    method: 'nemeth'
  });

  await assert.rejects(() => submitReplacement(session), /Nemeth input is unavailable on this branch/);
});
