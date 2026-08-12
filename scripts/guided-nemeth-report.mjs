import { writeFile } from 'node:fs/promises';
import {
  operationRegistry,
  registryDiagnostics,
  BANA_2022_URL,
  BANA_2022_ERRATA_URL
} from '../src/domain/guided-nemeth/index.js';

const operations = operationRegistry();
const diagnostics = registryDiagnostics();
const report = {
  standard: 'BANA Nemeth Braille Code for Mathematics and Science Notation 2022',
  source: BANA_2022_URL,
  errata: BANA_2022_ERRATA_URL,
  scope: 'nonspatial Rules 1–24 transition operations; Rule 25 and chemistry deferred',
  status: 'development',
  inputPolicies: {
    immediate: operations.filter(({ commitPolicy }) => commitPolicy === 'immediate').length,
    atomicSequence: operations.filter(({ commitPolicy }) => commitPolicy === 'atomic-sequence').length,
    structuralFollowup: operations.filter(({ commitPolicy }) => commitPolicy === 'structural-followup').length
  },
  registryDiagnostics: {
    // Shared prefixes are intentional in BANA (for example, a complete
    // shape indicator can begin a longer shape or arrow). A non-empty
    // policyErrors array is the release-blocking condition; the full list is
    // retained as an auditable source/policy index.
    policyErrors: diagnostics.policyErrors,
    shadowedAtomicCount: diagnostics.shadowedAtomic.length,
    shadowedAtomic: diagnostics.shadowedAtomic,
    shadowedImmediate: diagnostics.shadowedImmediate
  },
  operations: operations.map(({ id, commandLabel, cells, action, commitPolicy, args, banaRefs, errataRefs, validContexts }) => ({
    id, commandLabel, cells, action, commitPolicy, args, banaRefs, errataRefs, validContexts
  })),
  releaseBlockers: ['qualified Nemeth-transcriber review', 'blind-contributor task validation', 'complete Rules 1–24 ledger fixtures']
};

const output = process.argv[2];
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
