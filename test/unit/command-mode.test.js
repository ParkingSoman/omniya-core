import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCommandState,
  applyCommandKey,
  formatStatus,
  enterCommand,
  enterInsert,
  gradeForUebBackTranslate
} from '../../src/domain/command-mode.js';

test('Escape enters command; i returns to insert', () => {
  let s = createCommandState({ itemKind: 'text', uebGrade: 'g2' });
  s = enterCommand(s);
  assert.equal(s.interaction, 'command');
  const r = applyCommandKey(s, 'i');
  assert.equal(r.state.interaction, 'insert');
});

test('t on non-text empty becomes text g2', () => {
  let s = createCommandState({ itemKind: null, contentEmpty: true });
  s = enterCommand(s);
  const r = applyCommandKey(s, 't');
  assert.equal(r.state.itemKind, 'text');
  assert.equal(r.state.uebGrade, 'g2');
  assert.match(r.announcement, /Text/i);
});

test('t on text toggles grade whether empty or filled', () => {
  let s = enterCommand(createCommandState({ itemKind: 'text', uebGrade: 'g2', contentEmpty: true }));
  s = applyCommandKey(s, 't').state;
  assert.equal(s.uebGrade, 'g1');
  s = applyCommandKey(enterCommand(s), 't').state;
  assert.equal(s.uebGrade, 'g2');

  s = enterCommand(createCommandState({ itemKind: 'text', uebGrade: 'g2', contentEmpty: false }));
  // mid-block: toggle enters g1Passage rather than whole-item g1 when content exists
  const r = applyCommandKey(s, 't');
  assert.equal(r.state.g1Passage, true);
});

test('x cycles nemeth/latex only while equation empty', () => {
  let s = enterCommand(createCommandState({ itemKind: null, contentEmpty: true }));
  s = applyCommandKey(s, 'x').state;
  assert.equal(s.itemKind, 'equation');
  assert.equal(s.equationMethod, 'nemeth');
  s = applyCommandKey(enterCommand(s), 'x').state;
  assert.equal(s.equationMethod, 'latex');
  s = applyCommandKey(enterCommand({ ...s, contentEmpty: false }), 'x').state;
  assert.equal(s.equationMethod, 'latex'); // locked
});

test('e in command is unknown (no alias to x)', () => {
  const s = enterCommand(createCommandState({ itemKind: 'text', contentEmpty: true }));
  const r = applyCommandKey(s, 'e');
  assert.equal(r.state.itemKind, 'text');
  assert.equal(r.action, undefined);
  assert.match(r.announcement, /Unknown command/i);
});

test('s requests focus-status', () => {
  const s = enterCommand(createCommandState({ itemKind: 'text', uebGrade: 'g2' }));
  const r = applyCommandKey(s, 's');
  assert.equal(r.action, 'focus-status');
});

test('t refuses when equation has content', () => {
  const s = enterCommand(createCommandState({
    itemKind: 'equation', contentEmpty: false, equationMethod: 'nemeth'
  }));
  const r = applyCommandKey(s, 't');
  assert.equal(r.state.itemKind, 'equation');
  assert.match(r.announcement, /Can’t switch to Text|Cannot switch to Text/i);
});

test('question mark requests contextual help', () => {
  const s = enterCommand(createCommandState({ itemKind: 'text', uebGrade: 'g2' }));
  const r = applyCommandKey(s, '?');
  assert.equal(r.action, 'help');
  assert.match(r.announcement, /Command/i);
});

test('q is unknown (cancel is Escape outside the machine)', () => {
  const s = enterCommand(createCommandState({ itemKind: 'text' }));
  const r = applyCommandKey(s, 'q');
  assert.equal(r.action, undefined);
  assert.match(r.announcement, /Unknown command/i);
});

test('formatStatus includes replacing scope label', () => {
  const s = createCommandState({
    itemKind: 'equation',
    equationMethod: 'nemeth',
    contentEmpty: true,
    replaceScopeLabel: 'integral'
  });
  assert.match(formatStatus(s), /replacing: integral/i);
});

test('t refuses when replaceScopeLabel is set', () => {
  const s = enterCommand(createCommandState({
    itemKind: 'equation',
    contentEmpty: true,
    replaceScopeLabel: 'term'
  }));
  const r = applyCommandKey(s, 't');
  assert.equal(r.state.itemKind, 'equation');
  assert.match(r.announcement, /Can’t switch to Text|Cannot switch to Text|replacing/i);
});

test('gradeForUebBackTranslate uses g1 for whole-item g1 or G1 passage', () => {
  assert.equal(
    gradeForUebBackTranslate(createCommandState({ contentEmpty: true, uebGrade: 'g1' })),
    'g1'
  );
  assert.equal(
    gradeForUebBackTranslate(createCommandState({ contentEmpty: true, uebGrade: 'g2' })),
    'g2'
  );
  assert.equal(
    gradeForUebBackTranslate(createCommandState({
      contentEmpty: false, uebGrade: 'g2', g1Passage: true
    })),
    'g1'
  );
  assert.equal(
    gradeForUebBackTranslate(createCommandState({
      contentEmpty: false, uebGrade: 'g1', g1Passage: false
    })),
    'g2'
  );
});
