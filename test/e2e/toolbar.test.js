import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MAC, editorRoot, insertEquation, launchApp, mathNodeLocator, paragraphTexts,
  press, selectEquation, settle
} from './launch-electron.js';

const EQUATION_KEY = MAC ? 'Control+=' : 'Alt+=';
const INSERT_KEY = MAC ? 'Control+Equal' : 'Alt+Equal';

async function start(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  const app = await launchApp({ dataDirectory });
  t.after(() => app.electronApp.close().catch(() => {}));
  return app;
}

/**
 * Tab until the skip link has focus. Chromium keeps a starting point for Tab, so
 * "the first stop" is shown two ways: the link is the first tabbable element in
 * the page, and Tab reaches it by itself.
 */
async function tabToSkipLink(page) {
  const firstTabbable = await page.evaluate(() => {
    const all = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0
        || el.id === 'skip-to-note');
    return all[0]?.id;
  });
  assert.equal(firstTabbable, 'skip-to-note');
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.id === 'skip-to-note')) return;
  }
  throw new Error('Tab never reached the skip link');
}

async function createNote(page, name) {
  await page.locator('#new-napkin-button').click();
  await page.locator('#napkin-name').fill(name);
  await page.locator('#new-napkin-submit').click();
  await page.locator('#new-napkin-form').waitFor({ state: 'hidden' });
  await page.waitForFunction(
    (n) => document.querySelector('#current-napkin-name')?.textContent === n, name);
}

const noteButtons = (page) => page.locator('#napkin-list [data-napkin-id]');
const noteNames = async (page) => (await noteButtons(page).allTextContents()).map((s) => s.trim());

function contrast(a, b) {
  const lum = ([r, g, bl]) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const parseRgb = (css) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

test('Undo and Redo buttons track the history and never use `disabled`', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  const undo = page.locator('#undo-button');
  const redo = page.locator('#redo-button');
  assert.equal(await undo.getAttribute('aria-disabled'), 'true');
  assert.equal(await redo.getAttribute('aria-disabled'), 'true');

  // Clicking a button that is aria-disabled does nothing.
  await undo.click({ force: true });
  await redo.click({ force: true });
  assert.deepEqual(await paragraphTexts(page), ['']);

  // A click, even on an aria-disabled button, moves focus to it. Go back to the note.
  await editorRoot(page).focus();
  await page.keyboard.type('Hello');
  await settle(page);
  assert.equal(await undo.getAttribute('aria-disabled'), 'false');
  assert.equal(await redo.getAttribute('aria-disabled'), 'true');

  await undo.click();
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['']);
  assert.equal(await redo.getAttribute('aria-disabled'), 'false');
  assert.equal(await undo.getAttribute('aria-disabled'), 'true');

  await redo.click();
  await settle(page);
  assert.deepEqual(await paragraphTexts(page), ['Hello']);
  assert.equal(await redo.getAttribute('aria-disabled'), 'true');

  for (const button of [undo, redo]) {
    assert.equal(await button.getAttribute('disabled'), null, 'never the disabled attribute');
    assert.equal(await button.evaluate((el) => el.disabled), false);
  }
});

test('Insert equation button opens the dock and inserts at the caret', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  const button = page.locator('#insert-equation-button');
  assert.equal(await page.locator('#insert-equation-key').textContent(), EQUATION_KEY);
  assert.ok(await button.getAttribute('aria-keyshortcuts'));

  await page.keyboard.type('Solve ');
  await settle(page);
  await button.click();
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'composer-source');
  assert.equal(await page.locator('#replacement-method input[value="nemeth"]').isVisible(), true);
  assert.equal(await page.locator('#replacement-method input[value="latex"]').isVisible(), true);

  await page.evaluate(() => {
    const input = document.querySelector('#replacement-method input[value="latex"]');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#composer-source').fill('x^2');
  await page.locator('#composer-submit').click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await mathNodeLocator(page).first().locator('mjx-container').waitFor({ timeout: 30_000 });
  assert.deepEqual(await paragraphTexts(page), ['Solve [math]']);
});

test('Rename and Delete act on the open note', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await createNote(page, 'Alpha');
  await createNote(page, 'Beta');
  const before = await noteNames(page);
  assert.ok(before.length >= 2);

  // Rename the open note (Beta).
  await page.locator('#rename-button').click();
  await page.locator('#new-napkin-form').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#napkin-name').inputValue(), 'Beta');
  assert.equal((await page.locator('#new-napkin-submit').textContent()).trim(), 'Rename note');
  await page.locator('#napkin-name').fill('Gamma');
  await page.locator('#new-napkin-submit').click();
  await page.waitForFunction(() => document.querySelector('#current-napkin-name').textContent === 'Gamma');
  const renamed = await noteNames(page);
  assert.ok(renamed.some((n) => n.includes('Gamma')));
  assert.ok(!renamed.some((n) => n.includes('Beta')));
  assert.equal(renamed.length, before.length);

  // Delete: dismiss first.
  page.once('dialog', (dialog) => { void dialog.dismiss(); });
  await page.locator('#delete-button').click();
  await settle(page);
  assert.equal((await noteNames(page)).length, before.length);
  assert.equal((await page.locator('#current-napkin-name').textContent()).trim(), 'Gamma');

  // Then accept.
  let message = '';
  page.once('dialog', (dialog) => { message = dialog.message(); void dialog.accept(); });
  await page.locator('#delete-button').click();
  await page.waitForFunction((n) => document.querySelectorAll('#napkin-list [data-napkin-id]').length === n,
    before.length - 1);
  assert.match(message, /Gamma/);
  const after = await noteNames(page);
  assert.ok(!after.some((n) => n.includes('Gamma')));
  const current = (await page.locator('#current-napkin-name').textContent()).trim();
  assert.notEqual(current, 'Gamma');
  assert.ok(current.length > 0 && current !== 'Loading…');
});

test('Skip link is the first Tab stop, off-screen until focused, and reaches the editor', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  const link = page.locator('#skip-to-note');
  const hidden = await link.boundingBox();
  assert.ok(hidden.y < 0, `off-screen before focus (top ${hidden.y})`);

  await tabToSkipLink(page);
  assert.ok((await link.boundingBox()).y >= 0, 'on-screen when focused');

  await page.keyboard.press('Enter');
  await settle(page);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);

  // Space does the same.
  await tabToSkipLink(page);
  await page.keyboard.press('Space');
  await settle(page);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
});

test('File > New note opens the form with the name field focused', { timeout: 60_000 }, async (t) => {
  const { electronApp, page } = await start(t);
  const found = await electronApp.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu().items.find((item) => item.label === 'File');
    const item = file?.submenu?.items.find((entry) => entry.label === 'New note');
    if (!item) return false;
    item.click();
    return true;
  });
  assert.equal(found, true, 'File > New note exists');
  await page.locator('#new-napkin-form').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'napkin-name');
});

test('Double-clicking an equation reads it by parts; Escape returns with it selected', { timeout: 120_000 }, async (t) => {
  const { page } = await start(t);
  const node = await insertEquation(page, { source: 'x^2' });
  await node.dblclick();
  await page.waitForFunction(() => {
    const n = document.querySelector('#editor-host .math-node');
    return Boolean(document.activeElement && n?.contains(document.activeElement));
  }, null, { timeout: 15_000 });
  const imgRoles = await page.evaluate(() => {
    const n = document.querySelector('#editor-host .math-node');
    return [n, ...n.querySelectorAll('*')].filter((el) => el.getAttribute('role') === 'img').length;
  });
  assert.equal(imgRoles, 0, 'role="img" is lifted while the explorer is active');

  await page.keyboard.press('Escape');
  await settle(page);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null
    && !document.activeElement.closest('.math-node')), true);
  assert.equal(await page.evaluate(() => {
    const sel = globalThis.__omniyaTesting.editor.view.state.selection;
    return sel.node?.type.name ?? null;
  }), 'math');
  // The name returns with the explorer closed.
  assert.equal(await page.evaluate(() => {
    const n = document.querySelector('#editor-host .math-node');
    return [n, ...n.querySelectorAll('*')].some((el) => el.getAttribute('role') === 'img');
  }), true);
});

test('Status hint appears only while an equation is selected', { timeout: 120_000 }, async (t) => {
  const { page } = await start(t);
  const hint = page.locator('#status-hint');
  assert.equal(await hint.getAttribute('aria-hidden'), 'true');
  await page.keyboard.type('Solve ');
  await insertEquation(page, { source: 'x^2' });
  await page.keyboard.type(' now');
  await settle(page);
  assert.equal((await hint.textContent()).trim(), '');

  await selectEquation(page, 0);
  assert.equal((await hint.textContent()).trim(),
    'Equation selected. Enter reads it by parts. Backspace deletes it.');
  assert.equal(await hint.getAttribute('aria-hidden'), 'true');

  await press(page, 'ArrowRight');
  await press(page, 'ArrowRight');
  assert.equal((await hint.textContent()).trim(), '');

  await selectEquation(page, 0);
  await page.keyboard.press(INSERT_KEY);
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await settle(page);
  assert.equal((await hint.textContent()).trim(), '');
});

test('An empty note shows a visual hint that is not in the accessibility tree', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  const root = editorRoot(page);
  assert.match(await root.getAttribute('aria-placeholder') ?? '', /Start writing/);
  assert.equal(await root.getAttribute('data-empty'), 'true');
  assert.ok(!(await page.locator('#editor-host').ariaSnapshot()).includes('Start writing'));

  await page.keyboard.type('a');
  await settle(page);
  assert.equal(await root.getAttribute('data-empty'), 'false');
  assert.ok(!(await page.locator('#editor-host').ariaSnapshot()).includes('Start writing'));
});

test('A paragraph holding only an equation is a centred display equation', { timeout: 120_000 }, async (t) => {
  const { page } = await start(t);
  await insertEquation(page, { source: 'x^2' });
  await page.keyboard.press('Enter');
  await page.keyboard.type('Solve ');
  await insertEquation(page, { source: 'y' });
  await page.keyboard.type(' now');
  await settle(page);

  const info = await page.evaluate(() => [...document.querySelectorAll('#editor-host .ProseMirror > p')]
    .map((p) => ({ cls: p.classList.contains('display-equation'), align: getComputedStyle(p).textAlign })));
  assert.equal(info.length, 2);
  assert.equal(info[0].cls, true);
  assert.equal(info[0].align, 'center');
  assert.equal(info[1].cls, false);
  assert.notEqual(info[1].align, 'center');
});

test('Accessible names on the page', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  assert.equal(await page.title(), 'Omniya Notes');
  assert.equal(await editorRoot(page).getAttribute('aria-label'), 'Note text');
  assert.equal(await page.getByRole('textbox', { name: 'Note text' }).count(), 1);

  const heading = page.getByRole('heading', { level: 2 });
  assert.equal(await heading.count(), 1);
  assert.equal(await heading.getAttribute('id'), 'current-napkin-name');

  assert.equal(await page.getByRole('complementary', { name: 'Notes' }).count(), 1);
  assert.equal(await page.getByRole('navigation', { name: 'Your notes' }).count(), 1);

  // Exactly one text box in the editor area, with the equation dock closed.
  assert.equal(await page.getByRole('textbox').count(), 1);
  assert.equal(await page.locator('#composer-source').isVisible(), false);
});

test('Keyboard shortcuts dialog opens on its title and closes with Escape', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await page.locator('#keyboard-help-button').click();
  const dialog = page.locator('dialog#keyboard-help');
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'keyboard-help-heading');
  assert.equal(await dialog.evaluate((el) => el.scrollTop), 0);
  const { height, windowHeight } = await dialog.evaluate((el) => ({
    height: el.getBoundingClientRect().height, windowHeight: window.innerHeight
  }));
  assert.ok(height <= windowHeight, `dialog ${height} fits window ${windowHeight}`);
  const headings = (await dialog.locator('h4').allTextContents()).map((s) => s.trim());
  for (const name of ['Writing', 'Equations', 'Reading and editing an equation']) {
    assert.ok(headings.includes(name), `heading ${name}`);
  }

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'keyboard-help-button');
});

test('Dark mode changes the colours and keeps the text readable', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  const read = () => page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { color: s.color, background: s.backgroundColor };
  });
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await read();
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await read();
  assert.notEqual(dark.background, light.background);
  for (const scheme of [light, dark]) {
    const ratio = contrast(parseRgb(scheme.color), parseRgb(scheme.background));
    assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)} for ${scheme.color} on ${scheme.background}`);
  }
});
