import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('Rule 20 has no unclassified applicable rows', () => {
  const rows = coverage.rows.filter(({ printedPage }) => printedPage?.startsWith('20-'));
  assert.equal(rows.length, 64);

  const applicable = rows.filter(({ disposition }) => !disposition.startsWith('excluded'));
  assert.equal(applicable.length, 63);
  assert.deepEqual(
    applicable.filter(({ disposition, verified }) => disposition === 'unclassified' || !verified.implementation),
    []
  );
});

test('Rule 20.6 erratum is an exact heading-only documentary exclusion', () => {
  const row = coverage.rows.find(({ id }) => id === 'errata-2025:20.6-20-9');
  assert.ok(row);
  assert.equal(row.disposition, 'excluded-document-format');
  assert.deepEqual(row.mappingIds, []);
  assert.deepEqual(row.contextPolicyIds ?? [], []);
  assert.equal(row.printedPage, '20-9');
});
