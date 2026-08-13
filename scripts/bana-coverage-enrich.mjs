import { readFile, writeFile } from 'node:fs/promises';
import { appendixDSymbolRefs, contextPolicyRegistry, operationRegistry, parameterizedOperationRefs } from '../src/domain/guided-nemeth/index.js';

const inventoryPath = process.argv[2] ?? 'docs/bana-source-inventory.json';
const corpusPath = process.argv[3] ?? 'docs/bana-electron-corpus.json';
const outputPath = process.argv[4] ?? 'docs/bana-coverage.json';
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const official = JSON.parse(await readFile('docs/bana-official-examples.json', 'utf8'));
const registry = operationRegistry();
const contextPolicies = contextPolicyRegistry();
const parameterizedRefs = new Set(parameterizedOperationRefs());
const appendixDRefs = new Map(appendixDSymbolRefs().map(({ rank, banaRefs }) => [`appendix-D-${rank}`, banaRefs]));
const cases = corpus.cases ?? [];
const officialById = new Map(official.examples.map((example) => [example.id, example]));
const rows = inventory.rows.map((row) => {
  const ref = row.id.replace(/^bana-2022:/, '');
  const policyRef = row.kind === 'appendix' && /^appendix-[ABC]$/.test(ref) ? ref : ref;
  const isExample = row.kind === 'example';
  const example = isExample ? officialById.get(row.id) : null;
  const appendixRefs = row.kind === 'appendix' ? (appendixDRefs.get(ref) ?? []) : [];
  const mappingIds = registry.filter((mapping) => mapping.banaRefs?.includes(ref) || appendixRefs.some((sourceRef) => mapping.banaRefs?.includes(sourceRef)) || (isExample && mapping.banaRefs?.includes(example?.sourceRows?.[0]))).map((mapping) => mapping.id);
  const contextPolicyIds = contextPolicies.filter((policy) => policy.banaRefs.includes(policyRef)).map((policy) => policy.id);
  // An official example is not credited merely because its parent provision
  // has a family test. It needs its own Electron case ID. Provision-level
  // cases may cover the provision itself, but example rows match exact IDs.
  const matched = cases.filter((entry) => entry.sourceRows?.includes(ref));
  const verified = { ...row.verified };
  verified.implementation = mappingIds.length > 0 || contextPolicyIds.length > 0 || parameterizedRefs.has(ref) || appendixRefs.length > 0;
  verified.contextPolicy = contextPolicyIds.length > 0;
  const mappings = registry.filter((mapping) => mappingIds.includes(mapping.id));
  const policies = [...new Set(mappings.map((mapping) => mapping.commitPolicy))];
  const disposition = row.disposition === 'unclassified' && !isExample && (mappingIds.length > 0 || contextPolicyIds.length > 0 || parameterizedRefs.has(ref) || appendixRefs.length > 0)
    ? (contextPolicyIds.length > 0 && mappingIds.length === 0 || mappings.some((mapping) => mapping.args?.sourceKind === 'context-policy') ? 'implemented-context-policy' : 'implemented-operation')
    : row.disposition;
  for (const field of ['creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence']) {
    verified[field] = matched.some((entry) => entry[field] === true);
  }
  return {
    ...row,
    disposition,
    ...(policies.length === 1 ? { inputPolicy: policies[0] } : {}),
    ...(contextPolicyIds.length ? { contextPolicyIds } : {}),
    ...(appendixRefs.length ? { appendixRefs } : {}),
    ...(isExample && example ? { exampleParentId: example.parentId } : {}),
    ...(example ? { officialSource: { sourceLines: example.sourceLines, printAndBraille: example.printAndBraille, candidateBrailleLines: example.candidateBrailleLines, expectedWholeBraille: example.expectedWholeBraille ?? null, sourceNotation: example.sourceNotation ?? null } } : {}),
    mappingIds,
    unitCaseIds: mappingIds.map((id) => `registry:${id}`),
    electronCreationCaseIds: matched.filter((entry) => entry.creation).map((entry) => entry.id),
    electronEditingCaseIds: matched.filter((entry) => entry.editing).map((entry) => entry.id),
    navigationCaseIds: matched.filter((entry) => entry.navigation).map((entry) => entry.id),
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
