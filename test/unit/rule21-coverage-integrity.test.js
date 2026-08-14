import assert from 'node:assert/strict';
import test from 'node:test';

import coverage from '../../docs/bana-coverage.json' with { type: 'json' };
import { contextPolicyRegistry, operationRegistry } from '../../src/domain/guided-nemeth/index.js';

const EXPECTED_EXAMPLE_MAPPINGS = Object.freeze({
  'example-21-23': ['comparison.union.bar-under'],
  'example-21-25': ['shape.square'],
  'example-21-26': ['operator.equals'],
  'example-21-27': ['operator.equals'],
  'example-21-28': ['operator.equals'],
  'example-21-29': ['comparison.greater'],
  'example-21-30': ['comparison.subset'],
  'example-21-31': ['comparison.subset'],
  'example-21-32': ['comparison.less'],
  'example-21-33': ['comparison.reverse-membership'],
  'example-21-34': ['comparison.ratio', 'comparison.proportion'],
  'example-21-35': ['comparison.ratio', 'comparison.proportion'],
  'example-21-36': ['comparison.variation'],
  'example-21-37': ['comparison.vertical-bar', 'comparison.less'],
  'example-21-38': ['operator.equals', 'comparison.vertical-bar', 'comparison.less-equal'],
  'example-21-39': ['comparison.less'],
  'example-21-40': ['comparison.less', 'operator.equals', 'comparison.greater'],
  'example-21-41': ['operator.equals']
});

test('every Rule 21 row has exact operation or context-policy ownership', () => {
  const rows = coverage.rows.filter(({ printedPage }) => printedPage?.startsWith('21-'));
  assert.equal(rows.length, 54);
  assert.deepEqual(rows.filter(({ disposition, verified }) => disposition === 'unclassified' || !verified.implementation), []);

  const operations = new Set(operationRegistry().map(({ id }) => id));
  for (const [ref, expectedIds] of Object.entries(EXPECTED_EXAMPLE_MAPPINGS)) {
    const row = rows.find(({ id }) => id === `bana-2022:${ref}`);
    assert.ok(row, `missing ${ref}`);
    assert.deepEqual(row.mappingIds, expectedIds, `${ref} must use its exact printed operations`);
    for (const id of expectedIds) assert.ok(operations.has(id), `${ref} references unknown operation ${id}`);
  }

  const policies = new Set(contextPolicyRegistry().map(({ id }) => id));
  for (const ref of ['21.10', '21.13']) {
    const row = rows.find(({ id }) => id === `bana-2022:${ref}`);
    assert.deepEqual(row.contextPolicyIds, [`context-policy.${ref}`]);
    assert.ok(policies.has(`context-policy.${ref}`));
  }
});
