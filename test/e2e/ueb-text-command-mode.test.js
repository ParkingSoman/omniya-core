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
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#save-status')?.textContent ?? ''));
}

test('hides notes UI after launch and Add item', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-notes-hide-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  assert.equal(await page.locator('#note-toggle').isVisible(), false);
  assert.equal(await page.locator('#note-row').isVisible(), false);
});

test('command t then insert submits text with a UEB braille label', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-text-submit-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('t');
  await page.keyboard.type('i');
  await page.waitForFunction(() => /Insert/i.test(document.querySelector('#save-status')?.textContent ?? ''));
  await page.locator('#composer-source').fill('hello world');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#save-status')?.textContent ?? ''));
  await page.keyboard.type('n');

  const article = page.locator('article.napkin-article').filter({ hasText: 'hello world' }).first();
  await article.waitFor();
  const labeled = article.locator('[aria-braillelabel]');
  await labeled.first().waitFor({ timeout: 15_000 });
  const labels = await labeled.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-braillelabel') ?? ''));
  assert.ok(labels.some((label) => /⠓/.test(label)), `expected UEB ⠓ on a descendant, got ${JSON.stringify(labels)}`);
});

test('command e cycles authoring method while the composer is empty', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-e-cycle-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('e');
  await page.waitForFunction(() => {
    const status = document.querySelector('#save-status')?.textContent ?? '';
    const method = document.querySelector('#replacement-method input:checked')?.value;
    return /Nemeth/i.test(status) && method === 'nemeth';
  });
  assert.equal(
    await page.evaluate(() => document.querySelector('#replacement-method input:checked')?.value),
    'nemeth'
  );

  await page.keyboard.press('Escape');
  await page.keyboard.type('e');
  await page.waitForFunction(() => {
    const status = document.querySelector('#save-status')?.textContent ?? '';
    const method = document.querySelector('#replacement-method input:checked')?.value;
    return /LaTeX/i.test(status) && method === 'latex';
  });
  assert.equal(
    await page.evaluate(() => document.querySelector('#replacement-method input:checked')?.value),
    'latex'
  );
});
