/**
 * Ctrl+E/Ctrl+L while replacing focused mathematics (r/a/o), not just while
 * starting a brand new equation. Before this fix, `equationInsertIntent`
 * unconditionally treated any replace session as a no-op, and
 * `handleComposerCommandKey` bailed out before ever reaching it -- so the
 * chord did nothing during a replace, even though the field was empty and
 * `applyReplacementMethodFromCommand` (used by the composer's own method
 * radios) already handled this case correctly.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { addEquationViaComposer, electronLaunchEnv } from './launch-electron.js';

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

test('Ctrl+E and Ctrl+L switch method while replacing focused mathematics, same as starting a new equation', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-replace-switch-');
  t.after(() => app.close().catch(() => {}));

  const article = await addEquationViaComposer(page, { method: 'latex', source: 'x^2' });
  await article.click();
  await article.focus();
  await page.keyboard.press('r');

  await page.waitForFunction(() => /replacing/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  assert.match(
    await page.locator('#mode-panel').textContent() ?? '',
    /Equation · LaTeX/i,
    'replace opens with the last-used method, same as before this fix'
  );
  assert.equal(await page.locator('#composer-source').getAttribute('class'), 'latex-inline-editor');

  await page.locator('#composer-source').focus();
  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  assert.match(await page.locator('#mode-panel').textContent() ?? '', /replacing/i, 'still a replace, not a fresh equation');
  assert.equal(await page.locator('#composer-source').getAttribute('class'), 'nemeth-inline-editor');
  assert.equal(await page.locator('#composer-source').inputValue(), '', 'switching method clears the field, same as the radio picker');
  assert.match(await page.locator('#composer-status').textContent() ?? '', /Enter Nemeth cells/i);

  await page.keyboard.press('Control+l');
  await page.waitForFunction(() => /Equation · LaTeX/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  assert.match(await page.locator('#mode-panel').textContent() ?? '', /replacing/i);
  assert.equal(await page.locator('#composer-source').getAttribute('class'), 'latex-inline-editor');
  assert.match(await page.locator('#composer-status').textContent() ?? '', /Enter LaTeX/i);

  // Once content exists, switching locks again -- same rule as a new equation.
  await page.locator('#composer-source').fill('y^2');
  await page.locator('#composer-source').dispatchEvent('input');
  await page.waitForFunction(() => document.querySelector('#composer-source')?.value === 'y^2');
  await page.keyboard.press('Control+e');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#composer-source').getAttribute('class'), 'latex-inline-editor', 'no switch once content exists');
  assert.equal(await page.locator('#composer-source').inputValue(), 'y^2', 'content is preserved, not cleared');
});
