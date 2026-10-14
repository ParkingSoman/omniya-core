import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getMathNodes, launchApp, mathNodeLocator, openEquationDock } from './launch-electron.js';

// Enter starts an async equation commit (a real IPC round-trip through
// math:convert); nothing locks the UI while it's in flight. If Escape lands
// in that window it must not discard the equation that's already committing.
const CONVERT_DELAY_MS = 1000;

test('Escape pressed while a new equation is still committing does not lose it', { timeout: 60_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-submit-race-'));
  const { electronApp, page } = await launchApp({
    dataDirectory,
    env: { OMNIYA_TEST_MATH_CONVERT_DELAY_MS: String(CONVERT_DELAY_MS) }
  });
  t.after(() => electronApp.close().catch(() => {}));

  await openEquationDock(page, 'latex');
  await page.locator('#composer-source').fill('x^2');
  await page.keyboard.press('Enter');
  // The math:convert IPC call is now in flight (held open for CONVERT_DELAY_MS).
  // Land Escape well inside that window, before the commit finishes.
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#composer-dock').isVisible(), true, 'the commit has not finished yet');
  await page.keyboard.press('Escape');

  // The delayed conversion resolves and the commit lands.
  await mathNodeLocator(page).first().waitFor({ timeout: CONVERT_DELAY_MS + 5000 });
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });

  const nodes = await getMathNodes(page);
  assert.equal(nodes.length, 1, 'the equation must still have been added');
  assert.equal(nodes[0].attrs.source, 'x^2');
});
