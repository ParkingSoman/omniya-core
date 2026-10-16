import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { INSERT_EQUATION, editorRoot, launchApp, settle } from './launch-electron.js';

// A contributor who uses a screen reader asked for two things: a heading before
// each text field, and nothing unneeded in the way. These tests hold both.
//
// The models are the ones other apps already teach:
//   - a heading names each field, and the field comes right after it (WCAG 2.4.6, 2.4.10)
//   - a toolbar is one Tab stop, with arrow keys inside it (WAI-ARIA APG Toolbar)
//   - a list of items is one Tab stop, with arrow keys between them (Outlook, Mail)

async function start(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const app = await launchApp({ dataDirectory });
  t.after(() => app.electronApp.close().catch(() => {}));
  return app;
}

async function createNote(page, name) {
  await page.locator('#new-napkin-button').click();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (n) => document.querySelector('#napkin-list [aria-current="page"] .note-name')?.textContent === n, name);
}

/**
 * Walk the page in reading order up to `selector`. Report the last heading seen
 * and every Tab stop between that heading and the field.
 */
function headingBefore(page, selector) {
  return page.evaluate((sel) => {
    const target = document.querySelector(sel);
    const hidden = (el) => Boolean(el.closest('[hidden], [aria-hidden="true"]')) || el.getClientRects().length === 0;
    const isHeading = (el) => /^H[1-6]$/.test(el.tagName) || el.getAttribute('role') === 'heading';
    const tabbable = (el) => el.matches('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
      && !el.disabled;
    const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`;
    let heading = null;
    let between = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      if (node === target) break;
      if (node.contains(target)) continue; // an ancestor of the field is not "before" it
      if (hidden(node)) continue;
      if (isHeading(node)) { heading = node; between = []; continue; }
      if (tabbable(node)) between.push(label(node));
    }
    return heading
      ? { text: heading.textContent.trim(), tag: heading.tagName.toLowerCase(), id: heading.id, between }
      : { text: null, between };
  }, selector);
}

test('Each text field has a heading right before it', { timeout: 120_000 }, async (t) => {
  const { page } = await start(t);
  const found = {};

  found.search = await headingBefore(page, '#note-search');
  found.note = await headingBefore(page, '#editor-host [contenteditable="true"]');

  await page.locator('#find-button').click();
  await page.locator('#find-bar').waitFor({ state: 'visible' });
  found.find = await headingBefore(page, '#find-input');
  await page.keyboard.press('Escape');
  await settle(page);

  await editorRoot(page).focus();
  await page.keyboard.press(INSERT_EQUATION);
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  found.equation = await headingBefore(page, '#composer-source');

  console.log('heading before each field:', JSON.stringify(found, null, 1));

  assert.deepEqual([found.search.text, found.search.tag, found.search.between], ['Search notes', 'h2', []]);
  assert.deepEqual([found.note.text, found.note.tag, found.note.between], ['Note', 'h2', []]);
  assert.deepEqual([found.find.text, found.find.tag, found.find.between], ['Find in note', 'h2', []]);
  // The Nemeth and LaTeX choice sits between the equation heading and its field. Focus
  // lands in the field itself, so this only has to be a heading a reader can find.
  assert.deepEqual([found.equation.id, found.equation.tag], ['composer-heading', 'h2']);
  assert.ok(found.equation.between.every((entry) => entry.startsWith('input')),
    `only the two method choices may sit between: ${found.equation.between}`);

  // The long hint about the two methods is read after the field, not before it.
  assert.equal(await page.evaluate(() => Boolean(document.getElementById('composer-source')
    .compareDocumentPosition(document.getElementById('replacement-method-help')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);

  // A heading names the search and find fields, so no second hidden label repeats it.
  assert.equal(await page.getByRole('searchbox', { name: 'Search notes' }).count(), 1);
  assert.equal(await page.getByText('Search notes', { exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('#find-button').click();
  await page.locator('#find-bar').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('textbox', { name: 'Find in note' }).count(), 1);
  assert.equal(await page.getByText('Find in note', { exact: true }).count(), 1);
});

/** Press Tab from the skip link until focus is inside the note. Returns the count. */
async function tabsFromSkipLinkToNote(page) {
  await page.evaluate(() => document.getElementById('skip-to-note').focus());
  for (let presses = 1; presses <= 60; presses += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null)) return presses;
  }
  throw new Error('Tab never reached the note');
}

test('Tab reaches the note in five presses, however many notes there are', { timeout: 120_000 }, async (t) => {
  const { page } = await start(t);
  await createNote(page, 'One');
  await createNote(page, 'Two');
  await createNote(page, 'Three');
  const count = await page.locator('#napkin-list [data-napkin-id]').count();
  assert.ok(count >= 3);
  const presses = await tabsFromSkipLinkToNote(page);
  console.log(`Tab presses from the skip link to the note (${count} notes):`, presses);
  // New note, Search, the list, the toolbar, the note.
  assert.equal(presses, 5);
});

test('The toolbar is one Tab stop and arrow keys move inside it', { timeout: 120_000 }, async (t) => {
  const { page } = await start(t);
  const toolbar = page.locator('#toolbar');
  assert.equal(await toolbar.getAttribute('role'), 'toolbar');
  assert.ok(await toolbar.getAttribute('aria-label'));

  const ids = await page.evaluate(() => [...document.querySelectorAll('#toolbar button')].map((b) => b.id));
  assert.ok(ids.length >= 5);
  const stops = await page.evaluate(() => [...document.querySelectorAll('#toolbar button')]
    .filter((b) => b.tabIndex >= 0).map((b) => b.id));
  assert.equal(stops.length, 1, `one Tab stop, found ${stops}`);

  const active = () => page.evaluate(() => document.activeElement?.id);
  await page.evaluate((id) => document.getElementById(id).focus(), stops[0]);
  await page.keyboard.press('ArrowRight');
  assert.equal(await active(), ids[1]);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await active(), ids[0]);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await active(), ids.at(-1), 'wraps from the first button to the last');
  await page.keyboard.press('ArrowRight');
  assert.equal(await active(), ids[0], 'wraps from the last button to the first');
  await page.keyboard.press('ArrowRight');
  assert.equal(await active(), ids[1]);
  // Home and End are not taken: VoiceOver does its own first and last.
  await page.keyboard.press('End');
  assert.equal(await active(), ids[1]);

  // Leave, then come back: focus returns to the button last used.
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#toolbar') === null), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await active(), ids[1]);
});

test('The list of notes is one Tab stop and arrow keys move between notes', { timeout: 120_000 }, async (t) => {
  const { page } = await start(t);
  await createNote(page, 'One');
  await createNote(page, 'Two');
  await createNote(page, 'Three');
  const noteIds = await page.evaluate(() => [...document.querySelectorAll('#napkin-list [data-napkin-id]')]
    .map((b) => b.dataset.napkinId));
  assert.ok(noteIds.length >= 3);
  const stops = await page.evaluate(() => [...document.querySelectorAll('#napkin-list [data-napkin-id]')]
    .filter((b) => b.tabIndex >= 0).map((b) => b.dataset.napkinId));
  assert.equal(stops.length, 1, `one Tab stop, found ${stops.length}`);
  assert.equal(await page.evaluate(() => document.querySelector('#napkin-list [tabindex="0"]')
    ?.getAttribute('aria-current')), 'page', 'the open note is the stop');

  const focused = () => page.evaluate(() => document.activeElement?.dataset?.napkinId);
  await page.evaluate((id) => document.querySelector(`[data-napkin-id="${id}"]`).focus(), stops[0]);
  for (let i = 0; i < noteIds.length; i += 1) await page.keyboard.press('ArrowUp');
  assert.equal(await focused(), noteIds[0], 'the top of the list stops there');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), noteIds[1]);
  await page.keyboard.press('ArrowUp');
  assert.equal(await focused(), noteIds[0]);
  for (let i = 0; i < noteIds.length; i += 1) await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), noteIds.at(-1), 'the bottom of the list stops there');

  // Arrow keys only move focus. Enter opens the note and puts the caret in it.
  for (let i = 0; i < noteIds.length; i += 1) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  const wanted = noteIds[1];
  await page.keyboard.press('Enter');
  await page.waitForFunction((id) => document.querySelector('#napkin-list [aria-current="page"]')
    ?.dataset.napkinId === id, wanted);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
});

test('The shortcuts sheet names the arrow keys', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await page.locator('#keyboard-help-button').click();
  const text = await page.locator('#keyboard-help').innerText();
  assert.match(text, /Move between toolbar buttons/);
  assert.match(text, /Move between notes/);
});
