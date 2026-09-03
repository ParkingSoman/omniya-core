import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from './launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// This file used to drive a "Command mode" reached with Ctrl+[ , where a single
// letter afterwards chose the action: t for text, x to cycle authoring method,
// s to focus the mode panel, n to submit, ? for help. That mode is gone. The
// unified composer replaced it with direct chords -- Ctrl+E, Ctrl+L, Ctrl+T --
// and no renderer has handled Ctrl+[ since. `formatStatus` in
// src/domain/authoring-state.js cannot emit the word "Command" at all, so every
// wait for it ran to its timeout.
//
// The behaviours those tests covered are re-pinned here against the chords that
// exist. One test is not: "command s focuses mode panel". Nothing focuses the
// mode panel now, by design -- the panel is a quiet status line read through
// the field's aria-describedby, which the first test below pins. There was no
// behaviour left to re-target, so that test is not carried forward.

async function launch(prefix = 'omniya-ueb-cmd-') {
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

async function openComposer(page) {
  await page.locator('#composer-source').waitFor();
  await page.locator('#composer-source').focus();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source');
}

function modePanelReads(page, pattern) {
  return page.waitForFunction(
    (source) => new RegExp(source, 'i').test(document.querySelector('#mode-panel')?.textContent ?? ''),
    pattern.source
  );
}

test('hides notes UI after launch and Add item', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-notes-hide-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  assert.equal(await page.locator('#note-toggle').isVisible(), false);
  assert.equal(await page.locator('#note-row').isVisible(), false);
});

test('Escape while writing text moves focus to the article and keeps the text', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-text-escape-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await page.keyboard.type('hello');
  const article = page.locator('article.napkin-article').filter({ hasText: 'hello' }).first();
  await article.waitFor();

  await page.keyboard.press('Escape');

  // Escape on the text surface hands focus to the transcript so arrow-key
  // navigation can start. It must not discard what was typed.
  await page.waitForFunction(() => document.activeElement?.tagName === 'ARTICLE');
  assert.equal(await page.locator('article.napkin-article').count(), 1);
  assert.equal((await article.locator('.item-text').textContent())?.trim(), 'hello');
});

test('composer has no Command button and never opens the replacement dock', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-cmd-btn-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  assert.equal(await page.locator('#composer-command').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Command' }).count(), 0);
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);

  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
});

test('text submitted with Enter carries a UEB braille label', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-text-submit-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await page.locator('#composer-source').fill('hello world');
  await page.keyboard.press('Enter');

  const article = page.locator('article.napkin-article').filter({ hasText: 'hello world' }).first();
  await article.waitFor();
  const labeled = article.locator('[aria-braillelabel]');
  await labeled.first().waitFor({ timeout: 15_000 });
  const labels = await labeled.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-braillelabel') ?? ''));
  assert.ok(labels.some((label) => /⠓/.test(label)), `expected UEB ⠓ on a descendant, got ${JSON.stringify(labels)}`);
});

test('Ctrl+E and Ctrl+L switch authoring method while the composer is empty', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-x-cycle-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);
  assert.equal(await page.evaluate(() => document.querySelector('#mode-switch input:checked')?.value), 'equation');

  await page.keyboard.press('Control+l');
  await modePanelReads(page, /Equation · LaTeX/);

  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);
});

test('the mode panel is quiet and the help dialog lists the chords that exist', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-help-quiet-');
  t.after(() => app.close().catch(() => {}));

  // The panel is read through the field's aria-describedby, not announced on
  // its own and not focusable. Nothing in the app moves focus to it.
  const mode = await page.locator('#mode-panel').evaluate((el) => ({
    id: el.id,
    live: el.getAttribute('aria-live'),
    role: el.getAttribute('role'),
    tabIndex: el.tabIndex
  }));
  assert.equal(mode.live, null);
  assert.notEqual(mode.role, 'status');
  assert.equal(mode.tabIndex, -1);

  const save = await page.locator('#save-status').evaluate((el) => ({
    live: el.getAttribute('aria-live'),
    role: el.getAttribute('role')
  }));
  assert.equal(save.live, null);
  assert.notEqual(save.role, 'status');

  await openComposer(page);
  await page.locator('#keyboard-help-button').click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard help' });
  await dialog.waitFor();
  const help = await dialog.innerText();
  assert.match(help, /Ctrl\+E/i);
  assert.match(help, /Ctrl\+L/i);
  assert.match(help, /Ctrl\+T/i);
  assert.match(help, /Escape/i);
  // The dead chord must not be advertised to someone who cannot see that
  // pressing it does nothing.
  assert.doesNotMatch(help, /Ctrl\+\[/i);
  assert.doesNotMatch(help, /Command mode/i);
});

test('the Nemeth field reads computer braille, names the reading, and Escape cancels', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-repl-escape-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);

  // A lowercase letter used to be refused outright (8bc05ae). It is not any
  // more: `resolveBrailleInputTable` measures the table on every keystroke, so
  // 'a' typed on an ordinary keyboard decodes through en-us-comp8 to the cell
  // it spells. The field keeps the DECODED cell, not the character.
  await page.keyboard.type('a');
  await page.waitForFunction(() => document.querySelector('#composer-source')?.value === '⠁');
  assert.notEqual(await page.locator('#composer-source').getAttribute('aria-invalid'), 'true');

  // CLAUDE.md: naming the reading in the status line is the containment for a
  // wrong detection. If this assertion is ever removed, a misread keystroke
  // becomes silent for someone who cannot see the field.
  assert.match(await page.locator('#composer-status').textContent() ?? '', /computer braille/i);

  // A character that is neither a cell nor computer-braille text is still
  // refused, and the refusal still says so rather than dropping it silently.
  await page.keyboard.type('é');
  await page.waitForFunction(() => /Braille cells only/i.test(
    document.querySelector('#composer-error')?.textContent ?? ''
  ));
  assert.equal(await page.locator('#composer-source').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);

  await page.keyboard.press('Escape');
  await page.locator('#composer-source').waitFor();
  await modePanelReads(page, /Text/);
  assert.equal(await page.locator('#composer-dock').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source');
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
});
