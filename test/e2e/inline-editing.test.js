import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { _electron as electron } from 'playwright';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);

async function launch(prefix = 'omniya-replacement-') {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const app = await electron.launch({ args: ['.'], cwd: projectRoot, env: { ...process.env, OMNIYA_TEST_USER_DATA_DIR: dataDirectory } });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  return { app, page, dataDirectory };
}

async function addBlankEquation(page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('radio', { name: 'Equation' }).check();
  await page.getByLabel('Content', { exact: true }).press('Enter');
  await page.locator('#replacement-dock').waitFor();
  return page.locator('article.napkin-article').last();
}

async function chooseMethod(page, method) {
  await page.getByRole('radio', { name: method === 'latex' ? 'LaTeX' : 'Nemeth' }).check();
}

async function commitDraft(page, source, method = 'latex') {
  await chooseMethod(page, method);
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.fill(source);
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  const article = page.locator('article.napkin-article').last();
  await article.locator('mjx-container').waitFor();
  return article;
}

test('new equations use the same empty Nemeth replacement draft and commit once', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch();
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  assert.equal(await page.getByRole('radio', { name: 'Nemeth' }).isChecked(), true);
  await page.getByLabel('Replacement input', { exact: true }).fill('⠭⠬⠁');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelectorAll('article.napkin-article math mi').length === 2);
  assert.equal(await article.locator('math mi').count(), 2);
  assert.equal(await article.locator('math mo').count(), 1);
  assert.match(await article.locator('mjx-container').textContent(), /x/);
  assert.match(await article.locator('mjx-container').textContent(), /a/);
});

test('MathJax-selected duplicate subexpressions replace only the selected node', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-duplicate-replacement-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  await commitDraft(page, 'x+x', 'latex');
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'x');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'plus');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'x');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await page.getByLabel('Replacement input', { exact: true }).fill('⠵');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  const source = await article.locator('math').evaluate((node) => [...node.querySelectorAll('mi')].map((n) => n.textContent));
  assert.deepEqual(source, ['x', 'z']);
});

test('nested numerator replacement preserves the containing fraction', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-numerator-replacement-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  await commitDraft(page, '\\frac{a+b}{c}', 'latex');
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'Numerator a plus b');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await page.getByLabel('Replacement input', { exact: true }).fill('⠵');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math mfrac').count(), 1);
  assert.deepEqual(await article.locator('math mfrac > *').evaluateAll((nodes) => nodes.map((node) => node.textContent)), ['z', 'c']);
});

test('LaTeX is an alternate replacement draft and cancel or invalid input leaves the source unchanged', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-latex-replacement-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  await commitDraft(page, 'a+b', 'latex');
  await article.focus();
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'latex');
  await page.getByLabel('Replacement input', { exact: true }).fill('x^2+\\sqrt{y}');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.match(await article.locator('mjx-container').textContent(), /a/);
  assert.match(await article.locator('mjx-container').textContent(), /b/);

  await article.focus();
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'latex');
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.fill('\\frac{');
  await page.getByRole('button', { name: 'Replace' }).click();
  assert.match(await page.locator('#replacement-status').textContent(), /convert|empty|invalid|incomplete/i);
  assert.match(await article.locator('mjx-container').textContent(), /a/);
  await input.fill('x^3');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math msup').count(), 1);
});

test('six-key input feeds the same Nemeth draft transition as Unicode cells', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-six-key-replacement-');
  t.after(() => app.close().catch(() => {}));
  await page.evaluate(() => { globalThis.__omniyaBrailleSimulation = true; });
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });
  await page.keyboard.down('f');
  await page.keyboard.down('s');
  await page.keyboard.down('d');
  await page.keyboard.up('f');
  await page.keyboard.up('s');
  await page.keyboard.up('d');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math mi').count(), 1);
  assert.equal(await article.locator('math mi').textContent(), 'l');
  assert.equal(await input.count(), 1);
});
