import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const evidenceUrl = new URL('../../docs/guided-nemeth-electron-evidence.json', import.meta.url);
const electronUrl = new URL('../e2e/inline-editing.test.js', import.meta.url);

test('the Electron evidence ledger names real creation and editing workflows for every verified family', async () => {
  const evidence = JSON.parse(await readFile(evidenceUrl, 'utf8'));
  const source = await readFile(electronUrl, 'utf8');
  assert.equal(evidence.standard, 'BANA Nemeth Braille Code for Mathematics and Science Notation 2022');
  assert.ok(Array.isArray(evidence.families) && evidence.families.length > 0);

  for (const family of evidence.families) {
    assert.ok(family.ledgerRules, `missing BANA rule reference for ${family.id}`);
    assert.ok(['verified', 'gap', 'deferred'].includes(family.status), `invalid status for ${family.id}`);
    if (family.status !== 'verified') continue;
    assert.ok(family.creationTest, `verified ${family.id} needs a creation test`);
    assert.ok(family.editingTest, `verified ${family.id} needs an editing test`);
    assert.match(source, new RegExp(`test\\('${family.creationTest.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'`));
    assert.match(source, new RegExp(`test\\('${family.editingTest.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'`));
    assert.ok(family.nemethCells?.length > 0 || family.inputGesture, `verified ${family.id} needs concrete Nemeth input evidence`);
    for (const cells of family.nemethCells ?? []) assert.ok(source.includes(cells), `${family.id} is missing cells ${cells}`);
    if (family.inputGesture) assert.match(source, new RegExp(family.inputGesture));
    assert.equal(family.requiresExplorerNavigation, true, `${family.id} must document Explorer navigation for editing`);
    assert.ok(family.assertions.includes('whole-expression-braille'), `${family.id} needs whole-expression Braille evidence`);
    assert.ok(family.assertions.includes('focused-braille'), `${family.id} needs focused Braille evidence`);
  }
});

test('the evidence ledger does not silently claim deferred or untested BANA families', async () => {
  const evidence = JSON.parse(await readFile(evidenceUrl, 'utf8'));
  const ids = new Set(evidence.families.map(({ id }) => id));
  for (const required of ['letters-numerals', 'fractions', 'scripts-radicals', 'modifiers', 'comparisons-arrows', 'spatial']) {
    assert.ok(ids.has(required), `missing evidence row ${required}`);
  }
  assert.equal(evidence.families.find(({ id }) => id === 'spatial').status, 'deferred');
});
