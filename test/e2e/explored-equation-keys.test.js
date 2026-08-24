/**
 * Keys typed OUTSIDE an equation must not be claimed by the equation explorer.
 *
 * Both cases here come from one alpha report. After exploring an equation, the
 * contributor could not name a new napkin ("it would always say I had to name
 * the file, and the name I typed in wasn't showing up") and could not delete an
 * equation they had written ("including pressing backspace and control z").
 * Their diagnostics dump showed the answer from the other side: their typing
 * was arriving in #composer-source, a field they had not put focus in.
 *
 * The two bugs are separate but share a cause -- `exploringEquationItemId`
 * outliving the focus it describes -- so they are covered together.
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

async function launch(t, prefix) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({ OMNIYA_TEST_USER_DATA_DIR: dataDirectory })
  });
  t.after(() => app.close().catch(() => {}));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  return page;
}

/** Focus the article and press Enter, the documented way into the explorer. */
async function explore(page, article) {
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(
    document.activeElement?.closest?.('mjx-container, math, mjx-focus, mjx-speech')
  ), null, { timeout: 30_000 });
}

test('a napkin name typed after exploring an equation reaches the name field', { timeout: 120_000 }, async (t) => {
  const page = await launch(t, 'omniya-explored-name-');

  const equation = await addEquationViaComposer(page, { method: 'latex', source: 'x+1' });
  await explore(page, equation);

  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').waitFor();
  // "Algebra" leads with a, and also carries o-less r -- the letters the
  // explorer claims for append/prepend/replace.
  await page.keyboard.type('Algebra');

  assert.equal(
    await page.locator('#napkin-name').inputValue(),
    'Algebra',
    'every letter of the name reaches the name field'
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'napkin-name',
    'and focus stays in it'
  );
  assert.equal(
    await page.locator('#composer-source').inputValue(),
    '',
    'nothing leaks into the writing field'
  );
});

test('Backspace deletes the equation being explored', { timeout: 120_000 }, async (t) => {
  const page = await launch(t, 'omniya-explored-delete-');

  const equation = await addEquationViaComposer(page, { method: 'latex', source: 'x+1' });
  const articles = page.locator('article.napkin-article');
  assert.equal(await articles.count(), 1);

  await explore(page, equation);
  await page.keyboard.press('Backspace');

  await page.waitForFunction(
    () => document.querySelectorAll('article.napkin-article').length === 0,
    null,
    { timeout: 15_000 }
  );
  assert.equal(await articles.count(), 0, 'the explored equation is deleted');
});
