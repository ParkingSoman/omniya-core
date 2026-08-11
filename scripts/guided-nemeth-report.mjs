import { writeFile } from 'node:fs/promises';
import { operationRegistry, BANA_2022_URL, BANA_2022_ERRATA_URL } from '../src/domain/guided-nemeth/index.js';

const operations = operationRegistry();
const report = {
  standard: 'BANA Nemeth Braille Code for Mathematics and Science Notation 2022',
  source: BANA_2022_URL,
  errata: BANA_2022_ERRATA_URL,
  scope: 'nonspatial Rules 1–24 transition operations; Rule 25 and chemistry deferred',
  status: 'development',
  operations: operations.map(({ id, commandLabel, banaRefs, nemethSequences, validContexts }) => ({ id, commandLabel, banaRefs, nemethSequences, validContexts })),
  releaseBlockers: ['qualified Nemeth-transcriber review', 'blind-contributor task validation', 'complete Rules 1–24 ledger fixtures']
};

const output = process.argv[2];
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
