import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from './launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Enter starts an async equation commit (a real IPC round-trip through
// math:convert); nothing locks the UI while it's in flight. If Escape lands
// in that window it must not discard the equation that's already committing.
const CONVERT_DELAY_MS = 1000;

async function launch() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-submit-race-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({
      OMNIYA_TEST_USER_DATA_DIR: dataDirectory,
      OMNIYA_TEST_MATH_CONVERT_DELAY_MS: String(CONVERT_DELAY_MS)
    })
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  return { app, page };
}

test('Escape pressed while a new equation is still committing does not lose it', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch();
  t.after(() => app.close().catch(() => {}));

  await page.locator('#composer-source').waitFor();
  await page.locator('#composer-source').focus();
  await page.keyboard.press('Control+l');
  await page.waitForFunction(() => /Equation · LaTeX/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  await page.locator('#composer-source').fill('x^2');

  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());
  // The math:convert IPC call is now in flight (held open for CONVERT_DELAY_MS).
  // Land Escape well inside that window, before the commit finishes.
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');

  // Give the delayed conversion time to resolve and the commit to land.
  await page.waitForTimeout(CONVERT_DELAY_MS + 1000);

  assert.equal(await page.locator('article.napkin-article').count(), 1, 'the equation must still have been added');
  assert.equal(await page.locator('#empty-message').isVisible(), false);
});
