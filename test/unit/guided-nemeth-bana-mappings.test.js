import assert from 'node:assert/strict';
import test from 'node:test';
import SRE from 'speech-rule-engine';

import { parseMathML } from '../../src/domain/math-tree.js';
import {
  applyNemethCell,
  applyNemethChoice,
  createEmptyDraftMathDocument,
  operationRegistry
} from '../../src/domain/guided-nemeth/index.js';

// These cells are independently checked against BANA Appendix D and the
// MathCAT Nemeth corpus. MathCAT is only a regression oracle; the BANA rule
// references on each registry row remain normative.
const FIXTURES = [
  ['omission.general', '⠿', '?'],
  ['quantifier.forall', '⠈⠯', '∀'],
  ['quantifier.exists', '⠈⠿', '∃'],
  ['quantifier.not-exists', '⠌⠈⠿', '∄'],
  ['comparison.contains', '⠈⠢', '∋'],
  ['comparison.not-contains', '⠌⠈⠢', '∌'],
  ['comparison.less-equal', '⠐⠅⠱', '≤'],
  ['comparison.greater-equal', '⠨⠂⠱', '≥'],
  ['arrow.up', '⠫⠣⠒⠒⠕', '↑'],
  ['arrow.down', '⠫⠩⠒⠒⠕', '↓'],
  ['reference.dagger', '⠸⠻', '†'],
  ['reference.double-dagger', '⠸⠸⠻', '‡'],
  ['shape.circle', '⠫⠉', '○'],
  ['shape.square', '⠫⠲', '□'],
  ['shape.filled-circle', '⠫⠸⠉', '●'],
  ['shape.filled-square', '⠫⠸⠲', '■'],
  ['shape.triangle', '⠫⠞', '△'],
  ['shape.rectangle', '⠫⠗', '▭']
];

const RULE_23_FIXTURES = [
  ['misc.angstrom', '⠈⠠⠁', 'Å'],
  ['misc.planck', '⠈⠓', 'ℏ'],
  ['misc.caret', '⠸⠣', '^'],
  ['misc.cent', '⠈⠉', '¢'],
  ['misc.pound', '⠈⠇', '£'],
  ['misc.euro', '⠈⠑', '€'],
  ['misc.yen', '⠈⠽', '¥'],
  ['misc.per-mille', '⠈⠴⠴', '‰'],
  ['operator.double-integral', '⠮⠮', '∬'],
  ['operator.triple-integral', '⠮⠮⠮', '∭']
];

function applyFixture(id, cells) {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of [...cells]) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    if (result.status === 'choice') {
      const choice = result.choices.find((entry) => entry.operationId === id);
      assert.ok(choice, `${id} did not expose its BANA mapping choice`);
      result = applyNemethChoice({
        document,
        focus,
        inputState: result.inputState,
        operationId: choice.operationId
      });
    }
    assert.notEqual(result.status, 'rejected', `${id}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  // A complete code that is also a prefix of a longer code remains pending
  // until the next cell in a streaming editor. A fixture can explicitly
  // commit that registered meaning at end-of-input without introducing a
  // whole-expression parser.
  if (inputState.prefix) {
    const choice = applyNemethChoice({ document, focus, inputState, operationId: id });
    assert.notEqual(choice.status, 'rejected', `${id}: ${choice.announcement}`);
    ({ document, focus, inputState } = choice);
  }
  return parseMathML(document.mathml);
}

async function applySequence(cells) {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of cells) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  return document.mathml;
}

test('BANA-linked atomic mapping fixtures produce the expected MathML symbol', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of FIXTURES) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.ok(entry.banaRefs.length, id);
    assert.deepEqual(entry.cells.join(''), cells, id);
    const tree = applyFixture(id, cells);
    const inserted = tree.children.at(-1);
    assert.equal(inserted.children?.[0]?.text, expected, `${id}: resulting MathML`);
  }
});

test('BANA Rule 23 and compound-integral literals are source-linked', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of RULE_23_FIXTURES) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.deepEqual(entry.cells.join(''), cells, id);
    const tree = applyFixture(id, cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, expected, id);
  }
});

test('BANA Rule 6.2 Greek variant codes remain literal composable mappings', () => {
  for (const [cells, value] of [
    ['⠨⠈⠑', 'ϵ'],
    ['⠨⠈⠹', 'ϑ'],
    ['⠨⠈⠋', 'ϕ'],
    ['⠨⠈⠏', 'ϖ'],
    ['⠨⠈⠅', 'ϰ']
  ]) {
    const tree = applyFixture(`greek.variant-${value}`, cells);
    assert.equal(tree.children[0].children[0].text, value);
  }
});

test('BANA Rule 7 typeform indicators decorate only the next local atom', () => {
  const cases = [
    ['⠸⠰', 'bold'],
    ['⠨⠰', 'italic'],
    ['⠠⠨⠰', 'sans-serif'],
    ['⠈⠰', 'script'],
    ['⠠⠸⠰', 'double-struck']
  ];
  for (const [indicator, mathvariant] of cases) {
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    for (const cell of [...indicator, '⠁']) {
      const result = applyNemethCell({ document, focus, inputState, cell });
      let chosen = result;
      if (result.status === 'choice') {
        const operation = result.choices.find(({ operationId }) => operationId.endsWith('.number'));
        assert.ok(operation, `${indicator}: expected a numeral typeform mapping choice`);
        chosen = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: operation.operationId });
      }
      assert.notEqual(chosen.status, 'rejected', `${indicator}: ${chosen.announcement}`);
      ({ document, focus, inputState } = chosen);
    }
    const tree = parseMathML(document.mathml);
    assert.equal(tree.children[0].attrs.mathvariant, mathvariant);
    assert.equal(tree.children.at(-1).children[0].text, 'a');
  }
});

test('BANA Rule 7 numeral typeform indicators retain the numeric mode', () => {
  for (const [indicator, mathvariant] of [
    ['⠸⠼', 'bold'],
    ['⠨⠼', 'italic'],
    ['⠠⠨⠼', 'sans-serif'],
    ['⠈⠼', 'script'],
    ['⠠⠸⠼', 'double-struck']
  ]) {
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    for (const cell of [...indicator, '⠁']) {
      const result = applyNemethCell({ document, focus, inputState, cell });
      let chosen = result;
      if (result.status === 'choice') {
        const operation = result.choices.find(({ operationId }) => operationId.endsWith('.number'));
        assert.ok(operation, `${indicator}: expected a numeral typeform mapping choice`);
        chosen = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: operation.operationId });
      }
      assert.notEqual(chosen.status, 'rejected', `${indicator}: ${chosen.announcement}`);
      ({ document, focus, inputState } = chosen);
    }
    const tree = parseMathML(document.mathml);
    assert.equal(tree.children[0].attrs.mathvariant, mathvariant);
    assert.equal(tree.children[0].children[0].text, '1');
  }
});

test('BANA Rule 15 five-step modifier transition creates a local mover', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠐', '⠣', '⠁', '⠱', '⠻']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'mover');
  assert.equal(tree.children[0].children[1].children[0].text, '¯');
});

test('Rule 15 typeform and modifier mappings agree with the independent SRE Nemeth projection', async () => {
  await SRE.engineReady();
  await SRE.setupEngine({ locale: 'nemeth', modality: 'braille', domain: 'default' });
  const cases = [
    ['⠸⠰⠁', '<math><mi mathvariant="bold">a</mi></math>']
  ];
  for (const [cells, mathml] of cases) {
    assert.equal(SRE.toSpeech(mathml), cells);
  }
});

test('every accepted mapping has an explicit BANA source and action', () => {
  for (const entry of operationRegistry()) {
    assert.match(entry.id, /^\S+$/);
    assert.ok(entry.banaRefs.every((ref) => /^\d+(\.\d+)*$/.test(ref)), entry.id);
    assert.ok(Array.isArray(entry.errataRefs), entry.id);
    assert.ok(['insert-token', 'open-structure', 'open-fixed-root', 'open-modifier', 'move-slot', 'close-structure', 'set-mode'].includes(entry.action), entry.id);
  }
});

test('composed guided structures match SRE Nemeth output for whole expressions', async () => {
  await SRE.engineReady();
  await SRE.setupEngine({ locale: 'nemeth', modality: 'braille', domain: 'default' });
  const cases = [
    {
      cells: ['⠠', '⠹', '⠹', '⠁', '⠌', '⠃', '⠼', '⠠', '⠌', '⠉', '⠠', '⠼'],
      expected: '⠠⠹⠹⠁⠌⠃⠼⠠⠌⠉⠠⠼'
    },
    { cells: ['⠣', '⠒', '⠜', '⠁', '⠻'], expected: '⠣⠒⠜⠁⠻' },
    { cells: ['⠪', '⠭', '⠻'], expected: '⠪⠭⠻' },
    { cells: ['⠿'], expected: '⠿' }
  ];
  for (const { cells, expected } of cases) {
    const mathml = await applySequence(cells);
    assert.equal(SRE.toSpeech(mathml), expected);
  }
});
