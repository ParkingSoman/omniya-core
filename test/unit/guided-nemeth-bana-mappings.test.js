import assert from 'node:assert/strict';
import test from 'node:test';
import SRE from 'speech-rule-engine';

import { findMathNode, parseMathML } from '../../src/domain/math-tree.js';
import {
  applyNemethCell,
  applyNemethChoice,
  commitNemethLocalCode,
  createEmptyDraftMathDocument,
  inputRegistry,
  operationRegistry,
  registryDiagnostics,
  sourceNotationToCells
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
  ['shape.regular-hexagon', '⠫⠖', '⬡'],
  ['shape.parallel', '⠫⠇', '∥'],
  ['shape.perpendicular', '⠫⠏', '⟂'],
  ['shape.parallelogram', '⠫⠛', '▱'],
  ['shape.regular-pentagon', '⠫⠢', '⬠'],
  ['shape.star', '⠫⠎', '☆'],
  ['shape.trapezoid', '⠫⠵', '⏢'],
  ['shape.inverted-triangle', '⠨⠫', '▽'],
  ['group.angle-open', '⠨⠨⠷', '⟨'],
  ['group.angle-close', '⠨⠨⠾', '⟩'],
  ['group.bold-bracket-open', '⠸⠈⠷', '['],
  ['group.bold-bracket-close', '⠸⠈⠾', ']'],
  ['group.barred-bracket-open', '⠈⠸⠷', '⟦'],
  ['group.barred-bracket-close', '⠈⠸⠾', '⟧'],
  ['group.barred-brace-open', '⠨⠸⠷', '⦃'],
  ['group.barred-brace-close', '⠨⠸⠾', '⦄'],
  ['group.upper-half-open', '⠈⠘⠷', '⎡'],
  ['group.upper-half-close', '⠈⠘⠾', '⎤'],
  ['group.lower-half-open', '⠈⠰⠷', '⎣'],
  ['group.lower-half-close', '⠈⠰⠾', '⎦']
];

const RULE_23_FIXTURES = [
  ['misc.angstrom', '⠈⠠⠁', 'Å'],
  ['misc.crossed-h', '⠈⠓', 'ℏ'],
  ['misc.caret', '⠸⠣', '^'],
  ['misc.cent', '⠈⠉', '¢'],
  ['misc.pound', '⠈⠇', '£'],
  ['misc.euro', '⠈⠑', '€'],
  ['misc.yen', '⠈⠽', '¥'],
  ['misc.per-mille', '⠈⠴⠴', '‰'],
  ['misc.end-proof', '⠈⠫⠟⠑⠙', '∎'],
  ['misc.not-therefore', '⠌⠠⠡', '∴'],
  ['misc.empty-set', '⠸⠴', '∅'],
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
  ['comparison.vertical-bar', '⠳', '|'],
  ['comparison.simple-tilde', '⠈⠱', '∼'],
  ['comparison.extended-tilde', '⠈⠠⠱', '〰'],
  ['misc.ditto', '⠠⠄', '〃'],
  ['misc.hollow-dot', '⠨⠡', '∘'],
  ['misc.triple-prime', '⠄⠄⠄', '‴'],
  ['misc.vertical-bar', '⠳', '|'],
  ['operator.star', '⠫⠎', '☆']
];

const RULE_21_9_MODIFIED_FIXTURES = [
  ['comparison.equals.caret-over', '".k<_<]', '≙'],
  ['comparison.equals.caret-under', '".k%_<]', '='],
  ['comparison.equals.dot-over', '".k<*]', '≐'],
  ['comparison.equals.degree-over', '".k<.*]', '≗'],
  ['comparison.equals.dot-both', '".k%*<*]', '≑'],
  ['comparison.equals.triangle-over', '".k<$t]', '≜'],
  ['comparison.equals.inverted-caret-over', '".k<_%]', '≚'],
  ['comparison.equals.question-over', '".k<_8]', '≟'],
  ['comparison.equals.left-caret-over', '".k<;<]', '='],
  ['comparison.equals.right-caret-over', '".k<;%]', '='],
  ['comparison.equals.two-dots-both', '".k%**<**]', '⩷'],
  ['comparison.equals.vertical-bar-over', '".k<|]', '='],
  ['comparison.horizontal-bar.caret-over', '":<_<]', '^'],
  ['comparison.horizontal-bar.dot-under', '":%*]', '⨪'],
  ['comparison.horizontal-bar.caret-under', '":%_<]', '^'],
  ['comparison.horizontal-bar.tilde-dot-under', '`:%*]', '⨪'],
  ['comparison.greater.bar-over', ':.1', '⋝'],
  ['comparison.greater.equals-over', '.k.1', '⪚'],
  ['comparison.greater.equals-under', '.1.k', '≧'],
  ['comparison.inclusion.bar-over', ':_"k', '⊂'],
  ['comparison.inclusion.bar-under', '_"k:', '⊆'],
  ['comparison.inclusion.equals-over', '.k_"k', '⊂'],
  ['comparison.inclusion.equals-under', '_"k.k', '⊆'],
  ['comparison.less.bar-over', ':"k', '⋜'],
  ['comparison.less.bar-under', '"k:', '≤'],
  ['comparison.less.equals-over', '.k"k', '⪙'],
  ['comparison.less.equals-under', '"k.k', '≤'],
  ['comparison.intersection.bar-under', '.%:', '∩'],
  ['comparison.intersection.equals-under', '.%.k', '∩'],
  ['comparison.logical-product.bar-over', ':`%', '∧'],
  ['comparison.logical-product.bar-over-under', ':`%:', '∧'],
  ['comparison.logical-product.equals-under', '`%.k', '∧'],
  ['comparison.logical-product.bar-under', '`%:', '∧'],
  ['comparison.logical-product.equals-over', '.k`%', '∧'],
  ['comparison.logical-product.equals-over-under', '.k`%:', '∧'],
  ['comparison.logical-product.equals-both', '.k`%.k', '∧'],
  ['comparison.logical-sum.bar-over', ':`+', '∨'],
  ['comparison.logical-sum.bar-under', '`+:', '∨'],
  ['comparison.logical-sum.equals-over', '.k`+', '∨'],
  ['comparison.logical-sum.equals-over-under', '.k`+:', '∨'],
  ['comparison.logical-sum.equals-both', '.k`+.k', '∨'],
  ['comparison.logical-sum.equals-under', '`+.k', '∨'],
  ['comparison.reverse-inclusion.bar-over', ':_.1', '⊃'],
  ['comparison.reverse-inclusion.bar-under', '_.1:', '⊃'],
  ['comparison.reverse-inclusion.equals-under', '_.1.k', '⊃'],
  ['comparison.reverse-inclusion.equals-over', '.k_.1', '⊃'],
  ['comparison.tilde.bar-over-double', ':`:`:', '≈'],
  ['comparison.tilde.bar-over-single', ':`:', '≂'],
  ['comparison.tilde.bar-under-double', '`:`::', '≊'],
  ['comparison.tilde.bar-under-single', '`::', '≃'],
  ['comparison.tilde.double', '`:`:', '≈'],
  ['comparison.tilde.equals-over-double', '.k`:`:', '≈'],
  ['comparison.tilde.equals-over-single', '.k`:', '⩳'],
  ['comparison.tilde.equals-under-double', '`:`:.k', '⩰'],
  ['comparison.tilde.equals-under-single', '`:.k', '∼'],
  ['comparison.union.bar-under', '.+:', '∪'],
  ['comparison.union.equals-under', '.+.k', '∪']
];

const RULE_21_12_SUPERPOSITION_FIXTURES = [
  ['comparison.superposed.dot-equals', '*`.k]', '≐'],
  ['comparison.superposed.dot-subset', '*`_"k]', '⪽'],
  ['comparison.superposed.dot-superset', '*`_.1]', '⪾'],
  ['comparison.superposed.equals-subset', '.k`_"k]', '⊆'],
  ['comparison.superposed.equals-superset', '.k`_.1]', '⊇'],
  ['comparison.superposed.greater-nest', '.1`.1]', '≫'],
  ['comparison.superposed.greater-curved-nest', '..1`..1]', '⪼'],
  ['comparison.superposed.less-nest', '"k`"k]', '≪'],
  ['comparison.superposed.less-curved-nest', '."k`."k]', '⪻'],
  ['comparison.superposed.bar-subset', ':`_"k]', '⊂'],
  ['comparison.superposed.bar-superset', ':`_.1]', '⊃'],
  ['comparison.superposed.arrow-right', '|`$33o]', '⇸'],
  ['comparison.superposed.arrow-left', '|`$[33]', '⇷']
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
    const inserted = tree.children.at(-1);
    assert.equal(inserted.children?.[0]?.text, expected, id);
  }
});

test('BANA Rule 23.10 degree is a local superscript decoration, not a free token', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠼', '⠔', '⠴']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  for (const cell of ['⠘', '⠨', '⠡']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  if (inputState.prefix) {
    const committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', committed.announcement);
    ({ document, focus, inputState } = committed);
  }
  const degree = parseMathML(document.mathml).children[0];
  assert.equal(degree.name, 'msup');
  assert.equal(degree.children[1].children[0].text, '°');
});

test('Rules 20, 21, and 23 table literals remain independently source-linked', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of RULE_20_21_23_LITERALS) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.cells.join(''), cells, id);
    // Rule 20.3's number-sign shares `.#' with italic typeform numbers. At an
    // empty root the typeform wins; seed a numeral so the operator remains
    // independently reachable in its BANA context (`#2.##3`).
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    if (id === 'operator.number-sign') {
      for (const cell of sourceNotationToCells('#2')) {
        let result = applyNemethCell({ document, focus, inputState, cell });
        assert.notEqual(result.status, 'rejected', `${id} seed: ${result.announcement}`);
        ({ document, focus, inputState } = result);
      }
    }
    const tree = applyFixtureFrom(document, focus, inputState, id, cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, expected, id);
  }
});

function applyFixtureFrom(document, focus, inputState, id, cells) {
  const registryEntry = operationRegistry().find((entry) => entry.id === id);
  if (registryEntry?.commitPolicy === 'atomic-sequence' && cells.length > 1) {
    inputState = { ...inputState, prefix: [...cells].slice(0, -1).join('') };
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
  if (inputState.prefix) {
    const choice = applyNemethChoice({ document, focus, inputState, operationId: id });
    assert.notEqual(choice.status, 'rejected', `${id}: ${choice.announcement}`);
    ({ document, focus, inputState } = choice);
  }
  return parseMathML(document.mathml);
}

test('BANA Rule 20.9 tilde operation is distinct from the comparison tilde by local focus context', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const operation = registry.get('operator.tilde');
  assert.ok(operation, 'Rule 20.9 must have an operation-sign mapping');
  assert.deepEqual(operation.banaRefs, ['20.9']);
  assert.equal(operation.args.sourceNotation, '`:');
  assert.equal(operation.commitPolicy, 'immediate');

  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠈', '⠱']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    if (result.status === 'choice') {
      result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'operator.tilde' });
    }
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  if (inputState.prefix) {
    let result = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(result.status, 'choice', result.announcement);
    result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'operator.tilde' });
    assert.equal(result.status, 'applied', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'mo');
  assert.equal(tree.children[0].children[0].text, '∼');

  const comparison = registry.get('comparison.simple-tilde');
  assert.deepEqual(comparison.banaRefs, ['21.6']);
  assert.equal(comparison.args.sourceNotation, '`:');
});

test('BANA Rule 21.9 modified-comparison table is represented by bounded source rows', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation, expected] of RULE_21_9_MODIFIED_FIXTURES) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.args.sourceNotation, sourceNotation, id);
    assert.deepEqual(entry.banaRefs, ['21.9'], id);
    assert.equal(entry.commitPolicy, 'atomic-sequence', id);
    const tree = applyFixture(id, entry.cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, expected, id);
  }
});

test('BANA Rule 21.12 superposition table is represented by bounded source rows', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation, expected] of RULE_21_12_SUPERPOSITION_FIXTURES) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.args.sourceNotation, sourceNotation, id);
    assert.deepEqual(entry.banaRefs, ['15.9', '21.12'], id);
    assert.equal(entry.commitPolicy, 'atomic-sequence', id);
    const tree = applyFixture(id, entry.cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, expected, id);
  }
});

test('BANA Rules 17 and 19 shape and grouping literals are source-linked', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of RULE_17_19_FIXTURES) {
    assert.equal(registry.get(id)?.cells.join(''), cells, id);
    assert.ok(registry.get(id)?.banaRefs.some((ref) => ref.startsWith('17.') || ref.startsWith('19.')), id);
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
    ['arrow.counterclockwise', '⠫⠢⠔⠕', '↝'],
    ['arrow.clockwise', '⠫⠪⠢⠔', '↜'],
    ['arrow.spear.right', '⠫⠶⠶⠕', '⟹'],
    ['arrow.spear.left', '⠫⠪⠶⠶', '⟸'],
    ['arrow.spear.both', '⠫⠪⠶⠶⠕', '⟺'],
    ['arrow.blunted.right', '⠫⠒⠒⠿', '⇢'],
    ['arrow.blunted.left', '⠫⠿⠒⠒', '⇠'],
    ['arrow.blunted.both', '⠫⠿⠒⠒⠿', '⇔'],
    ['arrow.curved.right', '⠫⠒⠒⠽', '⇝'],
    ['arrow.curved.left', '⠫⠯⠒⠒', '⇜'],
    ['arrow.straight.right', '⠫⠒⠒⠳', '⇥'],
    ['arrow.straight.left', '⠫⠳⠒⠒', '⇤'],
    ['arrow.spear.left', '⠫⠪⠶⠶', '⟸'],
    ['arrow.spear.right', '⠫⠶⠶⠕', '⟹'],
    ['arrow.spear.both', '⠫⠪⠶⠶⠕', '⟺'],
    // BANA Rule 22 examples 22-4 through 22-16. These are kept as literal
    // source fixtures, not inferred by an arrow grammar.
    ['arrow.right', '⠫⠕', '→'],
    ['arrow.right.uncontracted', '⠫⠒⠒⠕', '→'],
    ['arrow.left', '⠫⠪⠒⠒', '←'],
    ['arrow.both', '⠫⠪⠒⠒⠕', '↔'],
    ['arrow.vertical-both', '⠫⠣⠪⠒⠒⠕', '↕'],
    ['arrow.northwest', '⠫⠘⠪⠒⠒', '↖'],
    ['arrow.northeast', '⠫⠘⠒⠒⠕', '↗'],
    ['arrow.southeast', '⠫⠰⠒⠒⠕', '↘'],
    ['arrow.southwest', '⠫⠰⠪⠒⠒', '↙'],
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

test('Rule 22 official source examples remain literal registry rows', () => {
  // Source notation is copied from BANA 22.4–22.7. The Unicode cells are the
  // independently transcribed six-dot sequences used by the dispatcher.
  const official = [
    ['arrow.right', '$o', '⠫⠕'],
    ['arrow.right.uncontracted', '$33o', '⠫⠒⠒⠕'],
    ['arrow.left', '$[33', '⠫⠪⠒⠒'],
    ['arrow.both', '$[33o', '⠫⠪⠒⠒⠕'],
    ['arrow.up', '$<33o', '⠫⠣⠒⠒⠕'],
    ['arrow.down', '$%33o', '⠫⠩⠒⠒⠕'],
    ['arrow.northwest', '$~[33', '⠫⠘⠪⠒⠒'],
    ['arrow.northeast', '$~33o', '⠫⠘⠒⠒⠕'],
    ['arrow.southeast', '$;33o', '⠫⠰⠒⠒⠕'],
    ['arrow.southwest', '$;[33', '⠫⠰⠪⠒⠒'],
    ['arrow.northwest-southeast', '$~[33o', '⠫⠘⠪⠒⠒⠕'],
    ['arrow.southwest-northeast', '$;[33o', '⠫⠰⠪⠒⠒⠕'],
    ['arrow.both.short', '$[3o', '⠫⠪⠒⠕'],
    ['arrow.both.long', '$[333o', '⠫⠪⠒⠒⠒⠕'],
    ['arrow.counterclockwise', '$59o', '⠫⠢⠔⠕'],
    ['arrow.clockwise', '$[59', '⠫⠪⠢⠔'],
    ['arrow.spear.right', '$77o', '⠫⠶⠶⠕'],
    ['arrow.spear.left', '$[77', '⠫⠪⠶⠶'],
    ['arrow.spear.both', '$[77o', '⠫⠪⠶⠶⠕'],
    ['arrow.blunted.right', '$33=', '⠫⠒⠒⠿'],
    ['arrow.blunted.left', '$=33', '⠫⠿⠒⠒'],
    ['arrow.blunted.both', '$=33=', '⠫⠿⠒⠒⠿'],
    ['arrow.curved.right', '$33y', '⠫⠒⠒⠽'],
    ['arrow.curved.left', '$&33', '⠫⠯⠒⠒'],
    ['arrow.curved.both', '$&33y', '⠫⠯⠒⠒⠽'],
    ['arrow.straight.right', '$33|', '⠫⠒⠒⠳'],
    ['arrow.straight.left', '$|33', '⠫⠳⠒⠒'],
    ['arrow.straight.both', '$|33|', '⠫⠳⠒⠒⠳']
  ];
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, source, cells] of official) {
    assert.equal(registry.get(id)?.cells.join(''), cells, `${id}: ${source}`);
    assert.ok(registry.get(id)?.banaRefs.some((ref) => ref.startsWith('22.')), `${id}: ${source}`);
  }
});

test('Rule 22 directional and shaft constructions retain their published source notation', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation] of [
    ['arrow.right', '$o'],
    ['arrow.right.uncontracted', '$33o'],
    ['arrow.left', '$[33'],
    ['arrow.both', '$[33o'],
    ['arrow.up', '$<33o'],
    ['arrow.down', '$%33o'],
    ['arrow.vertical-both', '$<[33o'],
    ['arrow.northwest', '$~[33'],
    ['arrow.northeast', '$~33o'],
    ['arrow.southeast', '$;33o'],
    ['arrow.southwest', '$;[33'],
    ['arrow.northwest-southeast', '$~[33o'],
    ['arrow.southwest-northeast', '$;[33o'],
    ['arrow.both.short', '$[3o'],
    ['arrow.both.long', '$[333o'],
    ['arrow.counterclockwise', '$59o'],
    ['arrow.clockwise', '$[59'],
    ['arrow.bold.right', '$_33o'],
    ['arrow.bold.left', '$_[33'],
    ['arrow.bold.both', '$_[33o'],
    ['arrow.blunted.right', '$33='],
    ['arrow.blunted.left', '$=33'],
    ['arrow.blunted.both', '$=33='],
    ['arrow.curved.right', '$33y'],
    ['arrow.curved.left', '$&33'],
    ['arrow.curved.both', '$&33y'],
    ['arrow.straight.right', '$33|'],
    ['arrow.straight.left', '$|33'],
    ['arrow.straight.both', '$|33|']
  ]) assert.equal(registry.get(id)?.args?.sourceNotation, sourceNotation, id);
});

test('BANA Rule 22.3 and 22.7.2 arrow constructions are complete bounded atoms', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation] of [
    ['arrow.bold.vertical-both', '$<_[33o'],
    ['arrow.spear.northwest-blunted', '$~=77'],
    ['arrow.upper-left', '$`[33'],
    ['arrow.lower-left', '$,[33'],
    ['arrow.upper-right', '$33`o'],
    ['arrow.lower-right', '$33,o'],
    ['arrow.both-upper-barbs', '$`[33`o'],
    ['arrow.both-lower-barbs', '$,[33,o'],
    ['arrow.left-upper-right-lower', '$`[33,o'],
    ['arrow.left-lower-right-upper', '$,[33`o'],
    ['arrow.left-upper-right-full', '$`[33o'],
    ['arrow.left-lower-right-full', '$,[33o'],
    ['arrow.left-full-right-upper', '$[33`o'],
    ['arrow.left-full-right-lower', '$[33,o']
  ]) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.commitPolicy, 'atomic-sequence', id);
    assert.equal(entry.args?.sourceNotation, sourceNotation, id);
    assert.ok(entry.banaRefs.some((ref) => ref.startsWith('22.')), id);
    assert.ok(entry.args?.dataAttributes?.['data-omniya-nemeth-intent'], id);
  }
});

test('Rule 22 two-way arrows that share a one-way prefix remain one atom', () => {
  for (const [id, expected] of [
    ['arrow.both.short', '↔'],
    ['arrow.both.long', '⟷'],
    ['arrow.northwest-southeast', '⤡'],
    ['arrow.southwest-northeast', '⤢']
  ]) {
    const entry = operationRegistry().find((candidate) => candidate.id === id);
    const tree = applyFixture(id, entry.cells);
    const inserted = tree.children.at(-1);
    assert.equal(inserted.name, 'mo', id);
    assert.equal(inserted.children?.[0]?.text, expected, id);
    assert.equal(tree.children.filter((node) => node.name === 'mi').length, 0, id);
  }
});

test('incomplete bounded arrow input never mutates the draft', () => {
  const entry = operationRegistry().find((candidate) => candidate.id === 'arrow.spear.northwest-blunted');
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of entry.cells.slice(0, -1)) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected');
    ({ document, focus, inputState } = result);
  }
  const before = document.mathml;
  const rejected = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.document.mathml, before);
});

test('BANA Rule 17 interior constructions and Rule 15 simultaneous modifiers are bounded', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, value] of [
    ['shape.circle.interior-cross', '⠫⠉⠸⠫⠈⠡⠻', '⊗'],
    ['shape.circle.interior-minus', '⠫⠉⠸⠫⠤⠻', '⊖'],
    ['shape.square.interior-diagonals', '⠫⠲⠸⠫⠢⠈⠔⠻', '⊠'],
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

test('audited composite rows retain the BANA source notation alongside cells', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation] of [
    ['operator.multiply', '`*'],
    ['misc.infinity', ',='],
    ['arrow.spear.right', '$77o'],
    ['shape.angle.interior-arc', '$[_$$a}'],
    ['shape.regular-hexagon', '$6'],
    ['shape.regular-pentagon', '$5']
  ]) {
    assert.equal(registry.get(id)?.args?.sourceNotation, sourceNotation, id);
  }
});

test('BANA 20.7 keeps cross, dot, and asterisk as distinct local operations', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  assert.equal(registry.get('operator.multiply')?.args?.sourceNotation, '`*');
  assert.equal(registry.get('operator.dot')?.args?.sourceNotation, '*');
  assert.equal(registry.get('operator.asterisk')?.cells.join(''), '⠈⠼');
  assert.notEqual(registry.get('operator.multiply')?.args?.value, registry.get('operator.dot')?.args?.value);
});

test('BANA source notation is retained for the basic Rule 20 and comparison atoms', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation] of [
    ['operator.plus', '+'],
    ['operator.minus', '-'],
    ['operator.equals', '.k'],
    ['comparison.less', '"k'],
    ['comparison.greater', '.1'],
    ['operator.ampersand', '_&'],
    ['operator.number-sign', '.#'],
    ['operator.paragraph', '`,p'],
    ['operator.section', '`,s'],
    ['operator.star', '$s'],
    ['operator.circle-dot', '$c_$*]'],
    ['operator.circle-plus', '$c_$+]'],
    ['operator.circle-minus', '$c_$-]'],
    ['operator.plus-minus', '+-'],
    ['operator.minus-plus', '-+'],
    ['operator.minus-bold', '_-'],
    ['operator.minus-minus', '-"-'],
    ['operator.minus-plus-bold', '_-"_+'],
    ['operator.minus-plus-horizontal', '-"+'],
    ['operator.minus-plus-regular-bold', '-"_+'],
    ['operator.plus-bold', '_+'],
    ['operator.plus-minus-bold', '_+"_-'],
    ['operator.plus-minus-regular', '+"-'],
    ['operator.plus-minus-regular-bold', '+"_-'],
    ['operator.proper-difference', '.-'],
    ['operator.union', '.+'],
    ['operator.intersection', '.%'],
    ['operator.logical-and', '`%'],
    ['operator.logical-or', '`+'],
    ['operator.divides', '|'],
    ['comparison.not-equal', '/.k'],
    ['comparison.equivalence', '`<,<'],
    ['comparison.contains', '`5'],
    ['comparison.not-contains', '/`5'],
    ['comparison.less-equal', '"k:'],
    ['comparison.greater-equal', '.1:'],
    ['comparison.identical', '_l'],
    ['comparison.not-less', '/"k'],
    ['comparison.not-greater', '/.1'],
    ['misc.not-identical', '/_l'],
    ['misc.infinity', ',='],
    ['misc.tally', '_'],
    ['misc.percent', '`0'],
    ['misc.per-mille', '`00'],
    ['misc.partial', '`d'],
    ['misc.therefore', ',*'],
    ['misc.not-therefore', '/,*'],
    ['misc.since', '`/'],
    ['misc.degree', '~.*'],
    ['misc.prime', "'"],
    ['misc.double-prime', "''"],
    ['misc.triple-prime', "'''"],
    ['misc.empty-set', '_0'],
    ['misc.does-not-divide', '/|'],
    ['quantifier.forall', '`&'],
    ['quantifier.exists', '`='],
    ['quantifier.exists-unique', '`=|'],
    ['quantifier.not-exists', '/`='],
    ['misc.end-proof', '@$qed'],
    ['omission.general', '='],
    ['shape.parallel', '$l'],
    ['shape.perpendicular', '$p']
  ]) {
    assert.equal(registry.get(id)?.args?.sourceNotation, sourceNotation, id);
  }
});

test('BANA Rules 9, 12, 13, 14, 15, 16, and 19 retain the printed local codes', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation] of [
    ['reference.asterisk', '@#'],
    ['reference.dagger', '_]'],
    ['reference.double-dagger', '__]'],
    ['reference.general', '@]'],
    ['cancellation.start', '['],
    ['cancellation.end', ']'],
    ['fraction.start.simple', '?'],
    ['fraction.next.denominator', '/'],
    ['fraction.next.denominator.diagonal', '_/'],
    ['fraction.end.simple', '#'],
    ['fraction.start.complex', ',?'],
    ['fraction.next.denominator.complex', ',/'],
    ['fraction.next.denominator.complex.diagonal', ',_/'],
    ['fraction.end.complex', ',#'],
    ['fraction.start.hypercomplex', ',,?'],
    ['fraction.next.denominator.hypercomplex', ',,/'],
    ['fraction.next.denominator.hypercomplex.diagonal', ',,_/'],
    ['fraction.end.hypercomplex', ',,#'],
    ['fraction.start.mixed', '_?'],
    ['fraction.next.denominator.mixed', '/'],
    ['fraction.next.denominator.mixed.diagonal', '_/'],
    ['fraction.end.mixed', '_#'],
    ['script.superscript', '~'],
    ['script.subscript', ';'],
    ['script.sup-sub', '~;'],
    ['script.sub-sup', ';~'],
    ['script.baseline', '"'],
    ['script.contracted-comma', '['],
    ['modifier.directly-over', '<'],
    ['modifier.directly-under', '%'],
    ['modifier.directly-over.higher', '<<'],
    ['modifier.directly-under.higher', '%%'],
    ['modifier.bar-over', ':'],
    ['modifier.caret.over', '_<'],
    ['modifier.caret.inverted', '_%'],
    ['modifier.caret.left', ';<'],
    ['modifier.caret.right', ';%'],
    ['modifier.dot', '*'],
    ['modifier.hollow-dot', '.*'],
    ['modifier.question', '_8'],
    ['modifier.tilde.extended', '`,:'],
    ['modifier.tilde.simple', '`:'],
    ['modifier.triangle', '$t'],
    ['radical.square', '>'],
    ['radical.cube', '<3>'],
    ['radical.fourth', '<4>'],
    ['radical.end', ']'],
    ['radical.indexed', '<'],
    ['radical.next.radicand', '/'],
    ['radical.indexed.end', ']'],
    ['group.parenthesis-open', '('],
    ['group.parenthesis-close', ')'],
    ['group.round', '('],
    ['group.round.end', ')'],
    ['group.bracket-open', '@('],
    ['group.bracket-close', '@)'],
    ['group.brace-open', '.('],
    ['group.brace-close', '.)'],
    ['group.angle-open', '..('],
    ['group.angle-close', '..)'],
    ['group.bold-bracket-open', '_@('],
    ['group.bold-bracket-close', '_@)'],
    ['group.barred-bracket-open', '@_('],
    ['group.barred-bracket-close', '@_)'],
    ['group.barred-brace-open', '._('],
    ['group.barred-brace-close', '._)'],
    ['group.upper-half-open', '@^('],
    ['group.upper-half-close', '@^)'],
    ['group.lower-half-open', '@;('],
    ['group.lower-half-close', '@;)'],
    ['group.vertical-bar', '|']
  ]) {
    assert.equal(registry.get(id)?.args?.sourceNotation, sourceNotation, id);
  }
});

test('BANA Rules 8.4, 8.7, and 16.3 use bounded local transitions', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  assert.equal(registry.get('punctuation.short-dash')?.args?.sourceNotation, '--');
  assert.equal(registry.get('punctuation.short-dash')?.commitPolicy, 'atomic-sequence');
  assert.equal(registry.get('plural.s')?.args?.sourceNotation, 's');
  assert.equal(registry.get('plural.s')?.action, 'append-plural');
  assert.equal(registry.get('script.possessive')?.action, 'append-possessive');
  for (const [id, notation, order] of [
    ['radical.order.one', '.', 1], ['radical.order.two', '..', 2], ['radical.order.three', '...', 3]
  ]) {
    assert.equal(registry.get(id)?.args?.sourceNotation, notation, id);
    assert.equal(registry.get(id)?.args?.mode, `radical-order:${order}`, id);
  }
});

test('BANA Rule 3.7 ordinal endings are bounded numeric suffixes', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, ending] of [
    ['ordinal.st', '⠎⠞', 'st'], ['ordinal.nd', '⠝⠙', 'nd'],
    ['ordinal.rd', '⠗⠙', 'rd'], ['ordinal.th', '⠞⠓', 'th']
  ]) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.deepEqual(entry.cells.join(''), cells, id);
    assert.deepEqual(entry.banaRefs, ['3.7'], id);
    assert.equal(entry.commitPolicy, 'atomic-sequence', id);
    assert.equal(entry.args.ending, ending, id);
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let state = { prefix: '', mode: 'numeric' };
    let result = applyNemethCell({ document, focus, inputState: state, cell: '⠼' });
    assert.equal(result.status, 'pending');
    ({ document, focus, inputState: state } = result);
    result = applyNemethCell({ document, focus, inputState: state, cell: '⠂' });
    assert.equal(result.status, 'applied');
    ({ document, focus, inputState: state } = result);
    // The numeric indicator's passage mode is complete for this one local
    // atom. End it explicitly before entering the bounded ordinal suffix.
    state = { ...state, mode: null };
    for (const cell of [...entry.cells]) {
      result = applyNemethCell({ document, focus, inputState: state, cell });
      assert.notEqual(result.status, 'rejected', `${id}: ${result.announcement}`);
    ({ document, focus, inputState: state } = result);
    }
    const committed = commitNemethLocalCode({ document, focus, inputState: state });
    assert.equal(committed.status, 'applied', id);
    const tree = parseMathML(committed.document.mathml);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, ending, id);
  }
});

test('Rule 19.2 horizontal grouping signs reuse the structural modifier registry', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, source, value] of [
    ['modifier.horizontal-brace-over', '.(', '⏞'],
    ['modifier.horizontal-brace-under', '.)', '⏟'],
    ['modifier.horizontal-bracket-over', '@(', '⏜'],
    ['modifier.horizontal-bracket-under', '@)', '⏝']
  ]) {
    const entry = registry.get(id);
    assert.ok(entry);
    assert.equal(entry.commitPolicy, 'structural-followup');
    assert.equal(entry.action, 'insert-modifier');
    assert.equal(entry.args.sourceNotation, source);
    assert.equal(entry.args.value, value);
    assert.deepEqual(entry.banaRefs, ['19.2', '15.2.1']);
  }
});

test('Rule 14.4.4 four-component level indicators remain bounded registry rows', () => {
  const rows = operationRegistry().filter((entry) => entry.banaRefs.includes('14.4.4'));
  assert.equal(rows.length, 16);
  assert.ok(rows.some((entry) => entry.args.sourceNotation === '~~~~'));
  assert.ok(rows.some((entry) => entry.args.sourceNotation === ';;;;'));
  assert.ok(rows.every((entry) => entry.action === 'open-script-chain' && entry.commitPolicy === 'atomic-sequence'));
});

test('Rule 11.1.2 keeps the omission long dash distinct from Rule 8.8 punctuation', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const punctuation = registry.get('punctuation.long-dash');
  const omission = registry.get('omission.long-dash');
  assert.deepEqual(punctuation.cells, omission.cells);
  assert.notDeepEqual(punctuation.banaRefs, omission.banaRefs);
  assert.equal(omission.args.sourceNotation, '----');
  assert.equal(omission.args.dataAttributes['data-omniya-nemeth-intent'], 'omission-long-dash');
  assert.equal(omission.commitPolicy, 'atomic-sequence');
});


test('BANA Rule 13 preserves horizontal versus diagonal fraction lines', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation, cells, bevelled] of [
    ['fraction.next.denominator', '/', '⠌', false],
    ['fraction.next.denominator.diagonal', '_/', '⠸⠌', true],
    ['fraction.next.denominator.complex', ',/', '⠠⠌', false],
    ['fraction.next.denominator.complex.diagonal', ',_/', '⠠⠸⠌', true],
    ['fraction.next.denominator.hypercomplex', ',,/', '⠠⠠⠌', false],
    ['fraction.next.denominator.hypercomplex.diagonal', ',,_/', '⠠⠠⠸⠌', true],
    ['fraction.next.denominator.mixed', '/', '⠌', false],
    ['fraction.next.denominator.mixed.diagonal', '_/', '⠸⠌', true]
  ]) {
    const entry = registry.get(id);
    assert.equal(entry?.args?.sourceNotation, sourceNotation, id);
    assert.equal(entry?.cells.join(''), cells, id);
    assert.equal(entry?.args?.bevelled, bevelled, id);
  }
});

test('Rule 13.8.2 retains a source-linked higher-order hypercomplex family', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const id of [
    'fraction.start.hypercomplex.order3',
    'fraction.next.denominator.hypercomplex.order3',
    'fraction.next.denominator.hypercomplex.order3.diagonal',
    'fraction.end.hypercomplex.order3'
  ]) {
    const entry = registry.get(id);
    assert.ok(entry);
    assert.deepEqual(entry.banaRefs, ['13.8.2']);
    assert.ok(entry.args.sourceNotation.startsWith(',,,'));
  }
});

test('Rules 17.6.2 and 17.6.3 retain complete multi-interior shape constructions', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, ref] of [['shape.circle.interior-arrows-horizontal', '17.6.2'], ['shape.circle.interior-arrows-vertical', '17.6.3']]) {
    const entry = registry.get(id);
    assert.ok(entry);
    assert.deepEqual(entry.banaRefs, [ref]);
    assert.equal(entry.commitPolicy, 'atomic-sequence');
    assert.ok(entry.args.sourceNotation.startsWith('$c_$$'));
  }
});

test('BANA Rules 17 and 18 retain exact published local source notation', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation] of [
    ['shape.circle', '$c'],
    ['shape.diamond', '$d'],
    ['shape.ellipse', '$e'],
    ['shape.regular-hexagon', '$6'],
    ['shape.parallelogram', '$g'],
    ['shape.regular-pentagon', '$5'],
    ['shape.star', '$s'],
    ['shape.trapezoid', '$z'],
    ['shape.inverted-triangle', '.$'],
    ['shape.square', '$4'],
    ['shape.triangle', '$t'],
    ['shape.rectangle', '$r'],
    ['shape.arc.down', '$a'],
    ['shape.arc.up', "$'"],
    ['shape.rhombus', '$h'],
    ['shape.intersecting-lines', '$i'],
    ['shape.quadrilateral', '$q'],
    ['shape.irregular-hexagon', '$hx'],
    ['shape.irregular-pentagon', '$pg'],
    ['shape.irregular-octagon', '$oc'],
    ['shape.regular-octagon', '$8'],
    ['shape.regular-dodecagon', '$12'],
    ['shape.filled-circle', '$_c'],
    ['shape.filled-square', '$_4'],
    ['shape.shaded-circle', '$.c'],
    ['shape.shaded-ellipse', '$.e'],
    ['function.sin', 'sin'],
    ['function.limit.upper', '<lim'],
    ['function.limit.lower', '%lim']
  ]) assert.equal(registry.get(id)?.args?.sourceNotation, sourceNotation, id);
});

test('shaded BANA shapes remain canonical operator atoms', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const id of ['shape.shaded-circle', 'shape.shaded-ellipse']) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.args.name, 'mo', id);
    const tree = applyFixture(id, entry.cells);
    assert.equal(tree.children.at(-1)?.name, 'mo', id);
  }
});

test('the registry does not advertise integral superpositions absent from the Rule 23 symbol table', () => {
  const ids = new Set(operationRegistry().map((entry) => entry.id));
  for (const id of [
    'integral.superpose.clockwise',
    'integral.superpose.anticlockwise',
    'integral.superpose.finite-part',
    'integral.superpose.double-stroke',
    'integral.superpose.times',
    'integral.superpose.intersection',
    'integral.superpose.union'
  ]) assert.equal(ids.has(id), false, id);
});

test('BANA Rule 9.2 general reference indicator consumes exactly one local atom', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠈', '⠻', '⠙']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children.at(-1)?.children?.[0]?.text, 'd');
  assert.equal(tree.children.at(-1)?.attrs?.['data-omniya-nemeth-intent'], 'general-reference');
  assert.equal(inputState.mode, null);
});

test('BANA Rule 9.2 accepts the bounded English-letter indicator before a reference letter', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠈', '⠻', '⠰', '⠙']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children.at(-1)?.children?.[0]?.text, 'd');
  assert.equal(tree.children.at(-1)?.attrs?.['data-omniya-nemeth-cells'], '⠈⠻⠰⠙');
  assert.equal(inputState.mode, null);
});

test('BANA Rule 9.2 accepts the numeric indicator before a reference numeral', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠈', '⠻', '⠼', '⠂']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  const reference = tree.children.at(-1);
  assert.equal(reference?.children?.[0]?.text, '1');
  assert.equal(reference?.attrs?.['data-omniya-nemeth-intent'], 'general-reference');
  assert.equal(reference?.attrs?.['data-omniya-nemeth-cells'], '⠈⠻⠼⠂');
  assert.equal(inputState.mode, null);
});

test('BANA Rule 20.7 keeps a lower-cell numeral valid immediately after times', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠼', '⠂', '⠨', '⠲', '⠈', '⠡', '⠂']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
});

test('example 9-2 authored cells are valid at each draft focus', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  const cells = ['⠼', '⠂', '⠨', '⠲', '⠶', '⠴', '⠔', '⠈', '⠡', '⠂', '⠴', '⠘', '⠦', '⠀', '⠅', '⠍', '⠲', '⠀', '⠈', '⠻', '⠼', '⠂'];
  for (const [index, authored] of cells.entries()) {
    let result = applyNemethCell({ document, focus, inputState, cell: authored });
    if (result.status === 'choice') {
      const preferred = result.choices.find((choice) => ['operator.multiply', 'reference.general'].includes(choice.operationId))
        ?? result.choices[0];
      result = applyNemethChoice({
        document: result.document,
        focus: result.focus,
        inputState: result.inputState,
        operationId: preferred.operationId
      });
    }
    assert.notEqual(result.status, 'rejected', `cell ${index} ${authored}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  const visit = (node, found = []) => {
    if (node?.attrs?.['data-omniya-nemeth-intent'] === 'general-reference') found.push(node);
    for (const child of node?.children ?? []) visit(child, found);
    return found;
  };
  const reference = visit(tree).at(-1);
  assert.equal(reference?.children?.[0]?.text, '1');
  assert.equal(reference?.attrs?.['data-omniya-nemeth-cells'], '⠈⠻⠼⠂');
});

test('BANA Rule 9.3.2 accepts a numeral immediately after an authored comma focus', () => {
  const commaId = 'rule9-comma-focus';
  const document = {
    mathml: `<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow data-omniya-id="rule9-row"><mo data-omniya-id="${commaId}" data-omniya-nemeth-intent="punctuation-comma">,</mo></mrow></math>`
  };
  const result = applyNemethCell({
    document,
    focus: { kind: 'node', nodeId: commaId },
    inputState: { prefix: '', mode: null },
    cell: '⠆'
  });
  assert.notEqual(result.status, 'rejected', result.announcement);
});

test('BANA Rule 9.1 exposes the reference star separately from the shape family', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const entry = registry.get('reference.star');
  assert.ok(entry);
  assert.deepEqual(entry.cells, ['⠫', '⠎']);
  assert.equal(entry.args?.sourceNotation, '$s');
  assert.ok(entry.banaRefs.includes('9.1'));
});

test('BANA Rule 9.4 exposes the pencil as one transcriber-defined icon', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const entry = registry.get('reference.icon.pencil');
  assert.ok(entry);
  assert.deepEqual(entry.cells, ['⠈', '⠫', '⠏']);
  assert.equal(entry.args?.sourceNotation, '`$p');
  assert.ok(entry.banaRefs.includes('9.4'));
  assert.deepEqual(registry.get('reference.icon.pencil-capital')?.cells, ['⠈', '⠫', '⠠', '⠏']);
  assert.equal(registry.get('shape.perpendicular')?.banaRefs.includes('9.4'), false);
});

test('example 9-7 keeps numeric-start on numbers that follow an authored blank after a pencil', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  const cells = ['⠈', '⠫', '⠏', '⠀', '⠼', '⠶', '⠢', '⠸', '⠲', '⠀', '⠭', '⠘', '⠲', '⠐', '⠤', '⠽', '⠘', '⠆', '⠀', '⠈', '⠫', '⠠', '⠏', '⠀', '⠼', '⠶', '⠖', '⠸', '⠲', '⠀', '⠭', '⠘', '⠆', '⠐', '⠬', '⠢', '⠽', '⠤', '⠂', '⠂', '⠆'];
  for (const [index, authored] of cells.entries()) {
    let result = applyNemethCell({ document, focus, inputState, cell: authored });
    if (result.status === 'choice') {
      const preferred = result.choices.find((choice) => choice.operationId.startsWith('reference.icon.pencil'))
        ?? result.choices[0];
      result = applyNemethChoice({
        document: result.document,
        focus: result.focus,
        inputState: result.inputState,
        operationId: preferred.operationId
      });
    }
    assert.notEqual(result.status, 'rejected', `cell ${index} ${authored}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const intents = [];
  const visit = (node) => {
    if (node?.name === 'mn' || node?.attrs?.['data-omniya-nemeth-intent']?.includes?.('pencil')) {
      intents.push({
        name: node.name,
        text: node.children?.[0]?.text,
        intent: node.attrs?.['data-omniya-nemeth-intent'],
        cells: node.attrs?.['data-omniya-nemeth-cells']
      });
    }
    for (const child of node?.children ?? []) visit(child);
  };
  visit(parseMathML(document.mathml));
  const seventyFive = intents.find((node) => node.text === '75');
  const seventySix = intents.find((node) => node.text === '76');
  assert.equal(seventyFive?.intent, 'numeric-start');
  assert.equal(seventySix?.intent, 'numeric-start');
  assert.equal(intents.find((node) => node.intent === 'transcriber-defined-pencil-icon')?.cells, '⠈⠫⠏');
  assert.equal(intents.find((node) => node.intent === 'transcriber-defined-pencil-icon-capital')?.cells, '⠈⠫⠠⠏');
});

test('BANA Rule 9.4 blank after a numeric superscript returns to the surrounding row', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠭', '⠘', '⠆', '⠀', '⠽']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children.at(-1)?.children?.[0]?.text, 'y');
});

test('BANA Rule 9.4 baseline indicator before plus leaves a numeric superscript', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠭', '⠘', '⠆', '⠐', '⠬', '⠢']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children.some((node) => node.name === 'mo' && node.children?.[0]?.text === '+'), true);
});

test('BANA Rule 9.4 retains repeated one cells inside the numeral 112', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠼', '⠂', '⠂', '⠆']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.equal(parseMathML(document.mathml).children.at(-1)?.children?.[0]?.text, '112');
});

test('BANA Rule 17 structural and interior shape codes use the published cells', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const fixtures = [
    ['shape.angle.alternate-exterior', '$[.ae]', '⠫⠪⠨⠁⠑⠻'],
    ['shape.angle.alternate-interior', '$[.ai]', '⠫⠪⠨⠁⠊⠻'],
    ['shape.angle.complementary', '$[.cp]', '⠫⠪⠨⠉⠏⠻'],
    ['shape.angle.corresponding', '$[.c]', '⠫⠪⠨⠉⠻'],
    ['shape.angle.exterior', '$[.e]', '⠫⠪⠨⠑⠻'],
    ['shape.angle.interior', '$[.i]', '⠫⠪⠨⠊⠻'],
    ['shape.angle.obtuse', '$[.o]', '⠫⠪⠨⠕⠻'],
    ['shape.angle.straight', '$[.s]', '⠫⠪⠨⠎⠻'],
    ['shape.angle.supplementary', '$[.sp]', '⠫⠪⠨⠎⠏⠻'],
    ['shape.angle.vertical', '$[.v]', '⠫⠪⠨⠧⠻'],
    ['shape.triangle.acute', '$t.a]', '⠫⠞⠨⠁⠻'],
    ['shape.square.interior-horizontal-bar', '$4_$:]', '⠫⠲⠸⠫⠱⠻'],
    ['shape.rectangle.interior-bar', '$r_$:]', '⠫⠗⠸⠫⠱⠻']
  ];
  for (const [id, sourceNotation, cells] of fixtures) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.args?.sourceNotation, sourceNotation, id);
    assert.equal(entry.cells.join(''), cells, id);
    assert.ok(entry.banaRefs.includes('17.5') || entry.banaRefs.includes('17.6.1'), id);
  }
});

test('BANA Rule 19 enlarged and double grouping codes remain local atoms', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const fixtures = [
    ['group.round-enlarged-open', ',(', '⠠⠷'],
    ['group.bracket-enlarged-open', '@,(', '⠈⠠⠷'],
    ['group.brace-enlarged-open', '.,(', '⠨⠠⠷'],
    ['group.angle-enlarged-open', '..,(', '⠨⠨⠠⠷'],
    ['group.vertical-double-open', '\\\\', '⠳⠳'],
    ['group.vertical-enlarged-open', ',\\', '⠠⠳'],
    ['group.bold-vertical-double-open', '_\\_\\', '⠸⠳⠸⠳'],
    ['group.barred-bracket-enlarged-open', '@_,(', '⠈⠸⠠⠷'],
    ['group.upper-half-enlarged-open', '@^,(', '⠈⠘⠠⠷'],
    ['group.lower-half-enlarged-open', '@;,(', '⠈⠰⠠⠷']
  ];
  for (const [id, sourceNotation, cells] of fixtures) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.args?.sourceNotation, sourceNotation.trim(), id);
    assert.equal(entry.cells.join(''), cells, id);
    assert.ok(entry.banaRefs.includes('19.1') || entry.banaRefs.includes('19.4') || entry.banaRefs.includes('19.5'), id);
  }
});

test('BANA Rule 21 direct composites retain their source notation and cells', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation, cells] of [
    ['comparison.vertical-arrow-pair', '$33o$[33', '⠫⠒⠒⠕⠫⠪⠒⠒'],
    ['comparison.greater-less', '.1""k', '⠨⠂⠐⠐⠅'],
    ['comparison.less-greater', '"k".1', '⠐⠅⠐⠨⠂'],
    ['comparison.greater-equals-less', '.1".k""k', '⠨⠂⠐⠨⠅⠐⠐⠅'],
    ['comparison.less-equals-greater', '"k".k".1', '⠐⠅⠐⠨⠅⠐⠨⠂']
  ]) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.args?.sourceNotation, sourceNotation, id);
    assert.equal(entry.cells.join(''), cells, id);
    assert.equal(entry.commitPolicy, 'atomic-sequence', id);
    assert.ok(entry.banaRefs.includes('21.9') || entry.banaRefs.includes('21.11'), id);
  }
});

test('BANA Rule 21 modified and compounded comparison codes are bounded local atoms', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, sourceNotation, cells] of [
    ['comparison.equals.caret-over', '".k<_<]', '⠐⠨⠅⠣⠸⠣⠻'],
    ['comparison.equals.dot-over', '".k<*]', '⠐⠨⠅⠣⠡⠻'],
    ['comparison.horizontal-bar.dot-under', '":%*]', '⠐⠱⠩⠡⠻'],
    ['comparison.greater.bar-over', ':.1', '⠱⠨⠂'],
    ['comparison.less.equals-under', '"k.k', '⠐⠅⠨⠅'],
    ['comparison.logical-product.bar-over', ':`%', '⠱⠈⠩'],
    ['comparison.logical-sum.equals-under', '`+.k', '⠈⠬⠨⠅'],
    ['comparison.reverse-inclusion.equals-over', '.k_.1', '⠨⠅⠸⠨⠂'],
    ['comparison.tilde.bar-over-double', ':`:`:', '⠱⠈⠱⠈⠱'],
    ['comparison.union.equals-under', '.+.k', '⠨⠬⠨⠅']
  ]) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.commitPolicy, 'atomic-sequence', id);
    assert.equal(entry.args?.sourceNotation, sourceNotation, id);
    assert.equal(entry.cells.join(''), cells, id);
    assert.ok(entry.banaRefs.some((ref) => ref.startsWith('21.')), id);
  }
});

test('new BANA atoms commit through the same bounded transition engine', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const ids = [
    'shape.angle.alternate-exterior',
    'shape.angle.complementary',
    'shape.triangle.acute',
    'shape.square.interior-horizontal-bar',
    'shape.rectangle.interior-bar',
    'group.round-enlarged-open',
    'group.bracket-enlarged-open',
    'group.angle-enlarged-open',
    'group.vertical-double-open',
    'group.vertical-enlarged-open',
    'group.bold-vertical-double-open',
    'group.barred-bracket-enlarged-open',
    'group.upper-half-enlarged-open',
    'group.lower-half-enlarged-open',
    'comparison.vertical-arrow-pair',
    'comparison.greater-less',
    'comparison.less-greater',
    'comparison.greater-equals-less',
    'comparison.less-equals-greater',
    'arrow.bold.vertical-both',
    'arrow.spear.northwest-blunted',
    'arrow.upper-left',
    'arrow.lower-left',
    'arrow.upper-right',
    'arrow.lower-right',
    'arrow.both-upper-barbs',
    'arrow.both-lower-barbs',
    'arrow.left-upper-right-lower',
    'arrow.left-lower-right-upper',
    'arrow.left-upper-right-full',
    'arrow.left-lower-right-full',
    'arrow.left-full-right-upper',
    'arrow.left-full-right-lower'
  ];
  for (const id of ids) {
    const entry = registry.get(id);
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    let result;
    for (const cell of entry.cells) {
      result = applyNemethCell({ document, focus, inputState, cell });
      assert.notEqual(result.status, 'rejected', `${id}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    if (result.status === 'pending') {
      result = commitNemethLocalCode({ document, focus, inputState });
      assert.notEqual(result.status, 'rejected', `${id}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    if (result.status === 'choice') {
      const choice = result.choices.find((candidate) => candidate.operationId === id);
      assert.ok(choice, `${id}: ${result.announcement}`);
      result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: id });
      assert.notEqual(result.status, 'rejected', `${id}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    assert.equal(result.status, 'applied', id);
    const tree = parseMathML(document.mathml);
    const values = [];
    const collect = (node) => {
      if (node.text !== undefined) values.push(node.text);
      else for (const child of node.children ?? []) collect(child);
    };
    collect(tree);
    assert.ok(values.includes(entry.args.value), `${id}: ${entry.args.value}`);
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
  if (result.status === 'choice') {
    result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'indicator.english-letter' });
  }
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
    if (id === 'function.limit.upper' || id === 'function.limit.lower') {
      assert.equal(tree.children[0].name, id.endsWith('upper') ? 'mover' : 'munder', id);
      assert.equal(tree.children[0].children[0].children[0].text, value, id);
      assert.equal(tree.children[0].children[1].attrs['data-omniya-hole'], 'true', id);
    } else assert.equal(tree.children[0].children[0].text, value, id);
  }
});

test('BANA Rule 23 repeated integrals use immediate and bounded forms', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const entry = registry.get('integral.extend');
  assert.equal(entry?.cells.join(''), '⠮');
  assert.equal(entry?.args?.sourceNotation, '!!');
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

test('BANA Rule 23.12 composes integral bounds through generic script follow-ups', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠮', '⠰', '⠁', '⠘', '⠃']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    if (result.status === 'choice') {
      assert.fail(`Unexpected ambiguity for ${cell}: ${result.announcement}`);
    }
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  const integral = tree.children[0];
  assert.equal(integral.name, 'msubsup');
  assert.deepEqual(integral.children.map((child) => child.children?.[0]?.text), ['∫', 'a', 'b']);
  assert.equal(inputState.prefix, '');
});

test('BANA Rule 23 superposed integrals are structural follow-ups to an immediate integral', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, expected] of [
    ['integral.superpose.circle', '⠈⠫⠉⠻', '∮'],
    ['integral.superpose.infinity', '⠈⠠⠿⠻', '∰'],
    ['integral.superpose.rectangle', '⠈⠫⠗⠻', '∯'],
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

test('BANA Rule 15.9 superposition uses one generic bounded local action', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, notation] of [
    ['superposition.bar-shape', ':`$4]']
  ]) {
    const entry = registry.get(id);
    assert.equal(entry?.args?.sourceNotation, notation, id);
    assert.equal(entry?.action, 'superpose-token', id);
    assert.equal(entry?.commitPolicy, 'atomic-sequence', id);
    assert.ok(entry.banaRefs.includes('15.9'), id);
  }
  assert.ok(operationRegistry().filter((entry) => entry.action === 'superpose-token').length >= 3);
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

test('BANA Rule 15.12 arrow modifiers are bounded local sequences, not per-cell modifiers', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const fixtures = [
    ['modifier.arrow.barbed-both', '$[33o', '↔'],
    ['modifier.arrow.barbed-left', '$[33', '←'],
    ['modifier.arrow.barbed-left-dotted-right', '$[33*', '⇇'],
    ['modifier.arrow.barbed-right', '$o', '→'],
    ['modifier.arrow.barbed-right-uncontracted', '$33o', '→'],
    ['modifier.arrow.dotted-both', '$*33*', '⇤⇥'],
    ['modifier.arrow.dotted-left', '$*33', '⇤'],
    ['modifier.arrow.dotted-left-barbed-right', '$*33o', '⇥'],
    ['modifier.arrow.dotted-right', '$33*', '⇥'],
    ['modifier.arrow.hollow-both', '$.*33.*', '⇔'],
    ['modifier.arrow.hollow-left', '$.*33', '⇐'],
    ['modifier.arrow.hollow-left-barbed-right', '$.*33o', '⇨'],
    ['modifier.arrow.hollow-right-barbed-left', '$[33.*', '⇦'],
    ['modifier.arrow.hollow-right', '$33.*', '⇥']
  ];
  for (const [id, sourceNotation, expected] of fixtures) {
    const entry = registry.get(id);
    assert.ok(entry, id);
    assert.equal(entry.commitPolicy, 'atomic-sequence', id);
    assert.equal(entry.args?.sourceNotation, sourceNotation, id);
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    // Establish the BANA five-step local modifier scope: expression, then
    // directly-over. The arrow code itself is held until its final cell and
    // committed with Enter as one registered Rule 15.12 construction.
    for (const cell of ['⠐', '⠁', '⠣']) {
      const result = applyNemethCell({ document, focus, inputState, cell });
      assert.notEqual(result.status, 'rejected', `${id}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    for (const cell of entry.cells) {
      const result = applyNemethCell({ document, focus, inputState, cell });
      assert.notEqual(result.status, 'rejected', `${id}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    assert.equal(parseMathML(document.mathml).children.length, 1, `${id}: no mutation before Enter`);
    const committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', `${id}: ${committed.announcement}`);
    const tree = parseMathML(committed.document.mathml);
    const modifier = tree.children[0];
    assert.equal(modifier.name, 'mover', id);
    assert.equal(modifier.children[1].children[0].text, expected, id);
    assert.equal(modifier.children[1].attrs['data-omniya-nemeth-intent'], entry.args.dataAttributes['data-omniya-nemeth-intent'], id);
  }
});

test('an incomplete Rule 15.12 arrow modifier leaves its existing hole untouched', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠐', '⠁', '⠣', '⠫', '⠪', '⠒']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const beforeCommit = document.mathml;
  const rejected = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.document.mathml, beforeCommit);
  assert.match(rejected.announcement, /incomplete|invalid/i);
  const tree = parseMathML(rejected.document.mathml);
  assert.equal(tree.children[0].name, 'mi');
  assert.equal(tree.children[0].children[0].text, 'a');
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

test('BANA Rule 15.3 keeps same-side higher-order modifiers distinct from simultaneous modifiers', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠐', '⠭', '⠣', '⠱', '⠻', '⠣', '⠣']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'mover');
  assert.equal(tree.children[0].children[0].name, 'mover');
  assert.equal(tree.children[0].children[1].attrs['data-omniya-hole'], 'true');
});

test('BANA Rule 15.5 parallel bars stay in one munderover slot', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠐', '⠭', '⠩', '⠱', '⠱', '⠣', '⠱', '⠱', '⠻']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'munderover');
  const under = tree.children[0].children[1];
  const over = tree.children[0].children[2];
  assert.equal(under.name, 'mrow');
  assert.equal(over.name, 'mrow');
  assert.deepEqual(under.children.map((node) => node.children[0].text), ['¯', '¯']);
  assert.deepEqual(over.children.map((node) => node.children[0].text), ['¯', '¯']);
});

test('BANA Rule 15.5 keeps parallel bars in one local modifier row', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠭', '⠱', '⠱', '⠻']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'mover');
  assert.equal(tree.children[0].children[1].name, 'mrow');
  assert.deepEqual(tree.children[0].children[1].children.map((node) => node.children[0].text), ['¯', '¯']);
});

test('BANA Rule 15.6 builds a bounded binomial table through local choices', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const [cell, operationId] of [['⠷', 'binomial.open'], ['⠝', null], ['⠩', 'binomial.lower'], ['⠅', null], ['⠾', 'binomial.close']]) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    if (result.status === 'choice') result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].attrs['data-omniya-binomial'], 'true');
  assert.equal(tree.children[0].children[1].name, 'mtable');
  assert.equal(tree.children[0].children[1].children[0].children[0].children[0].children[0].text, 'n');
  assert.equal(tree.children[0].children[1].children[1].children[0].children[0].children[0].text, 'k');
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

test('BANA Rules 3.6 and 3.11 keep base digits and Roman numerals bounded', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠼', '⠂', '⠒', '⠞', '⠑', '⠶']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.equal(parseMathML(document.mathml).children[0].children[0].text, '13te7');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const cell of ['⠠', '⠠', '⠧', '⠊', '⠊']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const roman = parseMathML(document.mathml).children[0];
  assert.equal(roman.children[0].text, 'VII');
  assert.equal(roman.attrs['data-omniya-nemeth-intent'], 'roman');
});

test('BANA Rule 14.13 appends a bounded possessive after a script', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠭', '⠘', '⠁', '⠸', '⠄', '⠎']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    if (result.status === 'pending' && result.inputState.prefix === '⠸⠄⠎') result = commitNemethLocalCode({ document, focus, inputState: result.inputState });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'msup');
  assert.equal(tree.children[1].children[0].text, '′');
  assert.equal(tree.children[2].children[0].text, 's');
});

test('BANA Rule 6.1.1 uses the German Fraktur glyphs specified by the code', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  for (const [id, cells, glyph] of [
    ['german.a', '⠸⠁', '𝖆'],
    ['german.capital-c', '⠸⠠⠉', '𝕮'],
    ['german.capital-z', '⠸⠠⠵', '𝖅']
  ]) {
    assert.equal(registry.get(id)?.cells.join(''), cells, id);
    const tree = applyFixture(id, cells);
    assert.equal(tree.children.at(-1)?.children?.[0]?.text, glyph, id);
  }
});

test('BANA Rule 23.5 exposes both Del glyphs as an explicit local choice', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  assert.equal(registry.get('misc.nabla')?.cells.join(''), '⠨⠫');
  assert.equal(registry.get('misc.del-inverted')?.cells.join(''), '⠨⠫');
  const document = createEmptyDraftMathDocument();
  const result = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠨' });
  const next = applyNemethCell({ document, focus: document.focus, inputState: result.inputState, cell: '⠫' });
  assert.equal(next.status, 'choice');
  assert.deepEqual(next.choices.map((choice) => choice.operationId).sort(), ['misc.del-inverted', 'misc.nabla', 'shape.inverted-triangle']);
});

test('BANA Rule 23.17 represents there-exists-uniquely as a bounded quantifier', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const entry = registry.get('quantifier.exists-unique');
  assert.ok(entry);
  assert.equal(entry.cells.join(''), '⠈⠿⠳');
  assert.ok(entry.banaRefs.includes('23.17'));
  const tree = applyFixture('quantifier.exists-unique', '⠈⠿⠳');
  const unique = tree.children.at(-1);
  assert.equal(unique.name, 'mrow');
  assert.deepEqual(unique.children.map((child) => child.children?.[0]?.text), ['∃', '|']);
});

test('BANA Rule 23.8 treats QED as a transcriber-defined local shape', async () => {
  await SRE.engineReady();
  await SRE.setupEngine({ locale: 'nemeth', modality: 'braille', domain: 'default' });
  const tree = applyFixture('misc.end-proof', '⠈⠫⠟⠑⠙');
  const proof = tree.children.at(-1);
  assert.equal(proof.attrs['data-omniya-nemeth-intent'], 'qed');
  assert.equal(SRE.toSpeech('<math><mo intent="qed">∎</mo></math>'), '⠸⠳');
});

test('BANA Rule 9 erratum uses the complete checkmark construction', () => {
  const entry = operationRegistry().find((mapping) => mapping.id === 'reference.checkmark');
  assert.ok(entry);
  assert.equal(entry.args?.sourceNotation, '.=`$cm');
  assert.deepEqual(entry.cells, ['⠨', '⠿', '⠈', '⠫', '⠉', '⠍']);
  assert.ok(entry.errataRefs.some((ref) => ref.includes('Rule 9.1')));
});

test('BANA Rule 10 abbreviation behavior stays compositional and bounded', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  const indicator = registry.get('indicator.english-letter');
  assert.deepEqual(indicator.cells, ['⠰']);
  assert.ok(indicator.banaRefs.includes('10.3'));
  // BANA 10.3 Example 10-18: the one-letter abbreviation g is an English
  // letter after the local indicator. The registry intentionally does not
  // classify words or measurement names; that is surrounding-language policy.
  const document = createEmptyDraftMathDocument();
  let result = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠰' });
  if (result.status === 'choice') result = applyNemethChoice({ document, focus: document.focus, inputState: result.inputState, operationId: 'indicator.english-letter' });
  result = applyNemethCell({ document, focus: document.focus, inputState: result.inputState, cell: '⠛' });
  if (result.status === 'choice') result = applyNemethChoice({ document, focus: document.focus, inputState: result.inputState, operationId: 'indicator.english-letter' });
  assert.equal(result.status, 'applied');
  const tree = parseMathML(result.document.mathml);
  assert.equal(tree.children[0].children[0].text, 'g');
  assert.deepEqual(registry.get('punctuation.period').banaRefs, ['8.1', '8.2']);
  assert.equal(registry.get('punctuation.period').args.sourceNotation, '_4');
});

test('every accepted mapping has explicit BANA source evidence and action', () => {
  for (const entry of operationRegistry()) {
    assert.match(entry.id, /^\S+$/);
    assert.ok(entry.banaRefs.every((ref) => /^\d+(\.\d+)*$/.test(ref)), entry.id);
    assert.ok(Array.isArray(entry.errataRefs), entry.id);
    assert.ok(entry.args?.sourceNotation || entry.args?.sourceKind, `${entry.id} has no source notation or contextual classification`);
    assert.ok(['insert-token', 'insert-numeric', 'insert-composite', 'insert-modifier', 'insert-structured-token', 'insert-contracted-script-comma', 'append-possessive', 'append-plural', 'append-ordinal', 'wrap-script-token', 'open-structure', 'open-left-script', 'open-fixed-root', 'open-function-limit', 'open-script-chain', 'open-modifier', 'move-slot', 'close-structure', 'set-mode', 'extend-integral', 'superpose-integral', 'superpose-token', 'simultaneous-modifier', 'higher-order-modifier', 'open-binomial', 'move-binomial-lower', 'close-binomial', 'open-typeform-scope', 'close-typeform-scope'].includes(entry.action), entry.id);
  }
});

test('atomic local codes are reachable and never shadowed by immediate prefixes', () => {
  // BANA has legitimate shared prefixes (for example, the shape angle and
  // several arrow constructions). Those immediate meanings must explicitly
  // opt into the longer-code lookahead policy; otherwise the first cell would
  // commit too early and make the atomic construction unreachable.
  assert.deepEqual(registryDiagnostics().policyErrors, []);
  assert.deepEqual(registryDiagnostics().shadowedImmediate, []);
  assert.deepEqual(registryDiagnostics().classificationErrors, []);
  assert.deepEqual(registryDiagnostics().operationErrors, []);
});

test('all immediate rows that prefix an atomic row use bounded lookahead', () => {
  const registry = operationRegistry();
  for (const immediate of registry.filter((entry) => entry.commitPolicy === 'immediate')) {
    const hasAtomicContinuation = registry.some((candidate) =>
      candidate.commitPolicy === 'atomic-sequence' &&
      candidate.cells.length > immediate.cells.length &&
      immediate.cells.every((cell, index) => cell === candidate.cells[index]));
    if (hasAtomicContinuation && !immediate.args?.allowImmediateBeforeContinuation) assert.equal(immediate.args?.preferLonger, true, immediate.id);
  }
});

test('the three input policies are one registry-wide contract', () => {
  const grouped = inputRegistry();
  const all = [...grouped.immediate, ...grouped.atomicSequence, ...grouped.structuralFollowup];
  assert.equal(all.length, operationRegistry().length);
  assert.equal(new Set(all.map((entry) => entry.id)).size, all.length);
  for (const entry of grouped.atomicSequence) assert.ok(entry.cells.length > 1 || entry.args?.preferLonger, entry.id);
  assert.ok(grouped.immediate.some((entry) => entry.id === 'operator.integral'));
  assert.ok(grouped.atomicSequence.some((entry) => entry.id.startsWith('arrow.')));
  assert.ok(grouped.structuralFollowup.some((entry) => entry.id === 'integral.extend'));
  assert.ok(grouped.structuralFollowup.some((entry) => entry.action === 'move-slot'));
});

test('each registry policy has a complete local-code contract', () => {
  const grouped = inputRegistry();
  assert.ok(grouped.immediate.length > 0);
  assert.ok(grouped.atomicSequence.length > 0);
  assert.ok(grouped.structuralFollowup.length > 0);
  for (const entry of grouped.immediate) {
    assert.equal(entry.commitPolicy, 'immediate');
    assert.ok(entry.args?.sourceNotation || entry.args?.sourceKind, entry.id);
  }
  for (const entry of grouped.atomicSequence) {
    assert.equal(entry.commitPolicy, 'atomic-sequence');
    assert.ok(entry.cells.length > 1 || entry.args?.preferLonger, entry.id);
  }
  for (const entry of grouped.structuralFollowup) {
    assert.equal(entry.commitPolicy, 'structural-followup');
    assert.ok(['move-slot', 'close-structure', 'extend-integral', 'superpose-token',
      'superpose-token', 'simultaneous-modifier', 'higher-order-modifier', 'insert-modifier',
      'open-modifier', 'move-binomial-lower', 'close-binomial', 'append-possessive',
      'append-plural', 'append-ordinal', 'insert-contracted-script-comma', 'set-mode', 'open-binomial',
      'open-typeform-scope', 'close-typeform-scope', 'open-structure'].includes(entry.action), entry.id);
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

test('BANA Rule 14.5 left-subscript construction composes with a later right subscript', () => {
  const document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus, inputState, cell: '⠰' });
  result = applyNemethCell({ document, focus, inputState: result.inputState, cell: '⠭' });
  assert.equal(result.status, 'choice');
  result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'script.left-subscript' });
  ({ focus, inputState } = result);
  result = applyNemethCell({ document: result.document, focus, inputState, cell: '⠐' });
  ({ focus, inputState } = result);
  result = applyNemethCell({ document: result.document, focus, inputState, cell: '⠝' });
  ({ focus, inputState } = result);
  result = applyNemethCell({ document: result.document, focus, inputState, cell: '⠰' });
  result = applyNemethCell({ document: result.document, focus: result.focus, inputState: result.inputState, cell: '⠽' });
  const tree = parseMathML(result.document.mathml);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].name, 'mmultiscripts');
  assert.equal(tree.children[0].children[0].children[0].text, 'n');
  assert.equal(tree.children[0].children[1].children[0].text, 'y');
  assert.equal(tree.children[0].children[4].children[0].text, 'x');
});

test('Rules 14.4.2-14.4.3 compose every two- and three-level direction chain locally', () => {
  const cases = [
    ['script.sup-sup', '⠘⠘', ['superscript', 'superscript']],
    ['script.sub-sub', '⠰⠰', ['subscript', 'subscript']],
    ['script.sup-sup-sup', '⠘⠘⠘', ['superscript', 'superscript', 'superscript']],
    ['script.sup-sup-sub', '⠘⠘⠰', ['superscript', 'superscript', 'subscript']],
    ['script.sup-sub-sup', '⠘⠰⠘', ['superscript', 'subscript', 'superscript']],
    ['script.sup-sub-sub', '⠘⠰⠰', ['superscript', 'subscript', 'subscript']],
    ['script.sub-sup-sup', '⠰⠘⠘', ['subscript', 'superscript', 'superscript']],
    ['script.sub-sup-sub', '⠰⠘⠰', ['subscript', 'superscript', 'subscript']],
    ['script.sub-sub-sup', '⠰⠰⠘', ['subscript', 'subscript', 'superscript']],
    ['script.sub-sub-sub', '⠰⠰⠰', ['subscript', 'subscript', 'subscript']]
  ];
  for (const [id, cells, roles] of cases) {
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    for (const cell of ['⠭', ...[...cells]]) {
      const result = applyNemethCell({ document, focus, inputState, cell });
      assert.notEqual(result.status, 'rejected', `${id}/${cell}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    const committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', id);
    const root = parseMathML(committed.document.mathml).children[0];
    const actual = [];
    let node = root;
    while (node?.name === 'msup' || node?.name === 'msub') {
      actual.push(node.name === 'msup' ? 'superscript' : 'subscript');
      node = node.children[0];
    }
    assert.deepEqual(actual, roles, id);
    const focused = parseMathML(committed.document.mathml).children[0];
    const focusedNode = findMathNode(focused, committed.focus.nodeId);
    assert.ok(focusedNode?.attrs?.['data-omniya-hole'] === 'true', id);
    assert.equal(focusedNode.attrs['data-omniya-role'], roles[0], id);
  }
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

test('BANA Rule 14.7 contracted commas and Rule 14.12 primes stay local to scripts', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠭', '⠰', '⠊', '⠪', '⠚']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  let tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'msub');
  assert.equal(tree.children[0].children[1].name, 'mrow');
  assert.deepEqual(tree.children[0].children[1].children.map((node) => node.children?.[0]?.text), ['i', ',','j']);

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const cell of ['⠭', '⠄', '⠰', '⠊']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'msub');
  assert.equal(tree.children[0].children[0].name, 'mrow');
  assert.deepEqual(tree.children[0].children[0].children.map((node) => node.children?.[0]?.text), ['x', '′']);
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
  // Dot-5 after a decimal is shared with Rule 15.16 multipurpose-before-digit.
  // The next local symbol chooses: a letter completes the 24.1.g nonnumeric path.
  assert.equal(inputState.mode, 'decimal-dot5');
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
  for (const cell of ['⠐', '⠅']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  // The complete less-than code is also a prefix of a BANA compound
  // comparison. Enter commits that one local code before the follow-up
  // separator is entered, exactly as the guided editor requires.
  let result = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(result.status, 'applied', result.announcement);
  ({ document, focus, inputState } = result);
  for (const cell of ['⠐', '⠨', '⠅']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
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
  for (const cell of ['⠳']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    if (result.status === 'pending') result = commitNemethLocalCode({ document, focus, inputState: result.inputState });
    assert.equal(result.status, 'choice');
    result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'misc.vertical-bar' });
    ({ document, focus, inputState } = result);
  }
  for (const cell of ['⠐', '⠳']) {
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
  assert.equal(result.status, 'choice');
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

test('BANA Rule 10.21 retains a local order prefix on an open group', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus, inputState, cell: '⠷' });
  assert.equal(result.status, 'choice');
  result = applyNemethChoice({ document: result.document, focus: result.focus,
    inputState: result.inputState, operationId: 'group.round' });
  ({ document, focus, inputState } = result);
  for (const cell of ['⠨', '⠢']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].attrs['data-omniya-radical-order'], '1');
  assert.equal(inputState.mode, 'radical-order:1');
});
