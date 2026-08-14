import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('implemented Rule 15 examples resolve to exact mapping or context-policy IDs', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:example-15-/.test(row.id));
  assert.equal(rows.length, 84);
  for (const row of rows.filter((entry) => entry.verified.implementation)) {
    assert.ok((row.mappingIds?.length ?? 0) + (row.contextPolicyIds?.length ?? 0) > 0, `${row.id} has only inherited implementation credit`);
  }
});
