import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));
test('Rule 19 rows are mapped or explicitly documentary exclusions', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:(?:19(?:\.|$)|example-19-)/.test(row.id));
  assert.equal(rows.length, 60);
  assert.equal(rows.filter((row) => row.disposition === 'unclassified').length, 0);
  for (const row of rows) if (row.disposition !== 'excluded-document-format') assert.equal(row.verified.implementation, true, row.id);
});
