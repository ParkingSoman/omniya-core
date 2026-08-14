import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { summarizeRuleRange } from '../../scripts/bana-range-readiness.mjs';
import { contextPolicyRegistry, operationRegistry } from '../../src/domain/guided-nemeth/index.js';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));
const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));

test('Rules 17-24 readiness accounts for every row without granting missing evidence', () => {
  const result = summarizeRuleRange(coverage, 17, 24);
  assert.equal(result.totals.rows, 466);
  assert.equal(result.totals.applicable, 447);
  assert.equal(result.totals.implementationGaps, 0);
  assert.equal(result.totals.missingCreation, 274);
  assert.equal(result.totals.missingVisualEvidence, 342);

  assert.deepEqual(result.rules.map(({ rule, firstMissingCreation, firstMissingVisualEvidence }) => ({
    rule, firstMissingCreation, firstMissingVisualEvidence
  })), [
    { rule: 17, firstMissingCreation: null, firstMissingVisualEvidence: 'bana-2022:example-17-1' },
    { rule: 18, firstMissingCreation: 'bana-2022:example-18-1', firstMissingVisualEvidence: 'bana-2022:example-18-1' },
    { rule: 19, firstMissingCreation: 'bana-2022:example-19-5', firstMissingVisualEvidence: 'bana-2022:example-19-1' },
    { rule: 20, firstMissingCreation: 'bana-2022:example-20-1', firstMissingVisualEvidence: 'bana-2022:example-20-1' },
    { rule: 21, firstMissingCreation: 'bana-2022:example-21-1', firstMissingVisualEvidence: 'bana-2022:example-21-1' },
    { rule: 22, firstMissingCreation: 'bana-2022:example-22-1', firstMissingVisualEvidence: 'bana-2022:example-22-1' },
    { rule: 23, firstMissingCreation: 'bana-2022:example-23-1', firstMissingVisualEvidence: 'bana-2022:example-23-1' },
    { rule: 24, firstMissingCreation: 'bana-2022:example-24-1', firstMissingVisualEvidence: 'bana-2022:example-24-1' }
  ]);
});

test('every applicable Rules 17-24 row has exact registered ownership', () => {
  const result = summarizeRuleRange(coverage, 17, 24);
  assert.deepEqual(result.rules.flatMap(({ ownershipGaps }) => ownershipGaps), []);
  assert.deepEqual(result.rules.flatMap(({ implementationGapIds }) => implementationGapIds), []);

  const operations = new Set(operationRegistry().map(({ id }) => id));
  const policies = new Set(contextPolicyRegistry().map(({ id }) => id));
  const rows = coverage.rows.filter(({ printedPage, disposition }) => {
    const rule = Number(printedPage?.split('-')[0]);
    return rule >= 17 && rule <= 24 && !disposition.startsWith('excluded');
  });
  for (const row of rows) {
    for (const id of row.mappingIds ?? []) assert.ok(operations.has(id), `${row.id}: unknown operation ${id}`);
    for (const id of row.contextPolicyIds ?? []) assert.ok(policies.has(id), `${row.id}: unknown context policy ${id}`);
  }
});

test('every applicable Rules 17-24 example retains exact source and executable corpus linkage', () => {
  const cases = new Map(corpus.cases.map((entry) => [entry.id, entry]));
  const examples = coverage.rows.filter(({ printedPage, disposition, kind }) => {
    const rule = Number(printedPage?.split('-')[0]);
    return rule >= 17 && rule <= 24 && kind === 'example' && !disposition.startsWith('excluded');
  });
  assert.equal(examples.length, 345);
  for (const row of examples) {
    assert.ok(row.officialSource, `${row.id}: missing official source extraction`);
    const entry = cases.get(`electron:${row.id}`);
    assert.ok(entry, `${row.id}: missing official Electron corpus case`);
    assert.equal(entry.executable, true, `${row.id}: applicable math example must stay executable`);
    assert.ok(entry.sourceRows.includes(row.id.replace(/^bana-2022:/, '')), `${row.id}: corpus source link drifted`);
  }
});
