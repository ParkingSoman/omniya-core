#!/usr/bin/env node
/**
 * Run missing official Electron examples for one rule, capture screenshots,
 * write docs/electron-evidence, and register visual evidence entries.
 *
 *   unset ELECTRON_RUN_AS_NODE
 *   node scripts/bana-close-rule-evidence.mjs --rule 12 [--limit 5] [--start 12-1]
 *
 * Stops at the first failing example unless --continue-on-fail is set.
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const get = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const has = (flag) => args.includes(flag);

const rule = get('--rule');
const limit = Number(get('--limit') ?? '0') || Infinity;
const start = get('--start');
const continueOnFail = has('--continue-on-fail');
if (!rule) {
  console.error('Usage: node scripts/bana-close-rule-evidence.mjs --rule N [--limit K] [--start N-M]');
  process.exit(1);
}

const corpus = JSON.parse(await readFile(path.join(root, 'docs/bana-electron-official-corpus.json'), 'utf8'));
const coverage = JSON.parse(await readFile(path.join(root, 'docs/bana-coverage.json'), 'utf8'));
const visual = JSON.parse(await readFile(path.join(root, 'docs/bana-visual-evidence.json'), 'utf8'));
const visualExamples = new Set((visual.cases ?? []).map((entry) => entry.example));

const openExampleIds = new Set(
  coverage.rows
    .filter((row) => row.kind === 'example' && row.evidenceScope === 'equation-workflow')
    .filter((row) => {
      const v = row.verified ?? {};
      return ['creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence', 'visualEvidence']
        .some((field) => v[field] !== true);
    })
    .map((row) => row.id.replace(/^bana-2022:example-/, '').replace(/-/g, (m, offset, s) => {
      // id is like example-12-1 -> want 12-1. Already stripped prefix.
      return m;
    }))
);

// Map open row ids "bana-2022:example-12-1" -> "12-1"
const openExamples = new Set(
  coverage.rows
    .filter((row) => row.kind === 'example')
    .filter((row) => {
      const v = row.verified ?? {};
      return ['creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence', 'visualEvidence']
        .some((field) => v[field] !== true);
    })
    .map((row) => row.id.replace(/^bana-2022:example-/, ''))
);

let cases = corpus.cases.filter((entry) => entry.executable && entry.exampleNumber.startsWith(`${rule}-`));
if (start) {
  const index = cases.findIndex((entry) => entry.exampleNumber === start);
  if (index < 0) throw new Error(`start example ${start} not found`);
  cases = cases.slice(index);
}
// Prefer open examples; if none match, run all executable for the rule that lack visual registration.
cases = cases.filter((entry) => openExamples.has(entry.exampleNumber) || !visualExamples.has(entry.exampleNumber));
cases = cases.slice(0, limit);

if (!cases.length) {
  console.log(`No open executable cases for rule ${rule}`);
  process.exit(0);
}

const runOne = (entry) => new Promise((resolve, reject) => {
  const safe = entry.exampleNumber.replace(/[^a-z0-9_-]/gi, '_');
  const resultPath = path.join(os.tmpdir(), `omniya-bana-${safe}-${process.pid}-${Date.now()}.json`);
  const shotDir = path.join(root, 'docs', 'electron-screenshots', `rule-${entry.exampleNumber}`);
  const env = {
    ...process.env,
    BANA_ELECTRON_OFFICIAL: '1',
    BANA_ELECTRON_EXAMPLE: entry.exampleNumber,
    BANA_ELECTRON_RESULTS: resultPath,
    BANA_ELECTRON_SCREENSHOTS: '1',
    BANA_ELECTRON_SCREENSHOT_DIR: shotDir,
    BANA_ELECTRON_ISOLATE_CASES: '0'
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, ['--test', 'test/e2e/bana-official-corpus.test.js'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', async (code, signal) => {
    try {
      await mkdir(path.join(root, 'docs', 'electron-evidence'), { recursive: true });
      const artifact = JSON.parse(await readFile(resultPath, 'utf8'));
      await writeFile(path.join(root, 'docs', 'electron-evidence', `example-${safe}.json`), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
      await rm(resultPath, { force: true });
      if (code !== 0) {
        reject(new Error(`${entry.exampleNumber} failed (${code ?? signal})\n${stdout}\n${stderr}`));
        return;
      }
      resolve({ artifact, shotDir });
    } catch (error) {
      reject(new Error(`${entry.exampleNumber} produced no complete artifact: ${error.message}\n${stdout}\n${stderr}`));
    }
  });
});

const registerVisual = (entry) => new Promise((resolve, reject) => {
  const sourceRows = (entry.sourceRows ?? [`example-${entry.exampleNumber}`]).join(',');
  const child = spawn(process.execPath, [
    'scripts/bana-register-visual-evidence.mjs',
    '--example', entry.exampleNumber,
    '--dir', path.join(root, 'docs', 'electron-screenshots', `rule-${entry.exampleNumber}`),
    '--source-rows', sourceRows
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => {
    if (code !== 0) reject(new Error(`visual register failed for ${entry.exampleNumber}: ${stderr || stdout}`));
    else resolve(stdout.trim());
  });
});

const passed = [];
const failed = [];
for (const [index, entry] of cases.entries()) {
  process.stdout.write(`[${index + 1}/${cases.length}] ${entry.exampleNumber}...\n`);
  try {
    await runOne(entry);
    await registerVisual(entry);
    passed.push(entry.exampleNumber);
    process.stdout.write(`  ok\n`);
  } catch (error) {
    failed.push({ example: entry.exampleNumber, error: String(error.message).split('\n')[0] });
    process.stderr.write(`  FAIL ${error.message}\n`);
    if (!continueOnFail) break;
  }
}

console.log(JSON.stringify({ rule, passed, failed }, null, 2));
if (failed.length) process.exitCode = 1;
