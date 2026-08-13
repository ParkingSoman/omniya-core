import { readFile } from 'node:fs/promises';

const file = process.argv[2] ?? 'docs/bana-source-inventory.json';
const inventory = JSON.parse(await readFile(file, 'utf8'));
const rows = inventory.rows ?? [];
if (inventory.schemaVersion < 2) {
  console.error('BANA coverage gate requires enriched schemaVersion 2 evidence. Run npm run bana:enrich first.');
  process.exitCode = 1;
}
const approvedExclusions = new Set(['excluded-spatial', 'excluded-chemistry', 'excluded-document-format', 'superseded-by-errata']);
const evidenceFields = ['source', 'implementation', 'creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence'];
const missing = rows.filter((row) => {
  if (approvedExclusions.has(row.disposition)) return false;
  return row.disposition !== 'implemented-operation' && row.disposition !== 'implemented-context-policy';
});
const incompleteEvidence = rows.filter((row) => {
  if (approvedExclusions.has(row.disposition)) return false;
  if (row.disposition !== 'implemented-operation' && row.disposition !== 'implemented-context-policy') return false;
  return evidenceFields.some((field) => row.verified?.[field] !== true);
});
const badExclusions = rows.filter((row) => row.disposition.startsWith('excluded-') && !approvedExclusions.has(row.disposition));
const pendingReview = rows.filter((row) => !approvedExclusions.has(row.disposition) && row.transcriberReview !== 'reviewed');
const examplesWithoutSource = rows.filter((row) => row.kind === 'example' && !approvedExclusions.has(row.disposition) && !row.officialSource);
const requiredFieldsByKind = rows.map((row) => {
  if (row.kind === 'erratum') return ['source', 'implementation', 'creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence'];
  if (row.kind === 'example') return ['source', 'implementation', 'creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence'];
  return evidenceFields;
});
const missingPolicy = rows.filter((row) => !approvedExclusions.has(row.disposition) && row.kind !== 'erratum' && row.kind !== 'example' && !['immediate', 'atomic-sequence', 'structural-followup'].includes(row.inputPolicy ?? ''));
const failures = [
  ...missing.map((row) => `${row.id}: ${row.disposition}`),
  ...incompleteEvidence.map((row) => `${row.id}: incomplete verification fields`),
  ...pendingReview.map((row) => `${row.id}: transcriber review is ${row.transcriberReview}`),
  ...examplesWithoutSource.map((row) => `${row.id}: missing extracted official example source block`),
  ...missingPolicy.map((row) => `${row.id}: missing one of the three input policies`),
  ...badExclusions.map((row) => `${row.id}: invalid exclusion ${row.disposition}`)
];
if (failures.length) {
  console.error(`BANA coverage gate failed: ${failures.length} source-row requirements are not complete.`);
  console.error(failures.slice(0, 50).join('\n'));
  if (failures.length > 50) console.error(`… ${failures.length - 50} more`);
  process.exitCode = 1;
} else {
  console.log(`BANA coverage gate passed: ${rows.length} source rows classified, evidenced, and implemented/excluded.`);
}
