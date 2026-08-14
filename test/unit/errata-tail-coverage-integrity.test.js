import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { contextPolicyRegistry, operationRegistry } from '../../src/domain/guided-nemeth/index.js';

const inventory = JSON.parse(fs.readFileSync(new URL('../../docs/bana-source-inventory.json', import.meta.url)));
const rows = new Map(inventory.rows.map((row) => [row.id, row]));
const operationIds = new Set(operationRegistry().map((entry) => entry.id));
const contextPolicyIds = new Set(contextPolicyRegistry().map((entry) => entry.id));

test('remaining Rule 15 and appendix errata have exact source-grounded ownership', () => {
  const executable = rows.get('errata-2025:15.2.1-15-4');
  assert.equal(executable?.disposition, 'implemented-operation');
  assert.deepEqual(executable.mappingIds, [
    'script.subscript',
    'indicator.multipurpose',
    'modifier.directly-over',
    'modifier.tilde.simple',
    'modifier.terminate.over',
    'script.baseline'
  ]);
  assert.ok(executable.mappingIds.every((id) => operationIds.has(id)));

  for (const id of ['errata-2025:15.7-15-12', 'errata-2025:B-2-B-2']) {
    const row = rows.get(id);
    assert.equal(row?.disposition, 'implemented-context-policy', id);
    assert.ok(contextPolicyIds.has(`context-policy.${id}`), id);
  }

  const crossedD = rows.get('errata-2025:D-27-D-27');
  assert.equal(crossedD?.disposition, 'implemented-operation');
  assert.deepEqual(crossedD.mappingIds, ['misc.crossed-d']);

  const removedUebEntry = rows.get('errata-2025:D-32-D-32');
  assert.equal(removedUebEntry?.disposition, 'excluded-document-format');
  assert.deepEqual(removedUebEntry.mappingIds, []);
});
