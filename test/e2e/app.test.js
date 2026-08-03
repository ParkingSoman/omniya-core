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

test('supports the complete offline keyboard napkin workflow', { timeout: 60_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  let session = await launch(dataDirectory);
  t.after(async () => session.electronApp.close().catch(() => {}));

  const { page } = session;
  const napkinSelect = page.getByLabel('Napkin', { exact: true });
  await napkinSelect.waitFor();
  assert.deepEqual(await napkinSelect.locator('option').allTextContents(), ['Untitled Napkin']);

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Proof ideas');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  assert.equal(await napkinSelect.inputValue(), await napkinSelect.locator('option', { hasText: 'Proof ideas' }).getAttribute('value'));

  await page.getByLabel('Equation', { exact: true }).check();
  await page.getByLabel('Content', { exact: true }).fill('x^2 + y^2');
  await page.getByLabel('Note', { exact: true }).fill('Pythagorean expression');
  await page.getByRole('button', { name: 'Add item' }).click();

  const listbox = page.getByRole('listbox', { name: 'Items' });
  await listbox.focus();
  assert.equal(await listbox.getByRole('option').count(), 1);
  assert.ok(await page.locator('#selected-item math msup').count());

  await listbox.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'edit-source');
  await page.getByLabel('Edit content', { exact: true }).fill('x^3 + y^3');
  await page.getByLabel('Edit note', { exact: true }).fill('Updated note');
  await page.getByRole('button', { name: 'Save changes' }).click();
  assert.match(await page.locator('#selected-item math').getAttribute('data-latex'), /x\^3/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'item-list');

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Text notes');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  await page.getByLabel('Text', { exact: true }).check();
  await page.getByLabel('Content', { exact: true }).fill('The proof starts here.');
  await page.getByLabel('Note', { exact: true }).fill('Opening thought');
  await page.getByLabel('Note', { exact: true }).press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  assert.equal(await listbox.getByRole('option').count(), 1);

  await napkinSelect.selectOption({ label: 'Proof ideas' });
  assert.equal(await listbox.getByRole('option').count(), 1);
  await listbox.focus();
  await listbox.press('Home');
  await listbox.press('Enter');
  await page.getByLabel('Edit content', { exact: true }).fill('discard this');
  await page.getByLabel('Edit content', { exact: true }).press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'item-list');

  await page.evaluate(axe.source);
  const scan = await page.evaluate(() => globalThis.axe.run());
  assert.deepEqual(scan.violations, []);

  await session.electronApp.close();
  session = await launch(dataDirectory);
  await session.page.getByLabel('Napkin', { exact: true }).waitFor();
  assert.equal(await session.page.getByLabel('Napkin', { exact: true }).inputValue(),
    await session.page.getByLabel('Napkin', { exact: true }).locator('option', { hasText: 'Proof ideas' }).getAttribute('value'));
  assert.match(await session.page.locator('#selected-item math').getAttribute('data-latex'), /x\^3/);
});
