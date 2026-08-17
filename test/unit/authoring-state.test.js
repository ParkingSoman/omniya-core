import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthoringState,
  enterEquationSurface,
  enterTextSurface,
  formatStatus,
  gradeForUebBackTranslate,
  equationInsertIntent,
  toggleUebGrade
} from '../../src/domain/authoring-state.js';

test('default authoring state is text UEB G2', () => {
  const s = createAuthoringState();
  assert.equal(s.surface, 'text');
  assert.equal(s.uebGrade, 'g2');
  assert.equal(s.g1Passage, false);
  assert.equal(s.contentEmpty, true);
  assert.equal(s.equationMethod, 'nemeth');
  assert.equal(s.replaceScopeLabel, null);
  assert.equal(s.placement, 'replace');
  assert.equal('interaction' in s, false);
  assert.equal('itemKind' in s, false);
});

test('formatStatus for text drops Command/Insert and names UEB grade', () => {
  assert.equal(formatStatus(createAuthoringState()), 'Text · UEB G2');
  assert.equal(
    formatStatus(createAuthoringState({ uebGrade: 'g1' })),
    'Text · UEB G1'
  );
  assert.equal(
    formatStatus(createAuthoringState({
      contentEmpty: false,
      uebGrade: 'g2',
      g1Passage: true
    })),
    'Text · UEB G2 · G1 passage on'
  );
  assert.doesNotMatch(formatStatus(createAuthoringState()), /Command|Insert/);
});

test('formatStatus for equation names method, fill, and placement', () => {
  assert.equal(
    formatStatus(createAuthoringState({
      surface: 'equation',
      equationMethod: 'nemeth',
      contentEmpty: true
    })),
    'Equation · Nemeth · empty'
  );
  assert.equal(
    formatStatus(createAuthoringState({
      surface: 'equation',
      equationMethod: 'latex',
      contentEmpty: false
    })),
    'Equation · LaTeX · editing'
  );
  assert.equal(
    formatStatus(createAuthoringState({
      surface: 'equation',
      equationMethod: 'nemeth',
      contentEmpty: true,
      replaceScopeLabel: 'integral'
    })),
    'Equation · Nemeth · empty · replacing: integral'
  );
  assert.match(
    formatStatus(createAuthoringState({
      surface: 'equation',
      equationMethod: 'latex',
      contentEmpty: true,
      replaceScopeLabel: 'x cubed',
      placement: 'append'
    })),
    /appending after: x cubed/i
  );
  assert.match(
    formatStatus(createAuthoringState({
      surface: 'equation',
      equationMethod: 'latex',
      contentEmpty: true,
      replaceScopeLabel: 'x cubed',
      placement: 'prepend'
    })),
    /prepending before: x cubed/i
  );
  assert.doesNotMatch(
    formatStatus(createAuthoringState({ surface: 'equation' })),
    /Command|Insert/
  );
});

test('enterTextSurface refuses while replacing mathematics', () => {
  const s = createAuthoringState({
    surface: 'equation',
    contentEmpty: true,
    replaceScopeLabel: 'term'
  });
  const r = enterTextSurface(s);
  assert.equal(r.state.surface, 'equation');
  assert.equal(r.state, s);
  assert.match(r.announcement, /Can’t switch to Text|Cannot switch to Text|Can't switch to Text|replacing/i);
});

test('enterTextSurface refuses after equation content exists', () => {
  const s = createAuthoringState({
    surface: 'equation',
    contentEmpty: false,
    equationMethod: 'nemeth'
  });
  const r = enterTextSurface(s);
  assert.equal(r.state.surface, 'equation');
  assert.equal(r.state, s);
  assert.match(r.announcement, /Can’t switch to Text|Cannot switch to Text|Can't switch to Text/i);
});

test('enterTextSurface from empty equation becomes text G2', () => {
  const s = createAuthoringState({
    surface: 'equation',
    contentEmpty: true,
    equationMethod: 'latex'
  });
  const r = enterTextSurface(s);
  assert.equal(r.state.surface, 'text');
  assert.equal(r.state.uebGrade, 'g2');
  assert.equal(r.state.g1Passage, false);
  assert.match(r.announcement, /Text · UEB G2/);
});

test('enterEquationSurface refuses after text content exists', () => {
  const s = createAuthoringState({
    surface: 'text',
    contentEmpty: false
  });
  const r = enterEquationSurface(s, 'nemeth');
  assert.equal(r.state.surface, 'text');
  assert.equal(r.state, s);
  assert.match(r.announcement, /Can’t switch to Equation|Cannot switch to Equation|Can't switch to Equation/i);
});

test('enterEquationSurface sets Nemeth or LaTeX while equation is empty', () => {
  const fromText = enterEquationSurface(createAuthoringState({
    surface: 'text',
    contentEmpty: true
  }), 'nemeth');
  assert.equal(fromText.state.surface, 'equation');
  assert.equal(fromText.state.equationMethod, 'nemeth');

  const toLatex = enterEquationSurface(fromText.state, 'latex');
  assert.equal(toLatex.state.equationMethod, 'latex');
  assert.equal(toLatex.state.surface, 'equation');

  const toNemeth = enterEquationSurface(toLatex.state, 'nemeth');
  assert.equal(toNemeth.state.equationMethod, 'nemeth');
});

test('enterEquationSurface locks method when equation has content', () => {
  const s = createAuthoringState({
    surface: 'equation',
    equationMethod: 'latex',
    contentEmpty: false
  });
  const r = enterEquationSurface(s, 'nemeth');
  assert.equal(r.state.surface, 'equation');
  assert.equal(r.state.equationMethod, 'latex');
  assert.equal(r.state, s);
});

test('toggleUebGrade on empty text toggles g2 and g1', () => {
  let r = toggleUebGrade(createAuthoringState({
    surface: 'text',
    uebGrade: 'g2',
    contentEmpty: true
  }));
  assert.equal(r.state.uebGrade, 'g1');
  assert.equal(r.state.g1Passage, false);
  r = toggleUebGrade(r.state);
  assert.equal(r.state.uebGrade, 'g2');
});

test('toggleUebGrade with text content toggles g1Passage', () => {
  const r = toggleUebGrade(createAuthoringState({
    surface: 'text',
    uebGrade: 'g2',
    contentEmpty: false
  }));
  assert.equal(r.state.g1Passage, true);
  assert.equal(r.state.uebGrade, 'g2');
  const off = toggleUebGrade(r.state);
  assert.equal(off.state.g1Passage, false);
});

test('toggleUebGrade is a no-op on equation surface', () => {
  const s = createAuthoringState({
    surface: 'equation',
    equationMethod: 'nemeth',
    contentEmpty: true,
    uebGrade: 'g2'
  });
  const r = toggleUebGrade(s);
  assert.equal(r.state.surface, 'equation');
  assert.equal(r.state.uebGrade, 'g2');
  assert.equal(r.state, s);
});

test('equationInsertIntent starts from text and switches empty equation', () => {
  assert.equal(equationInsertIntent(createAuthoringState({ surface: 'text' })), 'start');
  assert.equal(
    equationInsertIntent(createAuthoringState({ surface: 'equation', contentEmpty: true })),
    'switch-method'
  );
});

test('equationInsertIntent is a no-op when equation has content or replace is active', () => {
  assert.equal(
    equationInsertIntent(createAuthoringState({ surface: 'equation', contentEmpty: false })),
    'noop'
  );
  assert.equal(
    equationInsertIntent(createAuthoringState({
      surface: 'text',
      replaceScopeLabel: 'term'
    })),
    'noop'
  );
  assert.equal(
    equationInsertIntent(createAuthoringState({ surface: 'text' }), { replacing: true }),
    'noop'
  );
});

test('gradeForUebBackTranslate uses g1 for whole-item g1 or G1 passage', () => {
  assert.equal(
    gradeForUebBackTranslate(createAuthoringState({ contentEmpty: true, uebGrade: 'g1' })),
    'g1'
  );
  assert.equal(
    gradeForUebBackTranslate(createAuthoringState({ contentEmpty: true, uebGrade: 'g2' })),
    'g2'
  );
  assert.equal(
    gradeForUebBackTranslate(createAuthoringState({
      contentEmpty: false, uebGrade: 'g2', g1Passage: true
    })),
    'g1'
  );
  assert.equal(
    gradeForUebBackTranslate(createAuthoringState({
      contentEmpty: false, uebGrade: 'g1', g1Passage: false
    })),
    'g2'
  );
});
