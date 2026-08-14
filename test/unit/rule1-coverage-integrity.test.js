import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('every Rule 1 source row is owned by an explicit context policy', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:1\./.test(row.id));
  assert.equal(rows.length, 17);
  for (const row of rows) {
    assert.equal(row.disposition, 'implemented-context-policy');
    assert.ok(row.contextPolicyIds?.includes(`context-policy.${row.id.replace('bana-2022:', '')}`), `${row.id} lacks exact context ownership`);
    assert.equal(row.evidenceScope, 'source-policy');
  }
});
