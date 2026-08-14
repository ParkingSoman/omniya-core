import assert from 'node:assert/strict';import fs from 'node:fs';import test from 'node:test';
const c=JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json',import.meta.url)));
test('base gap rows retain exact policy or documentary ownership',()=>{for(const id of ['bana-2022:4.1','bana-2022:example-4-1','bana-2022:example-7-22']){const r=c.rows.find(x=>x.id===id);assert.equal(r.disposition,'implemented-context-policy',id);assert.equal(r.verified.implementation,true,id)}assert.equal(c.rows.find(x=>x.id==='bana-2022:17.8').disposition,'excluded-document-format')});
