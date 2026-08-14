/**
 * Headed coherent writing demo: work a short derivative problem across
 * multiple napkin items, reading earlier equations before writing later ones.
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
const PAUSE_MS = 600;
const BEAT_MS = 1100;

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

async function articleMathML(article) {
  return article.locator('math').evaluate((node) => node.outerHTML);
}

test('thought-stream demo: differentiate x^2+3x across napkin items', { timeout: 120_000 }, async (t) => {
  const started = Date.now();
  const { app, page } = await launch();
  t.after(() => app.close().catch(() => {}));

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Derivative scratch');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  await pause(page);
  assert.equal(await page.getByRole('button', { name: 'Derivative scratch' }).count(), 1);

  // Beat 1: problem statement
  await addTextItem(page, 'find dy/dx for y = x^2 + 3x');

  // Beat 2: Equation A = x^2+3x, with Backspace recovery after a wrong letter
  const equationA = await addBlankEquation(page);
  await feedCells(page, ['⠭']);
  await page.waitForFunction(() => document.querySelector('article.napkin-article:last-of-type math mi')?.textContent === 'x');
  await feedCells(page, ['⠽']);
  await page.waitForFunction(() => document.querySelectorAll('article.napkin-article:last-of-type math mi').length >= 2);
  await page.getByLabel('Replacement input', { exact: true }).press('Backspace');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('Undid last Nemeth input'));
  assert.equal(await equationA.locator('math mi').count(), 1);
  await feedCells(page, ['⠘', '⠆', '⠐', '⠬', '⠼', '⠒', '⠭']);
  await submitReplacement(page);
  const mathA = await articleMathML(equationA);
  assert.match(mathA, /<msup[\s\S]*<mi[^>]*>x<\/mi>[\s\S]*<mn[^>]*>2<\/mn>/);
  assert.match(mathA, /<mo[^>]*>\+<\/mo>/);
  assert.match(mathA, /<mn[^>]*>3<\/mn>/);

  // Beat 3: re-enter A and explore the powered term (read prior work)
  await focusArticle(page, 1);
  await enterExplore(page, equationA);
  await page.keyboard.press('ArrowDown');
  await pause(page);
  await leaveExplore(page);

  // Beat 4: Equation B = 2x (derivative of first term)
  const equationB = await addBlankEquation(page);
  await feedCells(page, ['⠼', '⠆', '⠭']);
  await submitReplacement(page);
  assert.match(await articleMathML(equationB), /2/);
  assert.match(await articleMathML(equationB), /x/);

  // Beat 5: return to A, explore again before writing the next piece
  await focusArticle(page, 1);
  await enterExplore(page, equationA);
  await page.keyboard.press('ArrowDown');
  await pause(page);
  await page.keyboard.press('ArrowRight');
  await pause(page);
  await leaveExplore(page);

  // Beat 6: Equation C = 2x+3 (combine)
  const equationC = await addBlankEquation(page);
  await feedCells(page, ['⠼', '⠆', '⠭', '⠬', '⠼', '⠒']);
  await submitReplacement(page);
  const mathC = await articleMathML(equationC);
  assert.match(mathC, /2/);
  assert.match(mathC, /x/);
  assert.match(mathC, /<mo[^>]*>\+<\/mo>/);
  assert.match(mathC, /3/);

  const articles = page.locator('article.napkin-article');
  assert.equal(await articles.count(), 4);
  assert.match(await articles.nth(0).textContent(), /dy\/dx/);

  const elapsedMs = Date.now() - started;
  assert.ok(elapsedMs <= 120_000, `demo exceeded 2 minutes (${elapsedMs}ms)`);
});
