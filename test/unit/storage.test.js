import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createInitialState, setNapkinDoc } from '../../src/domain/model.js';
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

test('serializes concurrent saves and leaves the newest state intact', async () => {
  const directory = await temporaryDirectory();
  const storage = createStorage(directory, { idFactory: () => 'napkin-1' });
  const first = createInitialState({ idFactory: () => 'napkin-1' });
  const second = setNapkinDoc(first, 'napkin-1', {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second save' }] }]
  });

  await Promise.all([storage.save(first), storage.save(second)]);

  assert.deepEqual((await storage.load()).state, second);
  assert.equal((await readdir(directory)).some((name) => name.endsWith('.tmp')), false);
});

test('upgrades an older file in memory and keeps a copy of the original', async () => {
  const directory = await temporaryDirectory();
  const v2 = {
    schemaVersion: 2,
    activeNapkinId: 'n1',
    napkins: [{ id: 'n1', name: 'Old', selectedItemId: null, items: [
      { id: 't1', type: 'text', source: 'written long ago', note: '', mathml: null }
    ] }]
  };
  const original = JSON.stringify(v2);
  await writeFile(path.join(directory, 'napkins.json'), original, 'utf8');
  const storage = createStorage(directory);

  const { state, warning } = await storage.load();

  assert.equal(warning, null);
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.napkins[0].doc.content[0].content[0].text, 'written long ago');
  const files = await readdir(directory);
  const backup = files.find((name) => name.startsWith('napkins.before-v3-'));
  assert.ok(backup, 'a backup copy of the old file exists');
  assert.equal(await readFile(path.join(directory, backup), 'utf8'), original);
  // The file on disk is still the old one until the next save.
  assert.equal(await readFile(path.join(directory, 'napkins.json'), 'utf8'), original);
});

test('does not make a backup when the file is already current', async () => {
  const directory = await temporaryDirectory();
  const storage = createStorage(directory, { idFactory: () => 'napkin-1' });
  await storage.save((await storage.load()).state);

  await storage.load();

  assert.equal((await readdir(directory)).some((name) => name.includes('before-v')), false);
});
