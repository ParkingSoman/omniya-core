/**
 * Ctrl+E/Ctrl+L while replacing focused mathematics (r/a/o in the explorer),
 * not just while starting a brand new equation. The chord must work whenever
 * the dock field is empty, and must stop once content exists.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { enterExplorer, insertEquation, launchApp } from './launch-electron.js';

const modePanel = (page) => page.locator('#mode-panel');
const waitForMode = (page, pattern) => page.waitForFunction(
  (source) => new RegExp(source, 'i').test(document.querySelector('#mode-panel')?.textContent ?? ''),
  pattern
);

test('Ctrl+E and Ctrl+L switch method while replacing focused mathematics, same as starting a new equation', { timeout: 90_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-replace-switch-'));
  const { electronApp, page } = await launchApp({ dataDirectory });
  t.after(() => electronApp.close().catch(() => {}));

  await insertEquation(page, { method: 'latex', source: 'x^2' });
  await enterExplorer(page, 0);
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'composer-source');

  await waitForMode(page, 'replacing');
  assert.match(
    await modePanel(page).textContent() ?? '',
    /Equation · LaTeX/i,
    'replace opens with the last-used method'
  );
  assert.equal(await page.locator('#composer-source').getAttribute('class'), 'latex-inline-editor');

  await page.keyboard.press('Control+e');
  await waitForMode(page, 'Equation · Nemeth');
  assert.match(await modePanel(page).textContent() ?? '', /replacing/i, 'still a replace, not a fresh equation');
  assert.equal(await page.locator('#composer-source').getAttribute('class'), 'nemeth-inline-editor');
  assert.equal(await page.locator('#composer-source').inputValue(), '', 'switching method clears the field, same as the radio picker');
  assert.match(await page.locator('#composer-status').textContent() ?? '', /Enter Nemeth cells/i);

  await page.keyboard.press('Control+l');
  await waitForMode(page, 'Equation · LaTeX');
  assert.match(await modePanel(page).textContent() ?? '', /replacing/i);
  assert.equal(await page.locator('#composer-source').getAttribute('class'), 'latex-inline-editor');
  assert.match(await page.locator('#composer-status').textContent() ?? '', /Enter LaTeX/i);

  // Once content exists, switching locks again. Same rule as a new equation.
  await page.locator('#composer-source').fill('y^2');
  await page.keyboard.press('Control+e');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#composer-source').getAttribute('class'), 'latex-inline-editor', 'no switch once content exists');
  assert.equal(await page.locator('#composer-source').inputValue(), 'y^2', 'content is preserved, not cleared');
  assert.match(await modePanel(page).textContent() ?? '', /Equation · LaTeX/i);
});
