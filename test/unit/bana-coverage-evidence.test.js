import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL('../..', import.meta.url).pathname);

async function enrich(inventory, evidence = null) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'omniya-bana-evidence-'));
  const inventoryPath = path.join(directory, 'inventory.json');
  const corpusPath = path.join(directory, 'corpus.json');
  const outputPath = path.join(directory, 'coverage.json');
  const evidencePath = evidence ? path.join(directory, 'electron.json') : null;
  await writeFile(inventoryPath, JSON.stringify(inventory));
  await writeFile(corpusPath, JSON.stringify({ schemaVersion: 1, cases: [] }));
  if (evidencePath) await writeFile(evidencePath, JSON.stringify(evidence));
  await execFileAsync(process.execPath, ['scripts/bana-coverage-enrich.mjs', inventoryPath, corpusPath, outputPath, ...(evidencePath ? [evidencePath] : [])], { cwd: root });
  return JSON.parse(await readFile(outputPath, 'utf8'));
}

const exampleRow = {
  id: 'bana-2022:example-3-2',
  kind: 'example',
  disposition: 'unclassified',
  inputPolicy: null,
  verified: { source: true }
};

test('coverage enrichment never credits a static official case as Electron evidence', async () => {
  const result = await enrich({ schemaVersion: 1, rows: [exampleRow], counts: {} });
  const row = result.rows[0];
  assert.equal(row.verified.creation, false);
  assert.deepEqual(row.electronCreationCaseIds, []);
});

test('coverage enrichment applies the empty canonical human-review ledger without claiming review', async () => {
  const result = await enrich({ schemaVersion: 1, rows: [exampleRow], counts: {} });
  assert.deepEqual(result.rows[0].humanReview, {
    transcriber: { status: 'pending', reviewIds: [] },
    blindContributor: { status: 'pending', reviewIds: [] }
  });
  assert.equal(result.rows[0].transcriberReview, 'pending');
  assert.equal(result.humanReview.acceptedRecords, 0);
});

test('coverage enrichment overlays only explicit real Electron case results', async () => {
  const result = await enrich(
    { schemaVersion: 1, rows: [exampleRow], counts: {} },
    { cases: [{ id: 'electron:bana-2022:example-3-2', sourceRows: ['example-3-2', '3.2.1'], creation: true, editing: true, navigation: true, wholeBraille: true, focusedBraille: true, undoRedo: true, persistence: true }] }
  );
  const row = result.rows[0];
  assert.equal(row.verified.creation, true);
  assert.equal(row.verified.focusedBraille, true);
  assert.deepEqual(row.electronEditingCaseIds, ['electron:bana-2022:example-3-2']);
});

test('coverage enrichment accepts cumulative Electron shard artifacts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'omniya-bana-evidence-shards-'));
  const inventoryPath = path.join(directory, 'inventory.json');
  const corpusPath = path.join(directory, 'corpus.json');
  const outputPath = path.join(directory, 'coverage.json');
  const first = path.join(directory, 'one.json');
  const second = path.join(directory, 'two.json');
  await writeFile(inventoryPath, JSON.stringify({ schemaVersion: 1, rows: [exampleRow], counts: {} }));
  await writeFile(corpusPath, JSON.stringify({ schemaVersion: 1, cases: [] }));
  await writeFile(first, JSON.stringify({ cases: [{ id: 'electron:bana-2022:example-3-2', sourceRows: ['example-3-2'], creation: true }] }));
  await writeFile(second, JSON.stringify({ cases: [{ id: 'electron:bana-2022:example-3-2', sourceRows: ['example-3-2'], editing: true, navigation: true, wholeBraille: true, focusedBraille: true, undoRedo: true, persistence: true }] }));
  await execFileAsync(process.execPath, ['scripts/bana-coverage-enrich.mjs', inventoryPath, corpusPath, outputPath, `${first},${second}`], { cwd: root });
  const row = JSON.parse(await readFile(outputPath, 'utf8')).rows[0];
  assert.equal(row.verified.creation, true);
  assert.equal(row.verified.editing, true);
  assert.equal(row.verified.persistence, true);
});

test('visual evidence requires authored input and a named committed phase', async () => {
  const evidence = {
    cases: [{
      id: 'electron:bana-2022:example-3-2',
      sourceRows: ['example-3-2'],
      creation: true, editing: true, navigation: true,
      wholeBraille: true, focusedBraille: true, undoRedo: true, persistence: true
    }]
  };
  const result = await enrich({ schemaVersion: 1, rows: [exampleRow], counts: {} }, evidence);
  assert.equal(result.rows[0].verified.visualEvidence, false);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'omniya-bana-visual-'));
  const inventoryPath = path.join(directory, 'inventory.json');
  const corpusPath = path.join(directory, 'corpus.json');
  const outputPath = path.join(directory, 'coverage.json');
  const electronPath = path.join(directory, 'electron.json');
  await writeFile(inventoryPath, JSON.stringify({ schemaVersion: 1, rows: [exampleRow], counts: {} }));
  await writeFile(corpusPath, JSON.stringify({ schemaVersion: 1, cases: [] }));
  await writeFile(electronPath, JSON.stringify({
    cases: [{ ...evidence.cases[0], visualEvidence: {
      evidenceSet: { screenshots: [
        { phase: 'input', path: 'input.png' },
        { phase: 'committed', path: 'committed.png' },
        { phase: 'focused', path: 'focused.png' },
        { phase: 'editing', path: 'editing.png' }
      ] }
    } }]
  }));
  await execFileAsync(process.execPath, ['scripts/bana-coverage-enrich.mjs', inventoryPath, corpusPath, outputPath, electronPath], { cwd: root });
  const credited = JSON.parse(await readFile(outputPath, 'utf8')).rows[0];
  assert.equal(credited.verified.visualEvidence, false, 'Electron result alone must not substitute for the visual evidence index');
});
