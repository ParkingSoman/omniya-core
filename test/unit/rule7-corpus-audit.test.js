import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
const inventory = JSON.parse(fs.readFileSync(new URL('../../docs/bana-source-inventory.json', import.meta.url)));

test('Rule 7 official corpus rows retain source links and expose unverified Electron gaps', () => {
  const rows = corpus.cases.filter((entry) => entry.exampleNumber.startsWith('7-'));
  assert.equal(rows.length, 24);
  const inventoryIds = new Set(inventory.rows.map((row) => row.id));
  for (const row of rows) {
    assert.ok(row.sourceRows?.length, `${row.exampleNumber} has no source row links`);
    assert.ok(row.sourceRows.every((id) => inventoryIds.has(`bana-2022:${id}`) || inventoryIds.has(id)), `${row.exampleNumber} has an unresolved source link`);
    assert.equal(row.executable, row.exampleNumber !== '7-22');
    assert.equal(row.creation, false, `${row.exampleNumber} must not claim unrun creation evidence`);
    assert.equal(row.editing, false, `${row.exampleNumber} must not claim unrun editing evidence`);
    assert.equal(row.navigation, false, `${row.exampleNumber} must not claim unrun navigation evidence`);
    assert.equal(row.visual, undefined, `${row.exampleNumber} must not claim visual evidence`);
  }
});
