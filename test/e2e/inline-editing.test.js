import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { _electron as electron } from 'playwright';
import { chooseMethod, electronLaunchEnv, openReplacementDockOnNewEquation, waitForDocumentComposer } from './launch-electron.js';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);

async function launch(prefix = 'omniya-replacement-') {
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
  return { app, page, dataDirectory };
}

async function addBlankEquation(page) {
  return openReplacementDockOnNewEquation(page);
}

async function commitDraft(page, source, method = 'latex') {
  await chooseMethod(page, method);
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.fill(source);
  await page.getByRole('button', { name: 'Replace' }).click();
  await waitForDocumentComposer(page);
  const article = page.locator('article.napkin-article').last();
  await article.locator('mjx-container').waitFor();
  return article;
}

// Nemeth authoring was torn out in the nemeth-v2 rewrite (Task 0); Task 5
// re-adds it along with the tests that exercised it. Only tests that never
// depend on a working Nemeth draft (empty-draft rejection, pure LaTeX
// replacement) survive here.

test('invalid replacement remains open and does not mutate the source', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-submit-invalid-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  await page.getByRole('button', { name: 'Replace' }).click();
  assert.equal(await page.locator('#composer-dock').isVisible(), true);
  assert.match(
    `${await page.locator('#composer-error').textContent() ?? ''}\n${await page.locator('#composer-status').textContent() ?? ''}`,
    /Enter Nemeth or LaTeX|empty|incomplete/i
  );
  assert.equal(await article.locator('math mi, math mn, math mo').count(), 0);
});

test('LaTeX is an alternate replacement draft and cancel or invalid input leaves the source unchanged', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-latex-replacement-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  await commitDraft(page, 'a+b', 'latex');
  await article.focus();
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor();
  await chooseMethod(page, 'latex');
  await page.getByLabel('Replacement input', { exact: true }).fill('x^2+\\sqrt{y}');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await waitForDocumentComposer(page);
  assert.match(await article.locator('mjx-container').textContent(), /a/);
  assert.match(await article.locator('mjx-container').textContent(), /b/);

  await article.focus();
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor();
  await chooseMethod(page, 'latex');
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.fill('\\frac{');
  await page.getByRole('button', { name: 'Replace' }).click();
  assert.match(await page.locator('#composer-status').textContent(), /convert|empty|invalid|incomplete/i);
  assert.match(await article.locator('mjx-container').textContent(), /a/);
  await input.fill('x^3');
  await page.getByRole('button', { name: 'Replace' }).click();
  await waitForDocumentComposer(page);
  assert.equal(await article.locator('math msup').count(), 1);
});
