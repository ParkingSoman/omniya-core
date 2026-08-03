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

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Proof ideas');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  assert.equal(await napkinRail.getByRole('button', { name: 'Proof ideas' }).count(), 1);

  await page.locator('#mode-switch label').filter({ hasText: 'Equation' }).click();
  await page.getByLabel('Content', { exact: true }).fill('x^2 + y^2');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Note', { exact: true }).fill('Pythagorean expression');
  await page.getByLabel('Content', { exact: true }).press('Enter');

  const item = transcript.getByRole('listitem').first();
  await item.waitFor();
  assert.ok(await item.locator('math msup').count());
  assert.match(await item.textContent(), /Pythagorean expression/);

  const itemButton = item.getByRole('button', { name: /Equation/ });
  await itemButton.focus();
  await itemButton.press('Enter');
  assert.equal(await composer.getByRole('button', { name: 'Save item' }).count(), 1);
  await page.getByLabel('Content', { exact: true }).fill('x^3 + y^3');
  await page.getByRole('button', { name: 'Save item' }).click();
  assert.match(await item.locator('math').getAttribute('data-latex'), /x\^3/);

  await page.locator('#mode-switch label').filter({ hasText: 'Text' }).click();
  await page.getByLabel('Content', { exact: true }).fill('A supporting sentence.');
  await page.getByLabel('Content', { exact: true }).press('Enter');
  assert.equal(await transcript.getByRole('listitem').count(), 2);
  const secondItem = transcript.getByRole('listitem').nth(1);
  const secondButton = secondItem.getByRole('button');
  await secondButton.focus();
  await secondButton.press('ArrowUp');
  assert.equal(await transcript.getByRole('listitem').first().getByRole('button').getAttribute('aria-current'), 'step');
  await transcript.getByRole('listitem').first().getByRole('button').press('ArrowDown');
  assert.equal(await secondItem.getByRole('button').getAttribute('aria-current'), 'step');
  await secondItem.getByRole('button').press('Home');
  assert.equal(await transcript.getByRole('listitem').first().getByRole('button').getAttribute('aria-current'), 'step');
  await transcript.getByRole('listitem').first().getByRole('button').press('End');
  assert.equal(await secondItem.getByRole('button').getAttribute('aria-current'), 'step');
  await transcript.getByRole('listitem').first().getByRole('button').click();

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Text notes');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  await page.locator('#mode-switch label').filter({ hasText: 'Text' }).click();
  await page.getByLabel('Content', { exact: true }).fill('The proof starts here.');
  await page.getByLabel('Content', { exact: true }).press('Enter');
  assert.equal(await transcript.getByRole('listitem').count(), 1);

  await napkinRail.getByRole('button', { name: 'Proof ideas' }).click();
  assert.equal(await transcript.getByRole('listitem').count(), 2);
  assert.match(await transcript.locator('math').getAttribute('data-latex'), /x\^3/);

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
  assert.match(await session.page.locator('math').getAttribute('data-latex'), /x\^3/);
});
