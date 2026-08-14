import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { contextPolicyRegistry } from '../../src/domain/guided-nemeth/index.js';

test('Rule 14 policy rows have exact context ownership or honest document exclusions', () => {
  const inventory = JSON.parse(fs.readFileSync(new URL('../../docs/bana-source-inventory.json', import.meta.url)));
  const rows = new Map(inventory.rows.map((row) => [row.id, row]));
  const policyRefs = new Set(contextPolicyRegistry().flatMap((policy) => policy.banaRefs));
  const provisions = [
    '14.1', '14.2', '14.5', '14.6', '14.9', '14.9.1', '14.9.2', '14.9.3', '14.9.4', '14.9.5',
    '14.10', '14.10.1', '14.10.2', '14.10.3', '14.11', '14.11.1', '14.11.2',
    '14.12', '14.12.1', '14.12.2', '14.12.3'
  ];
  for (const ref of provisions) {
    assert.ok(policyRefs.has(ref), `Rule 14 provision ${ref} must have a registered context policy`);
    assert.equal(rows.get(`bana-2022:${ref}`)?.disposition, 'implemented-context-policy', `${ref} disposition`);
  }
  for (const number of [1, 2]) {
    assert.equal(rows.get(`bana-2022:example-14-${number}`)?.disposition, 'excluded-document-format', `example 14-${number} exclusion`);
  }
});
