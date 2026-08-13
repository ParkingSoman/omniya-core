import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = process.argv[2] ?? 'docs/electron-evidence';
const output = process.argv[3] ?? 'docs/bana-electron-results.json';
const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
const byId = new Map();
for (const name of names) {
  const artifact = JSON.parse(await readFile(path.join(directory, name), 'utf8'));
  for (const result of artifact.cases ?? []) {
    const previous = byId.get(result.id) ?? { id: result.id, sourceRows: result.sourceRows ?? [] };
    // Preserve a successful field if a later retry only records an error.
    const merged = { ...previous, ...result };
    for (const field of ['creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence']) {
      merged[field] = previous[field] === true || result[field] === true;
    }
    byId.set(result.id, merged);
  }
}
const merged = {
  schemaVersion: 1,
  runKind: 'merged-official-electron-corpus',
  artifacts: names,
  cases: [...byId.values()]
};
await writeFile(output, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
console.log(`Merged ${names.length} Electron artifacts and ${byId.size} cases into ${output}`);
