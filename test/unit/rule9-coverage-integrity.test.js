import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));
const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));

test('Rule 9 Electron-proven reference workflows are never documentary exclusions', () => {
  const rows = coverage.rows.filter((row) => /^bana-2022:(?:9(?:\.|$)|example-9-)/.test(row.id));
  const electronRefs = new Set(corpus.cases.flatMap((entry) => entry.sourceRows ?? []).filter((ref) => /^9(?:\.|$)/.test(ref) || /^example-9-/.test(ref)));
  for (const row of rows) {
    const ref = row.id.replace(/^bana-2022:/, '');
    if (electronRefs.has(ref)) assert.notEqual(row.disposition, 'excluded-document-format', row.id);
  }
});
