import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createStorage } from '../../src/main/storage.js';

async function temporaryDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'omniya-storage-'));
}

test('loads a fresh default state when no data file exists', async () => {
  const directory = await temporaryDirectory();
  const storage = createStorage(directory, { idFactory: () => 'napkin-1' });

  const result = await storage.load();

  assert.equal(result.warning, null);
  assert.equal(result.state.activeNapkinId, 'napkin-1');
});

test('saves and loads a validated state', async () => {
  const directory = await temporaryDirectory();
  const storage = createStorage(directory, { idFactory: () => 'napkin-1' });
  const { state } = await storage.load();

  const saved = await storage.save(state);
  const loaded = await storage.load();

  assert.match(saved.savedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(loaded.state, state);
  assert.equal(loaded.warning, null);
  assert.equal((await readdir(directory)).includes('napkins.json.tmp'), false);
});

test('opens and saves a named napkin file', async () => {
  const directory = await temporaryDirectory();
  const storage = createStorage(directory, {
    fileName: 'review.napkin.json',
    idFactory: () => 'napkin-1'
  });
  const { state } = await storage.load();

  await storage.save(state);
  const files = await readdir(directory);

  assert.ok(files.includes('review.napkin.json'));
  assert.ok(!files.includes('review.napkin.json.tmp'));
  assert.deepEqual((await storage.load()).state, state);
});

test('rejects invalid state before writing', async () => {
  const directory = await temporaryDirectory();
  const storage = createStorage(directory);

  await assert.rejects(() => storage.save({ schemaVersion: 99 }), /Invalid application state/);
  assert.deepEqual(await readdir(directory), []);
});

test('preserves corrupt data and returns a usable default state', async () => {
  const directory = await temporaryDirectory();
  await writeFile(path.join(directory, 'napkins.json'), '{not json', 'utf8');
  const storage = createStorage(directory, { idFactory: () => 'recovered-napkin' });

  const result = await storage.load();
  const files = await readdir(directory);

  assert.equal(result.state.activeNapkinId, 'recovered-napkin');
  assert.match(result.warning, /could not be read/i);
  const recovery = files.find((name) => name.startsWith('napkins.corrupt-'));
  assert.ok(recovery);
  assert.equal(await readFile(path.join(directory, recovery), 'utf8'), '{not json');
});
