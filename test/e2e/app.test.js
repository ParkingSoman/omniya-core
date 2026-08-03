import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import axe from 'axe-core';
import { _electron as electron } from 'playwright';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

test('supports a condensed offline napkin workflow', { timeout: 60_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  let session = await launch(dataDirectory);
  t.after(async () => session.electronApp.close().catch(() => {}));

  const { page } = session;
  const napkinRail = page.getByRole('complementary', { name: 'Napkins' });
  const transcript = page.getByRole('list', { name: 'Napkin items' });
  const composer = page.getByRole('form', { name: 'Add to napkin' });

  await napkinRail.waitFor();
  await page.locator('#current-napkin-name').waitFor();
  await transcript.waitFor({ state: 'attached' });
  await composer.waitFor();
  assert.equal(await page.getByRole('button', { name: 'New napkin' }).count(), 1);

  const newNapkinButton = page.getByRole('button', { name: 'New napkin' });
  const textMode = page.locator('#mode-switch input[value="text"]');
  const equationMode = page.locator('#mode-switch input[value="equation"]');
  await newNapkinButton.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.value), 'text');
  assert.notEqual(await textMode.evaluate((input) => getComputedStyle(input.parentElement).outlineStyle), 'none');
  await page.keyboard.press('ArrowRight');
  assert.equal(await equationMode.isChecked(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.value), 'equation');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await textMode.isChecked(), true);

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Proof ideas');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  assert.equal(await napkinRail.getByRole('button', { name: 'Proof ideas' }).count(), 1);

  await page.locator('#mode-switch label').filter({ hasText: 'Text' }).click();
  await page.getByLabel('Content', { exact: true }).fill('Let a be positive.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Note', { exact: true }).fill('Define the domain.');
  await page.getByLabel('Content', { exact: true }).press('Enter');

  const textItem = transcript.getByRole('listitem').first();
  await textItem.waitFor();
  assert.match(await textItem.textContent(), /Let a be positive/);
  assert.match(await textItem.textContent(), /Define the domain/);

  await page.locator('#mode-switch label').filter({ hasText: 'Equation' }).click();
  await page.getByLabel('Content', { exact: true }).fill('\\frac{d}{dx}\\left(\\int_0^x e^{t^2}\\,dt\\right)=e^{x^2}');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Note', { exact: true }).fill('Fundamental theorem example.');
  await page.getByLabel('Content', { exact: true }).press('Enter');

  const equationItem = transcript.getByRole('listitem').nth(1);
  await equationItem.waitFor();
  assert.ok(await equationItem.locator('math mfrac').count());
  assert.ok(await equationItem.locator('math msubsup').count());
  assert.match(await equationItem.textContent(), /Fundamental theorem example/);

  const itemButton = equationItem.getByRole('button', { name: /Equation/ });
  await itemButton.focus();
  await itemButton.press('Enter');
  assert.equal(await composer.getByRole('button', { name: 'Save item' }).count(), 1);
  await page.getByLabel('Content', { exact: true }).fill('\\frac{d}{dx}\\left(\\int_0^x e^{t^2}\\,dt\\right)=3x^2');
  await page.getByRole('button', { name: 'Save item' }).click();
  assert.match(await equationItem.locator('math').getAttribute('data-latex'), /3x\^2/);

  assert.equal(await transcript.getByRole('listitem').count(), 2);
  const textButton = textItem.getByRole('button');
  await itemButton.focus();
  await itemButton.press('ArrowUp');
  assert.equal(await textButton.getAttribute('aria-current'), 'step');
  await textButton.press('ArrowDown');
  assert.equal(await itemButton.getAttribute('aria-current'), 'step');
  await itemButton.press('Home');
  assert.equal(await textButton.getAttribute('aria-current'), 'step');
  await textButton.press('End');
  assert.equal(await itemButton.getAttribute('aria-current'), 'step');
  assert.match(await textItem.textContent(), /Define the domain/);
  assert.match(await equationItem.textContent(), /Fundamental theorem example/);
  await textButton.click();

  const composerSource = page.getByLabel('Content', { exact: true });
  await composerSource.fill('unsaved draft');
  await composerSource.press('ArrowDown');
  assert.equal(await itemButton.getAttribute('aria-current'), 'step');
  assert.equal(await composerSource.inputValue(), 'unsaved draft');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'item-select');
  await page.keyboard.press('Enter');
  assert.equal(await composer.getByRole('button', { name: 'Save item' }).count(), 1);
  await composer.getByRole('button', { name: 'Cancel' }).click();
  await composerSource.focus();
  await composerSource.press('ArrowUp');
  assert.equal(await textButton.getAttribute('aria-current'), 'step');
  assert.equal(await composerSource.inputValue(), '');

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Text notes');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  await page.locator('#mode-switch label').filter({ hasText: 'Text' }).click();
  await page.getByLabel('Content', { exact: true }).fill('The proof starts here.');
  await page.getByLabel('Content', { exact: true }).press('Enter');
  assert.equal(await transcript.getByRole('listitem').count(), 1);

  await napkinRail.getByRole('button', { name: 'Proof ideas' }).click();
  assert.equal(await transcript.getByRole('listitem').count(), 2);
  assert.match(await transcript.locator('math').getAttribute('data-latex'), /3x\^2/);

  await page.evaluate(axe.source);
  const scan = await page.evaluate(() => globalThis.axe.run());
  assert.deepEqual(scan.violations, []);

  const ariaSnapshot = await page.getByRole('main').ariaSnapshot();
  assert.match(ariaSnapshot, /Add to napkin/);
  assert.match(ariaSnapshot, /Napkin items/);

  await session.electronApp.close();
  session = await launch(dataDirectory);
  await session.page.getByRole('complementary', { name: 'Napkins' }).waitFor();
  await session.page.getByRole('button', { name: 'Proof ideas' }).click();
  assert.match(await session.page.locator('math').getAttribute('data-latex'), /3x\^2/);
});
