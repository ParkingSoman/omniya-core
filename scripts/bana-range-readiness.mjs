import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const excluded = (row) => row.disposition?.startsWith('excluded-') || row.disposition === 'superseded-by-errata';
const missing = (rows, field) => rows.filter((row) => row.verified?.[field] !== true);

export function summarizeRuleRange(coverage, firstRule, lastRule) {
  const rules = [];
  for (let rule = firstRule; rule <= lastRule; rule += 1) {
    const rows = (coverage.rows ?? []).filter(({ printedPage }) => printedPage?.startsWith(`${rule}-`));
    const applicable = rows.filter((row) => !excluded(row));
    const examples = applicable.filter(({ kind }) => kind === 'example');
    const implementationGaps = applicable.filter((row) =>
      !['implemented-operation', 'implemented-context-policy'].includes(row.disposition) || row.verified?.implementation !== true);
    const ownershipGaps = applicable.filter((row) =>
      (row.disposition === 'implemented-operation' && !row.mappingIds?.length) ||
      (row.disposition === 'implemented-context-policy' && !row.contextPolicyIds?.length) ||
      (row.kind === 'example' && !row.mappingIds?.length && !row.contextPolicyIds?.length));
    const missingCreation = missing(examples, 'creation');
    const missingVisual = missing(examples, 'visualEvidence');
    rules.push({
      rule,
      rows: rows.length,
      applicable: applicable.length,
      examples: examples.length,
      excluded: rows.length - applicable.length,
      implementationGaps: implementationGaps.length,
      implementationGapIds: implementationGaps.map(({ id }) => id),
      ownershipGaps: ownershipGaps.map(({ id }) => id),
      missingCreation: missingCreation.length,
      missingEditing: missing(examples, 'editing').length,
      missingNavigation: missing(examples, 'navigation').length,
      missingWholeBraille: missing(examples, 'wholeBraille').length,
      missingFocusedBraille: missing(examples, 'focusedBraille').length,
      missingUndoRedo: missing(examples, 'undoRedo').length,
      missingPersistence: missing(examples, 'persistence').length,
      missingVisualEvidence: missingVisual.length,
      firstMissingCreation: missingCreation[0]?.id ?? null,
      firstMissingVisualEvidence: missingVisual[0]?.id ?? null
    });
  }
  const sum = (field) => rules.reduce((total, rule) => total + rule[field], 0);
  return {
    schemaVersion: 1,
    range: { firstRule, lastRule },
    totals: {
      rows: sum('rows'), applicable: sum('applicable'), examples: sum('examples'), excluded: sum('excluded'),
      implementationGaps: sum('implementationGaps'), missingCreation: sum('missingCreation'),
      missingEditing: sum('missingEditing'), missingNavigation: sum('missingNavigation'),
      missingWholeBraille: sum('missingWholeBraille'), missingFocusedBraille: sum('missingFocusedBraille'),
      missingUndoRedo: sum('missingUndoRedo'), missingPersistence: sum('missingPersistence'),
      missingVisualEvidence: sum('missingVisualEvidence')
    },
    rules
  };
}

async function main() {
  const coveragePath = process.argv[2] ?? 'docs/bana-coverage.json';
  const outputPath = process.argv[3] ?? 'docs/bana-rules17-24-readiness.json';
  const firstRule = Number(process.argv[4] ?? 17);
  const lastRule = Number(process.argv[5] ?? 24);
  const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
  const result = summarizeRuleRange(coverage, firstRule, lastRule);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`BANA Rules ${firstRule}-${lastRule} readiness written: ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
