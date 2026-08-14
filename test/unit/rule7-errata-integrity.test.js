import assert from 'node:assert/strict';import fs from 'node:fs';import test from 'node:test';
const c=JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json',import.meta.url)));
test('Rule 7 errata rows have exact context-policy ownership',()=>{for(const id of ['errata-2025:7.2.1-7-2','errata-2025:7.3.3-7-5','errata-2025:7.3.5-7-6']){const r=c.rows.find(x=>x.id===id);assert.ok(r);assert.equal(r.verified.implementation,true,id);assert.ok(r.contextPolicyIds?.length,id)}});
