import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { operationRegistry, sourceNotationToCells } from '../../src/domain/guided-nemeth/index.js';

test('Rules 9–16 executable corpus rows retain source links, cells, and owned implementation', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));
  const coverageRows = new Map(coverage.rows.map((row) => [row.id.replace(/^bana-2022:/, ''), row]));
  const operationIds = new Set(operationRegistry().map((mapping) => mapping.id));
  for (const entry of corpus.cases.filter((candidate) => /^(?:9|10|11|12|13|14|15|16)-/.test(candidate.exampleNumber) && candidate.executable)) {
    assert.ok(entry.sourceRows?.length, `${entry.exampleNumber} sourceRows`);
    assert.ok(entry.cells?.length, `${entry.exampleNumber} extracted cells`);
    if (entry.sourceNotation) assert.deepEqual(entry.cells, sourceNotationToCells(entry.sourceNotation), `${entry.exampleNumber} cells`);
    const owned = entry.sourceRows.map((ref) => coverageRows.get(ref)).filter(Boolean).some((row) => row.verified?.implementation || row.contextPolicyIds?.length || row.mappingIds?.length);
    assert.equal(owned, true, `${entry.exampleNumber} source rows need implementation/context ownership`);
    for (const operationId of entry.operationIds ?? []) {
      assert.equal(operationIds.has(operationId) || /^script\.(?:sub|sup)(?:-(?:sub|sup))+$/.test(operationId), true,
        `${entry.exampleNumber} unknown operation ${operationId}`);
    }
  }
});
