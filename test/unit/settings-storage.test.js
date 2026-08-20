import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDefaultSettings, createSettingsStorage } from '../../src/main/settings-storage.js';

async function temporaryDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'omniya-settings-'));
}

test('loads defaults when no settings file exists', async () => {
  const directory = await temporaryDirectory();
  const storage = createSettingsStorage(directory);

  const result = await storage.load();

  assert.equal(result.warning, null);
  assert.deepEqual(result.settings, createDefaultSettings());
  assert.equal(result.settings.nemethBrailleInputTable, 'none');
});

test('saves and loads a chosen table', async () => {
  const directory = await temporaryDirectory();
  const storage = createSettingsStorage(directory);

  const saved = await storage.save({ nemethBrailleInputTable: 'en-us-comp8' });
  const loaded = await storage.load();

  assert.match(saved.savedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(loaded.settings, { nemethBrailleInputTable: 'en-us-comp8' });
  assert.equal((await readdir(directory)).includes('settings.json.tmp'), false);
});

test('an unrecognized table value falls back to none instead of throwing', async () => {
  const directory = await temporaryDirectory();
  const storage = createSettingsStorage(directory);

  await storage.save({ nemethBrailleInputTable: 'not-a-real-table' });
  const loaded = await storage.load();

  assert.equal(loaded.settings.nemethBrailleInputTable, 'none');
});

test('preserves corrupt data and returns usable default settings', async () => {
  const directory = await temporaryDirectory();
  await writeFile(path.join(directory, 'settings.json'), '{not json', 'utf8');
  const storage = createSettingsStorage(directory);

  const result = await storage.load();
  const files = await readdir(directory);

  assert.deepEqual(result.settings, createDefaultSettings());
  assert.match(result.warning, /could not be read/i);
  const recovery = files.find((name) => name.startsWith('settings.corrupt-'));
  assert.ok(recovery);
});

test('serializes concurrent saves and leaves the newest setting intact', async () => {
  const directory = await temporaryDirectory();
  const storage = createSettingsStorage(directory);

  await Promise.all([
    storage.save({ nemethBrailleInputTable: 'none' }),
    storage.save({ nemethBrailleInputTable: 'en-us-comp8' })
  ]);

  assert.deepEqual((await storage.load()).settings, { nemethBrailleInputTable: 'en-us-comp8' });
  assert.equal((await readdir(directory)).some((name) => name.endsWith('.tmp')), false);
});
