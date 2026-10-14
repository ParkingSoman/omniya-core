import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { editorRoot, focusDocument, insertEquation, launchApp, retitleNote, settle } from './launch-electron.js';

async function start(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-export-data-'));
  const exportDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-export-out-'));
  const app = await launchApp({ dataDirectory, env: { OMNIYA_TEST_EXPORT_DIR: exportDirectory } });
  t.after(() => app.electronApp.close().catch(() => {}));
  return { ...app, exportDirectory };
}

async function renameNote(page, name) {
  await retitleNote(page, name);
  await page.waitForFunction(
    (n) => document.querySelector('#napkin-list [aria-current="page"] .note-name')?.textContent.trim() === n, name);
}

/** A note with a sentence and an inline equation (x^2). */
async function writeSampleNote(page) {
  await focusDocument(page);
  await page.keyboard.type('Area is ');
  await insertEquation(page, { method: 'latex', source: 'x^2' });
  await page.keyboard.type(' for 5 < 6');
  await settle(page);
}

async function exportWith(page, buttonId) {
  await page.locator('#export-button').click();
  await page.locator('#export-dialog').waitFor({ state: 'visible' });
  await page.locator(buttonId).click();
  await page.locator('#export-dialog').waitFor({ state: 'hidden' });
}

const announcement = (page) => page.locator('#announcer');

test('Export opens a dialog focused on its heading; Escape closes it and returns focus', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await page.locator('#export-button').click();
  await page.locator('#export-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'export-heading');
  await page.keyboard.press('Escape');
  await page.locator('#export-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'export-button');
});

test('each format writes a file with the note name, the equation and an announcement', { timeout: 120_000 }, async (t) => {
  const { page, exportDirectory } = await start(t);
  await renameNote(page, 'Area note');
  await writeSampleNote(page);

  await exportWith(page, '#export-html');
  await page.waitForFunction(() => /Exported as/.test(document.querySelector('#announcer')?.textContent ?? ''));
  assert.match(await announcement(page).textContent(), /Exported as Area note\.html/);
  const html = await readFile(path.join(exportDirectory, 'Area note.html'), 'utf8');
  assert.match(html, /<!doctype html>/);
  assert.match(html, /<title>Area note<\/title>/);
  assert.match(html, /<h1>Area note<\/h1>/);
  assert.match(html, /<math\b/);
  assert.match(html, /Area is /);
  assert.match(html, /for 5 &lt; 6/);
  assert.ok(!html.includes('data-omniya'));

  await exportWith(page, '#export-latex');
  await page.waitForFunction(() => /\.tex/.test(document.querySelector('#announcer')?.textContent ?? ''));
  assert.match(await announcement(page).textContent(), /Exported as Area note\.tex/);
  const tex = await readFile(path.join(exportDirectory, 'Area note.tex'), 'utf8');
  assert.match(tex, /\\begin\{document\}/);
  assert.match(tex, /\\title\{Area note\}/);
  assert.ok(tex.includes('\\(x^2\\)'));
  assert.ok(tex.includes('Area is '));

  await exportWith(page, '#export-text');
  await page.waitForFunction(() => /\.txt/.test(document.querySelector('#announcer')?.textContent ?? ''));
  assert.match(await announcement(page).textContent(), /Exported as Area note\.txt/);
  const txt = await readFile(path.join(exportDirectory, 'Area note.txt'), 'utf8');
  assert.ok(txt.startsWith('Area note\n\n'));
  assert.ok(txt.includes('$x^2$'));
  assert.ok(txt.includes('5 < 6'));

  assert.deepEqual((await readdir(exportDirectory)).sort(), ['Area note.html', 'Area note.tex', 'Area note.txt']);
});

test('a note name with odd characters exports to a safe file name', { timeout: 90_000 }, async (t) => {
  const { page, exportDirectory } = await start(t);
  await renameNote(page, 'Plan: a/b?');
  await focusDocument(page);
  await page.keyboard.type('Some words');
  await settle(page);

  await exportWith(page, '#export-text');
  await page.waitForFunction(() => /Exported as/.test(document.querySelector('#announcer')?.textContent ?? ''));
  assert.match(await announcement(page).textContent(), /Exported as Plan ab\.txt/);
  assert.deepEqual(await readdir(exportDirectory), ['Plan ab.txt']);
  const txt = await readFile(path.join(exportDirectory, 'Plan ab.txt'), 'utf8');
  assert.ok(txt.startsWith('Plan: a/b?\n\n'), 'the title keeps the real note name');
});

test('File > Export note opens the dialog', { timeout: 90_000 }, async (t) => {
  const { electronApp, page } = await start(t);
  await electronApp.evaluate(({ Menu }) => {
    const find = (items) => {
      for (const item of items) {
        if (item.label === 'Export note…') return item;
        const inner = item.submenu ? find(item.submenu.items) : null;
        if (inner) return inner;
      }
      return null;
    };
    const item = find(Menu.getApplicationMenu().items);
    if (!item) throw new Error('Export note… not found in the menu');
    item.click();
  });
  await page.locator('#export-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'export-heading');
});

test('Print closes the dialog and leaves the page usable', { timeout: 90_000 }, async (t) => {
  const { page, exportDirectory } = await start(t);
  await page.locator('#export-button').click();
  await page.locator('#export-dialog').waitFor({ state: 'visible' });
  await page.locator('#export-print').click();
  await page.locator('#export-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#app-error').isVisible(), false);
  await focusDocument(page);
  await page.keyboard.type('still works');
  await settle(page);
  assert.match(await editorRoot(page).textContent(), /still works/);
  assert.deepEqual(await readdir(exportDirectory), []);
});

test('print style hides the chrome and keeps the note', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await writeSampleNote(page);
  await page.emulateMedia({ media: 'print' });
  for (const selector of ['#napkin-rail', '#toolbar']) {
    const display = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).display);
    assert.equal(display, 'none', `${selector} is hidden in print`);
  }
  assert.equal(await page.locator('#editor-host').isVisible(), true);
  assert.match(await editorRoot(page).textContent(), /Area is/);
  await page.emulateMedia({ media: 'screen' });
  const rail = await page.locator('#napkin-rail').evaluate((el) => getComputedStyle(el).display);
  assert.notEqual(rail, 'none');
});

test('the Export button is aria-disabled when there is no note', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  const button = page.locator('#export-button');
  assert.equal(await button.getAttribute('aria-disabled'), 'false');

  // Delete every note.
  for (let guard = 0; guard < 10; guard += 1) {
    if (await button.getAttribute('aria-disabled') === 'true') break;
    page.once('dialog', (dialog) => { void dialog.accept(); });
    await page.locator('#delete-button').click();
    await settle(page, 300);
  }
  assert.equal(await button.getAttribute('aria-disabled'), 'true');

  // Pressing it opens nothing.
  await button.click({ force: true });
  await settle(page);
  assert.equal(await page.locator('#export-dialog').isVisible(), false);
});
