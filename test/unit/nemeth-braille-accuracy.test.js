import assert from 'node:assert/strict';
import test from 'node:test';
import SRE from 'speech-rule-engine';
import { importLatex, replaceMathTargetInDocument } from '../../src/main/math-service.js';
import { findMathNode, parseMathML, serializeMathML } from '../../src/domain/math-tree.js';
import { SUBEXPRESSION_FIXTURES, WHOLE_EXPRESSION_FIXTURES, fixtureById } from '../fixtures/nemeth-braille-fixtures.js';
import { MATHCAT_FIXTURES } from '../fixtures/mathcat-braille-fixtures.js';
import { applyNemethCell, applyNemethChoice, commitNemethLocalCode, createEmptyDraftMathDocument } from '../../src/domain/guided-nemeth/index.js';

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

test('long nested expressions match the independent SRE projection at whole and focused scopes', async () => {
  // These are deliberately longer than the small arithmetic fixtures.  The
  // expected cells are captured from the pinned SRE Nemeth serializer; the
  // MathCAT corpus and BANA examples above remain the normative review data.
  const fixtures = [
    {
      id: 'sum-fraction-radical-integral',
      latex: '\\sum_{i=1}^{n}\\frac{\\sqrt{x^2+y^2}}{\\int_0^1 \\sin(t)\\,dt}',
      expected: '⠐⠨⠠⠎⠩⠊⠀⠨⠅⠀⠼⠂⠣⠝⠻⠹⠜⠭⠘⠆⠐⠬⠽⠘⠆⠐⠻⠌⠮⠰⠴⠘⠂⠐⠎⠊⠝⠀⠷⠞⠾⠙⠞⠼'
    },
    {
      id: 'nested-scripted-radical-fraction',
      latex: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}^2 + \\sqrt[3]{\\frac{x_1+y_1}{x_2-y_2}}',
      expected: '⠠⠷⠁⠀⠃⠠⠾⠀⠠⠷⠉⠀⠙⠠⠾⠘⠆⠐⠬⠣⠒⠜⠹⠭⠂⠬⠽⠂⠌⠭⠆⠤⠽⠆⠼⠻'
    },
    {
      id: 'limit-sine-quotient',
      latex: '\\lim_{x\\to0}\\frac{\\sin x}{x} = 1',
      expected: '⠐⠇⠊⠍⠩⠭⠀⠫⠕⠀⠼⠴⠻⠀⠹⠎⠊⠝⠀⠭⠌⠭⠼⠀⠨⠅⠀⠼⠂'
    },
    {
      id: 'absolute-fraction-plus-integral',
      latex: '\\left|\\frac{a^2-b^2}{c+d}\\right| + \\int_{0}^{\\infty} e^{-t^2}dt',
      expected: '⠳⠹⠁⠘⠆⠐⠤⠃⠘⠆⠐⠌⠉⠬⠙⠼⠳⠬⠮⠰⠴⠘⠠⠿⠐⠑⠘⠤⠞⠘⠘⠆⠘⠐⠙⠞'
    }
  ];
  for (const fixture of fixtures) {
    const document = await importLatex(fixture.latex);
    assert.equal(await nemeth(document.mathml), fixture.expected, fixture.id);
  }

  const nested = await importLatex(fixtures[0].latex);
  const tree = parseMathML(nested.mathml);
  const allFractions = [];
  const visit = (node) => {
    if (node?.name === 'mfrac') allFractions.push(node);
    for (const child of node?.children ?? []) if (child.text === undefined) visit(child);
  };
  visit(tree);
  assert.ok(allFractions.length >= 1, 'nested fixture must contain a fraction');
  const focusedNumerator = allFractions[0].children[0];
  const focused = subtreeMathML(focusedNumerator);
  assert.equal(await nemeth(focused), '⠜⠭⠘⠆⠐⠬⠽⠘⠆⠐⠻');
  assert.equal(await nemeth(subtreeMathML(allFractions[0].children[1])), '⠮⠰⠴⠘⠂⠐⠎⠊⠝⠀⠷⠞⠾⠙⠞');
});

test('atomic-sequence and structural-followup policies stay local across the registry', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  // The complete right spear arrow is held as one local sequence. No partial
  // cell is allowed to mutate the draft.
  for (const cell of ['⠫', '⠶', '⠶', '⠕']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
    assert.equal(document.mathml.includes('⟹'), false);
  }
  let held = commitNemethLocalCode({ document, focus, inputState });
  if (held.status === 'choice') {
    held = applyNemethChoice({ document, focus, inputState: held.inputState, operationId: 'arrow.spear.right' });
  }
  assert.equal(held.status, 'applied');
  // SRE's current Nemeth serializer renders the Unicode spear glyph with its
  // explicit shaft cell as well. The input remains the BANA `$77o` code above;
  // this projection difference is recorded rather than used to redefine the
  // normative input mapping.
  assert.equal(await nemeth(held.document.mathml), '⠫⠶⠶⠶⠕');

  // An ordinary integral is immediate; adding its superposition is a second,
  // structural local code and cannot replace the surrounding expression.
  const empty = createEmptyDraftMathDocument();
  const integral = applyNemethCell({ document: empty, focus: empty.focus, inputState: { prefix: '', mode: null }, cell: '⠮' });
  assert.equal(integral.status, 'applied');
  assert.equal(await nemeth(integral.document.mathml), '⠮');
});

test('MathCAT Rule 86 modifier fixtures remain exact for whole and focused scopes', async () => {
  // MathCAT's independent regression fixture `overbar_86_b_2` records the
  // BANA five-step form for a modifier over a multi-token expression.  This
  // is intentionally a direct MathML fixture: LaTeX's overline serializer is
  // a different presentation choice and is not the authoring contract here.
  const mathml = '<math><mover><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mo>¯</mo></mover></math>';
  assert.equal(await nemeth(mathml), '⠐⠁⠬⠃⠣⠱⠻');
  const root = parseMathML(mathml).children[0];
  assert.equal(await nemeth(subtreeMathML(root.children[0])), '⠁⠬⠃');
  assert.equal(await nemeth(subtreeMathML(root.children[1])), '⠱');
});

test('Rule 23 superposed integral fixtures match BANA and SRE for complete symbols', async () => {
  const fixtures = [
    ['∮', '⠮⠈⠫⠉⠻', '23.12'],
    ['∯', '⠮⠮⠈⠫⠉⠻', '23.12'],
    ['∰', '⠮⠮⠮⠈⠫⠉⠻', '23.12']
  ];
  for (const [symbol, expected, banaRef] of fixtures) {
    assert.equal(await nemeth(`<math><mo>${symbol}</mo></math>`), expected, `${symbol} (${banaRef})`);
  }
});

test('guided local operations reproduce the reviewed multi-token modifier and integral outputs', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠐', '⠁', '⠬', '⠃', '⠣', '⠱', '⠻']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.equal(await nemeth(document.mathml), '⠐⠁⠬⠃⠣⠱⠻');

  // The integral itself is immediate. The superposition is a separate
  // bounded structural-follow-up code and therefore cannot mutate anything
  // until its terminator completes that one local construction.
  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus, inputState, cell: '⠮' });
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  for (const cell of ['⠈', '⠫', '⠉']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.equal(document.mathml.includes('>∫<'), true, 'pending superposition leaves the integral unchanged');
  result = applyNemethCell({ document, focus, inputState, cell: '⠻' });
  assert.equal(result.status, 'applied');
  assert.equal(await nemeth(result.document.mathml), '⠮⠈⠫⠉⠻');
});

test('new bounded Rule 8 and Rule 16 transitions match the independent Nemeth projection', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠤', '⠤']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.equal(result.status, 'pending');
    ({ document, focus, inputState } = result);
  }
  let result = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(result.status, 'applied');
  assert.equal(await nemeth(result.document.mathml), '⠤⠤');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const cell of ['⠭', '⠨', '⠁']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  for (const cell of ['⠸', '⠄', '⠎']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    if (result.status === 'pending' && result.inputState.prefix === '⠸⠄⠎') {
      result = commitNemethLocalCode({ document: result.document, focus: result.focus, inputState: result.inputState });
    }
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  // SRE emits the canonical Nemeth projection for the resulting MathML. The
  // input-side BANA code remains the bounded `_'s` registry row; punctuation
  // and script indicators are a projection choice, not a reverse-parser
  // authority.
  assert.equal(await nemeth(document.mathml), '⠭⠨⠁⠄⠎');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const cell of ['⠜', '⠭', '⠬', '⠨', '⠜', '⠽', '⠨', '⠻']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.equal(await nemeth(document.mathml), '⠜⠭⠨⠜⠬⠨⠻⠽⠻');
});

test('guided numeric cells use the BANA lower-cell digits and match SRE output', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠼', '⠒', '⠨', '⠂', '⠲']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.equal(parseMathML(document.mathml).children[0].children[0].text, '3.14');
  assert.equal(await nemeth(document.mathml), '⠼⠒⠨⠂⠲');
});

test('guided Rule 14 and Rule 24 local transitions preserve the reviewed projection', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠭', '⠰', '⠂', '⠐', '⠼', '⠆']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    assert.notEqual(result.status, 'choice', `${cell}: unresolved local choice`);
    ({ document, focus, inputState } = result);
  }
  // BANA 14.4/24.1.c constructs the subscript locally, then returns to the
  // baseline before the following number. SRE is checked only as an
  // independent projection of the resulting canonical MathML.
  assert.equal(await nemeth(document.mathml), '⠭⠂⠆');
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'msub');
  assert.equal(tree.children[1].name, 'mn');
});

test('guided Rule 24.1.g decimal return agrees with the independent projection', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠼', '⠴', '⠨', '⠐', '⠁']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  // BANA 24.1.g: dot 5 after the decimal point makes the following letter
  // nonnumeric. SRE is an independent projection; the BANA citation remains
  // the normative source for the local transition.
  assert.equal(await nemeth(document.mathml), '⠼⠴⠨⠁');
});

test('guided Rule 24.1.f comparison follow-up agrees with the independent projection', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠐', '⠅']) {
    let result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  let result = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(result.status, 'applied', result.announcement);
  ({ document, focus, inputState } = result);
  for (const cell of ['⠐', '⠨', '⠅']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  assert.equal(await nemeth(document.mathml), '⠐⠅⠨⠅');
});

test('guided Rule 24.1.i and 24.1.k local follow-ups retain reviewed Braille', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus, inputState, cell: '⠳' });
  result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'misc.vertical-bar' });
  ({ document, focus, inputState } = result);
  for (const cell of ['⠐', '⠳']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  // SRE normalizes the adjacent-bar output to its canonical two-bar form;
  // the authored dot-5 remains a BANA local input transition.
  assert.equal(await nemeth(document.mathml), '⠳⠳');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  result = applyNemethCell({ document, focus, inputState, cell: '⠈' });
  ({ document, focus, inputState } = result);
  result = applyNemethCell({ document, focus, inputState, cell: '⠱' });
  result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'comparison.similar' });
  ({ document, focus, inputState } = result);
  for (const cell of ['⠐', '⠈', '⠱']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.equal(await nemeth(document.mathml), '⠈⠱⠈⠱');
});

test('guided Rule 24.1.h tally punctuation uses the reviewed local projection', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus, inputState, cell: '⠸' });
  result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: 'misc.tally' });
  ({ document, focus, inputState } = result);
  for (const cell of ['⠐', '⠸', '⠠']) {
    result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  // SRE normalizes this as tally plus mathematical comma; BANA 24.1.h is the
  // normative reason for the intermediate dot-5 transition.
  assert.equal(await nemeth(document.mathml), '⠳⠠');
});

test('guided Rule 24.1.j polygon numeral agrees with the independent projection', async () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠫', '⠲', '⠐', '⠼', '⠂', '⠲']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  assert.equal(await nemeth(document.mathml), '⠫⠲⠀⠼⠂⠲');
});

test('guided Rule 18.3 limit forms retain their structural MathML and Braille', async () => {
  for (const [cells, element] of [
    [['⠣', '⠇', '⠊', '⠍'], 'mover'],
    [['⠩', '⠇', '⠊', '⠍'], 'munder']
  ]) {
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    for (const cell of cells) {
      let result = applyNemethCell({ document, focus, inputState, cell });
      if (result.status === 'pending' && result.inputState.prefix === cells.join('')) {
        result = commitNemethLocalCode({ document, focus, inputState: result.inputState });
      }
      assert.notEqual(result.status, 'rejected', result.announcement);
      ({ document, focus, inputState } = result);
    }
    const tree = parseMathML(document.mathml);
    assert.equal(tree.children[0].name, element);
    // SRE serializes the empty limit slot as an ordinary lim projection; the
    // BANA input indicator remains represented by the MathML structure.
    assert.equal(await nemeth(document.mathml), '⠇⠊⠍');
  }
});

test('MathCAT left-script fixtures remain accurate as canonical multiscripts', async () => {
  const fixtures = [
    ['<math><mmultiscripts><mi>n</mi><mprescripts/><none/><mi>x</mi></mmultiscripts></math>', '⠘⠭⠐⠝'],
    ['<math><mmultiscripts><mi>n</mi><mi>y</mi><none/><mprescripts/><mi>x</mi><none/></mmultiscripts></math>', '⠰⠭⠐⠝⠰⠽'],
    ['<math><mmultiscripts><mi>x</mi><mn>1</mn><none/><mprescripts/><mn>3</mn><none/></mmultiscripts></math>', '⠰⠒⠐⠭⠰⠂']
  ];
  for (const [mathml, expected] of fixtures) assert.equal(await nemeth(mathml), expected, mathml);
});

test('BANA Rule 14.7 and 14.12 guided script fixtures match the independent Braille projection', async () => {
  const contractedComma = await importLatex('x_{i,j}');
  assert.equal(await nemeth(contractedComma.mathml), '⠭⠰⠊⠠⠀⠚');
  const primedSubscript = await importLatex("x'_{i}");
  assert.equal(await nemeth(primedSubscript.mathml), '⠭⠄⠰⠊');
  const focusedBase = parseMathML(primedSubscript.mathml).children[0];
  assert.equal(await nemeth(subtreeMathML(focusedBase)), '⠭⠄⠰⠊');
});

test('BANA Rule 15.3 and 15.6 local structures match independent Nemeth output', async () => {
  const higher = '<math><mover><mover><mi>x</mi><mo>¯</mo></mover><mo>¯</mo></mover></math>';
  assert.equal(await nemeth(higher), '⠐⠭⠱⠣⠱⠻');
  const binomial = '<math><mrow data-omniya-binomial="true" intent="binomial($upper,$lower)"><mo>(</mo><mtable data-omniya-role="binomial-table"><mtr><mtd><mi>n</mi></mtd></mtr><mtr><mtd><mi>k</mi></mtd></mtr></mtable><mo>)</mo></mrow></math>';
  assert.equal(await nemeth(binomial), '⠷⠝⠩⠅⠾');
  const parallel = '<math><mover><mi>x</mi><mrow><mo>¯</mo><mo>¯</mo></mrow></mover></math>';
  assert.equal(await nemeth(parallel), '⠐⠭⠣⠱⠱⠻');
});

test('BANA Rules 3.6 and 3.11 guided drafts match independent Nemeth output', async () => {
  const base = '<math><mn>13te7</mn></math>';
  assert.equal(await nemeth(base), '⠼⠂⠒⠞⠑⠶');
  const roman = '<math><mi data-omniya-nemeth-intent="roman">VII</mi></math>';
  assert.equal(await nemeth(roman), '⠠⠠⠧⠊⠊');
  assert.equal(await nemeth('<math><msup><mi>x</mi><mi>a</mi></msup><mo>′</mo><mi>s</mi></math>'), '⠭⠘⠁⠄⠎');
});
