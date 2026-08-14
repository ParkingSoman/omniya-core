import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Rules 9–16 preserve executable handoff cases without fabricating credit', () => {
  const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  const handoffCases = new Map([
    [9, '9-1'], [10, '10-1'], [11, '11-1'], [12, '12-1'],
    [13, '13-1'], [14, '14-3'], [15, '15-1'], [16, '16-1']
  ]);
  for (const [rule, caseNumber] of handoffCases) {
    const corpusCase = corpus.cases.find((candidate) => candidate.exampleNumber === caseNumber);
    assert.ok(corpusCase?.executable, `Rule ${rule} handoff case ${caseNumber} must remain executable`);
    // Static corpus rows must not invent Electron results; real evidence lives
    // in docs/electron-evidence and is merged during enrichment.
    assert.equal(corpusCase.creation, false, `${caseNumber} must not claim fabricated creation evidence`);
    assert.equal(corpusCase.editing, false, `${caseNumber} must not claim fabricated editing evidence`);
    const rows = coverage.rows.filter((row) =>
      row.id.startsWith(`bana-2022:${rule}.`) ||
      row.id === `bana-2022:${rule}` ||
      row.id.startsWith(`bana-2022:example-${rule}-`));
    assert.ok(rows.length > 0, `Rule ${rule} must remain present in the coverage ledger`);
  }
});
