import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from './launch-electron.js';

// The napkin editor works like a word processor. These tests are the cited
// rationale: each key is the one Word uses (see docs/word-editor.md).
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAC = process.platform === 'darwin';
const INSERT_EQUATION = MAC ? 'Control+Equal' : 'Alt+Equal';
const DOC_END = MAC ? 'Meta+ArrowDown' : 'Control+End';
const UNDO = 'ControlOrMeta+z';
const REDO = MAC ? 'Meta+Shift+z' : 'Control+y';

async function launch(dataDirectory) {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({ OMNIYA_TEST_USER_DATA_DIR: dataDirectory })
  });
  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await page.locator('#editor-host [contenteditable="true"]').waitFor();
  return { electronApp, page };
}

const doc = (page) => page.evaluate(() => globalThis.__omniyaTesting.editor.getJSON());
const paragraphTexts = async (page) => (await doc(page)).content.map((p) =>
  (p.content ?? []).map((n) => (n.type === 'text' ? n.text : '[math]')).join(''));
const settle = (page) => page.waitForTimeout(120);

async function insertLatexEquation(page, latex) {
  await page.keyboard.press(INSERT_EQUATION);
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source');
  await page.keyboard.press('Control+l');
  await page.locator('#composer-source').fill(latex);
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await page.locator('.math-node mjx-container').first().waitFor();
}

test('opens in the document, ready to type', { timeout: 60_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const { electronApp, page } = await launch(dataDirectory);
  t.after(() => electronApp.close().catch(() => {}));

  const editor = page.locator('#editor-host [contenteditable="true"]');
  assert.equal(await editor.getAttribute('role'), 'textbox');
  assert.equal(await editor.getAttribute('aria-multiline'), 'true');
  assert.equal(await editor.getAttribute('aria-label'), 'Untitled Napkin');
  assert.equal(await page.locator('#composer-dock').isVisible(), false, 'no equation dock until asked');
  assert.match(await page.locator('#mode-panel').textContent() ?? '', /Text · UEB G2/);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
});

test('typing, Enter for a new paragraph, undo and redo', { timeout: 60_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const { electronApp, page } = await launch(dataDirectory);
  t.after(() => electronApp.close().catch(() => {}));

  await page.keyboard.type('Let a be positive.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Then a + a is positive.');
  assert.deepEqual(await paragraphTexts(page), ['Let a be positive.', 'Then a + a is positive.']);

  await page.keyboard.press(UNDO);
  assert.notDeepEqual(await paragraphTexts(page), ['Let a be positive.', 'Then a + a is positive.']);
  await page.keyboard.press(REDO);
  assert.deepEqual(await paragraphTexts(page), ['Let a be positive.', 'Then a + a is positive.']);
});

test('Word\'s key inserts an equation at the caret, in the middle of a sentence', { timeout: 90_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const { electronApp, page } = await launch(dataDirectory);
  t.after(() => electronApp.close().catch(() => {}));

  await page.keyboard.type('Solve  for x.');
  for (let i = 0; i < 'Solve  for x.'.length - 'Solve '.length; i += 1) await page.keyboard.press('ArrowLeft');
  // The browser reports the caret to the editor just after each key.
  await settle(page);
  await insertLatexEquation(page, 'x^2');

  assert.deepEqual(await paragraphTexts(page), ['Solve [math] for x.']);
  const paragraph = (await doc(page)).content[0].content;
  const math = paragraph.find((n) => n.type === 'math');
  assert.equal(math.attrs.sourceKind, 'latex');
  assert.equal(math.attrs.source, 'x^2');
  assert.match(math.attrs.mathml, /<msup/);
  // The caret is back in the document, right after the equation.
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
  await page.keyboard.type('!');
  assert.deepEqual(await paragraphTexts(page), ['Solve [math]! for x.']);
});

test('one undo history covers typing and equations', { timeout: 90_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const { electronApp, page } = await launch(dataDirectory);
  t.after(() => electronApp.close().catch(() => {}));

  await page.keyboard.type('Area ');
  await insertLatexEquation(page, '\\pi r^2');
  assert.deepEqual(await paragraphTexts(page), ['Area [math]']);

  await page.keyboard.press(UNDO);
  assert.deepEqual(await paragraphTexts(page), ['Area ']);
  await page.keyboard.press(REDO);
  assert.deepEqual(await paragraphTexts(page), ['Area [math]']);
});

test('Escape cancels the equation field and returns to the document unchanged', { timeout: 60_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const { electronApp, page } = await launch(dataDirectory);
  t.after(() => electronApp.close().catch(() => {}));

  await page.keyboard.type('Before');
  await page.keyboard.press(INSERT_EQUATION);
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await page.keyboard.press('Control+l');
  await page.locator('#composer-source').fill('x');
  await page.keyboard.press('Escape');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
  assert.deepEqual(await paragraphTexts(page), ['Before']);
});

test('saves the document, and reloads it as the same document', { timeout: 120_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  let session = await launch(dataDirectory);
  t.after(() => session.electronApp.close().catch(() => {}));

  await session.page.keyboard.type('Keep ');
  await insertLatexEquation(session.page, 'a+b');
  await session.page.keyboard.type(' this');
  await session.page.evaluate(() => globalThis.__omniyaTesting.flush());

  const saved = JSON.parse(await readFile(path.join(dataDirectory, 'napkins.json'), 'utf8'));
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.napkins[0].items, undefined);
  const before = saved.napkins[0].doc;
  assert.equal(before.content[0].content[0].text, 'Keep ');
  assert.equal(before.content[0].content[1].type, 'math');

  await session.electronApp.close();
  session = await launch(dataDirectory);
  assert.deepEqual(await doc(session.page), before);
  await session.page.locator('.math-node mjx-container').first().waitFor();
});

test('Backspace after an equation selects it, a second Backspace deletes it, undo restores it', { timeout: 90_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const { electronApp, page } = await launch(dataDirectory);
  t.after(() => electronApp.close().catch(() => {}));

  await insertLatexEquation(page, 'y');
  await page.keyboard.press('Backspace');
  await settle(page);
  assert.equal(await page.locator('.math-node-selected, .ProseMirror-selectednode').count(), 1, 'first Backspace selects');
  assert.deepEqual(await paragraphTexts(page), ['[math]']);
  await page.keyboard.press('Backspace');
  assert.deepEqual(await paragraphTexts(page), ['']);
  await page.keyboard.press(UNDO);
  assert.deepEqual(await paragraphTexts(page), ['[math]']);
  assert.ok(DOC_END);
});

test('inserting an equation is confirmed through a polite live region', { timeout: 90_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const { electronApp, page } = await launch(dataDirectory);
  t.after(() => electronApp.close().catch(() => {}));

  const announcer = page.locator('#announcer');
  assert.equal(await announcer.getAttribute('role'), 'status');
  assert.equal(await announcer.getAttribute('aria-live'), 'polite');
  // Focus moves from the equation field back to the document, so a reader
  // needs a spoken confirmation of what just happened.
  await insertLatexEquation(page, 'z');
  await page.waitForFunction(() => document.querySelector('#announcer')?.textContent === 'Equation inserted');
});
