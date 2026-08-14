import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('every Rule 10 row has exact abbreviation mapping or context ownership', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:(?:10\.|example-10-)/.test(row.id));
  assert.equal(rows.length, 69);
  for (const row of rows) {
    assert.notEqual(row.disposition, 'unclassified');
    if (row.disposition === 'document-context-exclusion') continue;
    assert.equal(row.verified.implementation, true);
    assert.ok((row.mappingIds?.length ?? 0) + (row.contextPolicyIds?.length ?? 0) > 0, `${row.id} lacks exact ownership`);
  }
});
