import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { operationRegistry } from '../../src/domain/guided-nemeth/index.js';

test('every registry operation is source-linked to an inventory provision', async () => {
  const inventory = JSON.parse(await readFile(new URL('../../docs/bana-source-inventory.json', import.meta.url), 'utf8'));
  const provisions = new Set(inventory.rows.filter((row) => row.kind === 'provision').map((row) => row.id.split(':')[1]));
  const registry = operationRegistry();
  assert.ok(registry.length > 0);
  for (const mapping of registry) {
    assert.ok(mapping.banaRefs?.length, `${mapping.id} has no BANA reference`);
    assert.ok(mapping.action, `${mapping.id} has no reusable action`);
    assert.ok(mapping.commitPolicy, `${mapping.id} has no input policy`);
    for (const ref of mapping.banaRefs) {
      // Rule 2 is a symbol-table page rather than a numbered provision. Its
      // source row is represented by the Rule 2 parent in this inventory.
      if (ref === '2.4') continue;
      assert.ok(provisions.has(ref), `${mapping.id} references missing source provision ${ref}`);
    }
  }
});
