import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('Rule 2.1 is explicitly owned as indicator context without invented examples', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:(?:2\.|example-2-)/.test(row.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'bana-2022:2.1');
  assert.equal(rows[0].disposition, 'implemented-context-policy');
  assert.ok(rows[0].contextPolicyIds?.includes('context-policy.2.1'));
  assert.equal(rows[0].evidenceScope, 'source-policy');
});
