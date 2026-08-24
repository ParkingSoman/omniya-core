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

/**
 * Backspace on an empty equation field takes the last equation back.
 *
 * From the same alpha thread: "Pressing backspace and control z didn't erase
 * the expression I'd written." The composer stays in equation mode after Enter
 * (5f8ab9c), so the author is left in an empty field with the equation they
 * just wrote sitting behind them and no key that reaches it -- their diagnostics
 * showed eleven Backspaces and two Ctrl+Zs into an empty field, in silence.
 *
 * Taking it back rather than deleting it is what makes repeating the key safe:
 * the second press is an ordinary cell delete, so leaning on Backspace cannot
 * walk backwards through the napkin destroying items.
 */
async function composeNemeth(page, source) {
  await page.locator('#composer-source').focus();
  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
  await page.keyboard.type(source);
  await page.keyboard.press('Enter');
  await page.locator('article.napkin-article mjx-container, article.napkin-article math')
    .first().waitFor({ timeout: 30_000 });
}

test('Backspace on the empty equation field takes the equation just committed back', { timeout: 120_000 }, async (t) => {
  const page = await launch(t, 'omniya-uncommit-');
  await composeNemeth(page, '#2+2');

  const articles = page.locator('article.napkin-article');
  assert.equal(await articles.count(), 1, 'the equation committed');
  assert.equal(await page.locator('#composer-source').inputValue(), '', 'and the field is empty again');

  await page.keyboard.press('Backspace');
  await page.waitForFunction(
    () => document.querySelector('#composer-source')?.value === '⠼⠆⠬⠆',
    null,
    { timeout: 15_000 }
  );
  assert.equal(await articles.count(), 0, 'the equation is out of the document');
  assert.match(
    await page.locator('#composer-status').textContent(),
    /back in the field/i,
    'and the author is told where it went'
  );

  // The second press is an ordinary cell delete, so holding Backspace cannot
  // walk backwards through the napkin.
  await page.keyboard.press('Backspace');
  await page.waitForFunction(
    () => document.querySelector('#composer-source')?.value === '⠼⠆⠬',
    null,
    { timeout: 15_000 }
  );
});

test('Ctrl+Z on the empty equation field takes it back too', { timeout: 120_000 }, async (t) => {
  const page = await launch(t, 'omniya-uncommit-undo-');
  await composeNemeth(page, '#2+2');

  await page.keyboard.press('Control+z');
  await page.waitForFunction(
    () => document.querySelector('#composer-source')?.value === '⠼⠆⠬⠆',
    null,
    { timeout: 15_000 }
  );
  assert.equal(await page.locator('article.napkin-article').count(), 0);
});

test('the diagnostics report shows a napkin name reaching the name field', { timeout: 120_000 }, async (t) => {
  // The report went silent the moment focus left #composer-source, so the half
  // of the session that contained the bug was simply absent from two alpha
  // reports. Whatever the app does with these keys, the report has to be able
  // to say where they went.
  const page = await launch(t, 'omniya-report-fields-');

  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').waitFor();
  await page.keyboard.type('Algebra');

  const report = await page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());
  assert.match(report, /-- typing into: napkin-name/, 'the name field is recorded and named');
  assert.match(report, /keydown key="A"/, 'and its keystrokes are in the report at all');
});

test('nothing pulls focus out of the new-napkin form while it is open', { timeout: 120_000 }, async (t) => {
  // A guard, not a fix for one path. Three alpha reports of "I couldn't make a
  // new napkin, what I typed never appeared" all reduce to something in the app
  // moving focus out of #napkin-name while the person was typing into it. Each
  // route there is worth fixing on its own, but the form is the one place where
  // a stolen focus is silent and unrecoverable for someone who cannot see it,
  // so programmatic focus is refused wholesale while it is up.
  //
  // openNewEquationDock is a real app path that ends in composer-source.focus().
  const page = await launch(t, 'omniya-focus-guard-');
  await addEquationViaComposer(page, { method: 'latex', source: 'x+1' });

  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').waitFor();
  await page.keyboard.type('Alg');

  await page.evaluate(() => globalThis.__omniyaTesting.openNewEquationDock());
  await page.waitForTimeout(500);

  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'napkin-name',
    'focus stays where the person put it'
  );
  await page.keyboard.type('ebra');
  assert.equal(await page.locator('#napkin-name').inputValue(), 'Algebra', 'and the whole name lands');
});

test('the form still hands focus on when the person closes it', { timeout: 120_000 }, async (t) => {
  // The guard must not outlive the form, or Cancel strands focus on nothing.
  const page = await launch(t, 'omniya-focus-guard-cancel-');
  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'new-napkin-button');

  await page.locator('#new-napkin-button').click();
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#new-napkin-form')?.hidden === true);
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'composer-source',
    'creating a napkin still lands the author in the writing field'
  );
});
