import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import axe from 'axe-core';
import { _electron as electron } from 'playwright';
import { addEquationViaComposer, chooseMethod, chooseType, electronLaunchEnv } from './launch-electron.js';

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
    env: electronLaunchEnv({ OMNIYA_TEST_USER_DATA_DIR: dataDirectory })
  });
  const page = await electronApp.firstWindow();
  const externalRequests = [];
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  await electronApp.context().setOffline(true);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  return { electronApp, page, externalRequests };
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
  const modeSwitchChrome = await page.locator('#mode-switch').evaluate((el) => {
    const style = getComputedStyle(el);
    return { position: style.position, clip: style.clip, overflow: style.overflow };
  });
  assert.equal(modeSwitchChrome.position, 'absolute');
  assert.equal(modeSwitchChrome.overflow, 'hidden');
  assert.match(modeSwitchChrome.clip, /^rect\(0px[, ]+0px[, ]+0px[, ]+0px\)$/);
  await source.fill('Let a be positive.');
  assert.equal(await page.locator('#note-toggle').isVisible(), false);
  assert.equal(await page.locator('#note-row').isVisible(), false);
  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());

  assert.equal(await page.getByRole('heading', { name: 'Reading' }).count(), 1);
  assert.equal(await articles.count(), 1);
  assert.match(await articles.first().textContent(), /Let a be positive/);
  assert.equal(await articles.first().locator('.item-note').count(), 0);

  await page.getByRole('button', { name: 'Add item' }).click();
  await chooseType(page, 'equation');
  assert.equal(await page.locator('#note-toggle').isVisible(), false);
  const methodChrome = await page.locator('#replacement-method').evaluate((el) => {
    const style = getComputedStyle(el);
    return { position: style.position, clip: style.clip, overflow: style.overflow };
  });
  assert.equal(methodChrome.position, 'absolute');
  assert.equal(methodChrome.overflow, 'hidden');
  assert.match(methodChrome.clip, /^rect\(0px[, ]+0px[, ]+0px[, ]+0px\)$/);
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('\\frac{d}{dx}\\left(\\int_0^x e^{t^2}\\,dt\\right)=e^{x^2}');
  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);

  assert.equal(await articles.count(), 2);
  assert.equal(await articles.nth(1).locator('h4').count(), 0);
  assert.equal(await articles.nth(1).locator('.item-source').count(), 0);
  await articles.nth(1).locator('mjx-container').waitFor();
  assert.ok(await articles.nth(1).locator('mjx-container').count());
  assert.ok(await articles.nth(1).locator('mjx-container math mfrac').count());
  assert.ok(await articles.nth(1).locator('mjx-container math msubsup').count());
  assert.equal(await articles.nth(1).locator('.item-note').count(), 0);

  const firstArticle = articles.nth(0);
  const secondArticle = articles.nth(1);
  await firstArticle.click();
  await firstArticle.press('ArrowDown');
  assert.equal(await secondArticle.getAttribute('tabindex'), '0');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'ARTICLE');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
  assert.equal(await page.evaluate(() => document.activeElement?.closest?.('mjx-container')?.localName), 'mjx-container');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.tagName === 'ARTICLE');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'ARTICLE');
  await page.keyboard.press('e');
  assert.equal(await page.locator('#composer-dock').isVisible(), true);
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
  assert.match(await page.locator('#mode-panel').textContent() ?? '', /replacing/i);
  await assertNoAxeViolations(page);
  await chooseMethod(page, 'latex');
  await page.getByLabel('Replacement input', { exact: true }).fill('\\frac{d}{dx}\\left(\\int_0^x e^{t^2}\\,dt\\right)=3x^2');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('heading', { name: 'Reading' }).count(), 1);
  await articles.nth(1).locator('mjx-container').waitFor();
  assert.ok(await articles.nth(1).locator('mjx-container math').count());

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
  await source.press('q');
  assert.equal(await page.getByRole('heading', { name: 'Reading' }).count(), 1);
  assert.equal(await articles.count(), 2);

  await page.getByRole('button', { name: 'Add item' }).click();
  await chooseType(page, 'equation');
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('\\frac{');
  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());
  assert.match(await page.locator('#composer-error').textContent(), /convert|incomplete|empty/i);
  await assertNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add item' }).waitFor();

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
  await articles.nth(1).locator('mjx-container').waitFor();
  assert.ok(await articles.nth(1).locator('mjx-container math').count());
  const ariaSnapshot = await page.getByRole('main').ariaSnapshot();
  assert.match(ariaSnapshot, /Reading/);
  assert.match(ariaSnapshot, /Napkin content/);

  assert.deepEqual([...session.externalRequests], []);
  await session.electronApp.close();
  session = await launch(dataDirectory);
  await session.page.getByRole('complementary', { name: 'Napkins' }).waitFor();
  await session.page.getByRole('button', { name: 'Proof ideas' }).click();
  await session.page.locator('article mjx-container').waitFor();
  assert.ok(await session.page.locator('article mjx-container math').count());
  assert.deepEqual([...session.externalRequests], []);
});

test('moves left and right between sibling expressions inside MathML', { timeout: 60_000 }, async (t) => {
  await resetArtifactDirectory();
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-horizontal-e2e-'));
  const session = await launch(dataDirectory);
  t.after(async () => {
    await saveNapkinFile(dataDirectory);
    await session.electronApp.close().catch(() => {});
  });

  const { page } = session;
  await addEquationViaComposer(page, { method: 'latex', source: 'a+b' });

  const article = page.locator('article.napkin-article').first();
  await article.locator('mjx-container').waitFor();
  await article.locator('mjx-speech').waitFor();
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));

  const speech = article.locator('mjx-speech');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('article mjx-speech')?.getAttribute('aria-label') === 'a');
  const first = await speech.getAttribute('aria-label');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('article mjx-speech')?.getAttribute('aria-label') === 'plus');
  const right = await speech.getAttribute('aria-label');
  assert.equal(first, 'a');
  assert.equal(right, 'plus');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('article mjx-speech')?.getAttribute('aria-label') === 'b');
  assert.equal(await speech.getAttribute('aria-label'), 'b');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('article mjx-speech')?.getAttribute('aria-label') === 'plus');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('article mjx-speech')?.getAttribute('aria-label') === 'a');
  assert.equal(await speech.getAttribute('aria-label'), first);
});

test('deletes a focused sidebar napkin only after confirmation', { timeout: 60_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-delete-napkin-e2e-'));
  const session = await launch(dataDirectory);
  t.after(async () => {
    await session.electronApp.close().catch(() => {});
  });

  const { page } = session;
  const rail = page.getByRole('complementary', { name: 'Napkins' });
  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Second napkin');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Third napkin');
  await page.getByRole('button', { name: 'Create napkin' }).click();

  const second = rail.getByRole('button', { name: 'Second napkin' });
  await second.focus();
  let message = '';
  await Promise.all([
    page.waitForEvent('dialog').then(async (dialog) => {
      message = dialog.message();
      await dialog.accept();
    }),
    second.press('Backspace')
  ]);
  assert.match(message, /delete.*Second napkin/i);
  await assert.rejects(() => rail.getByRole('button', { name: 'Second napkin' }).waitFor({ timeout: 250 }));
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Third napkin');

  const third = rail.getByRole('button', { name: 'Third napkin' });
  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.accept()),
    third.press('Backspace')
  ]);
  await assert.rejects(() => rail.getByRole('button', { name: 'Third napkin' }).waitFor({ timeout: 250 }));
  const first = rail.getByRole('button', { name: 'Untitled Napkin' });
  let finalMessage = '';
  await Promise.all([
    page.waitForEvent('dialog').then(async (dialog) => {
      finalMessage = dialog.message();
      await dialog.accept();
    }),
    first.press('Backspace')
  ]);
  assert.match(finalMessage, /delete.*Untitled Napkin/i);
  await assert.rejects(() => rail.getByRole('button', { name: 'Untitled Napkin' }).waitFor({ timeout: 250 }));
  assert.equal(await rail.locator('[data-napkin-id]').count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'No napkin selected' }).count(), 1);
});
