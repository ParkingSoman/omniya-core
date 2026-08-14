import assert from 'node:assert/strict';import fs from 'node:fs';import test from 'node:test';
const c=JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json',import.meta.url)));
test('Rule 24 erratum has exact context ownership',()=>{const r=c.rows.find(x=>x.id==='errata-2025:24.1.e-24-2');assert.ok(r);assert.equal(r.verified.implementation,true);assert.ok(r.contextPolicyIds?.includes('context-policy.errata-2025:24.1.e-24-2'))});
