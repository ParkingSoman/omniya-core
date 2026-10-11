/**
 * Keys typed OUTSIDE an equation must not be claimed by the equation explorer.
 *
 * Both cases come from one alpha report. After exploring an equation, the
 * contributor could not name a new napkin ("it would always say I had to name
 * the file, and the name I typed in wasn't showing up") and could not delete an
 * equation they had written ("including pressing backspace and control z").
 * Their diagnostics dump showed the answer from the other side: their typing
 * was arriving in a field they had not put focus in.
 *
 * The two bugs are separate but share a cause -- the explorer outliving the
 * focus it describes -- so they are covered together.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  chooseMethod,
  enterExplorer,
  explorerSpeech,
  getDoc,
  insertEquation,
  launchApp,
  mathNodeLocator,
  paragraphTexts,
  settle,
  UNDO
} from './launch-electron.js';

async function launch(t, prefix) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const { electronApp, page } = await launchApp({ dataDirectory });
  t.after(() => electronApp.close().catch(() => {}));
  return { electronApp, page };
}

const activeId = (page) => page.evaluate(() => document.activeElement?.id);

test('a napkin name typed after exploring an equation reaches the name field', { timeout: 120_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-explored-name-');
  await insertEquation(page, { method: 'latex', source: 'x+1' });
  await enterExplorer(page);

  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').waitFor();
  // "Algebra" leads with a, and also carries r -- two of the letters the
  // explorer claims for append and replace.
  await page.keyboard.type('Algebra');

  assert.equal(await page.locator('#napkin-name').inputValue(), 'Algebra', 'every letter of the name reaches the name field');
  assert.equal(await activeId(page), 'napkin-name', 'and focus stays in it');
  assert.equal(await page.locator('#composer-dock').isVisible(), false, 'no equation dock opened');
  assert.equal(await page.locator('#composer-source').inputValue(), '', 'nothing leaks into the equation field');
  assert.deepEqual(await paragraphTexts(page), ['[math]'], 'nor into the document');
});

test('the explorer keys r, a and o are plain letters in the equation field', { timeout: 120_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-explored-dock-field-');
  await insertEquation(page, { method: 'latex', source: 'x+1' });
  await enterExplorer(page);
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await chooseMethod(page, 'latex');
  const heading = await page.locator('#composer-heading').textContent();

  await page.keyboard.type('roar');
  assert.equal(await page.locator('#composer-source').inputValue(), 'roar');
  assert.equal(await page.locator('#composer-heading').textContent(), heading, 'the dock was not reopened on another scope');

  // Backspace edits the field. It must not delete the equation behind it.
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('#composer-source').inputValue(), 'roa');
  assert.equal(await mathNodeLocator(page).count(), 1);
  assert.equal(await activeId(page), 'composer-source');
});

test('Backspace deletes the equation being explored, and undo brings it back', { timeout: 120_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-explored-delete-');
  await insertEquation(page, { method: 'latex', source: 'x+1' });
  assert.equal(await mathNodeLocator(page).count(), 1);

  await enterExplorer(page);
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.querySelectorAll('#editor-host .math-node').length === 0);
  assert.deepEqual(await paragraphTexts(page), [''], 'the explored equation is deleted');

  // The editor takes the keys again, and undo is the document's own.
  await page.evaluate(() => globalThis.__omniyaTesting.editor.focus());
  await settle(page);
  await page.keyboard.press(UNDO);
  await page.waitForFunction(() => document.querySelectorAll('#editor-host .math-node').length === 1);
  assert.deepEqual(await paragraphTexts(page), ['[math]']);
});

test('Ctrl+Z inside the explorer undoes the last document change and returns to the document', { timeout: 120_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-explored-undo-');
  await page.keyboard.type('Keep ');
  await insertEquation(page, { method: 'latex', source: 'x+1' });
  await enterExplorer(page);

  await page.keyboard.press(UNDO);
  await page.waitForFunction(() => document.querySelectorAll('#editor-host .math-node').length === 0);
  assert.deepEqual(await paragraphTexts(page), ['Keep ']);
  assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('#editor-host'))), true, 'focus is back in the document');
  await page.keyboard.type('more');
  assert.deepEqual(await paragraphTexts(page), ['Keep more'], 'and typing goes into the text');
});

test('Ctrl+Z after an equation is inserted takes the equation back, in one step', { timeout: 120_000 }, async (t) => {
  // From the same alpha thread: "pressing backspace and control z didn't erase
  // the expression I'd written". The equation field now closes on Enter and the
  // caret is in the document, so the document's own undo reaches it.
  const { page } = await launch(t, 'omniya-uncommit-undo-');
  await insertEquation(page, { method: 'nemeth', source: '⠼⠆⠬⠆' });
  assert.deepEqual(await paragraphTexts(page), ['[math]']);
  assert.equal(await page.locator('#composer-dock').isVisible(), false);

  await page.keyboard.press(UNDO);
  assert.deepEqual(await paragraphTexts(page), ['']);
  assert.equal((await getDoc(page)).content.length, 1);
});

test('the diagnostics report shows a napkin name reaching the name field', { timeout: 120_000 }, async (t) => {
  // The report went silent the moment focus left the equation field, so the
  // half of the session that contained the bug was simply absent from two alpha
  // reports. Whatever the app does with these keys, the report has to be able
  // to say where they went.
  const { page } = await launch(t, 'omniya-report-fields-');

  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').waitFor();
  await page.keyboard.type('Algebra');

  const report = await page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());
  assert.match(report, /-- typing into: napkin-name/, 'the name field is recorded and named');
  assert.match(report, /keydown key="A"/, 'and its keystrokes are in the report at all');
});

test('nothing pulls focus out of the new-napkin form while it is open', { timeout: 120_000 }, async (t) => {
  // A guard, not a fix for one path. Three alpha reports of "I couldn't make a
  // new napkin, what I typed never appeared" all reduce to something in the app
  // moving focus out of the name field while the person was typing into it. The
  // form is the one place where a stolen focus is silent and unrecoverable for
  // someone who cannot see, so programmatic focus is refused wholesale while it
  // is up.
  //
  // The Insert > Equation menu is a real app path that ends in
  // composer-source.focus(). It reaches the page as a menu command.
  const { electronApp, page } = await launch(t, 'omniya-focus-guard-');
  await insertEquation(page, { method: 'latex', source: 'x+1' });

  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').waitFor();
  await page.keyboard.type('Alg');

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { action: 'insert-equation' });
  });
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await settle(page, 300);

  assert.equal(await activeId(page), 'napkin-name', 'focus stays where the person put it');
  await page.keyboard.type('ebra');
  assert.equal(await page.locator('#napkin-name').inputValue(), 'Algebra', 'and the whole name lands');
  assert.equal(await page.locator('#composer-source').inputValue(), '', 'nothing lands in the equation field');
});

test('the form still hands focus on when the person closes it', { timeout: 120_000 }, async (t) => {
  // The guard must not outlive the form, or Cancel strands focus on nothing.
  const { page } = await launch(t, 'omniya-focus-guard-cancel-');
  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await activeId(page), 'new-napkin-button');

  await page.locator('#new-napkin-button').click();
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#new-napkin-form')?.hidden === true);
  await page.waitForFunction(() => Boolean(document.activeElement?.closest('#editor-host')));
  assert.equal(await page.locator('#current-napkin-name').textContent(), 'Second');
});
