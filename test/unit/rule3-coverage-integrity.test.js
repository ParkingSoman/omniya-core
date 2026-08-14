import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('every Rule 3 row has exact mapping or context-policy ownership', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:(?:3\.|example-3-)/.test(row.id));
  assert.equal(rows.length, 151);
  for (const row of rows) {
    assert.notEqual(row.disposition, 'unclassified');
    assert.equal(row.verified.implementation, true);
    assert.ok((row.mappingIds?.length ?? 0) + (row.contextPolicyIds?.length ?? 0) > 0, `${row.id} lacks exact ownership`);
  }
});
