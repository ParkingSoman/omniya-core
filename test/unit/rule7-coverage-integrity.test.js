import assert from 'node:assert/strict'; import fs from 'node:fs'; import test from 'node:test';
const c=JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json',import.meta.url)));
test('Rule 7 typeform policy rows have explicit context ownership',()=>{const rows=c.rows.filter(r=>/^bana-2022:(?:7\.4|7\.5|example-7-2[0-4])/.test(r.id));assert.ok(rows.length>=16);for(const r of rows){assert.notEqual(r.disposition,'unclassified',r.id);assert.equal(r.verified.implementation,true,r.id);assert.ok((r.contextPolicyIds?.length||r.mappingIds?.length)>0,r.id)}});
