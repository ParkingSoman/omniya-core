import assert from 'node:assert/strict';
import test from 'node:test';

import { convertLatexToMathML } from '../../src/main/mathml.js';
import { importLatex } from '../../src/main/math-service.js';
import { findMathNode, parseMathML } from '../../src/domain/math-tree.js';
import {
  startReplacementSession,
  applyNemethCell,
  applyNemethBoundary,
  applyNemethChoice,
  commitNemethLocalCode,
  cancelReplacement,
  submitReplacement,
  setLatexSource,
  setReplacementMethod
} from '../../src/domain/replacement-session.js';

function replacementSession() {
  return startReplacementSession({ target: { kind: 'node', nodeId: 'root' }, method: 'nemeth' });
}

test('replacement drafts start empty and cancel without mutating the source document', async () => {
  const document = await importLatex('x+x');
  const tree = parseMathML(document.mathml);
  const target = tree.children[2].attrs['data-omniya-id'];
  const session = startReplacementSession({
    document,
    target: { kind: 'node', nodeId: target },
    explorerFocus: { semanticId: '3', speech: 'x', nemeth: '⠭' },
    method: 'nemeth'
  });

  assert.equal(parseMathML(session.draft.mathml).children.length, 0);
  const cancelled = cancelReplacement(session);
  assert.equal(cancelled.document.mathml, document.mathml);
  assert.deepEqual(cancelled.focus, { kind: 'node', nodeId: target });
});

test('committing a held Nemeth local code carries the immutable draft into the active session', () => {
  let session = startReplacementSession({ target: { kind: 'node', nodeId: 'root' }, method: 'nemeth' });
  for (const cell of ['⠫', '⠒', '⠒', '⠕']) session = applyNemethCell(session, cell).session;
  const committed = commitNemethLocalCode(session);
  assert.equal(committed.status, 'applied');
  session = committed.session;
  assert.equal(session.draft.mathml, committed.document.mathml);
  assert.deepEqual(session.draftFocus, committed.focus);
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

test('incomplete or empty replacement drafts cannot commit', async () => {
  const document = await importLatex('x');
  const tree = parseMathML(document.mathml);
  const target = tree.children[0].attrs['data-omniya-id'];
  const session = startReplacementSession({
    document,
    target: { kind: 'node', nodeId: target },
    explorerFocus: null,
    method: 'nemeth'
  });

  await assert.rejects(() => submitReplacement(session), /empty|incomplete/i);
});

test('Nemeth and LaTeX sessions use the same replacement commit path', async () => {
  const document = await importLatex('x+x');
  const tree = parseMathML(document.mathml);
  const target = tree.children[2].attrs['data-omniya-id'];
  let session = startReplacementSession({
    document,
    target: { kind: 'node', nodeId: target },
    explorerFocus: null,
    method: 'nemeth'
  });
  for (const value of ['⠹', '⠁', '⠌', '⠃', '⠼']) {
    const result = applyNemethCell(session, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    session = result.session;
  }
  const committed = await submitReplacement(session, { convertLatexToMathML });
  assert.equal(parseMathML(committed.document.mathml).children[2].name, 'mfrac');
});

test('authoring method can change only before the replacement draft receives input', async () => {
  const document = await importLatex('x');
  const target = parseMathML(document.mathml).children[0].attrs['data-omniya-id'];
  let session = startReplacementSession({ document, target: { kind: 'node', nodeId: target }, method: 'nemeth' });
  session = setReplacementMethod(session, 'latex');
  assert.equal(session.method, 'latex');
  session = setReplacementMethod(session, 'nemeth');
  assert.equal(session.method, 'nemeth');
  const pending = applyNemethCell(session, '⠼');
  assert.equal(pending.status, 'pending');
  assert.throws(() => setReplacementMethod(pending.session, 'latex'), /before entering content/i);
});

test('Enter commits one atomic Nemeth code before replacement submission', () => {
  let session = startReplacementSession({ target: { kind: 'node', nodeId: 'root' }, method: 'nemeth' });
  for (const cell of ['⠫', '⠒', '⠕']) session = applyNemethCell(session, cell).session;
  assert.match(session.draft.mathml, /<math[^>]*\/>/);
  const committed = commitNemethLocalCode(session);
  assert.equal(committed.status, 'applied');
  assert.match(committed.session.draft.mathml, />⇢</);
  assert.equal(committed.session.nemethState.prefix, '');
});

test('a pending next local code retains an immediately committed preceding token', () => {
  let session = startReplacementSession({ target: { kind: 'node', nodeId: 'root' }, method: 'nemeth' });
  session = applyNemethCell(session, '⠭').session;
  session = applyNemethCell(session, '⠬').session;
  const result = applyNemethCell(session, '⠁');
  assert.equal(result.status, 'pending');
  assert.equal(result.session.nemethState.prefix, '⠁');
  assert.match(result.session.draft.mathml, /<mo[^>]*>\+<\/mo>/);
});

test('a focus-only Nemeth choice updates the replacement session focus', () => {
  let session = startReplacementSession({ target: { kind: 'node', nodeId: 'root' }, method: 'nemeth' });
  for (const cell of ['⠭', '⠘', '⠆', '⠐']) session = applyNemethCell(session, cell).session;
  const scriptFocus = session.draftFocus.nodeId;
  const result = applyNemethChoice(session, 'script.baseline');
  assert.notEqual(result.session.draftFocus.nodeId, scriptFocus);
  assert.equal(result.session.draftFocus.nodeId, parseMathML(result.session.draft.mathml).attrs['data-omniya-id']);
});

test('a pending operator after a script baseline preserves the returned focus', () => {
  let session = startReplacementSession({ target: { kind: 'node', nodeId: 'root' }, method: 'nemeth' });
  for (const cell of ['⠭', '⠘', '⠆', '⠐', '⠤']) session = applyNemethCell(session, cell).session;
  assert.equal(session.draftFocus.nodeId, parseMathML(session.draft.mathml).attrs['data-omniya-id']);
});

test('a visible blank commits a complete local code and inserts a structural space', () => {
  let session = replacementSession();
  for (const cell of ['⠭', '⠬']) session = applyNemethCell(session, cell).session;

  const result = applyNemethBoundary(session, 'space');

  assert.equal(result.status, 'applied');
  assert.equal(result.session.nemethState.prefix, '');
  assert.match(result.session.draft.mathml, /<mo[^>]*>\+<\/mo>/);
  assert.match(result.session.draft.mathml, /<mspace[^>]*data-omniya-nemeth-intent="explicit-space"/);
});

test('a boundary held behind an equality choice is inserted after equality before question mark', () => {
  let session = replacementSession();
  for (const cell of ['⠨', '⠅']) session = applyNemethCell(session, cell).session;

  const boundary = applyNemethBoundary(session, 'space');
  assert.equal(boundary.status, 'choice');
  const equality = boundary.choices.find(({ operationId }) => operationId === 'operator.equals');
  assert.ok(equality, `expected equality choice, received ${JSON.stringify(boundary.choices)}`);

  const chosen = applyNemethChoice(boundary.session, equality.operationId);
  assert.equal(chosen.status, 'applied');
  const question = applyNemethCell(chosen.session, '⠿');
  assert.equal(question.status, 'applied');
  assert.deepEqual(parseMathML(question.session.draft.mathml).children.map(({ name, children }) => ({
    name,
    text: children?.[0]?.text ?? null
  })), [
    { name: 'mo', text: '=' },
    { name: 'mspace', text: null },
    { name: 'mo', text: '?' }
  ]);
});

test('a dot-6 punctuation prefix resolves as punctuation at a visible blank', () => {
  let session = replacementSession();
  session = applyNemethCell(session, '⠠').session;

  const result = applyNemethBoundary(session, 'space');

  assert.equal(result.status, 'applied');
  assert.match(result.session.draft.mathml, /<mo[^>]*>‚?<\/mo>|<mo[^>]*>,<\/mo>/);
  assert.match(result.session.draft.mathml, /<mspace[^>]*data-omniya-nemeth-intent="explicit-space"/);
});

test('a blank after superscript punctuation returns to the group and preserves the next lower-cell number boundary', () => {
  let session = replacementSession();
  const opener = applyNemethCell(session, '⠷');
  const group = applyNemethChoice(opener.session, 'group.round');
  assert.equal(group.status, 'applied');
  session = group.session;
  for (const cell of ['⠒', '⠎', '⠊', '⠝']) session = applyNemethCell(session, cell).session;
  session = applyNemethBoundary(session, 'space').session;
  for (const cell of ['⠼', '⠒', '⠴', '⠘', '⠨', '⠡', '⠠']) session = applyNemethCell(session, cell).session;

  const boundary = applyNemethBoundary(session, 'space');
  assert.equal(boundary.status, 'applied');
  assert.match(boundary.session.draft.mathml, /<mspace[^>]*data-omniya-nemeth-intent="explicit-space"[^>]*data-omniya-source-space="true"/);

  const nextNumber = applyNemethCell(boundary.session, '⠒');
  assert.equal(nextNumber.status, 'applied');
  assert.match(nextNumber.session.draft.mathml, /<mspace[^>]*data-omniya-nemeth-intent="explicit-space"[^>]*\/><mn[^>]*data-omniya-nemeth-intent="lower-cell-numeric"[^>]*>3<\/mn>/);
});

test('a blank does not mutate an incomplete atomic local code', () => {
  let session = replacementSession();
  for (const cell of ['⠫', '⠒', '⠒']) session = applyNemethCell(session, cell).session;
  const before = structuredClone(session);

  const result = applyNemethBoundary(session, 'space');

  assert.equal(result.status, 'rejected');
  assert.equal(result.session.draft.mathml, before.draft.mathml);
  assert.deepEqual(result.session.draftFocus, before.draftFocus);
  assert.deepEqual(result.session.nemethState, before.nemethState);
});

test('a valid longer prefix remains pending until its next non-space cell', () => {
  let session = replacementSession();
  const prefix = applyNemethCell(session, '⠬');
  assert.equal(prefix.status, 'pending');
  assert.equal(prefix.session.nemethState.prefix, '⠬');

  const continuation = applyNemethCell(prefix.session, '⠹');
  assert.equal(continuation.status, 'applied');
  assert.equal(continuation.session.nemethState.prefix, '');
  assert.match(continuation.session.draft.mathml, /<mo[^>]*>\+<\/mo>/);
});
