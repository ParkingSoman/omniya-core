import assert from 'node:assert/strict';
import test from 'node:test';
import { BANA_2022_URL, NEMETH_CONFORMANCE, SYMBOL_TRACEABILITY, TOKEN_TRACEABILITY, TRACEABILITY_MANIFEST, UNICODE } from '../../src/domain/nemeth/index.js';

test('Nemeth traceability names every BANA 2022 rule and authoritative source', () => {
  assert.equal(TRACEABILITY_MANIFEST.length, 26);
  assert.deepEqual(TRACEABILITY_MANIFEST.map(({ rule }) => rule), Array.from({ length: 26 }, (_, i) => i + 1));
  for (const row of TRACEABILITY_MANIFEST) {
    assert.ok(row.title);
    assert.ok(row.sections.length > 0);
    assert.match(row.source, new RegExp(BANA_2022_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(['implemented', 'partial', 'not-implemented', 'policy', 'out-of-scope'].includes(row.status));
  }
  for (const row of Object.values(SYMBOL_TRACEABILITY)) {
    assert.ok(row.rules.length > 0);
    assert.match(row.source, /brailleauthority\.org/);
    assert.ok(row.note);
  }
  assert.equal(NEMETH_CONFORMANCE.status, 'not-conformant');
});

test('every accepted Unicode cell has an explicit source mapping', () => {
  assert.deepEqual(Object.keys(TOKEN_TRACEABILITY).sort(), [...UNICODE.keys()].sort());
  for (const [cell, latex] of UNICODE) {
    const trace = TOKEN_TRACEABILITY[cell];
    assert.equal(trace.latex, latex);
    assert.ok(trace.rules.length > 0, `${cell} has no BANA rule`);
    assert.match(trace.source, /brailleauthority\.org/);
    assert.ok(['verified', 'placeholder'].includes(trace.status));
  }
});
