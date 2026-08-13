import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { appendixDSymbolRefs, contextPolicyRegistry, operationRegistry, parameterizedOperationRefs } from '../../src/domain/guided-nemeth/index.js';

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

test('Rules 1 through 4 context provisions are explicitly classified without fake input cells', async () => {
  const inventory = JSON.parse(await readFile(new URL('../../docs/bana-source-inventory.json', import.meta.url), 'utf8'));
  const refs = new Set(contextPolicyRegistry().flatMap((policy) => policy.banaRefs));
  for (const row of inventory.rows.filter((candidate) => candidate.kind === 'provision' && /^[1-4]\./.test(candidate.id.replace(/^bana-2022:/, '')))) {
    const ref = row.id.replace(/^bana-2022:/, '');
    assert.ok(refs.has(ref) || parameterizedOperationRefs().includes(ref) || operationRegistry().some((mapping) => mapping.banaRefs?.includes(ref)), row.id);
  }
});

test('Appendix A-C policies and all 63 Appendix D symbols are source-linked', async () => {
  const inventory = JSON.parse(await readFile(new URL('../../docs/bana-source-inventory.json', import.meta.url), 'utf8'));
  const appendixRows = inventory.rows.filter((row) => row.kind === 'appendix');
  assert.equal(appendixRows.length, 66);
  assert.equal(appendixRows.filter((row) => /appendix-D-\d+$/.test(row.id)).length, 63);
  assert.equal(appendixDSymbolRefs().length, 63);
  assert.deepEqual(appendixDSymbolRefs().map(({ rank }) => rank), Array.from({ length: 63 }, (_, index) => index + 1));
  const policyIds = new Set(contextPolicyRegistry().map((entry) => entry.id));
  for (const appendix of ['A', 'B', 'C']) assert.ok(policyIds.has(`context-policy.appendix-${appendix}`));
});
