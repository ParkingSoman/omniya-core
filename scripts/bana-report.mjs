import { readFile, writeFile } from 'node:fs/promises';

const coveragePath = process.argv[2] ?? 'docs/bana-coverage.json';
const outputPath = process.argv[3] ?? 'docs/bana-coverage-report.md';
const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
const rows = coverage.rows ?? [];
const excluded = new Set(['excluded-spatial', 'excluded-chemistry', 'excluded-document-format', 'superseded-by-errata']);
const applicable = rows.filter((row) => !excluded.has(row.disposition));
const complete = applicable.filter((row) => row.disposition === 'implemented-operation' || row.disposition === 'implemented-context-policy');
const officialExamples = rows.filter((row) => row.kind === 'example' && !excluded.has(row.disposition));
const appendixRows = rows.filter((row) => row.kind === 'appendix');
const evidenceRequirements = [
  ['creation', 'Electron creation evidence'],
  ['editing', 'Electron editing evidence'],
  ['navigation', 'navigation evidence'],
  ['wholeBraille', 'whole-expression Braille evidence'],
  ['focusedBraille', 'focused-node Braille evidence'],
  ['undoRedo', 'undo/redo evidence'],
  ['persistence', 'persistence evidence'],
  ['visualEvidence', 'visual evidence'],
];
const missingEvidence = evidenceRequirements.map(([field, label]) => ({
  field,
  label,
  count: applicable.filter((row) => row.verified?.[field] !== true).length,
}));
const pendingTranscriberReview = applicable.filter((row) =>
  (row.humanReview?.transcriber?.status ?? row.transcriberReview) !== 'reviewed'
).length;
const pendingBlindContributorReview = applicable.filter((row) =>
  row.humanReview?.blindContributor?.status !== 'reviewed'
).length;
const implementationComplete = complete.length === applicable.length;
const auditComplete = implementationComplete
  && missingEvidence.every(({ count }) => count === 0)
  && pendingTranscriberReview === 0
  && pendingBlindContributorReview === 0;
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
const status = auditComplete
  ? 'Status: **audit-complete**.'
  : implementationComplete
    ? 'Status: **implementation-complete; evidence-incomplete**. The release gate remains open until every applicable row has full evidence and both independent reviews.'
    : 'Status: **development**. The release gate remains intentionally open until every applicable row has implementation, full evidence, and both independent reviews.';
const lines = ['# BANA guided Nemeth coverage report', '', `Generated from \`${coveragePath}\`.`, '', `- Source rows: ${rows.length}`, `- Numbered provisions: ${coverage.counts?.numberedRows ?? 'unknown'}`, `- Applicable rows: ${applicable.length}`, `- Fully implemented rows: ${complete.length}`, `- Official examples: ${coverage.counts?.examples ?? 'unknown'}`, `- Official examples with extracted source blocks: ${coverage.counts?.officialExamplesLinked ?? 'unknown'}`, `- Official examples with Electron creation evidence: ${officialExamples.filter((row) => row.electronCreationCaseIds?.length).length}`, `- Official examples with Electron editing evidence: ${officialExamples.filter((row) => row.electronEditingCaseIds?.length).length}`, `- Appendix rows: ${appendixRows.length} (63 Appendix D symbols plus A–C policy rows)`, `- Electron creation-linked rows: ${coverage.counts?.electronCreationRows ?? 0}`, `- Electron editing-linked rows: ${coverage.counts?.electronEditingRows ?? 0}`, ...missingEvidence.map(({ label, count }) => `- Missing ${label}: ${count}`), `- Pending independent transcriber review: ${pendingTranscriberReview}`, `- Pending blind-contributor review: ${pendingBlindContributorReview}`, '', '| Rule | Total | Applicable | Implemented | Electron creation | Electron editing | Excluded |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |', ...[...ruleRows.entries()].sort(([a], [b]) => (Number(a) || 99) - (Number(b) || 99)).map(([rule, value]) => `| ${rule} | ${value.total} | ${value.applicable} | ${value.complete} | ${value.creation} | ${value.editing} | ${value.excluded} |`), '', status];
lines.push('', '## Visual evidence', '', 'The real Electron corpus also performs one-source-root, one-container, non-zero-geometry, and hidden-source-blank checks for every executable creation and editing case. PNG screenshots are captured for rule review when `BANA_ELECTRON_SCREENSHOTS=1`; the resulting JSON artifact records each `visualCreation` and `visualEditing` path. See [bana-electron-visual-evidence.md](bana-electron-visual-evidence.md).');
await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
