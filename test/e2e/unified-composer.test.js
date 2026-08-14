import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { chooseType, electronLaunchEnv } from './launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function launch(prefix = 'omniya-unified-') {
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

test('command x keeps composer-source visible', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-unified-x-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('x');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  assert.equal(await page.locator('#composer-source').isVisible(), true);
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
  assert.match(await page.locator('#composer-source').getAttribute('class') ?? '', /nemeth-inline-editor/);
  const help = await page.locator('#composer-help').textContent();
  assert.doesNotMatch(help ?? '', /opens the replacement writer/i);
});

test('Equation radio keeps composer-source visible', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-unified-radio-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await chooseType(page, 'equation');
  assert.equal(await page.locator('#composer-source').isVisible(), true);
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
});

test('equation Nemeth in composer commits without replacement dock', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-unified-nemeth-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('x'); // Equation Nemeth
  await page.keyboard.type('i');
  await page.locator('#composer-source').focus();
  // Immediate letter.x cell — same fixture used by inline-editing / replacement-session tests.
  await page.keyboard.type('⠭');
  await page.keyboard.press('Control+[');
  await page.keyboard.type('n');
  await page.locator('article.napkin-article').first().waitFor({ timeout: 15_000 });
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
  assert.equal(await page.locator('#composer-dock').isVisible(), false);
});
