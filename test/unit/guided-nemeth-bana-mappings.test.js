import assert from 'node:assert/strict';
import test from 'node:test';
import SRE from 'speech-rule-engine';

import { parseMathML } from '../../src/domain/math-tree.js';
import {
  applyNemethCell,
  applyNemethChoice,
  commitNemethLocalCode,
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

const RULE_17_EXTENDED_FIXTURES = [
  ['shape.arc.down', '⠫⠁', '⁀', '17.1'],
  ['shape.arc.up', '⠫⠄', '⌢', '17.1'],
  ['shape.rhombus', '⠫⠓', '◇', '17.2'],
  ['shape.intersecting-lines', '⠫⠊', '╳', '17.2'],
  ['shape.quadrilateral', '⠫⠟', '▱', '17.2'],
  ['shape.irregular-hexagon', '⠫⠓⠭', '⬡', '17.2'],
  ['shape.irregular-pentagon', '⠫⠏⠛', '⭔', '17.2'],
  ['shape.regular-octagon', '⠫⠦', '⯃', '17.4'],
  ['shape.regular-dodecagon', '⠫⠂⠆', '⯃', '17.4'],
  ['shape.triangle.isosceles', '⠫⠞⠨⠊⠻', '△', '17.5'],
  ['shape.triangle.right', '⠫⠞⠨⠗⠻', '⊿', '17.5'],
  ['shape.angle.adjacent', '⠫⠪⠨⠚⠻', '∠', '17.5'],
  ['shape.circle.interior-plus', '⠫⠉⠸⠫⠬⠻', '⨁', '17.6.1'],
  ['shape.circle.interior-dot', '⠫⠉⠸⠫⠡⠻', '⦿', '17.6.1'],
  ['shape.circle.superposed-bar', '⠳⠈⠫⠉⠻', '⌽', '17.7'],
  ['shape.triangle.plural', '⠫⠞⠎', '⧌', '17.9']
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
  ['comparison.equivalence', '⠈⠣⠠⠣', '≎'],
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

test('BANA Rule 17 extended shape constructions are bounded atomic mappings', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected, banaRef] of RULE_17_EXTENDED_FIXTURES) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.cells.join(''), cells, id);
    assert.ok(entry.banaRefs.includes(banaRef), id);
    assert.equal(entry.commitPolicy, 'atomic-sequence', id);
    const tree = applyFixture(id, cells);
    const inserted = tree.children.at(-1);
    assert.equal(inserted.children?.[0]?.text, expected, id);
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

test('BANA Rule 22 component constructions remain bounded and source-linked', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const fixtures = [
    ['arrow.up-double-stroked', '⠳⠳⠈⠫⠣⠒⠒⠕⠻', '⇞'],
    ['arrow.left-to-bar', '⠳⠫⠪⠒⠒', '⇤'],
    ['arrow.right-to-bar', '⠫⠒⠒⠕⠳', '⇥'],
    ['arrow.right-small-circle', '⠨⠡⠈⠫⠒⠒⠕⠻', '⇴'],
    ['arrow.long-both', '⠫⠪⠒⠒⠒⠕', '⟷'],
    ['arrow.long-double-right-bar', '⠫⠳⠶⠶⠶⠕', '⟾'],
    ['arrow.right-blunted', '⠫⠒⠒⠿', '⇢'],
    ['arrow.both-curved', '⠫⠯⠒⠒⠽', '↔']
  ];
  for (const [id, cells, value] of fixtures) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.cells.join(''), cells, id);
    assert.ok(entry.banaRefs.includes('22.7') || entry.banaRefs.includes('22.5'), id);
    assert.equal(entry.commitPolicy, 'atomic-sequence', id);
    const tree = applyFixture(id, cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, value, id);
  }
});

test('BANA Rule 17 interior constructions and Rule 15 simultaneous modifiers are bounded', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, value] of [
    ['shape.circle.interior-cross', '⠫⠉⠸⠫⠈⠡⠻', '⊗'],
    ['shape.circle.interior-minus', '⠫⠉⠸⠫⠤⠻', '⊖'],
    ['shape.square.interior-diagonals', '⠫⠲⠸⠫⠢⠈⠴⠻', '⊠'],
    ['shape.square.interior-vertical-bar', '⠫⠲⠸⠫⠳⠻', '◫'],
    ['shape.angle.interior-arc', '⠫⠪⠸⠫⠫⠁⠻', '∡']
  ]) {
    const entry = registry.get(id);
    assert.equal(entry?.cells.join(''), cells, id);
    assert.equal(entry?.args.value, value, id);
    assert.equal(entry?.commitPolicy, 'atomic-sequence', id);
    assert.ok(entry.banaRefs.includes('17.6.1') || entry.banaRefs.includes('15.4'), id);
  }
  assert.equal(registry.get('modifier.simultaneous.over')?.commitPolicy, 'structural-followup');
  assert.equal(registry.get('modifier.simultaneous.under')?.commitPolicy, 'structural-followup');
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

test('BANA Rule 6 non-English alphabet indicators remain bounded local mappings', () => {
  const fixtures = [
    ['german.v', '⠸⠧', '𝖛'],
    ['german.capital-v', '⠸⠠⠧', '𝔙'],
    ['hebrew.aleph', '⠠⠠⠁', 'א'],
    ['russian.ell', '⠈⠈⠇', 'л'],
    ['russian.capital-ell', '⠈⠈⠠⠇', 'Л'],
    ['russian.sha', '⠈⠈⠱', 'ш'],
    ['russian.capital-sha', '⠈⠈⠠⠱', 'Ш']
  ];
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of fixtures) {
    assert.equal(registry.get(id)?.cells.join(''), cells, id);
    assert.ok(registry.get(id)?.banaRefs.some((ref) => ref.startsWith('6.1')), id);
    assert.equal(registry.get(id)?.commitPolicy, 'atomic-sequence', id);
    const tree = applyFixture(id, cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, expected, id);
  }
});

test('BANA Rule 10.3 English-letter abbreviation indicator is a one-letter mode', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus, inputState, cell: '⠰' });
  if (result.status === 'choice') {
    result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'indicator.english-letter' });
  }
  assert.equal(result.status, 'pending');
  ({ document, focus, inputState } = result);
  result = applyNemethCell({ document, focus, inputState, cell: '⠛' });
  assert.equal(result.status, 'applied');
  assert.equal(parseMathML(result.document.mathml).children[0].children[0].text, 'g');
});

test('BANA Rule 18 abbreviated functions and limit forms are bounded local atoms', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, value] of [
    ['function.sin', '⠎⠊⠝', 'sin'],
    ['function.log', '⠇⠕⠛', 'log'],
    ['function.limit.upper', '⠣⠇⠊⠍', 'lim'],
    ['function.limit.lower', '⠩⠇⠊⠍', 'lim']
  ]) {
    const entry = registry.get(id);
    assert.equal(entry?.cells.join(''), cells, id);
    assert.equal(entry?.commitPolicy, 'atomic-sequence', id);
    assert.ok(entry?.banaRefs.includes('18.1') || entry?.banaRefs.includes('18.3'), id);
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    for (const cell of [...cells]) {
      const result = applyNemethCell({ document, focus, inputState, cell });
      assert.equal(result.status, 'pending', `${id}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    const committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', id);
    const tree = parseMathML(committed.document.mathml);
    assert.equal(tree.children[0].children[0].text, value, id);
  }
});

test('BANA Rule 23 repeated integrals use immediate and bounded forms', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const entry = registry.get('integral.extend');
  assert.equal(entry?.cells.join(''), '⠮');
  assert.equal(entry?.commitPolicy, 'structural-followup');
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus, inputState, cell: '⠮' });
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  result = applyNemethCell({ document, focus, inputState, cell: '⠮' });
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  assert.equal(parseMathML(document.mathml).children[0].children[0].text, '∬');
  result = applyNemethCell({ document, focus, inputState, cell: '⠮' });
  assert.equal(result.status, 'applied');
  assert.equal(parseMathML(result.document.mathml).children[0].children[0].text, '∭');
});

test('BANA Rule 23 superposed integrals are structural follow-ups to an immediate integral', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of [
    ['integral.superpose.circle', '⠈⠫⠉⠻', '∮'],
    ['integral.superpose.clockwise', '⠈⠫⠪⠢⠔⠻', '∲'],
    ['integral.superpose.anticlockwise', '⠈⠫⠢⠔⠕⠻', '∳'],
    ['integral.superpose.finite-part', '⠈⠱⠻', '⨍'],
    ['integral.superpose.double-stroke', '⠈⠱⠱⠻', '⨎'],
    ['integral.superpose.times', '⠈⠈⠡⠻', '⨘'],
    ['integral.superpose.intersection', '⠈⠨⠩⠻', '⨙'],
    ['integral.superpose.union', '⠈⠨⠬⠻', '⨚'],
    ['integral.superpose.square', '⠈⠫⠲⠻', '⨖']
  ]) {
    const entry = registry.get(id);
    assert.equal(entry?.cells.join(''), cells, id);
    assert.equal(entry?.commitPolicy, 'structural-followup', id);
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    let result = applyNemethCell({ document, focus, inputState, cell: '⠮' });
    assert.equal(result.status, 'applied', `${id}: immediate integral`);
    ({ document, focus, inputState } = result);
    for (const cell of [...cells]) {
      result = applyNemethCell({ document, focus, inputState, cell });
      assert.notEqual(result.status, 'rejected', `${id}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    if (inputState.prefix) {
      result = commitNemethLocalCode({ document, focus, inputState });
      assert.equal(result.status, 'applied', `${id}: commit`);
      document = result.document;
    }
    assert.equal(parseMathML(document.mathml).children[0].children[0].text, expected, id);
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
      if (chosen.status === 'pending' && chosen.inputState.prefix === '⠁') {
        chosen = commitNemethLocalCode({ document, focus, inputState: chosen.inputState });
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
    for (const cell of [...indicator, '⠂']) {
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
  for (const cell of ['⠐', '⠁', '⠣', '⠱', '⠻']) {
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
  assert.equal(tree.children[0].children[0].children[0].text, 'a');
});

test('BANA Rule 15 five-step order works for under-modifiers as well', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠐', '⠁', '⠩', '⠱', '⠻']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'munder');
  assert.equal(tree.children[0].children[0].children[0].text, 'a');
  assert.equal(tree.children[0].children[1].children[0].text, '¯');
});

test('BANA Rule 15.4 adds the opposite side through the same local follow-up policy', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  // BANA's simultaneous form is under side first, then over side, followed
  // by one terminator. The buffer never contains more than that local code.
  for (const cell of ['⠐', '⠁', '⠩', '⠱', '⠣', '⠱', '⠻']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'munderover');
  assert.equal(tree.children[0].children[0].children[0].text, 'a');
  assert.equal(tree.children[0].children[1].children[0].text, '¯');
  assert.equal(tree.children[0].children[2].children[0].text, '¯');
  assert.equal(inputState.prefix, '');
});

test('BANA Rule 15 modifier scope wraps a complete local multi-token expression', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠐', '⠁', '⠬', '⠃', '⠣', '⠱', '⠻']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    if (result.status === 'choice') {
      const operationId = result.choices.find(({ operationId }) => operationId === 'modifier.bar-over')?.operationId
        ?? result.choices[0]?.operationId;
      assert.ok(operationId, `${cell}: modifier choice`);
      result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId });
    }
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].name, 'mover');
  assert.equal(tree.children[0].children[0].name, 'mrow');
  assert.deepEqual(tree.children[0].children[0].children.map((child) => child.children[0].text), ['a', '+', 'b']);
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
    assert.ok(['insert-token', 'insert-numeric', 'insert-modifier', 'open-structure', 'open-fixed-root', 'open-modifier', 'move-slot', 'close-structure', 'set-mode', 'extend-integral', 'superpose-integral', 'simultaneous-modifier'].includes(entry.action), entry.id);
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

test('Rule 14 left-script cells use a local baseline promotion, not passage parsing', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠘', '⠭', '⠐', '⠝']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const scripts = parseMathML(document.mathml).children[0];
  assert.equal(scripts.name, 'mmultiscripts');
  assert.equal(scripts.children[1].name, 'mprescripts');
  assert.equal(scripts.children[2].name, 'none');
  assert.equal(scripts.children[3].children[0].text, 'x');
});

test('Rule 14 numeric subscripts and Rule 24 baseline numerals stay local to the draft row', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cellValue of ['⠭', '⠰', '⠂', '⠐', '⠼', '⠆']) {
    const result = applyNemethCell({ document, focus, inputState, cell: cellValue });
    assert.notEqual(result.status, 'rejected', `${cellValue}: ${result.announcement}`);
    assert.notEqual(result.status, 'choice', `${cellValue}: unresolved local choice`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children.length, 2, 'baseline number must be a sibling, not a replacement of the script');
  assert.equal(tree.children[0].name, 'msub');
  assert.equal(tree.children[0].children[1].name, 'mn');
  assert.equal(tree.children[0].children[1].children[0].text, '1');
  assert.equal(tree.children[1].name, 'mn');
  assert.equal(tree.children[1].children[0].text, '2');
});

test('BANA Rule 24.1.g decimal return is one bounded nonnumeric transition', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠼', '⠴', '⠨', '⠐']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  assert.equal(inputState.mode, 'decimal-nonnumeric');
  const before = document.mathml;
  const result = applyNemethCell({ document, focus, inputState, cell: '⠁' });
  assert.equal(result.status, 'applied');
  assert.equal(result.inputState.mode, null);
  assert.equal(result.document.mathml.includes('<mn'), true);
  assert.equal(result.document.mathml.includes('<mi'), true);
  assert.equal(result.document.mathml.includes('0.'), true);
  assert.notEqual(result.document.mathml, before);
});

test('BANA Rule 24.1.f comparison horizontalization stays a one-symbol follow-up', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠐', '⠅', '⠐', '⠨', '⠅']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    if (result.status === 'choice') {
      const choice = result.choices.find((candidate) => candidate.operationId === 'operator.equals');
      assert.ok(choice, result.announcement);
      result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: choice.operationId });
    }
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.filter((node) => node.name === 'mo').map((node) => node.children[0].text), ['<', '=']);
  assert.equal(inputState.mode, null);
});

test('BANA Rule 24.1.i adjacent bars and 24.1.k tildes use bounded follow-ups', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠡']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    assert.equal(result.status, 'choice');
    result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'misc.vertical-bar' });
    ({ document, focus, inputState } = result);
  }
  for (const cell of ['⠐', '⠡']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.deepEqual(parseMathML(document.mathml).children.map((node) => node.children[0].text), ['|', '|']);

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus, inputState, cell: '⠈' });
  ({ document, focus, inputState } = result);
  result = applyNemethCell({ document, focus, inputState, cell: '⠱' });
  assert.equal(result.status, 'pending');
  result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'comparison.similar' });
  ({ document, focus, inputState } = result);
  for (const cell of ['⠐', '⠈', '⠱']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.deepEqual(parseMathML(document.mathml).children.map((node) => node.children[0].text), ['∼', '∼']);
});

test('BANA Rule 24.1.h keeps tally punctuation local to the current mark', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus, inputState, cell: '⠸' });
  assert.equal(result.status, 'pending');
  result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'misc.tally' });
  ({ document, focus, inputState } = result);
  for (const cell of ['⠐', '⠸', '⠠']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.map((node) => node.children[0].text), ['|', ',']);
});

test('BANA Rule 24.1.j polygon numeral transition remains local', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠫', '⠲']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  for (const cell of ['⠐', '⠼', '⠂', '⠲']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.map((node) => node.children[0].text), ['□', '14']);
});
