import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DOC_END,
  REDO,
  UNDO,
  focusDocument,
  getDoc,
  getMathNodes,
  launchApp,
  mathNodeLocator,
  paragraphTexts,
  press,
  settle
} from './launch-electron.js';

async function start(t, prefix, { seed } = {}) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  if (seed) await writeFile(path.join(dataDirectory, 'napkins.json'), seed, 'utf8');
  const session = await launchApp({ dataDirectory });
  t.after(() => session.electronApp.close().catch(() => {}));
  return { ...session, dataDirectory };
}

async function createNapkin(page, name) {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note name').fill(name);
  await page.getByRole('button', { name: 'Create note' }).click();
}

const rail = (page) => page.getByRole('complementary', { name: 'Notes' });

test('a v2 napkins.json opens as a document, the old file is kept, and the next save is schema 3', { timeout: 90_000 }, async (t) => {
  // The shape the app wrote before the document editor: a list of items, each
  // with a note, an equation under `math`.
  const v2 = JSON.stringify({
    schemaVersion: 2,
    activeNapkinId: 'napkin-old',
    napkins: [{
      id: 'napkin-old',
      name: 'Old napkin',
      selectedItemId: 'item-eq',
      items: [
        { id: 'item-text', type: 'text', source: 'Solve this', note: '', mathml: null },
        {
          id: 'item-eq',
          type: 'equation',
          source: 'x^2',
          note: 'Remember the sign.',
          math: {
            formatVersion: 2,
            mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math>',
            focus: null
          }
        }
      ]
    }]
  }, null, 2);
  const { page, dataDirectory } = await start(t, 'omniya-upgrade-v2-', { seed: `${v2}\n` });

  // Text is a paragraph, the equation is a math node, the note is its own paragraph.
  assert.deepEqual(await paragraphTexts(page), ['Solve this', '[math]', 'Remember the sign.']);
  assert.equal((await getMathNodes(page)).length, 1);
  assert.match((await getMathNodes(page))[0].attrs.mathml, /<msup/);
  await mathNodeLocator(page).first().locator('mjx-container').waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('#editor-host [contenteditable="true"]').getAttribute('aria-label'), 'Note text');
  assert.equal(await page.locator('#current-napkin-name').textContent(), 'Old napkin');
  assert.equal(await rail(page).getByRole('button', { name: 'Old napkin' }).count(), 1);
  assert.equal(await page.locator('#app-error').isVisible(), false, 'a clean upgrade shows no warning');

  // The old file is preserved beside the new one, byte for byte.
  const backups = (await readdir(dataDirectory)).filter((name) => /^napkins\.before-v3-\d+\.json$/.test(name));
  assert.equal(backups.length, 1, `expected one backup, found ${JSON.stringify(await readdir(dataDirectory))}`);
  assert.equal(await readFile(path.join(dataDirectory, backups[0]), 'utf8'), `${v2}\n`);

  await page.evaluate(() => globalThis.__omniyaTesting.flush());
  const saved = JSON.parse(await readFile(path.join(dataDirectory, 'napkins.json'), 'utf8'));
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.activeNapkinId, 'napkin-old');
  assert.equal(saved.napkins[0].items, undefined);
  assert.equal(saved.napkins[0].doc.content.length, 3);
  assert.equal(saved.napkins[0].doc.content[1].content[0].type, 'math');
  // The upgrade did not overwrite the backup.
  assert.equal(await readFile(path.join(dataDirectory, backups[0]), 'utf8'), `${v2}\n`);
});

test('each napkin keeps its own document, and undo does not cross napkins', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t, 'omniya-two-napkins-');

  await page.keyboard.type('alpha one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('alpha two');

  await createNapkin(page, 'Second napkin');
  assert.deepEqual(await paragraphTexts(page), [''], 'a new napkin is empty');
  await page.keyboard.type('beta');
  assert.deepEqual(await paragraphTexts(page), ['beta']);

  await rail(page).getByRole('button', { name: 'Untitled note' }).click();
  await page.waitForFunction(() => document.querySelector('#current-napkin-name')?.textContent === 'Untitled note');
  assert.deepEqual(await paragraphTexts(page), ['alpha one', 'alpha two']);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);

  // Undo history belongs to the document on screen. Napkin B's typing is not in
  // napkin A's history, and A's own history started when it was opened.
  await page.keyboard.press(UNDO);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['alpha one', 'alpha two'], 'undo after switching changes nothing');
  await page.keyboard.press(REDO);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['alpha one', 'alpha two']);

  await rail(page).getByRole('button', { name: 'Second napkin' }).click();
  await page.waitForFunction(() => document.querySelector('#current-napkin-name')?.textContent === 'Second napkin');
  assert.deepEqual(await paragraphTexts(page), ['beta'], 'B is as it was left');
  await page.keyboard.press(UNDO);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['beta']);

  // An edit after switching is undone on its own. A document opens with the
  // caret at its start, as in Word, so go to the end first.
  await press(page, DOC_END);
  await page.keyboard.press('Enter');
  await page.keyboard.type('more');
  assert.deepEqual(await paragraphTexts(page), ['beta', 'more']);
  await page.keyboard.press(UNDO);
  await settle(page);
  assert.notDeepEqual(await paragraphTexts(page), ['beta', 'more']);
  assert.equal((await paragraphTexts(page))[0], 'beta');

  // And A was never touched by any of it.
  await rail(page).getByRole('button', { name: 'Untitled note' }).click();
  await page.waitForFunction(() => document.querySelector('#current-napkin-name')?.textContent === 'Untitled note');
  assert.deepEqual(await paragraphTexts(page), ['alpha one', 'alpha two']);
});

test('renaming a napkin does not reset the open document or its undo history', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t, 'omniya-rename-keeps-doc-');

  await page.keyboard.type('first line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second line');
  const typed = ['first line', 'second line'];
  assert.deepEqual(await paragraphTexts(page), typed);
  const before = await getDoc(page);

  const button = rail(page).getByRole('button', { name: 'Untitled note' });
  await button.focus();
  await button.press('Control+u');
  await page.getByLabel('Note name').fill('Renamed napkin');
  await page.locator('#new-napkin-form').getByRole('button', { name: 'Rename note' }).click();
  await rail(page).getByRole('button', { name: 'Renamed napkin' }).waitFor();

  assert.deepEqual(await getDoc(page), before, 'the document is untouched');
  assert.equal(await page.locator('#editor-host [contenteditable="true"]').getAttribute('aria-label'), 'Note text');
  assert.equal(await page.locator('#current-napkin-name').textContent(), 'Renamed napkin');

  // The caret is where it was, and typing continues there.
  await focusDocument(page);
  await page.keyboard.type('!');
  assert.deepEqual(await paragraphTexts(page), ['first line', 'second line!']);

  // Undo still reaches back over the rename: the history was not reset.
  await page.keyboard.press(UNDO);
  await settle(page);
  assert.notDeepEqual(await paragraphTexts(page), ['first line', 'second line!']);
  await page.keyboard.press(UNDO);
  await settle(page);
  await page.keyboard.press(UNDO);
  await settle(page);
  assert.notDeepEqual(await paragraphTexts(page), typed, 'earlier typing can be undone too');
  await page.keyboard.press(REDO);
  await page.keyboard.press(REDO);
  await page.keyboard.press(REDO);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['first line', 'second line!']);
});
