import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import axe from 'axe-core';
import { _electron as electron } from 'playwright';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactDirectory = path.join(projectRoot, 'test', 'artifacts', 'latest');

async function resetArtifactDirectory() {
  await rm(artifactDirectory, { recursive: true, force: true });
  await mkdir(artifactDirectory, { recursive: true });
}

async function saveNapkinFile(dataDirectory) {
  try {
    await copyFile(
      path.join(dataDirectory, 'napkins.json'),
      path.join(artifactDirectory, 'test.napkin.json')
    );
  } catch (error) {
    console.error(`Could not save test napkin file: ${error.message}`);
  }
}

async function launch(dataDirectory) {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: { ...process.env, OMNIYA_TEST_USER_DATA_DIR: dataDirectory }
  });
  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await electronApp.context().setOffline(true);
  return { electronApp, page };
}

async function assertNoAxeViolations(page) {
  await page.evaluate(axe.source);
  const scan = await page.evaluate(() => globalThis.axe.run());
  assert.deepEqual(scan.violations, []);
}

test('supports a read-first offline napkin workflow', { timeout: 60_000 }, async (t) => {
  await resetArtifactDirectory();
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  let session = await launch(dataDirectory);
  t.after(async () => {
    await saveNapkinFile(dataDirectory);
    await session.electronApp.close().catch(() => {});
  });

  const { page } = session;
  const napkinRail = page.getByRole('complementary', { name: 'Napkins' });
  const reading = page.getByRole('region', { name: 'Reading' });
  const articles = page.locator('article.napkin-article');
  const source = page.getByLabel('Content', { exact: true });

  await napkinRail.waitFor();
  await page.getByRole('heading', { name: 'Reading' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add item' }).count(), 1);
  assert.equal(await page.locator('#composer-dock').isHidden(), true);
  await assertNoAxeViolations(page);

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Proof ideas');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  assert.equal(await napkinRail.getByRole('button', { name: 'Proof ideas' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Add item' }).count(), 1);

  await page.getByRole('button', { name: 'Add item' }).click();
  assert.equal(await page.getByRole('heading', { name: 'Adding to Proof ideas' }).count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source');
  assert.equal(await page.locator('#reading-actions').isHidden(), true);
  assert.equal(await page.getByRole('button', { name: 'Keyboard help' }).count(), 0);
  await assertNoAxeViolations(page);
  await source.fill('Let a be positive.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Note', { exact: true }).fill('Define the domain.');
  await source.press('Enter');

  assert.equal(await page.getByRole('heading', { name: 'Reading' }).count(), 1);
  assert.equal(await articles.count(), 1);
  assert.match(await articles.first().textContent(), /Let a be positive/);
  assert.match(await articles.first().textContent(), /Define the domain/);

  await page.getByRole('button', { name: 'Add item' }).click();
  await page.locator('#mode-switch label').filter({ hasText: 'Equation' }).click();
  await source.fill('\\frac{d}{dx}\\left(\\int_0^x e^{t^2}\\,dt\\right)=e^{x^2}');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Note', { exact: true }).fill('Fundamental theorem example.');
  await source.press('Enter');

  assert.equal(await articles.count(), 2);
  assert.equal(await articles.nth(1).locator('h4').count(), 0);
  assert.equal(await articles.nth(1).locator('.item-source').count(), 0);
  assert.ok(await articles.nth(1).locator('math mfrac').count());
  assert.ok(await articles.nth(1).locator('math msubsup').count());
  assert.match(await articles.nth(1).textContent(), /Fundamental theorem example/);

  const firstArticle = articles.nth(0);
  const secondArticle = articles.nth(1);
  await firstArticle.click();
  await firstArticle.press('ArrowDown');
  assert.equal(await secondArticle.getAttribute('tabindex'), '0');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'ARTICLE');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.localName), 'math');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'ARTICLE');
  await page.keyboard.press('e');
  assert.equal(await page.getByRole('heading', { name: 'Editing item 2' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Save changes' }).count(), 1);
  await assertNoAxeViolations(page);
  await source.fill('\\frac{d}{dx}\\left(\\int_0^x e^{t^2}\\,dt\\right)=3x^2');
  await page.getByRole('button', { name: 'Save changes' }).click();
  assert.equal(await page.getByRole('heading', { name: 'Reading' }).count(), 1);
  assert.match(await articles.nth(1).locator('math').getAttribute('data-latex'), /3x\^2/);

  await secondArticle.focus();
  await secondArticle.press('ArrowUp');
  assert.equal(await firstArticle.getAttribute('tabindex'), '0');
  await firstArticle.press('Home');
  assert.equal(await firstArticle.getAttribute('tabindex'), '0');
  await firstArticle.press('End');
  assert.equal(await secondArticle.getAttribute('tabindex'), '0');

  await page.getByRole('button', { name: 'Add item' }).click();
  await source.fill('unfinished draft');
  await source.press('Escape');
  assert.equal(await page.getByRole('heading', { name: 'Reading' }).count(), 1);
  assert.equal(await articles.count(), 2);

  await page.getByRole('button', { name: 'Add item' }).click();
  await page.locator('#mode-switch label').filter({ hasText: 'Equation' }).click();
  await source.fill('\\frac{');
  await source.press('Enter');
  assert.equal(await page.getByText('The LaTeX could not be converted. Check its syntax.').count(), 1);
  await assertNoAxeViolations(page);
  await page.getByRole('button', { name: 'Discard draft' }).click();

  await page.getByRole('button', { name: 'Keyboard help' }).click();
  assert.equal(await page.getByRole('dialog', { name: 'Keyboard help' }).count(), 1);
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Text notes');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  await page.getByRole('button', { name: 'Add item' }).click();
  await source.fill('The proof starts here.');
  await source.press('Enter');
  await page.getByRole('button', { name: 'Add item' }).click();
  await source.fill('Remove this item.');
  await source.press('Enter');
  const textNotesArticles = page.locator('article.napkin-article');
  assert.equal(await textNotesArticles.count(), 2);
  await textNotesArticles.nth(1).focus();
  await textNotesArticles.nth(1).press('Backspace');
  assert.equal(await textNotesArticles.count(), 1);
  assert.equal(await textNotesArticles.first().getAttribute('tabindex'), '0');
  assert.match(await textNotesArticles.first().textContent(), /The proof starts here/);
  await textNotesArticles.first().press('Backspace');
  assert.equal(await textNotesArticles.count(), 0);
  assert.equal(await page.getByText('No items yet. Add the first item below.').count(), 1);

  await napkinRail.getByRole('button', { name: 'Proof ideas' }).click();
  assert.equal(await articles.count(), 2);
  assert.match(await articles.nth(1).locator('math').getAttribute('data-latex'), /3x\^2/);
  const ariaSnapshot = await page.getByRole('main').ariaSnapshot();
  assert.match(ariaSnapshot, /Reading/);
  assert.match(ariaSnapshot, /Napkin content/);

  await session.electronApp.close();
  session = await launch(dataDirectory);
  await session.page.getByRole('complementary', { name: 'Napkins' }).waitFor();
  await session.page.getByRole('button', { name: 'Proof ideas' }).click();
  assert.match(await session.page.locator('article math').getAttribute('data-latex'), /3x\^2/);
});
