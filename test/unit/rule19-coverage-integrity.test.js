import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));
test('Rule 19 rows are mapped or explicitly documentary exclusions', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:(?:19(?:\.|$)|example-19-)/.test(row.id));
  assert.equal(rows.length, 60);
  assert.equal(rows.filter((row) => row.disposition === 'unclassified').length, 0);
  for (const row of rows) if (row.disposition !== 'excluded-document-format') assert.equal(row.verified.implementation, true, row.id);
});

test('Rule 19 documentary exclusions are the printed 19-10 through 19-13 layout provisions', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:(?:19\.7|19\.8|19\.9(?:\.1|\.2)?|example-19-(?:3[6-9]|4[0-5]))$/.test(row.id));
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.disposition, 'excluded-document-format', row.id);
    assert.match(row.printedPage, /^19-(?:10|11|12|13)$/);
    assert.ok([262, 263, 264, 265].includes(row.pdfPage), row.id);
  }
});

test('Rule 19 documentary examples are not advertised as executable equations', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  for (let number = 36; number <= 45; number += 1) {
    const entry = corpus.cases.find((candidate) => candidate.exampleNumber === `19-${number}`);
    assert.equal(entry?.executable, false, `19-${number} is a transcriber/layout example, not an equation workflow`);
  }
});
