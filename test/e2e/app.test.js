import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import axe from 'axe-core';
import {
  DOC_END,
  enterExplorer,
  explorerSpeech,
  focusDocument,
  getDoc,
  getMathNodes,
  insertEquation,
  launchApp,
  mathNodeLocator,
  openEquationDock,
  paragraphTexts,
  press,
  projectRoot,
  settle,
  typeEquation
} from './launch-electron.js';

const artifactDirectory = path.join(projectRoot, 'test', 'artifacts', 'latest');

async function resetArtifactDirectory() {
  await rm(artifactDirectory, { recursive: true, force: true });
  await mkdir(artifactDirectory, { recursive: true });
}

async function saveNapkinFile(dataDirectory) {
  try {
    await copyFile(
      path.join(dataDirectory, 'napkins.json'),
      path.join(artifactDirectory, 'test.napkin.json')
    );
  } catch (error) {
    console.error(`Could not save test napkin file: ${error.message}`);
  }
}

/** Launch on a fresh data directory. The app closes when the test ends. */
async function start(t, prefix = 'omniya-e2e-') {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const session = await launchApp({ dataDirectory });
  t.after(() => session.electronApp.close().catch(() => {}));
  return { ...session, dataDirectory };
}

async function assertNoAxeViolations(page) {
  await page.evaluate(axe.source);
  const scan = await page.evaluate(() => globalThis.axe.run());
  assert.deepEqual(scan.violations, []);
}

const modePanelText = (page) => page.locator('#mode-panel').textContent();
const modePanelReads = (page, pattern) => page.waitForFunction(
  (source) => new RegExp(source, 'i').test(document.querySelector('#mode-panel')?.textContent ?? ''),
  pattern.source
);
const focusIsInDocument = (page) => page.evaluate(
  () => document.activeElement?.closest('#editor-host') !== null
);

async function createNapkin(page, name) {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
}

test('supports a live-text offline napkin workflow', { timeout: 120_000 }, async (t) => {
  await resetArtifactDirectory();
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-e2e-'));
  let session = await launchApp({ dataDirectory });
  t.after(async () => {
    await saveNapkinFile(dataDirectory);
    await session.electronApp.close().catch(() => {});
  });

  const { page } = session;
  const napkinRail = page.getByRole('complementary', { name: 'Notes' });
  const editor = page.locator('#editor-host [contenteditable="true"]');

  // The document is the first thing there is. No equation field until asked for.
  await napkinRail.waitFor();
  assert.equal(await editor.getAttribute('aria-label'), 'Note text');
  assert.equal(await page.locator('#napkin-list [aria-current="page"] .note-name').textContent(), 'Untitled note');
  assert.equal(await page.locator('#composer-dock').isVisible(), false);
  assert.equal(await focusIsInDocument(page), true);
  assert.match(await modePanelText(page), /Text · UEB G2/);
  assert.equal(await page.locator('#mode-panel').getAttribute('aria-live'), null);
  assert.equal(await page.getByRole('button', { name: 'Shortcuts' }).count(), 1);
  await assertNoAxeViolations(page);

  await createNapkin(page, 'Proof ideas');
  assert.equal(await napkinRail.getByRole('button', { name: 'Proof ideas' }).count(), 1);
  assert.equal(await editor.getAttribute('aria-label'), 'Note text');
  assert.equal(await page.locator('#napkin-list [aria-current="page"] .note-name').textContent(), 'Proof ideas');
  assert.equal(await page.locator('#composer-dock').isVisible(), false);
  assert.equal(await focusIsInDocument(page), true, 'a new napkin is ready to type in');
  assert.match(await modePanelText(page), /Text · UEB G2/);
  await assertNoAxeViolations(page);

  // The equation field open, with an unreadable expression refused in words.
  await openEquationDock(page, 'latex');
  assert.match(await modePanelText(page), /Equation · LaTeX · empty/);
  await assertNoAxeViolations(page);
  await typeEquation(page, { method: 'latex', source: '\\frac{' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#composer-error')?.hidden);
  assert.match(await page.locator('#composer-error').textContent(), /convert|incomplete|empty/i);
  assert.equal(await page.locator('#composer-dock').isVisible(), true, 'a refused equation keeps the field open');
  await assertNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.equal(await focusIsInDocument(page), true);
  assert.deepEqual(await paragraphTexts(page), ['']);

  // Keyboard help.
  await page.getByRole('button', { name: 'Shortcuts' }).click();
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await help.waitFor();
  await assertNoAxeViolations(page);
  const helpText = await help.innerText();
  assert.match(helpText, /Ctrl\+E/);
  assert.match(helpText, /Ctrl\+L/);
  assert.doesNotMatch(helpText, /Ctrl\+T/, 'Ctrl+T is no longer a shortcut');
  assert.match(helpText, /Escape/);
  await page.getByRole('button', { name: 'Close' }).click();
  await help.waitFor({ state: 'hidden' });
  await focusDocument(page);

  await page.keyboard.type('Let a be positive.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Then ');
  await insertEquation(page, {
    method: 'latex',
    source: '\\frac{d}{dx}\\left(\\int_0^x e^{t^2}\\,dt\\right)=e^{x^2}'
  });
  assert.deepEqual(await paragraphTexts(page), ['Let a be positive.', 'Then [math]']);
  const equation = mathNodeLocator(page).first();
  assert.ok(await equation.locator('mjx-container math mfrac').count());
  assert.ok(await equation.locator('mjx-container math msubsup').count());
  assert.equal(await equation.getAttribute('role'), 'img');
  assert.ok((await equation.getAttribute('aria-label') ?? '').length > 0, 'the equation has a spoken name');

  // A second napkin holds its own document.
  await createNapkin(page, 'Text notes');
  assert.equal(await focusIsInDocument(page), true);
  await page.keyboard.type('The proof starts here.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second line.');
  assert.deepEqual(await paragraphTexts(page), ['The proof starts here.', 'Second line.']);
  // Select all and delete leaves an empty title and one empty paragraph to type in.
  // The note is then called "Untitled note", as it is in Apple Notes.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  assert.deepEqual(await paragraphTexts(page), ['']);
  assert.equal(await page.locator('#napkin-list [aria-current="page"] .note-name').textContent(), 'Untitled note');

  // Switching back loads the first napkin's document, equation drawn.
  await napkinRail.getByRole('button', { name: 'Proof ideas' }).click();
  await mathNodeLocator(page).first().locator('mjx-container').waitFor();
  assert.deepEqual(await paragraphTexts(page), ['Let a be positive.', 'Then [math]']);
  assert.equal(await focusIsInDocument(page), true);
  const ariaSnapshot = await page.getByRole('main').ariaSnapshot();
  assert.match(ariaSnapshot, /textbox "Note text"/);
  assert.match(ariaSnapshot, /heading "Proof ideas"/);

  assert.deepEqual([...session.externalRequests], []);
  await page.evaluate(() => globalThis.__omniyaTesting.flush());
  const before = await getDoc(page);
  await session.electronApp.close();

  session = await launchApp({ dataDirectory });
  await session.page.getByRole('complementary', { name: 'Notes' }).waitFor();
  assert.deepEqual(await getDoc(session.page), before, 'the active napkin comes back as it was');
  await mathNodeLocator(session.page).first().locator('mjx-container').waitFor();
  assert.ok(await mathNodeLocator(session.page).first().locator('mjx-container math').count());
  assert.equal(await focusIsInDocument(session.page), true);
  await session.page.getByRole('button', { name: 'Untitled note' }).last().click();
  assert.deepEqual(await paragraphTexts(session.page), ['']);
  assert.deepEqual([...session.externalRequests], []);
});

test('the equation key inserts at the caret, and the dock closes with the caret after the equation', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t, 'omniya-insert-e2e-');

  await page.keyboard.type('Let x equal ');
  await openEquationDock(page, 'latex');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source');
  assert.match(await modePanelText(page), /Equation · LaTeX/);
  await typeEquation(page, { method: 'latex', source: '2+2' });
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await mathNodeLocator(page).first().locator('mjx-container').waitFor({ timeout: 30_000 });

  // Unlike the earlier editor, the field does not stay up. The document has text
  // after an equation, so the caret goes back to it.
  assert.equal(await focusIsInDocument(page), true);
  assert.match(await modePanelText(page), /Text · UEB G2/);
  assert.deepEqual(await paragraphTexts(page), ['Let x equal [math]']);
  await page.keyboard.type('.');
  assert.deepEqual(await paragraphTexts(page), ['Let x equal [math].']);
});

test('Ctrl+E in the equation field picks Nemeth; Escape cancels and keeps the text', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t, 'omniya-pick-nemeth-e2e-');

  await page.keyboard.type('Before equation');
  await openEquationDock(page, 'latex');
  await modePanelReads(page, /Equation · LaTeX/);
  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source');
  await page.keyboard.press('Control+l');
  await modePanelReads(page, /Equation · LaTeX/);
  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);

  await page.keyboard.press('Escape');
  await modePanelReads(page, /Text/);
  assert.equal(await page.locator('#composer-dock').isVisible(), false);
  assert.equal(await focusIsInDocument(page), true);
  assert.deepEqual(await paragraphTexts(page), ['Before equation']);
});

test('an equation in the middle of a word splits it around the equation, and Escape does not', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t, 'omniya-mid-word-e2e-');

  await page.keyboard.type('HelloWorld');
  await press(page, 'ArrowLeft', 'World'.length);

  // Opening the field changes nothing in the document.
  await openEquationDock(page, 'nemeth');
  assert.deepEqual(await paragraphTexts(page), ['HelloWorld']);
  await page.keyboard.press('Escape');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.deepEqual(await paragraphTexts(page), ['HelloWorld']);
  assert.equal(await focusIsInDocument(page), true);

  // Escape put the caret back where it was, so the equation goes between the words.
  await insertEquation(page, { method: 'latex', source: 'x' });
  assert.deepEqual(await paragraphTexts(page), ['Hello[math]World']);
  assert.equal((await getDoc(page)).content.length, 1, 'still one paragraph');

  // The caret is at the start of World, not at the end of the paragraph.
  await page.keyboard.type('!');
  assert.deepEqual(await paragraphTexts(page), ['Hello[math]!World']);
});

test('Escape at the start of World keeps Hello and World on either side of an equation', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t, 'omniya-escape-island-e2e-');

  await page.keyboard.type('Hello');
  await insertEquation(page, { method: 'latex', source: 'x' });
  await page.keyboard.type('World');
  assert.deepEqual(await paragraphTexts(page), ['Hello[math]World']);

  await press(page, 'ArrowLeft', 'World'.length);
  await openEquationDock(page, 'nemeth');
  await page.keyboard.press('Escape');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await modePanelReads(page, /Text/);

  assert.deepEqual(await paragraphTexts(page), ['Hello[math]World']);
  assert.equal((await getMathNodes(page)).length, 1);
  // Typing continues from the start of World, so nothing merged or moved.
  await page.keyboard.type('>');
  assert.deepEqual(await paragraphTexts(page), ['Hello[math]>World']);
});

test('an equation can be inserted into a paragraph that was cleared in the middle of the document', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t, 'omniya-middle-hole-e2e-');

  await page.keyboard.type('Hello');
  await page.keyboard.press('Enter');
  await page.keyboard.type('middle');
  await page.keyboard.press('Enter');
  await page.keyboard.type('World');
  // Let the editor catch up with the typing before the first navigation key.
  await settle(page, 300);
  await press(page, 'ArrowUp');
  // The caret must now be in the middle paragraph. A lost arrow key shows up here.
  await page.waitForFunction(
    () => globalThis.__omniyaTesting.editor.view.state.selection.$from.index(0) === 2,
    null,
    { timeout: 5_000 }
  );
  await press(page, 'ArrowRight');
  await press(page, 'Backspace', 'middle'.length);
  assert.deepEqual(await paragraphTexts(page), ['Hello', '', 'World']);

  await insertEquation(page, { method: 'latex', source: 'y' });
  assert.deepEqual(await paragraphTexts(page), ['Hello', '[math]', 'World']);
  await page.keyboard.press(DOC_END);
  await page.keyboard.type('!');
  assert.deepEqual(await paragraphTexts(page), ['Hello', '[math]', 'World!']);
});

test('moves left and right between sibling expressions inside MathML', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t, 'omniya-horizontal-e2e-');

  await insertEquation(page, { method: 'latex', source: 'a+b' });
  const node = await enterExplorer(page, 0);
  await node.locator('mjx-speech').waitFor();

  const speech = node.locator('mjx-speech');
  const labelIs = (label) => page.waitForFunction(
    (expected) => document.querySelector('.math-node mjx-speech')?.getAttribute('aria-label') === expected,
    label
  );
  await page.keyboard.press('ArrowDown');
  await labelIs('a');
  const first = await speech.getAttribute('aria-label');
  await page.keyboard.press('ArrowRight');
  await labelIs('plus');
  assert.equal(await speech.getAttribute('aria-label'), 'plus');
  await page.keyboard.press('ArrowRight');
  await labelIs('b');
  await page.keyboard.press('ArrowLeft');
  await labelIs('plus');
  await page.keyboard.press('ArrowLeft');
  await labelIs('a');
  assert.equal(await speech.getAttribute('aria-label'), first);
  assert.equal(await explorerSpeech(page) !== null, true);
});

test('r on an equation read by parts replaces it through the equation field', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t, 'omniya-replace-e2e-');

  await insertEquation(page, { method: 'latex', source: 'a+b' });
  const [{ attrs: original }] = await getMathNodes(page);
  await enterExplorer(page, 0);

  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await modePanelReads(page, /replacing/i);
  await typeEquation(page, { method: 'latex', source: 'c' });
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Replacement committed');

  const nodes = await getMathNodes(page);
  assert.equal(nodes.length, 1);
  assert.notEqual(nodes[0].attrs.mathml, original.mathml);
  assert.match(nodes[0].attrs.mathml, /<mi[^>]*>c<\/mi>/);
});

// The equation's drawing is hidden from readers (one named image stands for it)
// until the explorer is entered. MathJax's container is focusable, so the hidden
// drawing must also be inert, or axe reports aria-hidden-focus.
test('axe finds no violations in a document that holds an equation', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t, 'omniya-axe-equation-e2e-');
  await insertEquation(page, { method: 'latex', source: 'x^2' });
  await assertNoAxeViolations(page);
});

// The panel sits above the note's title in the page, so its heading is a level 2.
// As a level 3 it broke heading order (h1 Notes, then h3, then h2).
test('axe finds no violations with the equation panel open over an equation', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t, 'omniya-axe-equation-dock-e2e-');
  await insertEquation(page, { method: 'latex', source: 'x^2' });
  await openEquationDock(page, 'latex');
  await assertNoAxeViolations(page);
});

test('deletes a focused sidebar napkin only after confirmation', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t, 'omniya-delete-napkin-e2e-');
  const rail = page.getByRole('complementary', { name: 'Notes' });

  await createNapkin(page, 'Second napkin');
  await createNapkin(page, 'Third napkin');
  await page.keyboard.type('notes on third');
  assert.deepEqual(await paragraphTexts(page), ['notes on third']);

  const second = rail.getByRole('button', { name: 'Second napkin' });
  await second.focus();
  let message = '';
  await Promise.all([
    page.waitForEvent('dialog').then(async (dialog) => {
      message = dialog.message();
      await dialog.accept();
    }),
    second.press('Backspace')
  ]);
  assert.match(message, /delete the note.*Second napkin/i);
  await rail.getByRole('button', { name: 'Second napkin' }).waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Third napkin');
  assert.deepEqual(await paragraphTexts(page), ['notes on third'], 'deleting another napkin leaves the open one alone');

  // A declined confirmation deletes nothing.
  const third = rail.getByRole('button', { name: 'Third napkin' });
  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.dismiss()),
    third.press('Backspace')
  ]);
  await settle(page);
  assert.equal(await rail.getByRole('button', { name: 'Third napkin' }).count(), 1);

  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.accept()),
    third.press('Backspace')
  ]);
  await rail.getByRole('button', { name: 'Third napkin' }).waitFor({ state: 'detached' });
  // The napkin that is left is open and takes typing.
  await page.locator('#editor-host [contenteditable="true"]').waitFor();
  assert.equal(await page.locator('#napkin-list [aria-current="page"] .note-name').textContent(), 'Untitled note');
  await focusDocument(page);
  await page.keyboard.type('still works after delete');
  assert.deepEqual(await paragraphTexts(page), ['still works after delete']);

  const first = rail.getByRole('button', { name: 'Untitled note' });
  let finalMessage = '';
  await Promise.all([
    page.waitForEvent('dialog').then(async (dialog) => {
      finalMessage = dialog.message();
      await dialog.accept();
    }),
    first.press('Backspace')
  ]);
  assert.match(finalMessage, /delete the note.*Untitled note/i);
  await rail.getByRole('button', { name: 'Untitled note' }).waitFor({ state: 'detached' });
  assert.equal(await rail.locator('[data-napkin-id]').count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'No note open' }).count(), 1);
  assert.equal(await page.locator('#editor-host').isVisible(), false, 'no document without a napkin');
  assert.equal(await page.locator('#empty-message').isVisible(), true);
});

test('typing in the title renames the note, and Ctrl+U on the list goes to the title', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t, 'omniya-rename-napkin-e2e-');
  const rail = page.getByRole('complementary', { name: 'Notes' });

  await createNapkin(page, 'Second napkin');
  await page.locator('#editor-host [contenteditable="true"]').waitFor();

  const first = rail.getByRole('button', { name: 'Untitled note' });
  await first.focus();
  await first.press('Control+u');
  await page.waitForFunction(
    () => Boolean((getSelection().anchorNode?.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode?.parentElement)?.closest('#current-napkin-name')));
  await page.keyboard.type('Proof ideas');
  // The list follows as the title is typed.
  await rail.getByRole('button', { name: 'Proof ideas' }).waitFor();
  assert.equal(await rail.getByRole('button', { name: 'Second napkin' }).count(), 1);

  await page.getByRole('button', { name: 'Second napkin' }).click();
  assert.match(await page.locator('#napkin-list [aria-current="page"] .note-name').textContent() ?? '', /Second napkin/);
  assert.equal(await page.locator('#editor-host [contenteditable="true"]').getAttribute('aria-label'), 'Note text');

  // A note with an empty title is called "Untitled note", and the title shows a hint.
  await page.evaluate(() => globalThis.__omniyaTesting.editor.focusTitle());
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('#current-napkin-name').textContent(), '');
  assert.equal(await page.locator('#napkin-list [aria-current="page"] .note-name').textContent(), 'Untitled note');
});

test('Enter in the title moves to the note, and Up from the first line comes back', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t, 'omniya-title-keys-e2e-');
  await createNapkin(page, 'Algebra');
  assert.equal(await focusIsInDocument(page), true, 'Enter in the title lands in the note');
  await page.keyboard.type('first line');
  await page.keyboard.press('ArrowUp');
  assert.equal(
    await page.evaluate(() => Boolean((getSelection().anchorNode?.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode?.parentElement)?.closest('#current-napkin-name'))),
    true, 'Up from the first line reaches the title');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focusIsInDocument(page), true);
});

test('typing is saved on its own, without a save command', { timeout: 60_000 }, async (t) => {
  const { page, dataDirectory } = await start(t, 'omniya-autosave-e2e-');

  await page.keyboard.type('Saved by itself');
  const file = path.join(dataDirectory, 'napkins.json');
  const readSaved = async () => {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return null;
    }
  };
  // The editor saves a moment after typing stops. No flush here.
  await assert.doesNotReject(async () => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const saved = await readSaved();
      if (saved?.napkins[0].doc.content[1].content?.[0]?.text === 'Saved by itself') return;
      if (Date.now() > deadline) throw new Error('the typed text was never saved');
      await settle(page, 100);
    }
  });
  const saved = await readSaved();
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.napkins[0].items, undefined);
});
