import { readFile, writeFile } from 'node:fs/promises';

const coveragePath = process.argv[2] ?? 'docs/bana-coverage.json';
const outputPath = process.argv[3] ?? 'docs/bana-coverage-report.md';
const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
const rows = coverage.rows ?? [];
const excluded = new Set(['excluded-spatial', 'excluded-chemistry', 'excluded-document-format', 'superseded-by-errata']);
const applicable = rows.filter((row) => !excluded.has(row.disposition));
const complete = applicable.filter((row) => row.disposition === 'implemented-operation' || row.disposition === 'implemented-context-policy');
const ruleRows = new Map();
for (const row of rows) {
  const rule = row.id.match(/(?:bana-2022:|errata-2025:)?(\d{1,2})[.-]/)?.[1] ?? 'other';
  const current = ruleRows.get(rule) ?? { total: 0, applicable: 0, complete: 0, creation: 0, editing: 0, excluded: 0 };
  current.total += 1;
  if (excluded.has(row.disposition)) current.excluded += 1;
  else {
    current.applicable += 1;
    if (row.disposition === 'implemented-operation' || row.disposition === 'implemented-context-policy') current.complete += 1;
    if (row.electronCreationCaseIds?.length) current.creation += 1;
    if (row.electronEditingCaseIds?.length) current.editing += 1;
  }
  ruleRows.set(rule, current);
}
const lines = ['# BANA guided Nemeth coverage report', '', `Generated from \`${coveragePath}\`.`, '', `- Source rows: ${rows.length}`, `- Applicable rows: ${applicable.length}`, `- Fully implemented rows: ${complete.length}`, `- Official examples: ${coverage.counts?.examples ?? 'unknown'}`, `- Official examples with extracted source blocks: ${coverage.counts?.officialExamplesLinked ?? 'unknown'}`, `- Electron creation-linked rows: ${coverage.counts?.electronCreationRows ?? 0}`, `- Electron editing-linked rows: ${coverage.counts?.electronEditingRows ?? 0}`, '', '| Rule | Total | Applicable | Implemented | Electron creation | Electron editing | Excluded |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |', ...[...ruleRows.entries()].sort(([a], [b]) => (Number(a) || 99) - (Number(b) || 99)).map(([rule, value]) => `| ${rule} | ${value.total} | ${value.applicable} | ${value.complete} | ${value.creation} | ${value.editing} | ${value.excluded} |`), '', complete.length === applicable.length ? 'Status: **automated-complete** (subject to transcriber and blind-contributor review).' : 'Status: **development**. The release gate remains intentionally open until every applicable row has implementation and full Electron/Braille evidence.'];
await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
