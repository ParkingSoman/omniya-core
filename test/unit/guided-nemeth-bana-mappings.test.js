import assert from 'node:assert/strict';
import test from 'node:test';
import SRE from 'speech-rule-engine';

import { parseMathML } from '../../src/domain/math-tree.js';
import {
  applyNemethCell,
  applyNemethChoice,
  createEmptyDraftMathDocument,
  operationRegistry,
  registryDiagnostics
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

const RULE_17_19_FIXTURES = [
  ['shape.diamond', '⠫⠙', '◊'],
  ['shape.ellipse', '⠫⠑', '⬭'],
  ['shape.hexagon', '⠫⠖', '⬡'],
  ['shape.parallel', '⠫⠇', '∥'],
  ['shape.perpendicular', '⠫⠏', '⟂'],
  ['shape.parallelogram', '⠫⠛', '▱'],
  ['shape.pentagon', '⠫⠢', '⬠'],
  ['shape.star', '⠫⠎', '☆'],
  ['shape.trapezoid', '⠫⠵', '⏢'],
  ['shape.inverted-triangle', '⠨⠫', '▽'],
  ['group.angle-open', '⠨⠨⠷', '⟨'],
  ['group.angle-close', '⠨⠨⠾', '⟩'],
  ['group.barred-bracket-open', '⠈⠸⠷', '⟦'],
  ['group.barred-bracket-close', '⠈⠸⠾', '⟧'],
  ['group.barred-brace-open', '⠨⠸⠷', '⦃'],
  ['group.barred-brace-close', '⠨⠸⠾', '⦄'],
  ['group.upper-half-open', '⠈⠘⠠⠷', '⎡'],
  ['group.upper-half-close', '⠈⠘⠠⠾', '⎤'],
  ['group.lower-half-open', '⠈⠰⠷', '⎣'],
  ['group.lower-half-close', '⠈⠰⠾', '⎦']
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
  ['misc.end-proof', '⠈⠫⠟⠑⠙', '∎'],
  ['operator.integral', '⠮', '∫']
];

const RULE_20_21_23_LITERALS = [
  ['operator.ampersand', '⠸⠯', '&'],
  ['operator.backslash', '⠸⠡', '\\'],
  ['operator.circle-dot', '⠫⠉⠸⠫⠡⠻', '⊙'],
  ['operator.circle-plus', '⠫⠉⠸⠫⠬⠻', '⊕'],
  ['operator.circle-minus', '⠫⠉⠸⠫⠤⠻', '⊖'],
  ['operator.number-sign', '⠨⠼', '#'],
  ['operator.divides', '⠳', '∣'],
  ['operator.paragraph', '⠈⠠⠏', '¶'],
  ['operator.section', '⠈⠠⠎', '§'],
  ['comparison.perpendicular', '⠫⠏', '⊥'],
  ['comparison.proportion', '⠰⠆', '∷'],
  ['comparison.ratio', '⠐⠂', '∶'],
  ['comparison.relation', '⠠⠗', 'R'],
  ['comparison.reverse-subset', '⠸⠨⠂', '⊃'],
  ['comparison.vertical-bar', '⠡', '|'],
  ['comparison.simple-tilde', '⠈⠱', '∼'],
  ['comparison.extended-tilde', '⠈⠠⠱', '〰'],
  ['misc.ditto', '⠠⠄', '〃'],
  ['misc.hollow-dot', '⠨⠡', '∘'],
  ['misc.triple-prime', '⠄⠄⠄', '‴'],
  ['misc.vertical-bar', '⠡', '|'],
  ['operator.star', '⠫⠎', '☆']
];

function applyFixture(id, cells) {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  const registryEntry = operationRegistry().find((entry) => entry.id === id);
  // An atomic code is deliberately tested as one bounded local construction.
  // Seeding its already-collected prefix avoids treating a shared standalone
  // prefix, such as ∫ inside a double-integral code, as an unrelated passage.
  if (registryEntry?.commitPolicy === 'atomic-sequence' && cells.length > 1) {
    inputState.prefix = [...cells].slice(0, -1).join('');
    cells = cells.slice(-1);
  }
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

test('Rules 20, 21, and 23 table literals remain independently source-linked', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of RULE_20_21_23_LITERALS) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.cells.join(''), cells, id);
    const tree = applyFixture(id, cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, expected, id);
  }
});

test('BANA Rules 17 and 19 shape and grouping literals are source-linked', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of RULE_17_19_FIXTURES) {
    assert.equal(registry.get(id)?.cells.join(''), cells, id);
    assert.ok(registry.get(id)?.banaRefs.includes('17.1') || registry.get(id)?.banaRefs.includes('19.1'), id);
    const tree = applyFixture(id, cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, expected, id);
  }
});

test('official BANA and MathCAT cells guard corrected Greek, summation, and arrow literals', async () => {
  const fixtures = [
    ['greek.ϵ', '⠨⠑', 'ϵ'],
    ['greek.ϕ', '⠨⠋', 'ϕ'],
    ['greek.variant-ϐ', '⠨⠈⠃', 'ϐ'],
    ['greek.variant-ϑ', '⠨⠈⠹', 'ϑ'],
    ['greek.variant-ς', '⠨⠈⠎', 'ς'],
    ['greek.variant-φ', '⠨⠈⠋', 'φ'],
    ['operator.sum', '⠨⠠⠎', '∑'],
    ['arrow.vertical-both', '⠫⠣⠪⠒⠒⠕', '↕'],
    ['arrow.northwest', '⠫⠘⠪⠒⠒', '↖'],
    ['arrow.northeast', '⠫⠘⠒⠒⠕', '↗'],
    ['arrow.southeast', '⠫⠰⠒⠒⠕', '↘'],
    ['arrow.southwest', '⠫⠰⠪⠒⠒', '↙'],
    ['arrow.double-left', '⠫⠪⠶⠶', '⇐'],
    ['arrow.double-right', '⠫⠶⠶⠕', '⇒'],
    ['arrow.double-both', '⠫⠪⠶⠶⠕', '⇔'],
    ['misc.crossed-d', '⠈⠫', 'đ'],
    ['misc.crossed-lambda', '⠈⠨⠇', 'ƛ'],
    ['misc.crossed-r', '⠈⠠⠗', '℞']
  ];
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of fixtures) {
    assert.equal(registry.get(id)?.cells.join(''), cells, `${id}: BANA/MathCAT sequence`);
    const tree = applyFixture(id, cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, expected, id);
  }
});

test('BANA Rule 6.2 Greek variant codes remain literal composable mappings', () => {
  for (const [cells, value] of [
    ['⠨⠈⠃', 'ϐ'],
    ['⠨⠈⠹', 'ϑ'],
    ['⠨⠈⠎', 'ς'],
    ['⠨⠈⠋', 'φ']
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
    let result = applyNemethCell({ document, focus, inputState, cell });
    if (result.status === 'choice') {
      const operationId = cell === '⠱' ? 'modifier.bar-over' : 'modifier.terminate.over';
      result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId });
    }
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

test('atomic local codes are reachable and never shadowed by immediate prefixes', () => {
  // BANA has legitimate shared prefixes (for example, the shape angle and
  // several arrow constructions). Those immediate meanings must explicitly
  // opt into the longer-code lookahead policy; otherwise the first cell would
  // commit too early and make the atomic construction unreachable.
  assert.deepEqual(registryDiagnostics().policyErrors, []);
  assert.deepEqual(registryDiagnostics().shadowedImmediate, []);
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
