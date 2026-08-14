/**
 * Headed coherent writing demo: work a definite-integral problem across
 * napkin items — author ∫ with bounds, recover with Backspace, revisit via
 * Explorer+E, then write the antiderivative informed by prior work.
 *
 * Watch with: npm run test:demo:thought
 * Kept outside test/e2e so default CI e2e stays headless and fast.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from '../e2e/launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Short enough to watch end-to-end without dragging; dense integral beats. */
const PAUSE_MS = 220;
const BEAT_MS = 400;

async function pause(page, ms = PAUSE_MS) {
  await page.waitForTimeout(ms);
}

async function launch() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-thought-demo-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({
      OMNIYA_TEST_USER_DATA_DIR: dataDirectory,
      OMNIYA_HEADLESS: '0'
    })
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  return { app, page, dataDirectory };
}

async function addTextItem(page, text) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('radio', { name: 'Text' }).check();
  await page.getByLabel('Content', { exact: true }).fill(text);
  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await pause(page, BEAT_MS);
}

async function addBlankEquation(page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('radio', { name: 'Equation' }).check();
  await page.getByLabel('Content', { exact: true }).press('Enter');
  await page.locator('#replacement-dock').waitFor();
  await pause(page, BEAT_MS);
  return page.locator('article.napkin-article').last();
}

async function feedCells(page, cells) {
  const input = page.getByLabel('Replacement input', { exact: true });
  for (const cell of cells) {
    await input.fill(cell);
    await pause(page);
  }
}

async function submitReplacement(page) {
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await pause(page, BEAT_MS);
}

async function focusArticle(page, index) {
  const article = page.locator('article.napkin-article').nth(index);
  await article.click();
  await article.focus();
  await pause(page);
  return article;
}

async function enterExplore(page, article) {
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current),
    null,
    { timeout: 15_000 }
  );
  await pause(page);
}

async function leaveExplore(page) {
  await page.keyboard.press('Escape');
  await pause(page);
}

async function openBoundReplacement(page, article, { arrowRights = 1, labelHint = /lower|a|underscript/i } = {}) {
  await enterExplore(page, article);
  await page.keyboard.press('ArrowDown');
  await pause(page);
  for (let i = 0; i < arrowRights; i += 1) {
    await page.keyboard.press('ArrowRight');
    await pause(page);
  }
  await page.waitForFunction((pattern) => {
    const label = document.querySelector('mjx-speech')?.getAttribute('aria-label') ?? '';
    return new RegExp(pattern, 'i').test(label);
  }, typeof labelHint === 'string' ? labelHint : labelHint.source);
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await pause(page, BEAT_MS);
}

async function articleMathML(article) {
  return article.locator('math').evaluate((node) => node.outerHTML);
}

async function boundChildren(article) {
  return article.locator('math > msubsup > *').evaluateAll((nodes) => nodes.map((node) => node.textContent));
}

test('thought-stream demo: definite integral scratch across napkin items', { timeout: 90_000 }, async (t) => {
  const started = Date.now();
  const { app, page } = await launch();
  t.after(() => app.close().catch(() => {}));

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Integral scratch');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  await pause(page);
  assert.equal(await page.getByRole('button', { name: 'Integral scratch' }).count(), 1);

  // Beat 1: problem statement
  await addTextItem(page, 'evaluate ∫_0^1 of 2x dx');

  // Beat 2: author ∫_a^b with a mistaken cell, Backspace, then finish bounds
  const equationA = await addBlankEquation(page);
  await feedCells(page, ['⠮']);
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('operator.integral'));
  await feedCells(page, ['⠽']);
  await page.getByLabel('Replacement input', { exact: true }).press('Backspace');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('Undid last Nemeth input'));
  await feedCells(page, ['⠰', '⠁', '⠘', '⠃']);
  await page.waitForFunction(() => document.querySelector('article.napkin-article:last-of-type math > msubsup') !== null);
  await submitReplacement(page);
  assert.deepEqual(await boundChildren(equationA), ['∫', 'a', 'b']);

  // Beat 3: read lower bound, E-replace a → 0
  await focusArticle(page, 1);
  await openBoundReplacement(page, equationA, { arrowRights: 1, labelHint: /underscript|a/i });
  await feedCells(page, ['⠼', '⠴']);
  await submitReplacement(page);
  assert.deepEqual(await boundChildren(equationA), ['∫', '0', 'b']);

  // Beat 4: read upper bound, E-replace b → 1
  await focusArticle(page, 1);
  await openBoundReplacement(page, equationA, { arrowRights: 2, labelHint: /overscript|b|1|upper/i });
  await feedCells(page, ['⠼', '⠂']);
  await submitReplacement(page);
  assert.deepEqual(await boundChildren(equationA), ['∫', '0', '1']);

  // Beat 5: antiderivative of 2x is x^2 — written after reading the integral setup
  await leaveExplore(page).catch(() => {});
  const equationB = await addBlankEquation(page);
  await feedCells(page, ['⠭', '⠘', '⠆']);
  await submitReplacement(page);
  assert.match(await articleMathML(equationB), /<msup[\s\S]*<mi[^>]*>x<\/mi>[\s\S]*<mn[^>]*>2<\/mn>/);

  // Beat 6: evaluated difference F(1)-F(0) = 1
  const equationC = await addBlankEquation(page);
  await feedCells(page, ['⠼', '⠂']);
  await submitReplacement(page);
  assert.match(await articleMathML(equationC), /<mn[^>]*>1<\/mn>/);

  const articles = page.locator('article.napkin-article');
  assert.equal(await articles.count(), 4);
  assert.match(await articles.nth(0).textContent(), /∫|2x|dx/i);

  const elapsedMs = Date.now() - started;
  assert.ok(elapsedMs <= 60_000, `demo exceeded 60s (${elapsedMs}ms)`);
});
