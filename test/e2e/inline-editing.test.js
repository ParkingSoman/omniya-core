import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  chooseMethod,
  enterExplorer,
  getMathNodes,
  insertEquation,
  launchApp,
  mathNodeLocator
} from './launch-electron.js';

async function launch(t, prefix) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const { electronApp, page } = await launchApp({ dataDirectory });
  t.after(() => electronApp.close().catch(() => {}));
  return page;
}

const mathmlOf = async (page) => (await getMathNodes(page))[0].attrs.mathml;

// These cases do not depend on Nemeth. They cover the refusals: an empty or
// invalid replacement is refused, and a cancelled one changes nothing.

test('an empty replacement is refused, the dock stays open, and the equation is unchanged', { timeout: 60_000 }, async (t) => {
  const page = await launch(t, 'omniya-submit-invalid-');
  await insertEquation(page, { method: 'latex', source: 'a+b' });
  const original = await mathmlOf(page);

  await enterExplorer(page);
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Replace' }).click();

  assert.equal(await page.locator('#composer-dock').isVisible(), true);
  assert.match(
    `${await page.locator('#composer-error').textContent() ?? ''}\n${await page.locator('#composer-status').textContent() ?? ''}`,
    /Enter Nemeth or LaTeX|empty|incomplete/i
  );
  assert.equal(await mathmlOf(page), original);
  assert.equal(await mathNodeLocator(page).count(), 1);
});

test('LaTeX replacement: cancel or invalid input leaves the equation unchanged, valid input replaces it', { timeout: 90_000 }, async (t) => {
  const page = await launch(t, 'omniya-latex-replacement-');
  const node = await insertEquation(page, { method: 'latex', source: 'a+b' });
  const original = await mathmlOf(page);

  await enterExplorer(page);
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('x^2+\\sqrt{y}');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.equal(await mathmlOf(page), original, 'cancel changes nothing');
  assert.match(await node.locator('mjx-container').textContent(), /a/);
  assert.match(await node.locator('mjx-container').textContent(), /b/);

  // Cancel hands the explorer back, so r works again.
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('.math-node')));
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await chooseMethod(page, 'latex');
  const input = page.locator('#composer-source');
  await input.fill('\\frac{');
  await page.getByRole('button', { name: 'Replace' }).click();
  assert.match(await page.locator('#composer-status').textContent(), /convert|empty|invalid|incomplete/i);
  assert.equal(await page.locator('#composer-dock').isVisible(), true);
  assert.equal(await mathmlOf(page), original, 'an invalid draft changes nothing');

  await input.fill('x^3');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.equal(await mathNodeLocator(page).count(), 1, 'replaced in place');
  assert.equal(await node.locator('math msup').count(), 1);
  assert.match(await mathmlOf(page), /<msup/);
});
