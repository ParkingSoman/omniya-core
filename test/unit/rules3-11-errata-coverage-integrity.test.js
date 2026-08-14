import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { contextPolicyRegistry, operationRegistry } from '../../src/domain/guided-nemeth/index.js';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

const operationOwnership = Object.freeze({
  'errata-2025:3.3.1-3-4': ['letter.capital-r'],
  'errata-2025:8.2.4-8-3': ['punctuation.long-dash', 'punctuation.ellipsis'],
  'errata-2025:9.1-9-1': ['reference.checkmark']
});

const contextOwnership = Object.freeze({
  'errata-2025:4.2-4-1': ['context-policy.errata-2025:4.2-4-1'],
  'errata-2025:4.6.8.c-4-16': ['context-policy.errata-2025:4.6.8.c-4-16'],
  'errata-2025:6.4.2-6-9': ['context-policy.errata-2025:6.4.2-6-9'],
  'errata-2025:10.6.3-10-11': ['context-policy.errata-2025:10.6.3-10-11'],
  'errata-2025:11.1.4-11-3': ['context-policy.errata-2025:11.1.4-11-3']
});

const documentaryExclusions = Object.freeze([
  'errata-2025:3.4.3-3-14',
  'errata-2025:3.5.2-3-16',
  'errata-2025:3.6.2-3-20',
  'errata-2025:4.5.3-4-8',
  'errata-2025:4.8.2-4-19',
  'errata-2025:8.2.13-8-7',
  'errata-2025:8.2.16-8-8',
  'errata-2025:8.8.2-8-15',
  'errata-2025:9.3.2-9-3',
  'errata-2025:10.1.1.a-10-1',
  'errata-2025:10.6.1-10-9'
]);

test('Rules 3-11 errata have exact operation or context-policy ownership', () => {
  const operations = new Set(operationRegistry().map(({ id }) => id));
  const policies = new Set(contextPolicyRegistry().map(({ id }) => id));

  for (const [id, expected] of Object.entries(operationOwnership)) {
    const row = coverage.rows.find((candidate) => candidate.id === id);
    assert.equal(row?.disposition, 'implemented-operation', id);
    assert.deepEqual(row.mappingIds, expected, id);
    for (const mappingId of expected) assert.ok(operations.has(mappingId), `${id}: unknown ${mappingId}`);
  }

  for (const [id, expected] of Object.entries(contextOwnership)) {
    const row = coverage.rows.find((candidate) => candidate.id === id);
    assert.equal(row?.disposition, 'implemented-context-policy', id);
    assert.deepEqual(row.contextPolicyIds, expected, id);
    assert.deepEqual(row.mappingIds, [], id);
    for (const policyId of expected) assert.ok(policies.has(policyId), `${id}: unknown ${policyId}`);
  }
});

test('Rules 3-11 editorial and layout-only errata are explicit exact exclusions', () => {
  for (const id of documentaryExclusions) {
    const row = coverage.rows.find((candidate) => candidate.id === id);
    assert.equal(row?.disposition, 'excluded-document-format', id);
    assert.deepEqual(row.mappingIds, [], id);
    assert.deepEqual(row.contextPolicyIds ?? [], [], id);
  }
});

test('the named Rules 3-11 corrective batch has no unclassified applicable rows', () => {
  const ids = [...Object.keys(operationOwnership), ...Object.keys(contextOwnership), ...documentaryExclusions];
  assert.equal(ids.length, 19);
  const rows = ids.map((id) => coverage.rows.find((candidate) => candidate.id === id));
  assert.ok(rows.every(Boolean));
  assert.deepEqual(rows.filter(({ disposition }) => disposition === 'unclassified'), []);
  assert.deepEqual(rows.filter(({ disposition, verified }) => !disposition.startsWith('excluded') && !verified.implementation), []);
});
