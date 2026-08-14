import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
const inventory = JSON.parse(fs.readFileSync(new URL('../../docs/bana-source-inventory.json', import.meta.url)));

test('Rule 8 official corpus rows are source-linked and conservatively uncredited', () => {
  const rows = corpus.cases.filter((entry) => entry.exampleNumber.startsWith('8-'));
  assert.equal(rows.length, 68);
  const ids = new Set(inventory.rows.map((row) => row.id));
  for (const row of rows) {
    assert.equal(row.executable, true);
    assert.ok(row.sourceRows?.every((id) => ids.has(`bana-2022:${id}`) || ids.has(id)), `${row.exampleNumber} source link`);
    assert.equal(row.creation, false);
    assert.equal(row.editing, false);
    assert.equal(row.navigation, false);
  }
});
