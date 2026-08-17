/**
 * Characterizing probes for tester reports (display 2+2=4 → literary-looking
 * output). These record current engine behavior; they are not a product fix.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCommandKey,
  createCommandState,
  enterCommand
} from '../../src/domain/command-mode.js';
import {
  applyNemethCell,
  commitNemethLocalCode,
  createEmptyDraftMathDocument
} from '../../src/domain/guided-nemeth/index.js';
import { parseMathML } from '../../src/domain/math-tree.js';
import { isAllowedNemethCellInput } from '../../src/domain/nemeth-cell-input.js';

function leafTexts(node, out = []) {
  if (node.text !== undefined) {
    out.push(node.text);
    return out;
  }
  for (const child of node.children ?? []) leafTexts(child, out);
  return out;
}

function play(cells) {
  let document = createEmptyDraftMathDocument();
  const tree = parseMathML(document.mathml);
  let focus = { kind: 'node', nodeId: tree.attrs['data-omniya-id'] };
  let inputState = { prefix: '', mode: null };
  const steps = [];
  for (const authored of cells) {
    const result = applyNemethCell({ document, focus, inputState, cell: authored });
    if (result.status === 'choice') {
      steps.push({
        cell: authored,
        status: 'choice',
        announcement: result.announcement,
        prefix: result.inputState?.prefix,
        texts: leafTexts(parseMathML(result.document.mathml)),
        choices: result.choices?.map((c) => c.operationId)
      });
    }
    steps.push({
      cell: authored,
      codepoints: [...authored].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(' '),
      status: result.status,
      announcement: result.announcement,
      prefix: result.inputState?.prefix,
      texts: leafTexts(parseMathML(result.document.mathml))
    });
    document = result.document;
    focus = result.focus;
    inputState = result.inputState;
  }
  if (inputState.prefix) {
    const committed = commitNemethLocalCode({ document, focus, inputState });
    steps.push({
      cell: '<commit>',
      status: committed.status,
      announcement: committed.announcement,
      prefix: committed.inputState?.prefix,
      texts: leafTexts(parseMathML(committed.document.mathml))
    });
    document = committed.document;
    inputState = committed.inputState;
  }
  return { steps, texts: leafTexts(parseMathML(document.mathml)), mathml: document.mathml };
}

test('probe A: print/ASCII 2+2=4 is accepted as cells but equals is omission', () => {
  const result = play([...'2+2=4']);
  assert.deepEqual(result.texts, ['2', '+', '2', '?', '4']);
});

test('probe A spaced: print 2+2 = 4 still uses omission for =', () => {
  const result = play([...'2+2 = 4']);
  assert.ok(result.texts.includes('?'));
  assert.ok(result.texts.includes('2'));
});

test('probe B: adjacent Unicode 2+2=4 absorbs .k into the number 2.k4', () => {
  const result = play([...'⠆⠬⠆⠨⠅⠲']);
  assert.deepEqual(result.texts, ['2', '+', '2.k4']);
});

test('probe B with numeric indicators still absorbs .k into the number', () => {
  const result = play([...'⠼⠆⠬⠆⠨⠅⠼⠲']);
  assert.deepEqual(result.texts, ['2', '+', '2.k4']);
});

test('probe B spaced: ⠨⠅ after space is a choice between equals and greek kappa', () => {
  const result = play(['⠆', '⠬', '⠆', ' ', '⠨', '⠅', ' ', '⠲']);
  const choice = result.steps.find((s) => s.status === 'choice');
  assert.ok(choice, `no choice in ${result.steps.map((s) => s.status).join(',')}`);
  assert.ok(choice.choices.includes('operator.equals'));
  assert.ok(choice.choices.includes('greek.κ'));
});

test('probe G: ASCII 2+2 .K space is the same equals-vs-kappa choice', () => {
  const result = play([...'2+2 .K 4']);
  const choice = result.steps.find((s) => s.status === 'choice');
  assert.ok(choice, result.steps.map((s) => s.announcement).join(' | '));
  assert.deepEqual(choice.choices.sort(), ['greek.κ', 'operator.equals']);
});

test('probe C: upper-cell ⠃ (literary/UEB 2 without number sign) is letter b', () => {
  const result = play(['⠃']);
  assert.deepEqual(result.texts, ['b']);
});

test('probe D: lowercase latin is rejected; uppercase ASCII braille and digits are allowed', () => {
  assert.equal(isAllowedNemethCellInput('b'), false);
  assert.equal(isAllowedNemethCellInput('k'), false);
  assert.equal(isAllowedNemethCellInput('B'), true);
  assert.equal(isAllowedNemethCellInput('K'), true);
  assert.equal(isAllowedNemethCellInput('2'), true);
  assert.equal(isAllowedNemethCellInput('+'), true);
  assert.equal(isAllowedNemethCellInput('='), true);
  assert.equal(isAllowedNemethCellInput('.'), true);
  assert.equal(isAllowedNemethCellInput('⠆'), true);
  assert.equal(isAllowedNemethCellInput(' '), true);
});

test('probe G: ASCII 2+2.K4 without spaces also becomes 2.k4', () => {
  assert.equal(isAllowedNemethCellInput('k'), false);
  const dotted = play([...'2+2.K4']);
  assert.deepEqual(dotted.texts, ['2', '+', '2.k4']);
});


test('probe command X: Shift+X does not cycle back to Nemeth', () => {
  let s = enterCommand(createCommandState({ itemKind: null, contentEmpty: true }));
  s = applyCommandKey(s, 'x').state;
  assert.equal(s.itemKind, 'equation');
  assert.equal(s.equationMethod, 'nemeth');
  s = applyCommandKey(enterCommand(s), 'x').state;
  assert.equal(s.equationMethod, 'latex');
  const shifted = applyCommandKey(enterCommand(s), 'X');
  assert.equal(shifted.state.equationMethod, 'latex');
  assert.match(shifted.announcement, /Unknown command X/);
});

test('probe add-mode default: new items start as text, not equation', () => {
  const s = createCommandState({ itemKind: 'text', contentEmpty: true, equationMethod: 'nemeth' });
  assert.equal(s.itemKind, 'text');
});
