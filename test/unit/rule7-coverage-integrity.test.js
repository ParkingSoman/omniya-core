import assert from 'node:assert/strict'; import fs from 'node:fs'; import test from 'node:test';
const c=JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json',import.meta.url)));
test('Rule 7 typeform policy rows have explicit context ownership',()=>{const rows=c.rows.filter(r=>/^bana-2022:(?:7(?:\.|$)|example-7-)/.test(r.id));assert.equal(rows.filter(r=>r.disposition==='unclassified').length,0);assert.equal(rows.filter(r=>!r.verified.implementation).length,0);});
