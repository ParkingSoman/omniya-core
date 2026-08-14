import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from './launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function launch(prefix = 'omniya-ueb-cmd-') {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({ OMNIYA_TEST_USER_DATA_DIR: dataDirectory })
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  return { app, page };
}

async function openComposer(page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.locator('#composer-source').waitFor();
  await page.locator('#composer-source').focus();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source');
}

async function enterCommand(page) {
  await page.keyboard.press('Control+[');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
}

test('hides notes UI after launch and Add item', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-notes-hide-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  assert.equal(await page.locator('#note-toggle').isVisible(), false);
  assert.equal(await page.locator('#note-row').isVisible(), false);
});

test('Ctrl+[ enters Command; Escape cancels composer', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-cmd-chord-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await page.keyboard.type('hello');
  await page.keyboard.press('Control+[');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  await page.keyboard.press('Escape');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Add item' }).waitFor();
  assert.equal(await page.locator('article.napkin-article').count(), 0);
});

test('composer has Command button; replacement dock stays hidden', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-cmd-btn-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await page.getByRole('button', { name: 'Command' }).waitFor();
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
  await page.getByRole('button', { name: 'Command' }).click();
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
});

test('command t then insert submits text with a UEB braille label', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-text-submit-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('t');
  await page.keyboard.type('i');
  await page.waitForFunction(() => /Insert/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  await page.locator('#composer-source').fill('hello world');
  await page.keyboard.press('Control+[');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  await page.keyboard.type('n');

  const article = page.locator('article.napkin-article').filter({ hasText: 'hello world' }).first();
  await article.waitFor();
  const labeled = article.locator('[aria-braillelabel]');
  await labeled.first().waitFor({ timeout: 15_000 });
  const labels = await labeled.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-braillelabel') ?? ''));
  assert.ok(labels.some((label) => /⠓/.test(label)), `expected UEB ⠓ on a descendant, got ${JSON.stringify(labels)}`);
});

test('command x cycles authoring method while the composer is empty', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-x-cycle-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('x');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  assert.equal(await page.evaluate(() => document.querySelector('#mode-switch input:checked')?.value), 'equation');

  await page.keyboard.type('x');
  await page.waitForFunction(() => /Equation · LaTeX/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));

  await page.keyboard.type('x');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
});

test('command s focuses mode panel', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-s-focus-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('s');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'mode-panel');
  assert.match(await page.locator('#mode-panel').textContent(), /Command/i);
});

test('mode panel is quiet and command ? help lists x and s', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-help-quiet-');
  t.after(() => app.close().catch(() => {}));

  const mode = await page.locator('#mode-panel').evaluate((el) => ({
    id: el.id,
    live: el.getAttribute('aria-live'),
    role: el.getAttribute('role'),
    tabIndex: el.tabIndex
  }));
  assert.equal(mode.live, null);
  assert.notEqual(mode.role, 'status');
  assert.equal(mode.tabIndex, -1);

  const save = await page.locator('#save-status').evaluate((el) => ({
    live: el.getAttribute('aria-live'),
    role: el.getAttribute('role')
  }));
  assert.equal(save.live, null);
  assert.notEqual(save.role, 'status');

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard help' });
  await dialog.waitFor();
  const help = await page.locator('#keyboard-help [data-command-help]').innerText();
  assert.match(help ?? '', /Command · Text · UEB G2/i);
  assert.match(help ?? '', /\bx\b/i);
  assert.match(help ?? '', /\bs\b/i);
  assert.match(help ?? '', /Ctrl\+\[/i);
  assert.match(help ?? '', /Escape cancels/i);
  assert.doesNotMatch(help ?? '', /Escape enters Command/i);
  assert.doesNotMatch(help ?? '', /\bq\b.*cancel/i);
  assert.doesNotMatch(help ?? '', /make Equation \(Nemeth\).*e\b/i);
});

test('replacement Escape cancels dock; lowercase a rejected in Nemeth', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-repl-escape-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('x'); // Equation Nemeth
  await page.keyboard.type('n'); // Command submit empty equation → opens replacement dock
  await page.locator('#replacement-dock:not([hidden])').waitFor();
  await page.locator('#replacement-input').waitFor();
  await page.locator('#replacement-input').focus();

  await page.keyboard.type('a'); // lowercase — not an ASCII braille cell
  assert.equal(await page.locator('#replacement-input').inputValue(), '');
  assert.match(await page.locator('#replacement-status').textContent(), /braille cells only|LaTeX|Command x/i);

  await page.keyboard.press('Escape');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Add item' }).waitFor();
});
