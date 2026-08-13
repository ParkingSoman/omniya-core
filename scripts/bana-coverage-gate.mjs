import { readFile } from 'node:fs/promises';

const file = process.argv[2] ?? 'docs/bana-source-inventory.json';
const inventory = JSON.parse(await readFile(file, 'utf8'));
const rows = inventory.rows ?? [];
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
const failures = [
  ...missing.map((row) => `${row.id}: ${row.disposition}`),
  ...incompleteEvidence.map((row) => `${row.id}: incomplete verification fields`),
  ...pendingReview.map((row) => `${row.id}: transcriber review is ${row.transcriberReview}`),
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
