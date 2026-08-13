import { readFile, writeFile } from 'node:fs/promises';
import { appendixDSymbolRefs, contextPolicyRegistry, operationRegistry, parameterizedOperationRefs } from '../src/domain/guided-nemeth/index.js';

const inventoryPath = process.argv[2] ?? 'docs/bana-source-inventory.json';
const corpusPath = process.argv[3] ?? 'docs/bana-electron-corpus.json';
const outputPath = process.argv[4] ?? 'docs/bana-coverage.json';
const evidencePath = process.env.BANA_ELECTRON_RESULTS ?? process.argv[5] ?? null;
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const officialCorpus = JSON.parse(await readFile('docs/bana-electron-official-corpus.json', 'utf8'));
const official = JSON.parse(await readFile('docs/bana-official-examples.json', 'utf8'));
const visualEvidence = JSON.parse(await readFile('docs/bana-visual-evidence.json', 'utf8').catch(() => '{"cases":[]}'));
const registry = operationRegistry();
const contextPolicies = contextPolicyRegistry();
const parameterizedRefs = new Set(parameterizedOperationRefs());
const appendixDRefs = new Map(appendixDSymbolRefs().map(({ rank, banaRefs }) => [`appendix-D-${rank}`, banaRefs]));
const caseById = new Map([...(corpus.cases ?? []), ...(officialCorpus.cases ?? [])].map((entry) => [entry.id, entry]));
const visualBySource = new Map();
for (const entry of visualEvidence.cases ?? []) for (const sourceRow of entry.sourceRows ?? []) visualBySource.set(sourceRow, entry);
const visualSatisfies = (entry, needsEditing = false) => {
  if (!entry) return false;
  const phases = new Set((entry.evidenceSet?.screenshots ?? []).map((shot) => shot.phase));
  // Legacy creation/editing paths are intentionally not enough for the new
  // audit contract. They remain useful links for a reviewer, but cannot mark
  // a row complete because they do not prove how the Nemeth input was authored
  // or what MathJax scope was focused before E.
  if (!phases.size) return false;
  if (!phases.has('input') || (!phases.has('committed') && !phases.has('creation'))) return false;
  return !needsEditing || (phases.has('focused') && phases.has('editing'));
};
if (evidencePath) {
  // Accept a comma-separated set of rule-shard artifacts. This keeps the
  // ledger cumulative without requiring a hand-edited evidence file, while
  // preserving the rule that only real Electron results can turn a field true.
  for (const artifactPath of evidencePath.split(',').map((value) => value.trim()).filter(Boolean)) {
    try {
      const evidence = JSON.parse(await readFile(artifactPath, 'utf8'));
      for (const result of evidence.cases ?? []) {
        const existing = caseById.get(result.id) ?? { id: result.id, sourceRows: result.sourceRows ?? [] };
        caseById.set(result.id, { ...existing, ...result });
      }
    } catch (error) {
      throw new Error(`Unable to read Electron evidence artifact ${artifactPath}: ${error.message}`);
    }
  }
}
const cases = [...caseById.values()];
const officialById = new Map(official.examples.map((example) => [example.id, example]));
const inventoryById = new Map(inventory.rows.map((entry) => [entry.id, entry]));
const sourceRefsFor = (row, example) => {
  const refs = new Set();
  const add = (value) => {
    if (!value) return;
    const id = String(value).replace(/^bana-2022:/, '');
    refs.add(id);
  };
  add(row.id);
  for (const value of example?.sourceRows ?? []) add(value);
  let parent = row.parentId ? inventoryById.get(row.parentId) : null;
  const seen = new Set();
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    add(parent.id);
    parent = parent.parentId ? inventoryById.get(parent.parentId) : null;
  }
  return refs;
};
const rows = inventory.rows.map((row) => {
  const ref = row.id.replace(/^bana-2022:/, '');
  const policyRef = row.kind === 'appendix' && /^appendix-[ABC]$/.test(ref) ? ref : ref;
  const isExample = row.kind === 'example';
  const example = isExample ? officialById.get(row.id) : null;
  const officialElectronCase = isExample
    ? officialCorpus.cases.find((entry) => entry.sourceRows?.includes(ref))
    : null;
  const appendixRefs = row.kind === 'appendix' ? (appendixDRefs.get(ref) ?? []) : [];
  const sourceRefs = sourceRefsFor(row, example);
  const mappingIds = registry.filter((mapping) => [...sourceRefs].some((sourceRef) => mapping.banaRefs?.includes(sourceRef)) || appendixRefs.some((sourceRef) => mapping.banaRefs?.includes(sourceRef))).map((mapping) => mapping.id);
  const contextRefs = [...sourceRefs, policyRef];
  const contextPolicyIds = contextPolicies.filter((policy) => contextRefs.some((sourceRef) => policy.banaRefs.includes(sourceRef))).map((policy) => policy.id);
  // An official example is not credited merely because its parent provision
  // has a family test. It needs its own Electron case ID. Provision-level
  // cases may cover the provision itself, but example rows match exact IDs.
  const matched = cases.filter((entry) => entry.sourceRows?.includes(ref) && entry.creation === true);
  const visual = visualBySource.get(ref) ?? visualBySource.get(row.id);
  const verified = { ...row.verified };
  verified.implementation = mappingIds.length > 0 || contextPolicyIds.length > 0 || parameterizedRefs.has(ref) || appendixRefs.length > 0;
  verified.contextPolicy = contextPolicyIds.length > 0;
  const mappings = registry.filter((mapping) => mappingIds.includes(mapping.id));
  const policies = [...new Set(mappings.map((mapping) => mapping.commitPolicy))];
  // A source row can describe policy, scope, or document context rather than
  // an equation construction. Those rows are complete when the source and
  // implementation/context decision are reviewed; demanding an Electron
  // creation screenshot for prose would make the audit claim something the
  // application cannot meaningfully demonstrate. Equation provisions and
  // executable examples retain the full renderer evidence contract.
  const requiresEquationEvidence = isExample || mappings.some((mapping) => mapping.args?.sourceKind !== 'context-policy');
  const disposition = row.disposition === 'unclassified' && (mappingIds.length > 0 || contextPolicyIds.length > 0 || parameterizedRefs.has(ref) || appendixRefs.length > 0)
    ? (contextPolicyIds.length > 0 && mappingIds.length === 0 || mappings.some((mapping) => mapping.args?.sourceKind === 'context-policy') ? 'implemented-context-policy' : 'implemented-operation')
    : row.disposition;
  for (const field of ['creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence']) {
    verified[field] = requiresEquationEvidence ? matched.some((entry) => entry[field] === true) : true;
  }
  verified.visualEvidence = requiresEquationEvidence
    ? visualSatisfies(visual, matched.some((entry) => entry.editing === true))
    : true;
  return {
    ...row,
    disposition,
    ...(policies.length === 1 ? { inputPolicy: policies[0] } : {}),
    ...(contextPolicyIds.length ? { contextPolicyIds } : {}),
    ...(appendixRefs.length ? { appendixRefs } : {}),
    ...(isExample && example ? { exampleParentId: example.parentId } : {}),
    ...(example ? { officialSource: {
      sourceLines: example.sourceLines,
      printAndBraille: example.printAndBraille,
      candidateBrailleLines: example.candidateBrailleLines,
      expectedWholeBraille: example.expectedWholeBraille ?? null,
      sourceNotation: example.sourceNotation ?? null,
      brailleCells: officialElectronCase?.cells?.join('') ?? null
    } } : {}),
    ...(visual ? { visualEvidence: visual } : {}),
    evidenceScope: requiresEquationEvidence ? 'equation-workflow' : 'source-policy',
    mappingIds,
    unitCaseIds: mappingIds.map((id) => `registry:${id}`),
    electronCreationCaseIds: matched.filter((entry) => entry.creation === true).map((entry) => entry.id),
    electronEditingCaseIds: matched.filter((entry) => entry.editing === true).map((entry) => entry.id),
    navigationCaseIds: matched.filter((entry) => entry.navigation === true).map((entry) => entry.id),
    verified
  };
});
const result = {
  ...inventory,
  schemaVersion: 2,
  corpus: { path: corpusPath, caseCount: cases.length },
  counts: {
    ...inventory.counts,
    mappedRows: rows.filter((row) => row.mappingIds.length > 0).length,
    electronCreationRows: rows.filter((row) => row.electronCreationCaseIds.length > 0).length,
    electronEditingRows: rows.filter((row) => row.electronEditingCaseIds.length > 0).length
    ,officialExamplesLinked: rows.filter((row) => row.kind === 'example' && row.officialSource).length
  },
  rows
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`BANA coverage evidence written: ${outputPath}`);
