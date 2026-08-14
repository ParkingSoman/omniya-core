import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Rules 9–16 preserve the next unresolved evidence handoff without fabricating credit', () => {
  const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  const expected = new Map([
    [9, [null, '9-1']], [10, ['10.1.1', '10-1']], [11, ['11.1.1', '11-1']],
    [12, ['12.1.1', '12-1']], [13, ['13.1', '13-1']], [14, ['14.3', '14-3']],
    [15, ['15.1', '15-1']], [16, ['16.1', '16-1']]
  ]);
  for (const [rule, [rowRef, caseNumber]] of expected) {
    const rows = coverage.rows.filter((row) => row.id.startsWith(`bana-2022:${rule}.`) || row.id === `bana-2022:${rule}`);
    const row = rows.find((candidate) => Object.entries(candidate.verified ?? {}).some(([field, value]) =>
      ['creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence', 'visualEvidence'].includes(field) && value === false));
    if (rowRef) assert.equal(row?.id, `bana-2022:${rowRef}`, `Rule ${rule} first unresolved row`);
    const corpusCase = corpus.cases.find((candidate) => candidate.exampleNumber === caseNumber);
    assert.ok(corpusCase?.executable, `Rule ${rule} handoff case ${caseNumber} must remain executable`);
    assert.equal(corpusCase.creation, false, `${caseNumber} must not claim fabricated creation evidence`);
    assert.equal(corpusCase.editing, false, `${caseNumber} must not claim fabricated editing evidence`);
  }
});
