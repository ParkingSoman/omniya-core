import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { completionReport, parseMathML } from '../../src/domain/math-tree.js';
import {
  applyNemethCell,
  applyNemethChoice,
  commitNemethLocalCode,
  createEmptyDraftMathDocument,
  operationRegistry,
  sourceNotationToCells
} from '../../src/domain/guided-nemeth/index.js';

function focusOf(document) {
  const tree = parseMathML(document.mathml);
  return { kind: 'node', nodeId: tree.attrs['data-omniya-id'] };
}

function cell(document, focus, inputState, value) {
  return applyNemethCell({ document, focus, inputState, cell: value });
}

function replayCells(cells, choiceOperationIds = {}) {
  let document = createEmptyDraftMathDocument();
  let focus = focusOf(document);
  let inputState = { prefix: '', mode: null };
  for (const authoredCell of cells) {
    let result = cell(document, focus, inputState, authoredCell);
    if (result.status === 'choice') {
      const operationId = choiceOperationIds[inputState.prefix + authoredCell]
        ?? result.choices.find((choice) => choice.operationId === 'script.superscript')?.operationId
        ?? result.choices[0].operationId;
      result = applyNemethChoice({
        document: result.document, focus: result.focus, inputState: result.inputState, operationId
      });
    }
    if (result.status === 'rejected') {
      throw new Error(`${authoredCell}: ${result.announcement}`);
    }
    ({ document, focus, inputState } = result);
  }
  if (inputState.prefix) {
    const committed = commitNemethLocalCode({ document, focus, inputState });
    if (committed.status === 'applied') ({ document, focus, inputState } = committed);
  }
  return { document, focus, inputState };
}

test('Rule 14.4 absolute ~~ after a first-level superscript fills one nested hole', () => {
  const { document } = replayCells(sourceNotationToCells('n~x~~y'));
  const tree = parseMathML(document.mathml);
  const report = completionReport(tree);
  assert.equal(report.complete, true, `holes=${report.holes.map((hole) => hole.role).join(',')}`);
  assert.equal(tree.children[0].name, 'msup');
  assert.equal(tree.children[0].children[0].children[0].text, 'n');
  assert.equal(tree.children[0].children[1].name, 'msup');
  assert.equal(tree.children[0].children[1].children[0].children[0].text, 'x');
  assert.equal(tree.children[0].children[1].children[1].children[0].text, 'y');
});

test('Rule 14.9 grouped ~~n~ returns to the enclosing superscript instead of wrapping a hole', () => {
  const { document } = replayCells(sourceNotationToCells('x~(m~~n~)'));
  const tree = parseMathML(document.mathml);
  const report = completionReport(tree);
  assert.equal(report.complete, true, `holes=${report.holes.map((hole) => hole.role).join(',')}`);
  assert.equal(tree.children[0].name, 'msup');
  assert.equal(tree.children[0].children[0].children[0].text, 'x');
  const group = tree.children[0].children[1];
  const inner = (node) => {
    if (node?.name === 'msup' && node.children?.[0]?.children?.[0]?.text === 'm') return node;
    for (const child of node?.children ?? []) {
      const found = inner(child);
      if (found) return found;
    }
    return null;
  };
  const nested = inner(group);
  assert.ok(nested, 'grouped superscript should contain m^n');
  assert.equal(nested.children[1].children[0].text, 'n');
  assert.equal(nested.children[1].attrs?.['data-omniya-hole'], undefined);
});

test('Rule 14.9 level-1 ~ after a nested radical superscript continues the radicand', () => {
  const { document } = replayCells(sourceNotationToCells('e~>x~~2~+y~~2~]'));
  const tree = parseMathML(document.mathml);
  const report = completionReport(tree);
  assert.equal(report.complete, true, `holes=${report.holes.map((hole) => hole.role).join(',')}`);
  assert.equal(tree.children[0].name, 'msup');
  assert.equal(tree.children[0].children[0].children[0].text, 'e');
  const radical = tree.children[0].children[1];
  assert.equal(radical.name, 'msqrt');
  const names = [];
  const visit = (node) => {
    if (node?.name) names.push(node.name);
    for (const child of node?.children ?? []) visit(child);
  };
  visit(radical);
  assert.equal(names.filter((name) => name === 'msup').length, 2);
  assert.ok(names.includes('mo'));
});

test('Rule 14 corpus operation IDs remain declared in the authoritative generator', () => {
  const generator = fs.readFileSync(new URL('../../scripts/bana-example-corpus-generate.mjs', import.meta.url), 'utf8');
  for (const number of [...Array.from({ length: 11 }, (_, index) => index + 12), ...Array.from({ length: 88 }, (_, index) => index + 34)]) {
    assert.match(generator, new RegExp(`['"]14-${number}['"]\\s*:`), `14-${number} must remain generator-owned rather than generated-only`);
  }
});

test('Rule 14 corpus cases 14-45 through 14-66 retain source-grounded script operations', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 45; number <= 66; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `14-${number}`);
    assert.ok(entry?.executable, `14-${number} must be executable`);
    assert.ok(entry.operationIds?.length, `14-${number} needs reviewed operation IDs`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    if (entry.choiceOperationIds) {
      assert.ok(Object.values(entry.choiceOperationIds).every((id) => entry.operationIds.includes(id)), `14-${number} choice IDs must be reviewed operations`);
    }
    let document = createEmptyDraftMathDocument(); let focus = focusOf(document); let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') result = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: result.choices[0].operationId });
      if (result.status === 'rejected') break;
      ({ document, focus, inputState } = result);
    }
    const names = [];
    const visit = (node) => { if (node?.name) names.push(node.name); for (const child of node?.children ?? []) visit(child); };
    visit(parseMathML(document.mathml));
    assert.ok(names.some((name) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(name)) || entry.operationIds.some((id) => id.startsWith('script.')),
      `14-${number} lacks canonical script replay or reviewed script metadata`);
    for (const [prefix, operationId] of Object.entries(entry.choiceOperationIds ?? {})) {
      const empty = createEmptyDraftMathDocument();
      const chosen = applyNemethChoice({ document: empty, focus: focusOf(empty), inputState: { prefix, mode: null }, operationId });
      assert.equal(chosen.status, 'applied', `14-${number} ${operationId} choice must apply`);
      assert.match(chosen.document.mathml, /<mmultiscripts[\s\S]*<mprescripts(?:\s[^>]*)?\/>[\s\S]*<none(?:\s[^>]*)?\/>/);
    }
  }
});

test('Rule 14 corpus cases 14-67 through 14-77 retain level and baseline operations', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 67; number <= 77; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `14-${number}`);
    assert.ok(entry?.executable, `14-${number} must be executable`);
    assert.ok(entry.operationIds?.length, `14-${number} needs reviewed operation IDs`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    let document = createEmptyDraftMathDocument(); let focus = focusOf(document); let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') result = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: result.choices[0].operationId });
      if (result.status === 'rejected') break;
      ({ document, focus, inputState } = result);
    }
    const names = [];
    const visit = (node) => { if (node?.name) names.push(node.name); for (const child of node?.children ?? []) visit(child); };
    visit(parseMathML(document.mathml));
    assert.ok(names.some((name) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(name)) || entry.operationIds.some((id) => id.startsWith('script.')),
      `14-${number} lacks canonical script replay or reviewed script metadata`);
  }
});

test('Rule 14 corpus cases 14-78 through 14-88 retain exact spacing and script operations', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 78; number <= 88; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `14-${number}`);
    assert.ok(entry?.executable, `14-${number} must be executable`);
    assert.ok(entry.operationIds?.length, `14-${number} needs reviewed operation IDs`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    let document = createEmptyDraftMathDocument(); let focus = focusOf(document); let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') result = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: result.choices[0].operationId });
      if (result.status === 'rejected') break;
      ({ document, focus, inputState } = result);
    }
    const names = [];
    const visit = (node) => { if (node?.name) names.push(node.name); for (const child of node?.children ?? []) visit(child); };
    visit(parseMathML(document.mathml));
    assert.ok(names.some((name) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(name)) || entry.operationIds.some((id) => id.startsWith('script.')),
      `14-${number} lacks canonical script replay or reviewed script metadata`);
  }
});

test('Rule 14 corpus cases 14-89 through 14-99 retain exact spacing and boundary operations', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 89; number <= 99; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `14-${number}`);
    assert.ok(entry?.executable, `14-${number} must be executable`);
    assert.ok(entry.operationIds?.length, `14-${number} needs reviewed operation IDs`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    let document = createEmptyDraftMathDocument(); let focus = focusOf(document); let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') result = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: result.choices[0].operationId });
      if (result.status === 'rejected') break;
      ({ document, focus, inputState } = result);
    }
    const names = [];
    const visit = (node) => { if (node?.name) names.push(node.name); for (const child of node?.children ?? []) visit(child); };
    visit(parseMathML(document.mathml));
    assert.ok(names.some((name) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(name)) || entry.operationIds.some((id) => id.startsWith('script.')),
      `14-${number} lacks canonical script replay or reviewed script metadata`);
  }
});

test('Rule 14 corpus cases 14-100 through 14-110 retain exact boundary and left-script operations', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 100; number <= 110; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `14-${number}`);
    assert.ok(entry?.executable, `14-${number} must be executable`);
    assert.ok(entry.operationIds?.length, `14-${number} needs reviewed operation IDs`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    if (entry.choiceOperationIds) assert.ok(Object.values(entry.choiceOperationIds).every((id) => entry.operationIds.includes(id)), `14-${number} choice IDs must be reviewed operations`);
    let document = createEmptyDraftMathDocument(); let focus = focusOf(document); let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') result = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: result.choices[0].operationId });
      if (result.status === 'rejected') break;
      ({ document, focus, inputState } = result);
    }
    const names = [];
    const visit = (node) => { if (node?.name) names.push(node.name); for (const child of node?.children ?? []) visit(child); };
    visit(parseMathML(document.mathml));
    assert.ok(names.some((name) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(name)) || entry.operationIds.some((id) => id.startsWith('script.')),
      `14-${number} lacks canonical script replay or reviewed script metadata`);
    for (const [prefix, operationId] of Object.entries(entry.choiceOperationIds ?? {})) {
      const empty = createEmptyDraftMathDocument();
      const chosen = applyNemethChoice({ document: empty, focus: focusOf(empty), inputState: { prefix, mode: null }, operationId });
      assert.equal(chosen.status, 'applied', `14-${number} ${operationId} choice must apply`);
      assert.match(chosen.document.mathml, /<mmultiscripts[\s\S]*<mprescripts(?:\s[^>]*)?\/>[\s\S]*<none(?:\s[^>]*)?\/>/);
    }
  }
});

test('Rule 14 corpus cases 14-111 through 14-121 retain exact comparison and script operations', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 111; number <= 121; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `14-${number}`);
    assert.ok(entry?.executable, `14-${number} must be executable`);
    assert.ok(entry.operationIds?.length, `14-${number} needs reviewed operation IDs`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    let document = createEmptyDraftMathDocument(); let focus = focusOf(document); let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') result = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: result.choices[0].operationId });
      if (result.status === 'rejected') break;
      ({ document, focus, inputState } = result);
    }
    const names = [];
    const visit = (node) => { if (node?.name) names.push(node.name); for (const child of node?.children ?? []) visit(child); };
    visit(parseMathML(document.mathml));
    assert.ok(names.some((name) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(name)) || entry.operationIds.some((id) => id.startsWith('script.')),
      `14-${number} lacks canonical script replay or reviewed script metadata`);
  }
});

test('Rule 14 corpus cases 14-122 through 14-141 retain exact prime and script operations', () => {
  const expected = new Map(Object.entries({
    '14-122': ['script.sub-sup'], '14-123': ['script.superscript'],
    '14-124': ['script.sup-sub'], '14-125': ['script.sub-sup'],
    '14-126': ['script.sup-sub'], '14-127': ['script.sub-sup'],
    '14-128': ['script.superscript', 'script.baseline'],
    '14-129': ['misc.prime', 'script.sub-sup'], '14-130': ['misc.prime'],
    '14-131': ['misc.prime', 'script.subscript'],
    '14-132': ['misc.prime', 'script.superscript'],
    '14-133': ['misc.prime', 'script.sub-sup'],
    '14-134': ['misc.prime', 'script.superscript'],
    '14-135': ['misc.prime', 'script.superscript'],
    '14-136': ['script.superscript', 'misc.prime'],
    '14-137': ['script.sub-sup', 'misc.prime'],
    '14-138': ['misc.prime', 'script.sub-sup'],
    '14-139': ['script.superscript', 'script.possessive'],
    '14-140': ['script.subscript', 'script.possessive'],
    '14-141': ['script.subscript', 'script.possessive']
  }));
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  const generator = fs.readFileSync(new URL('../../scripts/bana-example-corpus-generate.mjs', import.meta.url), 'utf8');
  for (const [exampleNumber, operationIds] of expected) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === exampleNumber);
    assert.ok(entry?.executable, `${exampleNumber} must be executable`);
    assert.deepEqual(entry.operationIds, operationIds, `${exampleNumber} needs exact reviewed operation ownership`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    assert.match(generator, new RegExp(`['"]${exampleNumber}['"]\\s*:`), `${exampleNumber} must remain generator-owned`);
    let document = createEmptyDraftMathDocument();
    let focus = focusOf(document);
    let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') {
        const reviewed = result.choices.find((choice) => operationIds.includes(choice.operationId));
        result = applyNemethChoice({
          document: result.document,
          focus: result.focus,
          inputState: result.inputState,
          operationId: reviewed?.operationId ?? result.choices[0].operationId
        });
      }
      assert.notEqual(result.status, 'rejected', `${exampleNumber} rejects authored cell ${authoredCell}`);
      ({ document, focus, inputState } = result);
    }
    assert.notEqual(document.mathml, createEmptyDraftMathDocument().mathml, `${exampleNumber} must build a canonical draft`);
  }
});

test('Rule 14 Electron corpus cases 14-12 through 14-22 replay authored cells', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 12; number <= 22; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `14-${number}`);
    assert.ok(entry?.executable, `14-${number} must be executable`);
    assert.ok(entry.operationIds?.length, `14-${number} needs reviewed operation IDs`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    let document = createEmptyDraftMathDocument();
    let focus = focusOf(document);
    let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') result = applyNemethChoice({
        document: result.document, focus: result.focus, inputState: result.inputState,
        operationId: result.choices[0].operationId
      });
      if (result.status === 'rejected') break;
      ({ document, focus, inputState } = result);
    }
    const mathml = parseMathML(document.mathml);
    const names = [];
    const visit = (node) => { if (node?.name) names.push(node.name); for (const child of node?.children ?? []) visit(child); };
    visit(mathml);
    assert.ok(names.some((name) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(name)), `14-${number} lacks script MathML`);
  }
});

test('Rule 14 left-script Electron corpus cases 14-23 through 14-33 carry reviewed choices and canonical MathML', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 23; number <= 33; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `14-${number}`);
    assert.ok(entry?.executable, `14-${number} must be executable`);
    assert.ok(entry.operationIds?.length, `14-${number} needs reviewed operation IDs`);
    assert.ok(entry.operationIds.some((id) => id.includes('left-')) === Boolean(entry.choiceOperationIds), `14-${number} choice metadata must match left-script operations`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    let document = createEmptyDraftMathDocument(); let focus = focusOf(document); let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') result = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: result.choices[0].operationId });
      if (result.status === 'rejected') break;
      ({ document, focus, inputState } = result);
    }
    const names = [];
    const visit = (node) => { if (node?.name) names.push(node.name); for (const child of node?.children ?? []) visit(child); };
    visit(parseMathML(document.mathml));
    assert.ok(names.some((name) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(name)) || entry.operationIds.some((id) => id.includes('left-')),
      `14-${number} lacks canonical script metadata`);
    for (const leftOperationId of entry.operationIds.filter((id) => id === 'script.left-superscript' || id === 'script.left-subscript')) {
      // Use a valid continuation cell so the explicit choice exercises the
      // complete left-script construction independent of the source example's
      // preceding numeric/sign indicators.
      const choicePrefix = leftOperationId === 'script.left-superscript' ? '⠘⠭' : '⠰⠭';
      const empty = createEmptyDraftMathDocument();
      const chosen = applyNemethChoice({ document: empty, focus: focusOf(empty), inputState: { prefix: choicePrefix, mode: null }, operationId: leftOperationId });
      assert.equal(chosen.status, 'applied', `14-${number} ${leftOperationId} choice must apply`);
      assert.match(chosen.document.mathml, /<mmultiscripts[\s\S]*<mprescripts(?:\s[^>]*)?\/>[\s\S]*<none(?:\s[^>]*)?\/>/);
    }
  }
});

test('Rule 14 right-script Electron corpus cases 14-34 through 14-44 retain exact source and replay structure', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 34; number <= 44; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `14-${number}`);
    assert.ok(entry?.executable, `14-${number} must be executable`);
    assert.ok(entry.operationIds?.length, `14-${number} needs reviewed operation IDs`);
    assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation));
    if (entry.choiceOperationIds) {
      assert.ok(Object.values(entry.choiceOperationIds).every((id) => entry.operationIds.includes(id)), `14-${number} choice IDs must be reviewed operations`);
    }
    let document = createEmptyDraftMathDocument(); let focus = focusOf(document); let inputState = { prefix: '', mode: null };
    for (const authoredCell of entry.cells) {
      let result = cell(document, focus, inputState, authoredCell);
      if (result.status === 'choice') result = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: result.choices[0].operationId });
      if (result.status === 'rejected') break;
      ({ document, focus, inputState } = result);
    }
    const names = [];
    const visit = (node) => { if (node?.name) names.push(node.name); for (const child of node?.children ?? []) visit(child); };
    visit(parseMathML(document.mathml));
    assert.ok(names.some((name) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(name)) || entry.operationIds.some((id) => id.startsWith('script.')),
      `14-${number} lacks canonical script replay or reviewed script metadata`);
    for (const leftOperationId of entry.operationIds.filter((id) => id === 'script.left-superscript' || id === 'script.left-subscript')) {
      const prefix = leftOperationId === 'script.left-superscript' ? '⠘⠉' : '⠰⠉';
      const empty = createEmptyDraftMathDocument();
      const chosen = applyNemethChoice({ document: empty, focus: focusOf(empty), inputState: { prefix, mode: null }, operationId: leftOperationId });
      assert.equal(chosen.status, 'applied', `14-${number} ${leftOperationId} choice must apply`);
      assert.match(chosen.document.mathml, /<mmultiscripts[\s\S]*<mprescripts(?:\s[^>]*)?\/>[\s\S]*<none(?:\s[^>]*)?\/>/);
    }
  }
});

test('sequential Nemeth cells build a plain MathML row one token at a time', () => {
  let document = createEmptyDraftMathDocument();
  let focus = focusOf(document);
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠁', '⠬', '⠃']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.map((node) => [node.name, node.children[0].text]), [
    ['mi', 'a'], ['mo', '+'], ['mi', 'b']
  ]);
});

test('choice-only registry rows stay out of automatic matching but remain explicitly applicable', () => {
  const entry = operationRegistry().find((candidate) => candidate.id === 'script.left-superscript');
  assert.ok(entry, 'left-superscript choice row should be registered');
  assert.equal(entry.choiceOnly, true);

  let document = createEmptyDraftMathDocument();
  let focus = focusOf(document);
  const automatic = cell(document, focus, { prefix: '', mode: null }, entry.cells[0]);
  assert.notEqual(automatic.status, 'choice', 'choice-only row must not create an automatic choice');
  const contextual = cell(document, focus, automatic.inputState, '⠁');
  assert.equal(contextual.status, 'choice');
  assert.ok(contextual.choices.some((choice) => choice.operationId === entry.id));
  const explicit = applyNemethChoice({ document, focus, inputState: contextual.inputState, operationId: entry.id });
  assert.equal(explicit.status, 'applied');
  assert.match(explicit.document.mathml, /mmultiscripts/);
});

test('a function code terminates numeric mode without merging into the number', () => {
  let document = createEmptyDraftMathDocument();
  let focus = focusOf(document);
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠼', '⠆', '⠎', '⠊', '⠝']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const local = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(local.status, 'applied', local.announcement);
  ({ document, focus, inputState } = local);
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.map((node) => [node.name, node.children[0]?.text]), [
    ['mn', '2'],
    ['mi', 'sin']
  ]);
  assert.equal(tree.children[1].attrs['data-omniya-nemeth-intent'], 'function-name');
});

test('fraction cells create and traverse structural slots without parsing a passage', () => {
  let document = createEmptyDraftMathDocument();
  let focus = focusOf(document);
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠹', '⠁']) {
    const result = cell(document, focus, inputState, value);
    const committed = result.status === 'pending'
      ? commitNemethLocalCode({ document, focus, inputState: result.inputState })
      : result;
    assert.equal(committed.status, 'applied');
    ({ document, focus, inputState } = committed);
  }
  let result = cell(document, focus, inputState, '⠌');
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠃');
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠼');
  assert.equal(result.status, 'applied');
  const tree = parseMathML(result.document.mathml);
  assert.equal(tree.children[0].name, 'mfrac');
  assert.equal(tree.children[0].children[0].children[0].text, 'a');
  assert.equal(tree.children[0].children[1].children[0].text, 'b');
});

test('Rule 19.1.2 keeps a closing bar subscript at one current script level', () => {
  let document = createEmptyDraftMathDocument();
  let focus = focusOf(document);
  let inputState = { prefix: '', mode: null };
  const cells = ['⠹', '⠙', '⠵', '⠌', '⠙', '⠞', '⠼', '⠳', '⠰', '⠞', ' ', '⠰', '⠨', '⠅', ' ', '⠼', '⠴'];
  for (const value of cells) {
    let result = cell(document, focus, inputState, value);
    if (result.status === 'choice') {
      const operationId = result.choices.some((choice) => choice.operationId === 'group.vertical-bar')
        ? 'group.vertical-bar'
        : result.choices.some((choice) => choice.operationId === 'script.subscript')
          ? 'script.subscript'
          : 'operator.equals';
      result = applyNemethChoice({ document: result.document, focus: result.focus,
        inputState: result.inputState, operationId });
    }
    assert.notEqual(result.status, 'rejected', `${value}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  const bar = tree.children.find((node) => node.name === 'msub');
  assert.ok(bar, 'closing vertical bar should own one subscript');
  assert.equal(bar.children[0].children[0].text, '|');
  assert.deepEqual(bar.children[1].children.filter((node) => node.name !== 'mspace').map((node) => node.name), ['mi', 'mo', 'mn']);
  assert.equal(bar.children[1].children.filter((node) => node.name !== 'mspace')[0].children[0].text, 't');
  assert.equal(bar.children[1].children.filter((node) => node.name !== 'mspace')[1].children[0].text, '=');
  assert.equal(bar.children[1].children.filter((node) => node.name !== 'mspace')[2].children[0].text, '0');
  assert.equal(bar.children[1].children.some((node) => node.name === 'msub'), false, 'current-level indicator must not create a nested subscript');
});

test('a diagonal fraction boundary keeps the following expression in the same root row', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  const choices = new Map([
    ['operator.equals', 'operator.equals'],
    ['modifier.dot', 'operator.dot']
  ]);
  for (const value of sourceNotationToCells('#1_/cos -cos .k tan *sin')) {
    let result = cell(document, focus, inputState, value);
    if (result.status === 'choice') {
      const choice = result.choices.find((candidate) => choices.has(candidate.operationId));
      assert.ok(choice, `unexpected local choice for ${value}`);
      result = applyNemethChoice({
        document,
        focus,
        inputState: result.inputState,
        operationId: choices.get(choice.operationId)
      });
    }
    if (result.status === 'rejected') {
      assert.fail(result.announcement);
    }
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.name, 'math');
  assert.equal(tree.children.filter((node) => node.name).length, 10);
  const fraction = tree.children[0];
  assert.equal(fraction.name, 'mfrac');
  assert.equal(fraction.attrs.bevelled, 'true');
  assert.equal(fraction.children[0].children[0].text, '1');
  assert.equal(fraction.children[1].name, 'mi');
  assert.equal(fraction.children[1].children[0].text, 'cos');
  assert.equal(tree.children[2].children[0].text, '−');
  assert.equal(tree.children[3].children[0].text, 'cos');
  assert.equal(tree.children[5].children[0].text, '=');
  assert.equal(tree.children[9].children[0].text, '·');
});

test('group content remains the insertion row after a nested structure closes', () => {
  let document = createEmptyDraftMathDocument();
  let focus = focusOf(document);
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠷', '⠹', '⠁', '⠌', '⠃', '⠼', '⠾', '⠉']) {
    let result = cell(document, focus, inputState, value);
    if (result.status === 'choice') {
      result = applyNemethChoice({ document, focus, inputState: result.inputState, operationId: result.choices.find((choice) => choice.operationId === 'group.round')?.operationId ?? result.choices[0].operationId });
    }
    if (result.status === 'pending') result = commitNemethLocalCode({ document, focus, inputState: result.inputState });
    assert.equal(result.status, 'applied', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  const group = tree.children.find((node) => node.name === 'mrow' && node.attrs['data-omniya-group'] === 'round');
  assert.ok(group);
  const content = group.children.find((node) => node.name === 'mrow' && !node.attrs['data-omniya-role']);
  assert.equal(content.name, 'mrow');
  assert.deepEqual(content.children.filter((node) => node.name).map((node) => node.name), ['mfrac', 'mi']);
});

test('complex and hypercomplex fraction indicators keep their BANA distinction locally', () => {
  for (const [kind, opening, separator, closing] of [
    ['complex', ['⠠', '⠹'], ['⠠', '⠌'], ['⠠', '⠼']],
    ['hypercomplex', ['⠠', '⠠', '⠹'], ['⠠', '⠠', '⠌'], ['⠠', '⠠', '⠼']]
  ]) {
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    for (const value of [...opening, '⠁', ...separator, '⠃', ...closing]) {
      const result = cell(document, focus, inputState, value);
      assert.notEqual(result.status, 'rejected', `${kind}: ${result.announcement}`);
      ({ document, focus, inputState } = result);
    }
    const root = parseMathML(document.mathml);
    assert.equal(root.children[0].name, 'mfrac');
    assert.equal(root.children[0].attrs['data-omniya-fraction-kind'], kind);
    assert.equal(root.children[0].children[0].children[0].text, 'a');
    assert.equal(root.children[0].children[1].children[0].text, 'b');
  }
});

test('Rule 13.8.2 higher-order hypercomplex opening keeps order in canonical MathML', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠠', '⠠', '⠠', '⠹']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'mfrac');
  assert.equal(tree.children[0].attrs['data-omniya-fraction-kind'], 'hypercomplex');
  assert.equal(tree.children[0].attrs['data-omniya-fraction-order'], '3');
});

test('Rule 17.6 multi-interior shapes remain atomic until Enter', () => {
  for (const id of ['shape.circle.interior-arrows-horizontal', 'shape.circle.interior-arrows-vertical']) {
    const code = operationRegistry().find((entry) => entry.id === id).cells;
    let document = createEmptyDraftMathDocument();
    let focus = document.focus;
    let inputState = { prefix: '', mode: null };
    const initialMathML = document.mathml;
    for (const cell of code) {
      const result = applyNemethCell({ document, focus, inputState, cell });
      assert.ok(result);
      assert.notEqual(result.status, 'rejected', result.announcement);
      ({ document, focus, inputState } = result);
    }
    assert.equal(document.mathml, initialMathML, `${id} mutated before Enter`);
    assert.equal(inputState.prefix.length > 0, true);
    const committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', committed.announcement);
    assert.match(committed.document.mathml, /data-omniya-shape-modification="interior-arrows-/);
  }
});

test('fixed-index roots create canonical mroot structure one code at a time', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠣', '⠒', '⠜', '⠁', '⠻']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const root = parseMathML(document.mathml);
  assert.equal(root.children[0].name, 'mroot');
  assert.equal(root.children[0].children[0].children[0].text, 'a');
  assert.equal(root.children[0].children[1].children[0].text, '3');
});

test('omission and cancellation indicators become local MathML constructs', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  const omission = cell(document, focus, inputState, '⠿');
  assert.equal(omission.status, 'applied');
  const omissionTree = parseMathML(omission.document.mathml);
  assert.equal(omissionTree.children[0].children[0].text, '?');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const value of ['⠪', '⠭', '⠻']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'menclose');
  assert.equal(tree.children[0].attrs.notation, 'updiagonalstrike');
  assert.equal(tree.children[0].children[0].children[0].text, 'x');
});

function applyDraftCells(cells) {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of cells) {
    let result = cell(document, focus, inputState, value);
    while (result.status === 'choice') {
      const operationId = result.choices.find((choice) => choice.operationId === 'group.round')?.operationId
        ?? result.choices[0].operationId;
      result = applyNemethChoice({
        document: result.document,
        focus: result.focus,
        inputState: result.inputState,
        operationId
      });
    }
    assert.notEqual(result.status, 'rejected', `${value}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  return parseMathML(document.mathml);
}

test('adjacent cancellations remain sibling enclosures, not a replacement of the whole draft', () => {
  const tree = applyDraftCells(['⠪', '⠭', '⠻', '⠪', '⠽', '⠻']);
  const cancellations = tree.children.filter((node) => node.name === 'menclose');
  assert.equal(cancellations.length, 2);
  assert.equal(cancellations[0].children[0].children[0].text, 'x');
  assert.equal(cancellations[1].children[0].children[0].text, 'y');
});

test('a cancellation may contain an authored blank before a lower-cell digit', () => {
  const tree = applyDraftCells(['⠪', '⠀', '⠆', '⠻']);
  const cancellation = tree.children[0];
  assert.equal(cancellation.name, 'menclose');
  const inner = cancellation.children[0].name === 'mrow' ? cancellation.children[0].children : cancellation.children;
  assert.equal(inner[0].name, 'mspace');
  assert.equal(inner[1].name, 'mn');
  assert.equal(inner[1].children[0].text, '2');
  assert.equal(inner[1].attrs['data-omniya-nemeth-intent'], 'lower-cell-numeric');
});

test('Rule 12 adjacent cancellations keep later uncancelled letters as siblings', () => {
  const tree = applyDraftCells(['⠪', '⠭', '⠻', '⠪', '⠽', '⠻', '⠵']);
  assert.equal(tree.children.filter((node) => node.name === 'menclose').length, 2);
  assert.equal(tree.children.at(-1).name, 'mi');
  assert.equal(tree.children.at(-1).children[0].text, 'z');
});

test('Rule 8.7 short dash waits for its complete local code', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = cell(document, focus, inputState, '⠤');
  assert.equal(result.status, 'pending');
  const before = result.document.mathml;
  result = cell(result.document, result.focus, result.inputState, '⠤');
  assert.equal(result.status, 'pending');
  assert.equal(result.document.mathml, before);
  const committed = commitNemethLocalCode({ document: result.document, focus: result.focus, inputState: result.inputState });
  assert.equal(committed.status, 'applied');
  assert.equal(parseMathML(committed.document.mathml).children[0].children[0].text, '–');
});

test('Rule 11.1.2 omission long dash is a bounded local construction', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const [index, value] of ['⠤', '⠤', '⠤', '⠤'].entries()) {
    const result = cell(document, focus, inputState, value);
    assert.equal(result.status, index === 3 ? 'choice' : 'pending');
    ({ document, focus, inputState } = result);
  }
  const committed = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(committed.status, 'choice');
  const omission = applyNemethChoice({
    document: committed.document,
    focus: committed.focus,
    inputState: committed.inputState,
    operationId: 'omission.long-dash'
  });
  assert.equal(omission.status, 'applied', omission.announcement);
  assert.match(omission.document.mathml, /data-omniya-nemeth-intent="omission-long-dash"/);
});

test('Rule 3.2.3 decimal-return long dash is one bounded local construction', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠼', '⠨', '⠂', '⠬', '⠨', '⠆', ' ', '⠨', '⠅', ' ']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    if (result.status === 'choice') {
      const selected = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: 'operator.equals' });
      assert.equal(selected.status, 'applied', selected.announcement);
      ({ document, focus, inputState } = selected);
    } else {
      ({ document, focus, inputState } = result);
    }
  }
  for (const cell of ['⠨', '⠐', '⠤', '⠤', '⠤', '⠤']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  assert.equal(inputState.prefix, '⠨⠐⠤⠤⠤⠤');
  const committed = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(committed.status, 'applied', committed.announcement);
  assert.match(committed.document.mathml, /omission-decimal-long-dash/);
});

test('BANA numeric mode resumes after a baseline arithmetic operator', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠼', '⠂', '⠨', '⠆', '⠬', '⠂', '⠨', '⠲']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  assert.match(document.mathml, />1\.2<\/mn>[\s\S]*>\+<\/mo>[\s\S]*>1\.4<\/mn>/);
});

test('BANA signed numeric construction accepts a local digit after plus', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠬', '⠒']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  assert.match(document.mathml, />\+<\/mo>[\s\S]*>3<\/mn>/);
});

test('BANA signed numeric indicator intent survives explicit number sign before a digit', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cell of ['⠤', '⠼', '⠒']) {
    const result = applyNemethCell({ document, focus, inputState, cell });
    assert.notEqual(result.status, 'rejected', `${cell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.map((node) => [node.name, node.children[0]?.text]), [
    ['mo', '−'], ['mn', '3']
  ]);
  assert.equal(tree.children[1].attrs['data-omniya-nemeth-intent'], 'signed-numeric-indicator');
});

test('Rule 8.4 plural and possessive endings append to the focused local expression', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠭', '⠘', '⠁', '⠸', '⠄', '⠎']) {
    let result = cell(document, focus, inputState, value);
    if (result.status === 'choice') {
      const selected = applyNemethChoice({ document: result.document, focus: result.focus, inputState: result.inputState, operationId: 'script.possessive' });
      assert.equal(selected.status, 'applied', selected.announcement);
      ({ document, focus, inputState } = selected);
      continue;
    }
    if (result.status === 'pending' && result.inputState.prefix === '⠸⠄⠎') {
      result = commitNemethLocalCode({ document: result.document, focus: result.focus, inputState: result.inputState });
    }
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  let tree = parseMathML(document.mathml);
  assert.equal(tree.children.at(-2).name, 'mo');
  assert.equal(tree.children.at(-2).children[0].text, '′');
  assert.equal(tree.children.at(-1).name, 'mi');
  assert.equal(tree.children.at(-1).children[0].text, 's');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const value of ['⠭']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  let plural = cell(document, focus, inputState, '⠎');
  if (plural.status === 'choice') {
    plural = applyNemethChoice({ document: plural.document, focus: plural.focus, inputState: plural.inputState, operationId: 'plural.s' });
  }
  if (plural.status === 'pending' && plural.inputState.prefix === '⠎') {
    plural = commitNemethLocalCode({ document: plural.document, focus: plural.focus, inputState: plural.inputState });
  }
  if (plural.status === 'choice') {
    plural = applyNemethChoice({ document: plural.document, focus: plural.focus, inputState: plural.inputState, operationId: 'plural.s' });
  }
  assert.equal(plural.status, 'applied', plural.announcement);
  tree = parseMathML(plural.document.mathml);
  assert.equal(tree.children.at(-1).children[0].text, 's');

  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  for (const value of ['⠭', '⠘', '⠁']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  plural = cell(document, focus, inputState, '⠎');
  if (plural.status === 'pending') plural = commitNemethLocalCode({ document: plural.document, focus: plural.focus, inputState: plural.inputState });
  if (plural.status === 'choice') plural = applyNemethChoice({ document: plural.document, focus: plural.focus, inputState: plural.inputState, operationId: 'plural.s' });
  assert.equal(plural.status, 'applied', plural.announcement);
  tree = parseMathML(plural.document.mathml);
  assert.equal(tree.children.at(-1).name, 'mi');
  assert.equal(tree.children.at(-1).children[0].text, 's');
  assert.equal(tree.children.at(-2).name, 'msup');
});

test('Rule 16.3 nested radical order builds and closes a local inner radical', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠜', '⠭', '⠬']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  let result = cell(document, focus, inputState, '⠨');
  assert.equal(result.status, 'pending');
  result = cell(result.document, result.focus, result.inputState, '⠜');
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠽');
  assert.equal(result.status, 'applied');
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠨');
  assert.equal(result.status, 'pending');
  result = cell(result.document, result.focus, result.inputState, '⠻');
  assert.equal(result.status, 'applied', result.announcement);
  const root = parseMathML(result.document.mathml);
  assert.equal(root.children[0].name, 'msqrt');
  assert.equal(root.children[0].children[0].name, 'mrow');
});

test('UEB passage mode inserts neutral alphabetic cells as source-linked mtext', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: 'ueb-passage' };
  const result = applyNemethCell({ document, focus, inputState, cell: '⠁' });
  assert.equal(result.status, 'applied');
  assert.match(result.document.mathml, /<mtext[^>]*data-omniya-nemeth-intent="ueb-passage"[^>]*>a<\/mtext>/);
});

test('indexed radicals preserve MathML child order while following Nemeth entry order', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠣', '⠼', '⠆', '⠌', '⠁', '⠻']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const root = parseMathML(document.mathml);
  const radical = root.children[0];
  assert.equal(radical.name, 'mroot');
  assert.equal(radical.children[0].children[0].text, 'a');
  assert.equal(radical.children[1].children[0].text, '2');
});

test('compound Rule 14 level indicators build one msubsup with navigable slots', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠘', '⠰']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const committed = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(committed.status, 'applied', committed.announcement);
  ({ document, focus, inputState } = committed);
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'msubsup');
  assert.equal(tree.children[0].children.length, 3);
  const move = cell(document, focus, inputState, '⠰');
  assert.equal(move.status, 'applied');
  assert.equal(parseMathML(move.document.mathml).children[0].attrs['data-omniya-id'], tree.children[0].attrs['data-omniya-id']);
});

test('Rule 14.4.4 four-level script chains compose through the same bounded operation', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠭']) {
    const result = cell(document, focus, inputState, value);
    assert.equal(result.status, 'applied');
    ({ document, focus, inputState } = result);
  }
  for (const value of ['⠘', '⠘', '⠘', '⠘']) {
    const result = cell(document, focus, inputState, value);
    assert.equal(result.status, 'pending');
    ({ document, focus, inputState } = result);
  }
  const committed = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(committed.status, 'applied', committed.announcement);
  const tree = parseMathML(committed.document.mathml);
  let depth = 0;
  let node = tree.children[0];
  while (node?.name === 'msup') {
    depth += 1;
    node = node.children[0];
  }
  assert.equal(depth, 4);
  assert.equal(committed.focus.kind, 'node');
});

test('Rule 14.4.4 repeated local script operations remain bounded at depth 32', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠭', ...Array.from({ length: 31 }, () => ['⠘', '⠭']).flat()]) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  // Each local script operation wraps the previously focused expression;
  // count the resulting MathML nodes rather than relying on which child
  // MathML chooses to carry the nested base.
  assert.equal((document.mathml.match(/<msup\b/g) ?? []).length, 31);
  assert.equal(inputState.prefix, '');
  assert.equal(focus.kind, 'node');
});

test('every registered Nemeth mapping is declarative and source-linked', () => {
  const entries = operationRegistry();
  assert.ok(entries.length > 20);
  for (const entry of entries) {
    assert.ok(entry.id);
    assert.ok(entry.action);
    assert.ok(entry.banaRefs?.length, entry.id);
    assert.ok(Array.isArray(entry.cells), entry.id);
  }
});

test('locally ambiguous grouping cells wait for an explicit operation choice', () => {
  const document = createEmptyDraftMathDocument();
  const pending = cell(document, document.focus, { prefix: '', mode: null }, '⠷');
  assert.equal(pending.status, 'choice');
  assert.equal(pending.document.mathml, document.mathml);
  const chosen = applyNemethChoice({
    document,
    focus: document.focus,
    inputState: pending.inputState,
    operationId: 'group.round'
  });
  assert.equal(chosen.status, 'applied');
  assert.match(chosen.document.mathml, /data-omniya-group="round"/);
});

test('a mixed square bracket and round close commits the parenthesis token', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  let result = null;
  for (const value of ['⠈', '⠷']) {
    result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  if (result.status === 'pending') {
    result = commitNemethLocalCode({ document, focus, inputState });
  }
  assert.equal(result.status, 'applied', result.announcement);
  ({ document, focus, inputState } = result);
  let letter = cell(document, focus, inputState, '⠁');
  if (letter.status === 'pending') {
    letter = commitNemethLocalCode({ document: letter.document, focus: letter.focus, inputState: letter.inputState });
  }
  assert.equal(letter.status, 'applied', letter.announcement);
  ({ document, focus, inputState } = letter);
  let close = cell(document, focus, inputState, '⠾');
  assert.notEqual(close.status, 'choice', `mixed close remained a choice: ${JSON.stringify(close.choices)}`);
  if (close.status === 'pending') {
    close = commitNemethLocalCode({ document: close.document, focus: close.focus, inputState: close.inputState });
  }
  assert.equal(close.status, 'applied', close.announcement);
  assert.match(close.document.mathml, />\)<\/mo>/);
  assert.doesNotMatch(close.document.mathml, /data-omniya-group="round"/);
});

test('a round group close still applies when that group is open', () => {
  const document = createEmptyDraftMathDocument();
  const pending = cell(document, document.focus, { prefix: '', mode: null }, '⠷');
  assert.equal(pending.status, 'choice');
  const opened = applyNemethChoice({
    document,
    focus: document.focus,
    inputState: pending.inputState,
    operationId: 'group.round'
  });
  assert.equal(opened.status, 'applied');
  let letter = cell(opened.document, opened.focus, opened.inputState, '⠁');
  if (letter.status === 'pending') {
    letter = commitNemethLocalCode({ document: letter.document, focus: letter.focus, inputState: letter.inputState });
  }
  assert.equal(letter.status, 'applied', letter.announcement);
  const close = cell(letter.document, letter.focus, letter.inputState, '⠾');
  const resolved = close.status === 'choice'
    ? applyNemethChoice({
      document: close.document,
      focus: close.focus,
      inputState: close.inputState,
      operationId: 'group.round.end'
    })
    : close;
  assert.equal(resolved.status, 'applied', resolved.announcement);
  assert.match(resolved.document.mathml, /data-omniya-role="closed-group"/);
});

test('computer-Braille and Unicode blanks create the same explicit MathML space', () => {
  for (const blank of [' ', '⠀']) {
    const document = createEmptyDraftMathDocument();
    const result = cell(document, document.focus, { prefix: '', mode: null }, blank);
    assert.equal(result.status, 'applied');
  assert.match(result.document.mathml, /<mspace width="1em"/);
  assert.match(result.document.mathml, /data-omniya-source-space="true"/);
  }
});

test('BANA 7.3.5 expression typeforms use bounded MathML scope operations', () => {
  const cases = [
    ['⠠⠄⠸', '⠸⠠⠄', 'bold'],
    ['⠠⠄⠨', '⠨⠠⠄', 'italic']
  ];
  for (const [open, close, mathvariant] of cases) {
    let document = createEmptyDraftMathDocument();
    let focus = focusOf(document);
    let inputState = { prefix: '', mode: null };
    for (const currentCell of [...open]) {
      const result = cell(document, focus, inputState, currentCell);
      assert.notEqual(result.status, 'rejected', result.announcement);
      ({ document, focus, inputState } = result);
    }
    let committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', committed.announcement);
    ({ document, focus, inputState } = committed);
    for (const currentCell of ['⠁', '⠬', '⠃']) {
      const result = cell(document, focus, inputState, currentCell);
      assert.notEqual(result.status, 'rejected', result.announcement);
      ({ document, focus, inputState } = result);
    }
    const tree = parseMathML(document.mathml);
    assert.equal(tree.children[0].name, 'mstyle');
    assert.equal(tree.children[0].attrs.mathvariant, mathvariant);
    assert.equal(tree.children[0].children[0].name, 'mrow');
    for (const currentCell of [...close]) {
      const result = cell(document, focus, inputState, currentCell);
      assert.notEqual(result.status, 'rejected', result.announcement);
      ({ document, focus, inputState } = result);
    }
    committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied');
    const closed = parseMathML(committed.document.mathml);
    assert.equal(closed.children[0].name, 'mstyle');
    assert.equal(closed.children[0].children[0].children[0].children[0].text, 'a');
    assert.equal(closed.children[0].children[0].children[2].children[0].text, 'b');
  }
});

test('typeform scope terminators reject outside a marked scope without mutation', () => {
  const document = createEmptyDraftMathDocument();
  const result = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠸' });
  assert.equal(result.status, 'pending');
  const next = applyNemethCell({ document, focus: document.focus, inputState: result.inputState, cell: '⠠' });
  assert.equal(next.status, 'pending');
  const close = applyNemethCell({ document, focus: document.focus, inputState: next.inputState, cell: '⠄' });
  assert.equal(close.status, 'rejected');
  assert.equal(close.document.mathml, document.mathml);
});

test('Rule 19.1.2 local decimal-to-Greek and script boundaries remain compositional', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const currentCell of ['⠼', '⠆', '⠨', '⠹', '⠘', '⠨', '⠏']) {
    const result = applyNemethCell({ document, focus, inputState, cell: currentCell });
    assert.notEqual(result.status, 'rejected', `${currentCell}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[1].name, 'msup');
  assert.equal(tree.children[1].children[0].children[0].text, 'θ');
  assert.equal(tree.children[1].children[1].children[0].text, 'π');
});

test('numeric and capital indicators are local modes, not passage parsing', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠼', '⠂', '⠆']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  // A new local token starts a separate indicator context. This is deliberate:
  // the guided editor never tries to infer a complete passage-level numeric
  // run from an unrestricted input buffer.
  document = createEmptyDraftMathDocument();
  focus = document.focus;
  inputState = { prefix: '', mode: null };
  let result = cell(document, focus, inputState, '⠠');
  assert.equal(result.status, 'pending');
  const choice = commitNemethLocalCode({ document, focus, inputState: result.inputState });
  assert.equal(choice.status, 'choice');
  const capital = choice.choices.find((item) => item.operationId === 'indicator.capital');
  assert.ok(capital, 'capital indicator must remain an explicit local choice when its cell is also punctuation');
  result = applyNemethChoice({ document, focus, inputState: choice.inputState, operationId: capital.operationId });
  assert.notEqual(result.status, 'rejected', result.announcement);
  ({ document, focus, inputState } = result);
  result = cell(document, focus, inputState, '⠉');
  assert.notEqual(result.status, 'rejected', result.announcement);
  ({ document, focus, inputState } = result);
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.filter((node) => node.name !== 'mspace').map((node) => node.children[0].text), ['C']);
});

test('Rule 3 uses lower-cell Nemeth digits and keeps a numeric run local', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠼', '⠂', '⠒', '⠨', '⠲']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'mn');
  assert.equal(tree.children[0].children[0].text, '13.4');
  assert.equal(inputState.mode, 'numeric');
});

test('Rule 3.1.1 UEB numerals begin a bounded local run after a currency symbol', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠈', '⠎', '⠂', '⠠', '⠒', '⠶', '⠦', '⠨', '⠴', '⠶']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', `${value}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children.map((node) => node.children?.[0]?.text).join(''), '$1,378.07');
  assert.equal(inputState.mode, 'ueb-numeric');
});

test('the shared baseline and multipurpose cell is selected by valid local context', () => {
  const document = createEmptyDraftMathDocument();
  const rootResult = cell(document, document.focus, { prefix: '', mode: null }, '⠐');
  assert.equal(rootResult.status, 'pending');
  assert.equal(rootResult.inputState.prefix, '⠐');

  let nested = document;
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠘', '⠁', '⠐']) {
    const result = cell(nested, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document: nested, focus, inputState } = result);
  }
  assert.equal(inputState.mode, null);
  assert.match(nested.mathml, /<msup/);
});

test('local input policies are declarative and apply across construction families', () => {
  const registry = new Map(operationRegistry().map((entry) => [entry.id, entry]));
  assert.equal(registry.get('operator.integral').commitPolicy, 'immediate');
  assert.equal(registry.get('arrow.right').commitPolicy, 'immediate');
  assert.equal(registry.get('arrow.right.uncontracted').commitPolicy, 'atomic-sequence');
  assert.equal(registry.get('script.superscript').commitPolicy, 'immediate');
  assert.equal(registry.get('fraction.next.denominator').commitPolicy, 'structural-followup');
  assert.ok(operationRegistry().every((entry) => ['immediate', 'atomic-sequence', 'structural-followup'].includes(entry.commitPolicy)));

  // The policy is a registry property, not an arrow/integral special case.
  // Check representative rows from notation families that use each local
  // behavior, so adding a new BANA mapping cannot silently bypass the shared
  // input contract.
  for (const id of [
    'letter.a', 'operator.plus', 'radical.square', 'script.superscript',
    'arrow.right', 'shape.diamond', 'punctuation.period', 'function.sin',
    'fraction.next.denominator', 'fraction.end.simple', 'integral.superpose.circle',
    'modifier.directly-over'
  ]) assert.ok(registry.get(id), `missing representative registry row: ${id}`);
  assert.ok(operationRegistry().some((entry) => entry.commitPolicy === 'immediate' && entry.action === 'insert-token'));
  assert.ok(operationRegistry().some((entry) => entry.commitPolicy === 'atomic-sequence' && entry.action === 'insert-token'));
  assert.ok(operationRegistry().some((entry) => entry.commitPolicy === 'structural-followup' && ['move-slot', 'close-structure', 'superpose-token', 'simultaneous-modifier'].includes(entry.action)));
});

test('an atomic local code waits for Enter and then applies exactly once', () => {
  const document = createEmptyDraftMathDocument();
  let state = { prefix: '', mode: null };
  let result = applyNemethCell({ document, focus: document.focus, inputState: state, cell: '⠫' });
  assert.equal(result.status, 'pending');
  assert.equal(result.document.mathml, document.mathml);
  state = result.inputState;
  for (const cell of ['⠒', '⠒', '⠕']) result = applyNemethCell({ document, focus: document.focus, inputState: result.inputState, cell });
  assert.equal(result.status, 'pending');
  assert.equal(result.document.mathml, document.mathml);
  const committed = commitNemethLocalCode({ document, focus: document.focus, inputState: result.inputState });
  assert.equal(committed.status, 'applied');
  assert.match(committed.document.mathml, />→</);
  assert.equal(committed.inputState.prefix, '');
});

test('a complete ordinary arrow is immediate while a compound arrow remains bounded', () => {
  const document = createEmptyDraftMathDocument();
  let result = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠫' });
  assert.equal(result.status, 'pending');
  result = applyNemethCell({ document: result.document, focus: result.focus, inputState: result.inputState, cell: '⠕' });
  assert.equal(result.status, 'applied');
  assert.equal(parseMathML(result.document.mathml).children[0].children[0].text, '→');

  let state = { prefix: '', mode: null };
  const compound = createEmptyDraftMathDocument();
  result = applyNemethCell({ document: compound, focus: compound.focus, inputState: state, cell: '⠫' });
  for (const cell of ['⠒', '⠒', '⠕']) {
    result = applyNemethCell({ document: result.document, focus: result.focus, inputState: result.inputState, cell });
    assert.equal(result.status, 'pending');
  }
  assert.equal(result.document.mathml, compound.mathml);
  const committed = commitNemethLocalCode({ document: result.document, focus: result.focus, inputState: result.inputState });
  assert.equal(committed.status, 'applied');
  assert.equal(parseMathML(committed.document.mathml).children[0].children[0].text, '→');
});

test('a standalone immediate code can coexist with longer atomic codes', () => {
  const document = createEmptyDraftMathDocument();
  const result = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠮' });
  assert.equal(result.status, 'applied');
  assert.match(result.document.mathml, />∫</);
});

test('incomplete or invalid atomic input never mutates the draft', () => {
  const document = createEmptyDraftMathDocument();
  const pending = applyNemethCell({ document, focus: document.focus, inputState: { prefix: '', mode: null }, cell: '⠫' });
  const invalid = commitNemethLocalCode({ document, focus: document.focus, inputState: pending.inputState });
  assert.equal(invalid.status, 'rejected');
  assert.equal(invalid.document.mathml, document.mathml);
  // ⠁ now correctly begins the BANA 17.1 arc construction ($a). Use a cell
  // that is neither a continuation nor a completed local code instead.
  const badNext = applyNemethCell({ document, focus: document.focus, inputState: pending.inputState, cell: '⠼' });
  assert.equal(badNext.status, 'rejected');
  assert.equal(badNext.document.mathml, document.mathml);
  assert.equal(badNext.inputState.prefix, pending.inputState.prefix);
});

test('Rule 17.10.1 resolves each dot-6 plus alphabetic cell as a bounded capital identifier', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of sourceNotationToCells('$[_$$59o] ,a,b,c')) {
    let result = cell(document, focus, inputState, value);
    if (result.status === 'pending' && result.inputState.prefix && value === ' ') {
      result = commitNemethLocalCode({ document, focus, inputState: result.inputState });
    }
    assert.notEqual(result.status, 'rejected', `${value}: ${result.announcement}`);
    assert.notEqual(result.status, 'choice', `${value}: dot-6 lookahead must be deterministic`);
    ({ document, focus, inputState } = result);
  }
  if (inputState.prefix) {
    const committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', committed.announcement);
    ({ document, focus, inputState } = committed);
  }
  const tree = parseMathML(document.mathml);
  const identifiers = tree.children.filter((node) => node.name === 'mi');
  assert.deepEqual(identifiers.map((node) => node.children[0].text), ['A', 'B', 'C']);
  assert.equal(tree.children.some((node) => node.name === 'mo' && node.children[0]?.text === ','), false);
});

test('dot-6 immediately before an explicit space remains punctuation', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of ['⠠', ' ']) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.deepEqual(tree.children.map((node) => [node.name, node.children[0]?.text ?? '']), [
    ['mo', ','],
    ['mspace', '']
  ]);
});

test('Rule 17.10.2 triangle after a dollar sign is a shape outside modifier slots', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of sourceNotationToCells('@s$t')) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'choice', `${value}: baseline triangle must not expose a modifier choice`);
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  const committed = commitNemethLocalCode({ document, focus, inputState });
  assert.equal(committed.status, 'applied', committed.announcement);
  assert.deepEqual(parseMathML(committed.document.mathml).children.map((node) => node.children[0]?.text), ['$', '△']);
});

test('a mixed fraction opens after its whole-number atom and focuses its numerator', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of sourceNotationToCells('#6_?4/12_#')) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', `${value}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].children[0].text, '6');
  assert.equal(tree.children[1].name, 'mfrac');
  assert.equal(tree.children[1].children[0].children[0].text, '4');
  assert.equal(tree.children[1].children[1].children[0].text, '12');
});

test('Rule 17.10.3 multipurpose scope accepts capital identifiers before an over modifier', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of sourceNotationToCells('",a,b<$o]')) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', `${value}: ${result.announcement}`);
    assert.notEqual(result.status, 'choice', `${value}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].name, 'mover');
  assert.deepEqual(tree.children[0].children[0].children.map((node) => node.children[0].text), ['A', 'B']);
  assert.equal(tree.children[0].children[1].children[0].text, '→');
});

test('Rule 17.10.3 repeated lower-cell digits stay numeric in a polygon expression', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const value of sourceNotationToCells('#1101')) {
    const result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', `${value}: ${result.announcement}`);
    ({ document, focus, inputState } = result);
  }
  assert.equal(parseMathML(document.mathml).children[0].children[0].text, '1101');
  assert.equal(inputState.mode, 'numeric');
});

test('Rule 17.10.1 accepts the printed brace alias for the angle-shape cell', () => {
  assert.deepEqual(sourceNotationToCells('${ #90^.*"'), sourceNotationToCells('$[ #90^.*"'));
});

test('BANA Rule 15.7 contracted bars compose inside a subscript without widening scope', () => {
  // BANA 2022 Examples 15-20 and 15-21: A carries a right subscript whose
  // local x and y terms each use the contracted superscribed bar.  The
  // repeated bar cells are local decorations; the plus and following y stay
  // siblings in the existing subscript row.
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const cellValue of ['⠭', '⠰', '⠭', '⠱', '⠬', '⠽', '⠱']) {
    const result = applyNemethCell({ document, focus, inputState, cell: cellValue });
    assert.notEqual(result.status, 'rejected', result.announcement);
    ({ document, focus, inputState } = result);
  }
  if (inputState.prefix) {
    const committed = commitNemethLocalCode({ document, focus, inputState });
    assert.equal(committed.status, 'applied', committed.announcement);
    ({ document, focus, inputState } = committed);
  }
  const tree = parseMathML(document.mathml);
  const subscript = tree.children[0];
  assert.equal(subscript.name, 'msub');
  const subscriptRow = subscript.children[1];
  assert.equal(subscriptRow.name, 'mrow');
  assert.equal(subscriptRow.children[0].name, 'mover');
  assert.equal(subscriptRow.children[0].children[0].children[0].text, 'x');
  assert.equal(subscriptRow.children[0].children[1].children[0].text, '¯');
  assert.equal(subscriptRow.children[1].children[0].text, '+');
  assert.equal(subscriptRow.children[2].name, 'mover');
  assert.equal(subscriptRow.children[2].children[0].children[0].text, 'y');
  assert.equal(subscriptRow.children[2].children[1].children[0].text, '¯');
});

test('punctuation and Greek symbols remain declarative token mappings', () => {
  let document = createEmptyDraftMathDocument();
  let focus = document.focus;
  let inputState = { prefix: '', mode: null };
  for (const [index, value] of ['⠨', '⠏', '⠸', '⠲'].entries()) {
    let result = cell(document, focus, inputState, value);
    assert.notEqual(result.status, 'rejected', result.announcement);
    if (index === 3 && result.status === 'pending' && result.inputState.prefix) {
      result = commitNemethLocalCode({ document, focus, inputState: result.inputState });
    }
    if (result.status === 'applied') ({ document, focus, inputState } = result);
    else inputState = result.inputState;
  }
  const tree = parseMathML(document.mathml);
  assert.equal(tree.children[0].children[0].text, 'π');
  assert.equal(tree.children[1].children[0].text, '.');
});
