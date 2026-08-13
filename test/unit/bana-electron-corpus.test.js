import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('BANA Electron corpus names real Nemeth creation and editing tests', async () => {
  const corpus = JSON.parse(await readFile(new URL('../../docs/bana-electron-corpus.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../e2e/inline-editing.test.js', import.meta.url), 'utf8');
  const inventory = JSON.parse(await readFile(new URL('../../docs/bana-source-inventory.json', import.meta.url), 'utf8'));
  const sourceIds = new Set(inventory.rows.map((row) => row.id.replace(/^bana-2022:/, '')));
  assert.equal(corpus.cases.length, 19);
  assert.ok(corpus.cases.every((entry) => !entry.sourceRows.some((row) => /^example-/.test(row))), 'the starter corpus must not disguise family tests as official examples');
  for (const entry of corpus.cases) {
    assert.ok(entry.sourceRows?.length, `${entry.id} needs exact source rows`);
    for (const sourceRow of entry.sourceRows) assert.ok(sourceIds.has(sourceRow), `${entry.id} references unknown source row ${sourceRow}`);
    assert.match(source, new RegExp(`test\\('${entry.testName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'`));
    assert.equal(entry.creation, true, `${entry.id} must exercise creation through Electron`);
    if (entry.editing) assert.equal(entry.navigation, true, `${entry.id} editing must navigate MathJax`);
  }
});
