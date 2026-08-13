import { readFile } from 'node:fs/promises';
import { appendixDSymbolRefs, contextPolicyRegistry, operationRegistry, parameterizedOperationRefs } from '../src/domain/guided-nemeth/index.js';

const inventoryPath = process.argv[2] ?? 'docs/bana-source-inventory.json';
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const rows = inventory.rows ?? [];
const registry = operationRegistry();
const contextPolicies = contextPolicyRegistry();
const appendixDSymbols = appendixDSymbolRefs();
const provisionRows = new Map(rows.filter((row) => row.kind === 'provision').map((row) => [row.id.split(':')[1], row]));
const referenced = new Map();
for (const mapping of registry) {
  for (const ref of mapping.banaRefs ?? []) {
    const list = referenced.get(ref) ?? [];
    list.push(mapping.id);
    referenced.set(ref, list);
  }
}
for (const policy of contextPolicies) {
  for (const ref of policy.banaRefs) {
    const list = referenced.get(ref) ?? [];
    list.push(policy.id);
    referenced.set(ref, list);
  }
}
  for (const ref of parameterizedOperationRefs()) {
  const list = referenced.get(ref) ?? [];
  list.push(`parameterized:${ref}`);
  referenced.set(ref, list);
}
const missingRegistryRefs = [...referenced.keys()].filter((ref) => !provisionRows.has(ref) && ref !== '2.4');
const registryWithoutSource = registry.filter((mapping) => !mapping.banaRefs?.length || !mapping.action || !mapping.commitPolicy);
const sourceRowsWithRegistry = [...provisionRows.entries()].filter(([ref]) => referenced.has(ref)).map(([ref]) => ({ ref, mappingIds: referenced.get(ref) }));
const result = {
  registryMappings: registry.length,
  contextPolicies: contextPolicies.length,
  appendixDSymbols: appendixDSymbols.length,
  distinctBanaRefs: referenced.size,
  sourceRowsWithRegistry,
  missingRegistryRefs,
  registryWithoutSource: registryWithoutSource.map((mapping) => mapping.id),
  uncoveredProvisionRows: [...provisionRows.keys()].filter((ref) => !referenced.has(ref))
};
console.log(JSON.stringify(result, null, 2));
if (missingRegistryRefs.length || registryWithoutSource.length) process.exitCode = 1;
