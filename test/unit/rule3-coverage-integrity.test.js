import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('every Rule 3 row has exact mapping or context-policy ownership', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:(?:3\.|example-3-)/.test(row.id));
  assert.equal(rows.length, 151);
  const sectionTitle = rows.find((row) => row.id === 'bana-2022:example-3-1');
  assert.equal(sectionTitle?.disposition, 'excluded-document-format');
  assert.match(sectionTitle?.officialSource?.printAndBraille ?? '', /Section 1\.3\.4/);
  assert.deepEqual(sectionTitle?.mappingIds, []);
  for (const field of ['creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence', 'visualEvidence']) {
    assert.equal(sectionTitle?.verified?.[field], false, `excluded section title must not claim ${field} evidence`);
  }
  for (const row of rows) {
    if (row.id === 'bana-2022:example-3-1') continue;
    assert.notEqual(row.disposition, 'unclassified');
    assert.equal(row.verified.implementation, true);
    assert.ok((row.mappingIds?.length ?? 0) + (row.contextPolicyIds?.length ?? 0) > 0, `${row.id} lacks exact ownership`);
  }
});
