import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { addEquationViaComposer, chooseType, electronLaunchEnv, waitForDocumentComposer } from './launch-electron.js';

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
  await page.locator('#composer-source').waitFor();
  await page.locator('#composer-source').focus();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source');
}

async function enterCommand(page) {
  await page.keyboard.press('Control+[');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
}

// Nemeth authoring was torn out in the nemeth-v2 rewrite (Task 0); Task 5
// re-adds it along with the tests that exercised it. Only tests that never
// depend on a working Nemeth draft (mode/UI plumbing, empty-draft rejection,
// pure LaTeX replacement) survive here.

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

test('empty equation submit refuses without opening replacement dock', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-unified-empty-eq-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('x');
  await page.keyboard.type('n');
  await page.waitForFunction(() => /Enter Nemeth or LaTeX/i.test(document.querySelector('#composer-error')?.textContent ?? ''));
  assert.equal(await page.locator('#composer-dock').isVisible(), true);
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
  assert.equal(await page.locator('article.napkin-article').count(), 0);
});

test('r opens unified composer for subtree replace', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-unified-e-');
  t.after(() => app.close().catch(() => {}));
  const article = await addEquationViaComposer(page, { method: 'latex', source: 'x+1' });
  const beforeTokens = await article.locator('math').evaluate((node) =>
    [...node.querySelectorAll('mi, mn, mo')].map((el) => el.textContent).join('|')
  );
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current));
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor();
  assert.equal(await page.locator('#composer-source').isVisible(), true);
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
  assert.match(await page.locator('#mode-panel').textContent() ?? '', /replacing/i);
  await page.keyboard.press('Control+[');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  await page.keyboard.type('t');
  await page.waitForFunction(() => /Can't switch to Text|Equation/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  assert.doesNotMatch(await page.locator('#mode-panel').textContent() ?? '', /Text · UEB/i);
  await page.keyboard.press('Escape');
  await waitForDocumentComposer(page);
  const afterTokens = await article.locator('math').evaluate((node) =>
    [...node.querySelectorAll('mi, mn, mo')].map((el) => el.textContent).join('|')
  );
  assert.equal(afterTokens, beforeTokens);
  assert.equal(afterTokens, 'x|+|1');
});

test('a opens append composer on a focused equation', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-unified-append-');
  t.after(() => app.close().catch(() => {}));
  const article = await addEquationViaComposer(page, { method: 'latex', source: 'x^3' });
  await article.focus();
  await page.keyboard.press('a');
  await page.locator('#composer-dock').waitFor();
  assert.match(await page.locator('#composer-heading').textContent(), /Appending after/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
});
