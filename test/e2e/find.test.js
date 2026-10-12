import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  UNDO, editorRoot, focusDocument, goToDocStart, insertEquation, launchApp, openEquationDock,
  paragraphTexts, press, settle
} from './launch-electron.js';

const FIND_KEY = 'ControlOrMeta+f';
const TEXT = 'Cat dog cat bird CAT';

async function start(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const app = await launchApp({ dataDirectory });
  t.after(() => app.electronApp.close().catch(() => {}));
  return app;
}

/** Type a line into the note and leave the caret at the end of it. */
async function writeNote(page, text = TEXT) {
  await focusDocument(page);
  await page.keyboard.type(text);
  await settle(page);
}

const bar = (page) => page.locator('#find-bar');
const input = (page) => page.locator('#find-input');
const count = (page) => page.locator('#find-count');
const matches = (page) => page.locator('#editor-host .find-match');
const current = (page) => page.locator('#editor-host .find-current');

async function openFind(page) {
  await page.keyboard.press(FIND_KEY);
  await bar(page).waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'find-input');
}

async function search(page, query) {
  await input(page).fill(query);
  await settle(page);
}

const selection = (page) => page.evaluate(() => {
  const { state } = globalThis.__omniyaTesting.editor.view;
  const { from, to, node } = state.selection;
  return {
    from, to,
    text: state.doc.textBetween(from, to, ' '),
    node: node ? node.type.name : null
  };
});

/** Click a menu item of the real application menu, by its label. */
function clickMenuItem(electronApp, label) {
  return electronApp.evaluate(({ Menu }, wanted) => {
    const walk = (items) => {
      for (const item of items) {
        if (item.label === wanted) return item;
        const inner = item.submenu ? walk(item.submenu.items) : null;
        if (inner) return inner;
      }
      return null;
    };
    const item = walk(Menu.getApplicationMenu().items);
    if (!item) throw new Error(`No menu item "${wanted}"`);
    item.click();
  }, label);
}

test('Cmd/Ctrl+F opens a search region named "Find in note" and focuses its field', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  assert.equal(await bar(page).isHidden(), true);
  await openFind(page);
  assert.equal(await bar(page).getAttribute('role'), 'search');
  assert.equal(await bar(page).getAttribute('aria-label'), 'Find in note');
  assert.equal(await input(page).inputValue(), '');
  assert.equal(await count(page).getAttribute('aria-live'), 'polite');
  assert.equal(await count(page).textContent(), '');
});

test('the Find button and the Edit menu item open the bar too', { timeout: 60_000 }, async (t) => {
  const { page, electronApp } = await start(t);
  await writeNote(page);
  await page.locator('#find-button').click();
  await bar(page).waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'find-input');
  await page.locator('#find-close').click();
  await bar(page).waitFor({ state: 'hidden' });

  await clickMenuItem(electronApp, 'Find in note…');
  await bar(page).waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'find-input');
});

test('the field starts with a short selection', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await goToDocStart(page);
  await press(page, 'Shift+ArrowRight', 3);
  await openFind(page);
  assert.equal(await input(page).inputValue(), 'Cat');
  assert.equal(await count(page).textContent(), '1 of 3');
});

test('typing highlights every match and counts them, ignoring case', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await goToDocStart(page);
  await openFind(page);
  await search(page, 'cat');
  assert.equal(await matches(page).count(), 3);
  assert.equal(await current(page).count(), 1);
  assert.equal(await count(page).textContent(), '1 of 3');
  assert.deepEqual((await matches(page).allTextContents()).map((s) => s.toLowerCase()), ['cat', 'cat', 'cat']);
});

test('typing key by key keeps the count right', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await goToDocStart(page);
  await openFind(page);
  await page.keyboard.type('bird');
  await settle(page);
  assert.equal(await count(page).textContent(), '1 of 1');
  assert.equal(await matches(page).count(), 1);
});

test('the first match at or after the caret is the current one', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await goToDocStart(page);
  await press(page, 'ArrowRight', 5);
  await openFind(page);
  await search(page, 'cat');
  assert.equal(await count(page).textContent(), '2 of 3');
  assert.equal(await current(page).textContent(), 'cat');
  assert.equal((await selection(page)).from, 9);
});

test('no matches says so, and an empty query is silent', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await openFind(page);
  await search(page, 'zebra');
  assert.equal(await count(page).textContent(), 'No matches');
  assert.equal(await matches(page).count(), 0);
  await search(page, '');
  assert.equal(await count(page).textContent(), '');
  assert.equal(await matches(page).count(), 0);
});

test('Enter goes to the next match and Shift+Enter to the previous, wrapping round', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await goToDocStart(page);
  await openFind(page);
  await search(page, 'cat');
  assert.equal(await count(page).textContent(), '1 of 3');
  await press(page, 'Enter');
  assert.equal(await count(page).textContent(), '2 of 3');
  await press(page, 'Enter', 2);
  assert.equal(await count(page).textContent(), '1 of 3');
  await press(page, 'Shift+Enter');
  assert.equal(await count(page).textContent(), '3 of 3');
  await press(page, 'Shift+Enter');
  assert.equal(await count(page).textContent(), '2 of 3');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'find-input');
});

test('the Next and Previous buttons do the same', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await goToDocStart(page);
  await openFind(page);
  await search(page, 'cat');
  await page.locator('#find-next').click();
  assert.equal(await count(page).textContent(), '2 of 3');
  await page.locator('#find-previous').click();
  await page.locator('#find-previous').click();
  assert.equal(await count(page).textContent(), '3 of 3');
});

test('Escape closes the bar, clears the highlights, returns to the editor and leaves the match selected', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await goToDocStart(page);
  await openFind(page);
  await search(page, 'dog');
  await page.keyboard.press('Escape');
  await bar(page).waitFor({ state: 'hidden' });
  assert.equal(await matches(page).count(), 0);
  assert.equal(await count(page).textContent(), '');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
  const picked = await selection(page);
  assert.equal(picked.text, 'dog');
  assert.equal(picked.node, null);

  // Typing now replaces the selected match: the caret really is on it.
  await page.keyboard.type('fox');
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['Cat fox cat bird CAT']);
});

test('the Close button does what Escape does', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await goToDocStart(page);
  await openFind(page);
  await search(page, 'bird');
  await page.locator('#find-close').click();
  await bar(page).waitFor({ state: 'hidden' });
  assert.equal(await matches(page).count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
  assert.equal((await selection(page)).text, 'bird');
});

test('Find next and Find previous in the Edit menu open the bar when it is closed', { timeout: 60_000 }, async (t) => {
  const { page, electronApp } = await start(t);
  await writeNote(page);
  await clickMenuItem(electronApp, 'Find next');
  await bar(page).waitFor({ state: 'visible' });
  await page.locator('#find-close').click();
  await bar(page).waitFor({ state: 'hidden' });
  await clickMenuItem(electronApp, 'Find previous');
  await bar(page).waitFor({ state: 'visible' });
});

test('Find next in the menu steps through matches while the bar is open', { timeout: 60_000 }, async (t) => {
  const { page, electronApp } = await start(t);
  await writeNote(page);
  await goToDocStart(page);
  await openFind(page);
  await search(page, 'cat');
  await clickMenuItem(electronApp, 'Find next');
  await page.waitForFunction(() => document.querySelector('#find-count').textContent === '2 of 3');
  await clickMenuItem(electronApp, 'Find previous');
  await page.waitForFunction(() => document.querySelector('#find-count').textContent === '1 of 3');
});

test('an equation matches when its source holds the query, and the whole equation is highlighted', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await focusDocument(page);
  await page.keyboard.type('Before ');
  const equation = await insertEquation(page, { method: 'latex', source: 'x^2+y' });
  await settle(page);
  await goToDocStart(page);
  await openFind(page);
  await search(page, 'X^2');
  assert.equal(await count(page).textContent(), '1 of 1');
  assert.equal(await page.locator('#editor-host .math-node.find-match.find-current').count(), 1);
  assert.equal(await matches(page).count(), 1);
  assert.ok(await equation.evaluate((el) => el.classList.contains('find-match')));
  await search(page, 'before');
  assert.equal(await page.locator('#editor-host .math-node.find-match').count(), 0);
  assert.equal(await matches(page).count(), 1);
});

test('closing on an equation match leaves the equation selected as a unit', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await focusDocument(page);
  await page.keyboard.type('Before ');
  await insertEquation(page, { method: 'latex', source: 'x^2+y' });
  await settle(page);
  await goToDocStart(page);
  await openFind(page);
  await search(page, 'x^2');
  await page.keyboard.press('Escape');
  await bar(page).waitFor({ state: 'hidden' });
  assert.equal((await selection(page)).node, 'math');
  assert.equal(await page.locator('#editor-host .find-match').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
});

test('editing the note while the bar is open updates the matches', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await openFind(page);
  await search(page, 'cat');
  assert.equal(await matches(page).count(), 3);

  // Back to the note without closing the bar, and add one more word.
  await editorRoot(page).focus();
  await settle(page);
  await page.keyboard.press('End');
  await page.keyboard.type(' cat');
  await settle(page);
  assert.equal(await matches(page).count(), 4);

  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await settle(page);
  assert.equal(await matches(page).count(), 3);
});

// The highlights follow an edit, but #find-count is only redrawn by runFind(),
// which runs on input and on note switch, not on an editor change. After typing
// a fourth "cat" the count still reads "1 of 3".
test('editing the note while the bar is open updates the count',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await start(t);
    await writeNote(page);
    await openFind(page);
    await search(page, 'cat');
    await editorRoot(page).focus();
    await settle(page);
    await page.keyboard.press('End');
    await page.keyboard.type(' cat');
    await settle(page);
    assert.match(await count(page).textContent(), /^\d of 4$/);
  });

test('switching to another note runs the search again on that note', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  const firstName = (await page.locator('#current-napkin-name').textContent()).trim();

  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').fill('Second');
  await page.locator('#new-napkin-submit').click();
  await page.locator('#new-napkin-form').waitFor({ state: 'hidden' });
  await page.waitForFunction(
    () => document.querySelector('#current-napkin-name')?.textContent === 'Second');
  await focusDocument(page);
  await page.keyboard.type('one cat only');
  await settle(page);

  await openFind(page);
  await search(page, 'cat');
  assert.equal(await matches(page).count(), 1);

  await page.locator('#napkin-list [data-napkin-id]', { hasText: firstName }).first().click();
  await page.waitForFunction(
    (n) => document.querySelector('#current-napkin-name')?.textContent === n, firstName);
  await page.waitForFunction(() => document.querySelector('#find-count').textContent === '1 of 3');
  assert.equal(await matches(page).count(), 3);
  assert.equal(await bar(page).isVisible(), true);
});

test('while the equation panel is open, Find refuses and says why', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page);
  await openEquationDock(page, 'latex');
  assert.equal(await page.locator('#announcer').getAttribute('aria-live'), 'polite');
  await page.keyboard.press(FIND_KEY);
  await page.waitForFunction(
    () => document.querySelector('#announcer')?.textContent.includes('Finish or cancel the equation first.'));
  assert.equal(await bar(page).isHidden(), true);
  assert.equal(await page.locator('#composer-dock').isVisible(), true);
});

test('searching does not add to the undo history', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await writeNote(page, 'alpha beta');
  await openFind(page);
  await search(page, 'beta');
  await page.keyboard.press('Escape');
  await bar(page).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#undo-button').getAttribute('aria-disabled'), 'false');

  // One Undo takes back the typing, not the search.
  await page.keyboard.press(UNDO);
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['']);
});

test('searching a fresh note leaves Undo disabled', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await focusDocument(page);
  await openFind(page);
  await search(page, 'anything');
  await page.keyboard.press('Escape');
  await bar(page).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#undo-button').getAttribute('aria-disabled'), 'true');
});
