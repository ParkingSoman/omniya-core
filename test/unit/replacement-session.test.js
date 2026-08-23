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
  setNemethSource,
  setReplacementMethod
} from '../../src/domain/replacement-session.js';
import { NemethUnsupportedError, UNSUPPORTED_MESSAGE } from '../../src/domain/nemeth/index.js';

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

// Replaces the Task 0 stub pin ("a Nemeth-mode session refuses to submit:
// Nemeth input is unavailable on this branch"). That assertion described the
// torn-out engine and could only pass while `materializeDraft` threw; it is
// superseded here by the three outcomes the real branch has, which pin strictly
// more behaviour than the stub did.
async function nemethSession(cells) {
  const document = await importLatex('x');
  const tree = parseMathML(document.mathml);
  const session = startReplacementSession({
    document,
    target: { kind: 'node', nodeId: tree.children[0].attrs['data-omniya-id'] },
    explorerFocus: null,
    method: 'nemeth'
  });
  return cells === undefined ? session : setNemethSource(session, cells);
}

test('a Nemeth session with no cells refuses as empty, not as unsupported', async () => {
  const session = await nemethSession();
  assert.equal(session.nemethSource, '');
  await assert.rejects(() => submitReplacement(session, { convertLatexToMathML }), /Replacement draft is empty/);
});

test('a Nemeth session commits its cells through the LaTeX MathML converter', async () => {
  // '?a/b#' in Braille ASCII: a simple fraction, BANA Rule 12.
  const session = await nemethSession('\u2839\u2801\u280c\u2803\u283c');
  const result = await submitReplacement(session, { convertLatexToMathML });
  assert.match(result.document.mathml, /<mfrac[ >]/);

  // The point of routing Nemeth through convertLatexToMathML rather than a
  // second generator: the same mathematics authored either way must be
  // byte-identical MathML, not merely equivalent.
  const latexResult = await submitReplacement(
    { ...session, method: 'latex', latexSource: '\\frac{a}{b}', nemethSource: '' },
    { convertLatexToMathML }
  );
  assert.equal(
    serializeWithoutIds(result.document.mathml),
    serializeWithoutIds(latexResult.document.mathml)
  );
});

test('a session authored on a computer-braille keyboard commits through the configured table', async () => {
  // The real report this pins: a braille display set to 8-dot U.S. computer
  // braille sends '#2+#2 .k #4' for 2+2=4. `eec9b56` taught the composer's
  // classifier to decode that, but never threaded the table down to here, so
  // submit re-read the buffer with no table and refused input it had just
  // narrated back as "read as 2+2=4".
  const session = await nemethSession('#2+#2 .k #4');
  const result = await submitReplacement(session, {
    convertLatexToMathML,
    brailleInputTable: 'en-us-comp8'
  });
  assert.match(result.document.mathml, />2<\/mn>.*>\+<\/mo>.*>2<\/mn>.*>=<\/mo>.*>4<\/mn>/);
});

test('the configured table does not leak into a session that did not ask for one', async () => {
  // The table is opt-in per user. Without it the QWERTY gate below must still
  // hold, so decoding stays a thing a caller requests, never a default.
  const session = await nemethSession('#2+#2');
  await assert.rejects(
    () => submitReplacement(session, { convertLatexToMathML }),
    /Braille cells only: "#" at character 1/
  );
});

test('a QWERTY character refuses instead of being decoded as its Braille ASCII cell', async () => {
  // The composer strips these as they are typed, so this guards a session
  // assembled any other way. Committing the cells that *did* convert would be a
  // plausible-looking wrong answer a braille author cannot see; and decoding the
  // 'a' to the letter cell would reverse commit 8bc05ae, "gate Nemeth QWERTY".
  const session = await nemethSession('\u2839a\u283c');
  await assert.rejects(
    () => submitReplacement(session, { convertLatexToMathML }),
    /Braille cells only: "a" at character 2/
  );
});

test('an out-of-scope Nemeth construct refuses with the single product message and no developer detail', async () => {
  // U+282B has no reading in the v1 symbol table.
  const session = await nemethSession('\u282d\u282b\u282d');
  await assert.rejects(
    () => submitReplacement(session, { convertLatexToMathML }),
    (error) => {
      assert.ok(error instanceof NemethUnsupportedError, 'expected NemethUnsupportedError');
      assert.equal(error.message, UNSUPPORTED_MESSAGE);
      assert.doesNotMatch(error.message, /cell|offset|U\+/i, 'developer detail must not reach error.message');
      return true;
    }
  );
});

test('setNemethSource refuses a LaTeX-mode session, and cells block a method switch', async () => {
  const latex = startReplacementSession({
    document: null,
    target: { kind: 'node', nodeId: 'omniya-x' },
    method: 'latex'
  });
  assert.throws(() => setNemethSource(latex, '⠭'), /not in Nemeth mode/);

  const withCells = setNemethSource(
    startReplacementSession({ document: null, target: { kind: 'node', nodeId: 'omniya-x' }, method: 'nemeth' }),
    '⠭'
  );
  assert.throws(() => setReplacementMethod(withCells, 'latex'), /before entering content/i);
});

function serializeWithoutIds(mathml) {
  return mathml.replace(/ data-omniya-id="[^"]*"/g, '');
}
