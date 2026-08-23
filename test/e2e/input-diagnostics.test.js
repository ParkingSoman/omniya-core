/**
 * The diagnostics dump, end to end in the real app.
 *
 * Unit tests cover the formatting; what they cannot show is that the capture is
 * actually attached to the live field, sees what the composer did to a
 * keystroke, and produces a report a contributor could paste back. That whole
 * chain is the point -- the bug it exists for survived three rounds of email
 * precisely because nothing observable connected "I typed this" to "the app
 * stored that".
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from './launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function launch(prefix) {
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
  return { app, page };
}

test('the diagnostics report captures what the field received in the running app', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-diagnostics-');
  t.after(() => app.close().catch(() => {}));

  await page.locator('#composer-source').focus();
  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
  await page.keyboard.type('#2+#2');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));

  // Built from the app's own live state, not from a fixture.
  const report = await page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());
  assert.ok(report, 'the app can produce a report');

  assert.match(report, /Omniya Core — braille input diagnostics/);
  assert.match(report, /Braille input table: auto \(read as en-us-comp8\)/, 'names the reading detection settled on');
  assert.match(report, /keydown .*key="#"/, 'the keystrokes the device sent are recorded');
  assert.match(report, /field="⠼⠆⠬⠼⠆"/, 'and the cells the field ended up holding');
  assert.match(report, /includes the mathematics you were typing/, 'and it discloses what it contains');
});

test('a keystroke the app consumes is visible in the report', { timeout: 90_000 }, async (t) => {
  // Six-key chording used to consume s d f j k l here, silently. It is gone,
  // but the signal that exposed it is kept, because "a handler ate the
  // keypress" is the first thing to rule out when input seems not to arrive.
  // Enter is a keystroke the composer still legitimately claims.
  const { app, page } = await launch('omniya-diagnostics-consumed-');
  t.after(() => app.close().catch(() => {}));

  await page.locator('#composer-source').focus();
  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
  await page.keyboard.type('#2+#2');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  await page.keyboard.press('Enter');

  const report = await page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());
  assert.match(report, /CONSUMED-BY-APP/, 'the app says it claimed the keystroke');
});
