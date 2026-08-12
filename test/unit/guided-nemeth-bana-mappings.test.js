import assert from 'node:assert/strict';
import test from 'node:test';
import SRE from 'speech-rule-engine';

import { parseMathML } from '../../src/domain/math-tree.js';
import {
  applyNemethCell,
  applyNemethChoice,
  commitNemethLocalCode,
  createEmptyDraftMathDocument,
  inputRegistry,
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
    'comparison.less-equals-greater'
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

test('every accepted mapping has an explicit BANA source and action', () => {
  for (const entry of operationRegistry()) {
    assert.match(entry.id, /^\S+$/);
    assert.ok(entry.banaRefs.every((ref) => /^\d+(\.\d+)*$/.test(ref)), entry.id);
    assert.ok(Array.isArray(entry.errataRefs), entry.id);
    assert.ok(['insert-token', 'insert-numeric', 'insert-quantifier-unique', 'insert-modifier', 'insert-contracted-script-comma', 'append-script-possessive', 'open-structure', 'open-fixed-root', 'open-function-limit', 'open-modifier', 'move-slot', 'close-structure', 'set-mode', 'extend-integral', 'superpose-integral', 'simultaneous-modifier', 'higher-order-modifier', 'open-binomial', 'move-binomial-lower', 'close-binomial'].includes(entry.action), entry.id);
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

test('all immediate rows that prefix an atomic row use bounded lookahead', () => {
  const registry = operationRegistry();
  for (const immediate of registry.filter((entry) => entry.commitPolicy === 'immediate')) {
    const hasAtomicContinuation = registry.some((candidate) =>
      candidate.commitPolicy === 'atomic-sequence' &&
      candidate.cells.length > immediate.cells.length &&
      immediate.cells.every((cell, index) => cell === candidate.cells[index]));
    if (hasAtomicContinuation) assert.equal(immediate.args?.preferLonger, true, immediate.id);
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
