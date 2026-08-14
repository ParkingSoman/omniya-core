import assert from 'node:assert/strict';
import test from 'node:test';

import coverage from '../../docs/bana-coverage.json' with { type: 'json' };
import { contextPolicyRegistry, operationRegistry } from '../../src/domain/guided-nemeth/index.js';

const ERRATA_MAPPINGS = Object.freeze({
  'errata-2025:symbol-list-23-1': ['misc.crossed-d'],
  'errata-2025:23.4-23-3': ['misc.crossed-d'],
  'errata-2025:23.17-23-13': ['quantifier.exists-unique', 'typeform.barred']
});

test('every Rule 23 row, including errata, has exact operation or context ownership', () => {
  const rows = coverage.rows.filter(({ printedPage }) => printedPage?.startsWith('23-'));
  assert.equal(rows.length, 81);
  assert.deepEqual(rows.filter(({ disposition, verified }) => disposition === 'unclassified' || !verified.implementation), []);

  const operations = new Set(operationRegistry().map(({ id }) => id));
  for (const [id, mappingIds] of Object.entries(ERRATA_MAPPINGS)) {
    const row = rows.find((candidate) => candidate.id === id);
    assert.ok(row, `missing ${id}`);
    assert.deepEqual(row.mappingIds, mappingIds, `${id} must use only the corrected source operations`);
    for (const mappingId of mappingIds) assert.ok(operations.has(mappingId), `${id} references unknown ${mappingId}`);
  }

  const monetaryId = 'errata-2025:23.13-23-9';
  const monetary = rows.find(({ id }) => id === monetaryId);
  assert.deepEqual(monetary.contextPolicyIds, [`context-policy.${monetaryId}`]);
  assert.ok(contextPolicyRegistry().some(({ id }) => id === `context-policy.${monetaryId}`));
});
