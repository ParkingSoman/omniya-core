import assert from 'node:assert/strict';
import test from 'node:test';
import SRE from 'speech-rule-engine';
import { importLatex, replaceMathTargetInDocument } from '../../src/main/math-service.js';
import { findMathNode, parseMathML, serializeMathML } from '../../src/domain/math-tree.js';
import { SUBEXPRESSION_FIXTURES, WHOLE_EXPRESSION_FIXTURES, fixtureById } from '../fixtures/nemeth-braille-fixtures.js';
import { MATHCAT_FIXTURES } from '../fixtures/mathcat-braille-fixtures.js';

async function nemeth(mathml) {
  await SRE.engineReady();
  await SRE.setupEngine({ locale: 'nemeth', modality: 'braille', domain: 'default' });
  return SRE.toSpeech(mathml);
}

function subtreeMathML(node) {
  return serializeMathML({ name: 'math', attrs: {}, children: [structuredClone(node)] });
}

function expressionNode(document) {
  const tree = parseMathML(document.mathml);
  return tree.children.length === 1 ? tree.children[0] : tree;
}

test('fixed BANA-referenced whole-expression fixtures match the independent Nemeth projection', async () => {
  for (const fixture of WHOLE_EXPRESSION_FIXTURES) {
    const document = await importLatex(fixture.latex);
    const actual = await nemeth(document.mathml);
    assert.equal(actual, fixture.expected, `${fixture.id} (${fixture.banaRef})`);
  }
});

test('focused canonical subexpressions retain exact Nemeth cells, not only whole-expression output', async () => {
  for (const fixture of SUBEXPRESSION_FIXTURES) {
    const whole = await importLatex(fixtureById(fixture.whole).latex);
    const root = expressionNode(whole);
    let target;
    if (fixture.part === 'numerator') target = root.children[0];
    else if (fixture.part === 'denominator') target = root.children[1];
    else if (fixture.part === 'radical') target = root;
    else if (fixture.part === 'exponent') target = root.children[0].children[1];
    else if (fixture.part === 'arrow') target = root.children.find((node) => node.name === 'mo' && ['↖', '↗', '↘', '↙'].includes(node.children?.[0]?.text));
    else if (fixture.part === 'sum') target = root.children.find((node) => node.name === 'munderover');
    else target = root;
    assert.equal(await nemeth(subtreeMathML(target)), fixture.expected, `${fixture.id} (${fixture.banaRef})`);
  }
});

test('editing a focused numerator changes whole and focused Braille exactly once', async () => {
  const before = await importLatex('\\frac{a+b}{c-d}');
  const beforeTree = parseMathML(before.mathml);
  const fraction = findMathNode(beforeTree, beforeTree.children.find((node) => node.name === 'mfrac')?.attrs?.['data-omniya-id']) ?? beforeTree.children[0];
  const numerator = fraction.children[0];
  const changed = await replaceMathTargetInDocument({
    document: before,
    target: { kind: 'node', nodeId: numerator.attrs['data-omniya-id'] },
    replacementLatex: 'x^2'
  });
  assert.equal(await nemeth(changed.document.mathml), '⠹⠭⠘⠆⠐⠌⠉⠤⠙⠼');
  const changedTree = parseMathML(changed.document.mathml);
  const changedFraction = changedTree.children.find((node) => node.name === 'mfrac');
  assert.equal(await nemeth(subtreeMathML(changedFraction.children[0])), '⠭⠘⠆');
  assert.equal(await nemeth(subtreeMathML(changedFraction.children[1])), '⠉⠤⠙');
  assert.equal(changed.cursor.nodeId, numerator.attrs['data-omniya-id']);
});

test('nested editing fixtures change only the exponent or radical body while preserving the containing fraction', async () => {
  const source = await importLatex('\\frac{a^2+\\sqrt{b}}{c}');
  const tree = parseMathML(source.mathml);
  const fraction = tree.children.find((node) => node.name === 'mfrac');
  const exponent = fraction.children[0].children.find((node) => node.name === 'msup').children[1];
  const radical = fraction.children[0].children.find((node) => node.name === 'msqrt');
  const exponentEdit = await replaceMathTargetInDocument({
    document: source,
    target: { kind: 'node', nodeId: exponent.attrs['data-omniya-id'] },
    replacementLatex: '3'
  });
  assert.equal(await nemeth(exponentEdit.document.mathml), '⠹⠁⠘⠒⠐⠬⠜⠃⠻⠌⠉⠼');
  assert.equal(parseMathML(exponentEdit.document.mathml).children[0].children[1].children[0].text, 'c');

  const radicalBody = radical.children[0];
  const radicalEdit = await replaceMathTargetInDocument({
    document: source,
    target: { kind: 'node', nodeId: radicalBody.attrs['data-omniya-id'] },
    replacementLatex: 'x'
  });
  assert.equal(await nemeth(radicalEdit.document.mathml), '⠹⠁⠘⠆⠐⠬⠜⠭⠻⠌⠉⠼');
  assert.equal(parseMathML(radicalEdit.document.mathml).children[0].children[1].children[0].text, 'c');
});

test('the external oracle is configured explicitly for Nemeth Braille', async () => {
  const actual = await nemeth('<math><mi>x</mi></math>');
  assert.equal(actual, '⠭');
  assert.equal(SRE.engineSetup().locale, 'nemeth');
  assert.equal(SRE.engineSetup().modality, 'braille');
});

test('ported MathCAT Nemeth cases remain stable through Omniya MathML import', async () => {
  for (const fixture of MATHCAT_FIXTURES) {
    const document = await importLatex(fixture.latex);
    assert.equal(await nemeth(document.mathml), fixture.expected, fixture.sourceFile);
  }
});
