/**
 * Nemeth authoring, end to end in the real Electron app.
 *
 * The equation dock accumulates braille cells, `classifyNemethInput` narrates
 * the buffer into `#composer-status` (an aria-live region referenced by the
 * field's aria-describedby), and Enter runs the whole buffer through
 * `parseNemeth` before the equation is inserted into the document.
 *
 * Source is typed as Unicode braille cells (what a braille display sends) or
 * as computer braille (what a braille keyboard configured for text sends).
 * The Braille ASCII beside each literal below is a reading aid only.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  getMathNodes, insertEquation, launchApp, mathNodeLocator, openEquationDock
} from './launch-electron.js';

const FRACTION = '\u2839\u2801\u280c\u2803\u283c';                    // ?a/b#
const OPEN_FRACTION = '\u2839\u2801\u280c\u2803';                     // ?a/b
const FRACTION_CLOSE = '\u283c';                                      // #
const X_EQ_Y = '\u282d\u2800\u2828\u2805\u2800\u283d';                // x .k y
const UNKNOWN_SYMBOL = '\u282d\u282b\u282d';                          // x$x -- U+282B has no reading
const TWO_PLUS_TWO_CELLS = '⠼⠆⠬⠼⠆⠀⠨⠅⠀⠼⠲';                           // 2+2=4

async function launch(t, prefix) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const session = await launchApp({ dataDirectory });
  t.after(() => session.electronApp.close().catch(() => {}));
  return session;
}

const readStatus = (page, pattern) => page.waitForFunction(
  (source) => new RegExp(source).test(document.querySelector('#composer-status')?.textContent ?? ''),
  pattern
);

test('a computer-braille keyboard leaves braille cells in the field, not the characters it sent', { timeout: 90_000 }, async (t) => {
  // The decode was once computed for the status line and then thrown away, so
  // the field kept the ASCII. A braille reader arrowing the field heard
  // ordinary characters instead of cells.
  const { page } = await launch(t, 'omniya-nemeth-comp8-cells-');
  await openEquationDock(page, 'nemeth');

  await page.keyboard.type('#2+#2');
  await readStatus(page, 'read as');
  assert.equal(
    await page.locator('#composer-source').inputValue(),
    '⠼⠆⠬⠼⠆',
    'the field holds the decoded cells, not the ASCII the keyboard sent'
  );
});

test('an equation typed on a computer-braille keyboard commits with Enter', { timeout: 90_000 }, async (t) => {
  // The contributor's literal report: 2+2=4, which is '#2+#2 .k #4'.
  const { page } = await launch(t, 'omniya-nemeth-comp8-commit-');
  await openEquationDock(page, 'nemeth');

  await page.keyboard.type('#2+#2 .k #4');
  await readStatus(page, 'read as');
  assert.match(await page.locator('#composer-status').textContent() ?? '', /read as 2\+2=4/);

  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await mathNodeLocator(page).first().locator('mjx-container').waitFor();
  const [{ attrs }] = await getMathNodes(page);
  assert.match(attrs.mathml, />4<\/mn>/, 'the equation committed rather than refusing the buffer it just read back');
  assert.equal(attrs.sourceKind, 'nemeth');
});

test('s d f j k l are ordinary characters, not braille dots', { timeout: 90_000 }, async (t) => {
  // These six were the home-row dot keys while six-key chording existed, and
  // typing one produced a single-dot chord instead of the letter. Chording is
  // gone. Pinned because `f(x)` starts with one.
  const { page } = await launch(t, 'omniya-nemeth-letters-');
  await openEquationDock(page, 'nemeth');

  const field = page.locator('#composer-source');
  for (const [character, cell] of [
    ['f', '⠋'], ['d', '⠙'], ['s', '⠎'],
    ['j', '⠚'], ['k', '⠅'], ['l', '⠇']
  ]) {
    await field.fill('');
    await page.keyboard.type(character);
    assert.equal(await field.inputValue(), cell, `'${character}' is read as itself`);
  }

  await field.fill('');
  await page.keyboard.type('f(x)');
  await readStatus(page, 'read as');
  assert.match(await page.locator('#composer-status').textContent() ?? '', /read as f\(x\)/);
});

test('a display sending raw cells needs no table at all', { timeout: 90_000 }, async (t) => {
  // insertText bypasses key events entirely, which is what a braille display
  // sending Unicode cells looks like.
  const { page } = await launch(t, 'omniya-nemeth-rawcells-');
  await openEquationDock(page, 'nemeth');

  await page.keyboard.insertText(TWO_PLUS_TWO_CELLS);
  await readStatus(page, 'read as');
  assert.match(await page.locator('#composer-status').textContent() ?? '', /read as 2\+2=4/);

  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await mathNodeLocator(page).first().locator('mjx-container').waitFor();
  const [{ attrs }] = await getMathNodes(page);
  assert.match(attrs.mathml, />4<\/mn>/);
});

test('Nemeth cells in the dock become mathematics in the document', { timeout: 90_000 }, async (t) => {
  const { page, externalRequests } = await launch(t, 'omniya-nemeth-commit-');

  // A simple fraction, BANA Rule 12.
  const node = await insertEquation(page, { method: 'nemeth', source: FRACTION });
  const [{ attrs }] = await getMathNodes(page);
  assert.match(attrs.mathml, /mfrac/, 'the committed equation is a fraction');
  assert.equal(attrs.source, FRACTION, 'what was typed is kept as the source');

  // The braille projection is SRE's, from the MathML. No authoring-method side
  // channel writes aria-braillelabel.
  const braille = await node.locator('mjx-speech').first().getAttribute('aria-braillelabel');
  assert.ok(braille, 'the committed equation carries an SRE braille label');

  // After Enter the dock is gone and the document is back in text mode.
  assert.equal(await page.locator('#composer-dock').isVisible(), false);
  assert.match(await page.locator('#mode-panel').textContent() ?? '', /Text · UEB/);
  assert.deepEqual(externalRequests, [], 'authoring Nemeth makes no network request');
});

test('a blank cell is a Nemeth token: "x = y" commits as one expression', { timeout: 90_000 }, async (t) => {
  // If the field were routed through ueb-cell-buffer.js, the space would flush
  // and only "x" would survive.
  const { page } = await launch(t, 'omniya-nemeth-blank-');

  await insertEquation(page, { method: 'nemeth', source: X_EQ_Y });
  const [{ attrs }] = await getMathNodes(page);
  assert.match(attrs.mathml, /<mo[^>]*>=<\/mo>/, 'the comparison sign survived the blanks');
  assert.match(attrs.mathml, /<mi[^>]*>y<\/mi>/, 'the right-hand side survived the blanks');
});

test('the live status narrates the buffer to a screen reader without crying "unsupported"', { timeout: 90_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-nemeth-status-');
  await openEquationDock(page, 'nemeth');

  const status = page.locator('#composer-status');
  assert.equal(await status.getAttribute('aria-live'), 'polite', 'status must reach a screen reader');
  const describedBy = await page.locator('#composer-source').getAttribute('aria-describedby');
  assert.match(describedBy ?? '', /composer-status/);

  // Mid-expression: understood so far, not an error.
  await page.keyboard.type(OPEN_FRACTION);
  await readStatus(page, 'cells');
  const midway = await status.textContent();
  assert.doesNotMatch(midway ?? '', /unsupported|not supported|unavailable/i);
  assert.equal(
    await page.locator('#composer-source').getAttribute('aria-invalid'),
    'false',
    'an unfinished expression is not an error state'
  );
  assert.equal(await page.locator('#composer-error').isVisible(), false);

  // Closed: the status names the reading rather than merely approving.
  await page.keyboard.type(FRACTION_CLOSE);
  await readStatus(page, 'read as');
  assert.match(await status.textContent() ?? '', /5 cells read as \\frac\{a\}\{b\}/);

  // Cells stay in the field exactly as typed. Nothing is silently discarded.
  assert.equal(await page.locator('#composer-source').inputValue(), FRACTION);
});

test('an out-of-scope construct refuses at submit, with the product message and the cells kept', { timeout: 90_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-nemeth-refuse-');
  await openEquationDock(page, 'nemeth');

  await page.keyboard.type(UNKNOWN_SYMBOL);
  await page.keyboard.press('Enter');
  await page.locator('#composer-error:not([hidden])').waitFor();

  const message = await page.locator('#composer-error').textContent();
  assert.match(message ?? '', /isn't supported yet/i);
  assert.match(message ?? '', /LaTeX/, 'the refusal points at the way forward');
  assert.doesNotMatch(message ?? '', /offset|U\+|cell \d/i, 'developer detail must not reach the author');
  assert.equal(await page.locator('#composer-status').textContent(), message, 'the refusal is announced too');
  assert.equal(await page.locator('#composer-source').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#composer-source').inputValue(), UNKNOWN_SYMBOL, 'the cells are not thrown away');

  // A refusal keeps the dock open and puts nothing in the document.
  assert.equal(await page.locator('#composer-dock').isVisible(), true);
  assert.deepEqual(await getMathNodes(page), []);
});

test('a typed letter is read as its computer-braille cell, and said out loud', { timeout: 90_000 }, async (t) => {
  // With the input table measured rather than configured, there is no
  // cells-only mode: a letter decodes to the cell it spells. What holds the
  // line against silent reinterpretation is disclosure: the status names the
  // reading on every keystroke.
  const { page } = await launch(t, 'omniya-nemeth-letter-');
  await openEquationDock(page, 'nemeth');

  await page.keyboard.type(OPEN_FRACTION);
  await page.keyboard.type('a');

  assert.equal(
    await page.locator('#composer-source').inputValue(),
    `${OPEN_FRACTION}\u2801`,
    'the a becomes the letter-a cell, and the cells already entered survive'
  );
  assert.equal(await page.locator('#composer-error').isVisible(), false, 'this is not an error');
  const status = await page.locator('#composer-status').textContent() ?? '';
  assert.match(status, /computer braille/i, 'and the reading is announced, so it is never silent');
});

test('automatic detection reads a device with no setting, and says which reading it used', { timeout: 90_000 }, async (t) => {
  // The contributor had their display set to computer braille correctly and
  // was still refused on every keystroke, because no picker was discoverable.
  // Nothing is configured here. This is a fresh profile.
  const { page } = await launch(t, 'omniya-nemeth-auto-');
  await openEquationDock(page, 'nemeth');

  await page.keyboard.type('#2+#2 .k #4');
  await readStatus(page, 'read as');
  const status = await page.locator('#composer-status').textContent() ?? '';
  assert.match(status, /read as 2\+2=4/, 'decoded without anyone choosing a table');
  assert.match(status, /computer braille/i, 'and names the reading, so a wrong guess is audible');
  assert.equal(await page.locator('#composer-source').inputValue(), TWO_PLUS_TWO_CELLS);

  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await mathNodeLocator(page).first().locator('mjx-container').waitFor();
  const [{ attrs }] = await getMathNodes(page);
  assert.match(attrs.mathml, />4<\/mn>/);
});

test('automatic detection leaves a raw-cell buffer alone and announces no mode', { timeout: 90_000 }, async (t) => {
  // A display sending real cells must not be told it is being decoded through
  // anything. Silence here is the signal that nothing was reinterpreted.
  const { page } = await launch(t, 'omniya-nemeth-auto-cells-');
  await openEquationDock(page, 'nemeth');

  await page.keyboard.insertText(FRACTION);
  await readStatus(page, 'read as');
  const status = await page.locator('#composer-status').textContent() ?? '';
  assert.match(status, /read as/);
  assert.doesNotMatch(status, /computer braille/i);
  assert.equal(await page.locator('#composer-source').inputValue(), FRACTION, 'cells pass through untouched');
});

// The old "equation mode persists after Enter until Escape" test is rewritten.
// An alpha tester asked for it in August 2026; the Word-style editor ends it on
// purpose (docs/word-editor.md). What still matters: the equation landed, the
// document has the caret again, and the next equation is one key away.
test('after Enter the dock closes, the caret is back in the document, and a second equation is one key away', { timeout: 120_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-nemeth-mode-persists-');
  await openEquationDock(page, 'nemeth');

  await page.keyboard.type('#2+#2 .k #4');
  await readStatus(page, 'read as');
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await mathNodeLocator(page).first().locator('mjx-container').waitFor();

  assert.match(await page.locator('#mode-panel').textContent() ?? '', /Text · UEB/i);
  assert.equal(
    await page.evaluate(() => document.activeElement?.closest('#editor-host') !== null),
    true,
    'focus returns to the document'
  );

  await insertEquation(page, { method: 'nemeth', source: '⠼⠒⠬⠼⠒⠀⠨⠅⠀⠼⠖' }); // 3+3=6
  assert.equal((await getMathNodes(page)).length, 2);
});

test('the mode panel stops calling a full equation empty', { timeout: 90_000 }, async (t) => {
  // The panel is the state readout a braille reader queries.
  const { page } = await launch(t, 'omniya-nemeth-contentempty-');
  await openEquationDock(page, 'nemeth');

  assert.match(await page.locator('#mode-panel').textContent() ?? '', /Equation · Nemeth/);
  assert.match(await page.locator('#mode-panel').textContent() ?? '', /empty/i);
  await page.keyboard.type('#2+#2 .k #4');
  await readStatus(page, 'read as');
  assert.doesNotMatch(
    await page.locator('#mode-panel').textContent() ?? '',
    /empty/i,
    'a field holding a complete expression is not empty'
  );
});
