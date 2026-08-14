import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('every Rule 10 row has exact abbreviation mapping or context ownership', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:(?:10\.|example-10-)/.test(row.id));
  assert.equal(rows.length, 69);
  for (const row of rows) {
    assert.notEqual(row.disposition, 'unclassified');
    if (['example-10-15', 'example-10-16', 'example-10-17'].some((id) => row.id.endsWith(id))) {
      assert.equal(row.disposition, 'excluded-document-format');
      continue;
    }
    assert.equal(row.verified.implementation, true);
    assert.ok((row.mappingIds?.length ?? 0) + (row.contextPolicyIds?.length ?? 0) > 0, `${row.id} lacks exact ownership`);
  }
});

test('Rule 10 literary initialism examples use policy ownership without unrelated operations', () => {
  for (const number of [2, 3]) {
    const row = coverage.rows.find((candidate) => candidate.id === `bana-2022:example-10-${number}`);
    assert.equal(row?.disposition, 'implemented-context-policy');
    assert.deepEqual(row?.mappingIds, []);
    assert.deepEqual(row?.contextPolicyIds, ['context-policy.10.1']);
    assert.match(row?.officialSource?.printAndBraille ?? '', /Literary (?:Initialism|Acronym)/);
  }
});
