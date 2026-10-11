import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  launchApp,
  openEquationDock,
  paragraphTexts
} from './launch-electron.js';

// This file used to drive a "Command mode" reached with Ctrl+[ , where a single
// letter afterwards chose the action. That mode is gone, and so is the shared
// composer that replaced it: the napkin is now one document, and the equation
// field opens only on Word's equation key. The behaviours that still exist are
// pinned here against the keys that exist: Ctrl+E and Ctrl+L inside the equation
// field, and Ctrl+T in the document.
//
// "command s focuses mode panel" is not carried forward. Nothing focuses the
// mode panel, by design: it is a quiet status line.

async function launch(t, prefix = 'omniya-ueb-cmd-') {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const session = await launchApp({ dataDirectory });
  t.after(() => session.electronApp.close().catch(() => {}));
  return session;
}

function modePanelReads(page, pattern) {
  return page.waitForFunction(
    (source) => new RegExp(source, 'i').test(document.querySelector('#mode-panel')?.textContent ?? ''),
    pattern.source
  );
}

const savedStatus = (page) => page.locator('#save-status').textContent();

test('notes, the item list and the old composer chrome are gone', { timeout: 60_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-ueb-notes-hide-');

  for (const selector of [
    '#note-toggle', '#note-row', '#composer-note', '#transcript', 'article.napkin-article',
    '#mode-switch', '#composer-back', '#composer-discard', '#composer-choices',
    '#replacement-dock', '#replacement-input', '#item-count', '#reading-section'
  ]) {
    assert.equal(await page.locator(selector).count(), 0, `${selector} no longer exists`);
  }
});

test('Escape in the document does nothing: the caret stays and the text is kept', { timeout: 60_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-text-escape-');
  await page.keyboard.type('hello');

  await page.keyboard.press('Escape');

  // Escape used to hand focus to the item list. There is no list now, and a
  // stray Escape must not take the author out of the document or lose text.
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
  assert.deepEqual(await paragraphTexts(page), ['hello']);
  assert.equal(await page.locator('#composer-dock').isVisible(), false);
  await page.keyboard.type('!');
  assert.deepEqual(await paragraphTexts(page), ['hello!']);
});

test('there is no Command button, and the field is the only equation surface', { timeout: 60_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-cmd-btn-');
  assert.equal(await page.locator('#composer-command').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Command' }).count(), 0);
  assert.equal(await page.locator('#replacement-dock').count(), 0);

  await openEquationDock(page, null);
  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);
  assert.equal(await page.locator('#replacement-dock').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Command' }).count(), 0);
});

// The label has to survive ProseMirror redrawing the paragraph. An attribute set
// by hand on a ProseMirror-owned element is dropped, so the editor applies it as a
// node decoration. Without it a braille display user would get no UEB.
test('typed text carries a UEB braille label on its paragraph', { timeout: 60_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-ueb-text-submit-');

  await page.keyboard.type('hello world');
  const labeled = page.locator('#editor-host [contenteditable="true"] p[aria-braillelabel]');
  await labeled.first().waitFor({ timeout: 5_000 });
  const labels = await labeled.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-braillelabel') ?? ''));
  assert.ok(labels.some((label) => /⠓/.test(label)), `expected UEB ⠓ on a paragraph, got ${JSON.stringify(labels)}`);

  // The label follows the text: a second paragraph gets its own.
  await page.keyboard.press('Enter');
  await page.keyboard.type('good day');
  await page.waitForFunction(() => document.querySelectorAll(
    '#editor-host [contenteditable="true"] p[aria-braillelabel]'
  ).length === 2, null, { timeout: 15_000 });
});

test('Ctrl+E and Ctrl+L switch authoring method while the equation field is empty', { timeout: 60_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-ueb-x-cycle-');

  await openEquationDock(page, null);
  const checkedMethod = () => page.evaluate(
    () => document.querySelector('#replacement-method input:checked')?.value
  );
  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);
  assert.equal(await checkedMethod(), 'nemeth');

  await page.keyboard.press('Control+l');
  await modePanelReads(page, /Equation · LaTeX/);
  assert.equal(await checkedMethod(), 'latex');

  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);
  assert.equal(await checkedMethod(), 'nemeth');
});

test('Ctrl+E and Ctrl+L do nothing in the document, where they are not Word keys', { timeout: 60_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-ueb-chords-doc-');

  await page.keyboard.type('abc');
  await page.keyboard.press('Control+e');
  await page.keyboard.press('Control+l');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#composer-dock').isVisible(), false);
  assert.match(await page.locator('#mode-panel').textContent() ?? '', /Text · UEB G2/);
  assert.deepEqual(await paragraphTexts(page), ['abc']);
});

test('Ctrl+T toggles UEB grade in the document, announces it, and does nothing in the equation field', { timeout: 60_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-ueb-grade-');
  const mode = page.locator('#mode-panel');

  assert.match(await mode.textContent() ?? '', /Text · UEB G2/);
  await page.keyboard.press('Control+t');
  await modePanelReads(page, /Text · UEB G1/);
  assert.match(await savedStatus(page) ?? '', /UEB grade 1/);
  await page.keyboard.press('Control+t');
  await modePanelReads(page, /Text · UEB G2/);
  assert.match(await savedStatus(page) ?? '', /UEB grade 2/);
  // Toggling the grade is not an edit.
  assert.deepEqual(await paragraphTexts(page), ['']);

  await openEquationDock(page, 'nemeth');
  await modePanelReads(page, /Equation · Nemeth · empty/);
  await page.keyboard.press('Control+t');
  await page.waitForTimeout(150);
  assert.match(await mode.textContent() ?? '', /Equation · Nemeth · empty/);
  await page.keyboard.press('Escape');
  await modePanelReads(page, /Text · UEB G2/);
});

test('the mode panel is quiet and the help dialog lists the keys that exist', { timeout: 60_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-ueb-help-quiet-');

  // The panel is not announced on its own and not focusable. Nothing in the
  // app moves focus to it.
  const mode = await page.locator('#mode-panel').evaluate((el) => ({
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

  await page.locator('#keyboard-help-button').click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await dialog.waitFor();
  const help = await dialog.innerText();
  assert.match(help, /Ctrl\+E/i);
  assert.match(help, /Ctrl\+L/i);
  assert.match(help, /Ctrl\+T/i);
  assert.match(help, /Escape/i);
  assert.match(help, /Alt\+=/);
  assert.match(help, /Control\+=/);
  assert.match(help, /Ctrl\+Z/i);
  // The dead chord must not be advertised to someone who cannot see that
  // pressing it does nothing.
  assert.doesNotMatch(help, /Ctrl\+\[/i);
  assert.doesNotMatch(help, /Command mode/i);
  // The removed list model must not be described either.
  assert.doesNotMatch(help, /Up\/Down between items/i);
  // "Return to the note" is the document now, not a per-item note field.
  assert.doesNotMatch(help, /\bitems?\b/i);
  assert.doesNotMatch(help, /per-item/i);
  assert.match(await page.locator('#app-build-identity').textContent() ?? '', /\S/);
});

test('the Nemeth field reads computer braille, names the reading, and Escape cancels', { timeout: 90_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-ueb-repl-escape-');

  await openEquationDock(page, null);
  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);

  // A lowercase letter is not refused: `resolveBrailleInputTable` measures the
  // table on every keystroke, so 'a' typed on an ordinary keyboard decodes
  // through en-us-comp8 to the cell it spells. The field keeps the DECODED cell.
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

  await page.keyboard.press('Escape');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await modePanelReads(page, /Text/);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null), true);
  assert.deepEqual(await paragraphTexts(page), ['']);
});
