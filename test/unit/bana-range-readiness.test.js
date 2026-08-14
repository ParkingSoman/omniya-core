import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { summarizeRuleRange } from '../../scripts/bana-range-readiness.mjs';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

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
});
