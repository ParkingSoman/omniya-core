import assert from 'node:assert/strict';
import test from 'node:test';

import coverage from '../../docs/bana-coverage.json' with { type: 'json' };
import { contextPolicyRegistry, operationRegistry } from '../../src/domain/guided-nemeth/index.js';

test('every applicable Rule 18 row has exact operation or context-policy ownership', () => {
  const rows = coverage.rows.filter(({ printedPage }) => printedPage?.startsWith('18-'));
  assert.equal(rows.length, 30);
  const applicable = rows.filter(({ disposition }) => !disposition.startsWith('excluded'));
  assert.equal(applicable.length, 29);
  assert.deepEqual(applicable.filter(({ disposition, verified }) => disposition === 'unclassified' || !verified.implementation), []);

  const policies = new Set(contextPolicyRegistry().map(({ id }) => id));
  for (const ref of ['18.2', '18.5']) {
    const row = rows.find(({ id }) => id === `bana-2022:${ref}`);
    assert.deepEqual(row.contextPolicyIds, [`context-policy.${ref}`]);
    assert.ok(policies.has(`context-policy.${ref}`));
  }

  const example = rows.find(({ id }) => id === 'bana-2022:example-18-22');
  assert.deepEqual(example.mappingIds, ['function.sin', 'function.cos', 'function.tan']);
  assert.deepEqual(example.contextPolicyIds, ['context-policy.18.5']);
  const operations = new Set(operationRegistry().map(({ id }) => id));
  for (const id of example.mappingIds) assert.ok(operations.has(id), `unknown Rule 18 operation ${id}`);
});
