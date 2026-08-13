import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const corpus = JSON.parse(await readFile(path.join(root, 'docs/bana-electron-official-corpus.json'), 'utf8'));
const outputDirectory = process.env.BANA_ELECTRON_ARTIFACT_DIR
  ? path.resolve(process.env.BANA_ELECTRON_ARTIFACT_DIR)
  : path.join(root, 'docs', 'electron-evidence');
await mkdir(outputDirectory, { recursive: true });
const requestedExample = process.env.BANA_ELECTRON_EXAMPLE ?? null;
const filterRule = process.env.BANA_RULE ?? null;
const filterExample = requestedExample;
const cases = corpus.cases.filter((entry) => entry.executable &&
  (!filterRule || entry.exampleNumber.startsWith(`${filterRule}-`)) &&
  (!filterExample || entry.exampleNumber === filterExample));
if (!cases.length) throw new Error('No executable official Electron cases matched the requested filter');

const runOne = (entry) => new Promise((resolve, reject) => {
  const safe = entry.exampleNumber.replace(/[^a-z0-9_-]/gi, '_');
  const resultPath = path.join(os.tmpdir(), `omniya-bana-${safe}-${process.pid}-${Date.now()}.json`);
  const child = spawn(process.execPath, ['--test', 'test/e2e/bana-official-corpus.test.js'], {
    cwd: root,
    env: {
      ...process.env,
      BANA_ELECTRON_OFFICIAL: '1',
      BANA_ELECTRON_EXAMPLE: entry.exampleNumber,
      BANA_ELECTRON_RESULTS: resultPath,
      // The test itself still performs a real relaunch persistence check.
      // Keep the process to one official case so Electron/MathJax state from
      // another example can never truncate this one.
      BANA_ELECTRON_ISOLATE_CASES: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', async (code, signal) => {
    try {
      const artifact = JSON.parse(await readFile(resultPath, 'utf8'));
      await writeFile(path.join(outputDirectory, `example-${safe}.json`), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
      await rm(resultPath, { force: true });
      if (code !== 0) reject(new Error(`${entry.exampleNumber} Electron process failed (${code ?? signal})\n${stdout}\n${stderr}`));
      else resolve(artifact);
    } catch (error) {
      reject(new Error(`${entry.exampleNumber} produced no complete Electron artifact: ${error.message}\n${stdout}\n${stderr}`));
    }
  });
});

const results = [];
for (const [index, entry] of cases.entries()) {
  process.stdout.write(`[${index + 1}/${cases.length}] Electron ${entry.exampleNumber}\n`);
  const artifact = await runOne(entry);
  const result = artifact.cases?.find((item) => item.id === entry.id) ?? artifact.cases?.[0];
  if (!result?.creation || !result.editing || !result.navigation || !result.wholeBraille || !result.focusedBraille || !result.undoRedo || !result.persistence) {
    throw new Error(`${entry.exampleNumber} completed without the full creation/edit/navigation/Braille/history/persistence contract: ${JSON.stringify(result)}`);
  }
  results.push(result);
}
await writeFile(path.join(outputDirectory, 'run-summary.json'), `${JSON.stringify({ schemaVersion: 1, cases: results }, null, 2)}\n`, 'utf8');
console.log(`Completed ${results.length} isolated official Electron cases`);
