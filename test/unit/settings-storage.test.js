import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDefaultSettings, createSettingsStorage } from '../../src/main/settings-storage.js';

async function temporaryDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'omniya-settings-'));
}

test('loads empty defaults when no settings file exists', async () => {
  // The store deliberately persists nothing right now: the braille input table
  // it used to hold is measured rather than configured. What is being pinned
  // here is that an absent file is a normal first run, not an error.
  const directory = await temporaryDirectory();
  const storage = createSettingsStorage(directory);

  const result = await storage.load();

  assert.equal(result.warning, null);
  assert.deepEqual(result.settings, createDefaultSettings());
  assert.deepEqual(result.settings, {});
});

test('a settings file from an older build loads cleanly instead of erroring', async () => {
  // Real upgrade path: anyone who used the input-table picker has
  // `nemethBrailleInputTable` on disk. A retired key must be dropped, not
  // treated as corruption -- otherwise upgrading looks like data loss.
  const directory = await temporaryDirectory();
  await writeFile(
    path.join(directory, 'settings.json'),
    JSON.stringify({ nemethBrailleInputTable: 'en-us-comp8' }),
    'utf8'
  );
  const storage = createSettingsStorage(directory);

  const result = await storage.load();

  assert.equal(result.warning, null, 'a retired key is not corruption');
  assert.deepEqual(result.settings, {});
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

test('concurrent saves serialize and leave no temp file behind', async () => {
  // The atomic-write behaviour is why this module is kept even with nothing to
  // store yet: `uebGrade` is the known next occupant.
  const directory = await temporaryDirectory();
  const storage = createSettingsStorage(directory);

  await Promise.all([storage.save({}), storage.save({})]);

  assert.deepEqual((await storage.load()).settings, {});
  assert.equal((await readdir(directory)).some((name) => name.endsWith('.tmp')), false);
});
