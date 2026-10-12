import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { enterExplorer, insertEquation, launchApp, paragraphTexts, settle } from './launch-electron.js';

// On Mac and Windows the Edit menu owns Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or
// Ctrl+Y). The key never reaches the page: the menu item runs instead. A menu
// built from Electron's stock `editMenu` role runs the browser's own undo, which
// does not know the editor's history, so undo failed for a person using the real
// app while every test that pressed the key inside the page passed. These tests
// choose the menu item itself.
async function startSession(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-menu-undo-e2e-'));
  const session = await launchApp({ dataDirectory });
  t.after(() => session.electronApp.close().catch(() => {}));
  return session;
}

/** Choose Edit > Undo or Edit > Redo from the application menu. */
const chooseMenuItem = (electronApp, id) => electronApp.evaluate(({ Menu }, itemId) => {
  const item = Menu.getApplicationMenu().getMenuItemById(itemId);
  if (!item) throw new Error(`No menu item ${itemId}`);
  item.click();
}, id);
const menuUndo = (electronApp) => chooseMenuItem(electronApp, 'undo');
const menuRedo = (electronApp) => chooseMenuItem(electronApp, 'redo');

test('Edit > Undo and Redo undo and redo typing', { timeout: 60_000 }, async (t) => {
  const { electronApp, page } = await startSession(t);

  await page.keyboard.type('Let a be positive.');
  await settle(page, 700);
  await page.keyboard.type(' Then more.');
  assert.deepEqual(await paragraphTexts(page), ['Let a be positive. Then more.']);

  await menuUndo(electronApp);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['Let a be positive.']);

  await menuRedo(electronApp);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['Let a be positive. Then more.']);
});

test('Edit > Undo takes an equation back, and Redo puts it back', { timeout: 90_000 }, async (t) => {
  const { electronApp, page } = await startSession(t);

  await page.keyboard.type('Area ');
  await insertEquation(page, { source: '\\pi r^2' });
  assert.deepEqual(await paragraphTexts(page), ['Area [math]']);

  await menuUndo(electronApp);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['Area ']);

  await menuRedo(electronApp);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['Area [math]']);
});

test('Edit > Undo in the equation field edits the field, not the document', { timeout: 60_000 }, async (t) => {
  const { electronApp, page } = await startSession(t);

  await page.keyboard.type('Keep this');
  await page.keyboard.press(process.platform === 'darwin' ? 'Control+Equal' : 'Alt+Equal');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await page.keyboard.type('x^2');
  await menuUndo(electronApp);
  await settle(page);

  assert.deepEqual(await paragraphTexts(page), ['Keep this'], 'the document is untouched');
});

test('Undo from the menu works while an equation is being read by parts', { timeout: 90_000 }, async (t) => {
  const { electronApp, page } = await startSession(t);

  await insertEquation(page, { source: 'a+b' });
  await enterExplorer(page, 0);
  await menuUndo(electronApp);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['']);

  await menuRedo(electronApp);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['[math]']);
});
