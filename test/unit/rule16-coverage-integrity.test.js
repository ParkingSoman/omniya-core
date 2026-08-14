import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('Rule 16 radical provisions have direct declarative implementation mappings', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:16(?:\.|$)/.test(row.id));
  assert.deepEqual(rows.map((row) => row.id), [
    'bana-2022:16.1', 'bana-2022:16.1.1', 'bana-2022:16.1.2', 'bana-2022:16.2', 'bana-2022:16.3'
  ]);
  for (const row of rows) {
    assert.equal(row.verified.implementation, true, `${row.id} is not implementation-covered`);
    assert.notEqual(row.disposition, 'unclassified', `${row.id} remains unclassified`);
    assert.ok((row.mappingIds?.length ?? 0) > 0, `${row.id} has no direct mapping IDs`);
  }
});
