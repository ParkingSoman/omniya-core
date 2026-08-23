/**
 * Nemeth authoring, end to end in the real Electron app.
 *
 * These exercise the re-wire itself: the composer field accumulates braille
 * cells, `classifyNemethInput` narrates the buffer into `#composer-status`
 * (an aria-live region referenced by the field's aria-describedby), and Enter
 * runs the whole buffer through `parseNemeth` inside `materializeDraft`.
 *
 * Source is typed as Unicode braille cells, which is what a braille display or
 * the six-key emitter sends. QWERTY characters are deliberately NOT accepted
 * (commit 8bc05ae, "gate Nemeth QWERTY"); the Braille ASCII beside each literal
 * below is a reading aid for a sighted developer, not an accepted input.
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

// Cell literals. Braille ASCII shown alongside for readability only.
const FRACTION = '\u2839\u2801\u280c\u2803\u283c';                    // ?a/b#
const OPEN_FRACTION = '\u2839\u2801\u280c\u2803';                     // ?a/b
const FRACTION_CLOSE = '\u283c';                                      // #
const X_EQ_Y = '\u282d\u2800\u2828\u2805\u2800\u283d';                // x .k y
const UNKNOWN_SYMBOL = '\u282d\u282b\u282d';                          // x$x -- U+282B has no reading

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

async function enterNemethMode(page) {
  await page.locator('#composer-source').waitFor();
  await page.locator('#composer-source').focus();
  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
}

test('a computer-braille keyboard leaves braille cells in the field, not the characters it sent', { timeout: 90_000 }, async (t) => {
  // The decode was being computed for the status line and then thrown away, so
  // the field kept the ASCII. A braille reader arrowing the field heard
  // ordinary characters instead of cells, and Enter refused the buffer the
  // status line had just read back as mathematics.
  const { app, page } = await launch('omniya-nemeth-comp8-cells-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  await page.keyboard.type('#2+#2');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  assert.equal(
    await page.locator('#composer-source').inputValue(),
    '⠼⠆⠬⠼⠆',
    'the field holds the decoded cells, not the ASCII the keyboard sent'
  );
});

test('an equation typed on a computer-braille keyboard commits with Enter', { timeout: 90_000 }, async (t) => {
  // The contributor's literal report: 2+2=4, which is '#2+#2 .k #4'. Note the
  // '.k' -- the Nemeth equals sign spells with 'k', one of the six-key chord
  // letters, so this case needs both the decode fix and the chord guard.
  const { app, page } = await launch('omniya-nemeth-comp8-commit-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  await page.keyboard.type('#2+#2 .k #4');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  assert.match(await page.locator('#composer-status').textContent() ?? '', /read as 2\+2=4/);

  await page.keyboard.press('Enter');
  const article = page.locator('article.napkin-article').first();
  await article.locator('mjx-assistive-mml math, math').first().waitFor();
  const mathml = await article.locator('mjx-assistive-mml math, math').first().innerHTML();
  assert.match(mathml, />4<\/mn>/, 'the equation committed rather than refusing the buffer it just read back');
});

test('s d f j k l are ordinary characters, not braille dots', { timeout: 90_000 }, async (t) => {
  // These six were the home-row dot keys while six-key chording existed, and
  // typing one produced a single-dot chord instead of the letter -- 'f' meant ⠋
  // and inserted ⠁, silently. Chording is gone, so they are just characters
  // now. Pinned because `f(x)` starts with one and this is the exact set that
  // used to break.
  const { app, page } = await launch('omniya-nemeth-letters-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  const field = page.locator('#composer-source');
  for (const [character, cell] of [
    ['f', '⠋'], ['d', '⠙'], ['s', '⠎'],
    ['j', '⠚'], ['k', '⠅'], ['l', '⠇']
  ]) {
    await field.fill('');
    await page.keyboard.type(character);
    assert.equal(await field.inputValue(), cell, `'${character}' is read as itself`);
  }

  // And the case that motivated removing chording at all.
  await field.fill('');
  await page.keyboard.type('f(x)');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  assert.match(await page.locator('#composer-status').textContent() ?? '', /read as f\(x\)/);
});

test('a display sending raw cells needs no table at all', { timeout: 90_000 }, async (t) => {
  // insertText bypasses key events entirely, which is what a braille display
  // sending Unicode cells looks like -- also the shape NVDA produces with its
  // braille input table set to "Unicode braille". Structurally immune to the
  // six-key layer, so it pins that the two paths stay independent.
  const { app, page } = await launch('omniya-nemeth-rawcells-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  await page.keyboard.insertText('⠼⠆⠬⠼⠆⠀⠨⠅⠀⠼⠲');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  assert.match(await page.locator('#composer-status').textContent() ?? '', /read as 2\+2=4/);

  await page.keyboard.press('Enter');
  const article = page.locator('article.napkin-article').first();
  await article.locator('mjx-assistive-mml math, math').first().waitFor();
  assert.match(
    await article.locator('mjx-assistive-mml math, math').first().innerHTML(),
    />4<\/mn>/
  );
});

test('Nemeth cells in the composer become mathematics in the document', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-commit-');
  t.after(() => app.close().catch(() => {}));

  // \u2839\u2801\u280c\u2803\u283c ('?a/b#') -- a simple fraction, BANA Rule 12.
  const article = await addEquationViaComposer(page, { method: 'nemeth', source: FRACTION });
  const mathml = await article.locator('mjx-assistive-mml math, math').first().innerHTML();
  assert.match(mathml, /mfrac/, 'the committed equation is a fraction');

  // The braille projection is SRE's, from the MathML -- there is no
  // authoring-method side channel writing aria-braillelabel.
  const braille = await article.locator('mjx-speech').first().getAttribute('aria-braillelabel');
  assert.ok(braille, 'the committed equation carries an SRE braille label');
});

test('a blank cell is a Nemeth token: "x = y" commits as one expression', { timeout: 90_000 }, async (t) => {
  // The blocker this input path exists for. If the field were routed through
  // ueb-cell-buffer.js, the space would flush and only "x" would survive.
  const { app, page } = await launch('omniya-nemeth-blank-');
  t.after(() => app.close().catch(() => {}));

  const article = await addEquationViaComposer(page, { method: 'nemeth', source: X_EQ_Y });
  const mathml = await article.locator('mjx-assistive-mml math, math').first().innerHTML();
  assert.match(mathml, /<mo[^>]*>=<\/mo>/, 'the comparison sign survived the blanks');
  assert.match(mathml, /<mi[^>]*>y<\/mi>/, 'the right-hand side survived the blanks');
});

test('the live status narrates the buffer to a screen reader without crying "unsupported"', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-status-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  const status = page.locator('#composer-status');
  assert.equal(await status.getAttribute('aria-live'), 'polite', 'status must reach a screen reader');
  const describedBy = await page.locator('#composer-source').getAttribute('aria-describedby');
  assert.match(describedBy ?? '', /composer-status/);

  // Mid-expression: understood so far, not an error.
  await page.keyboard.type(OPEN_FRACTION);
  await page.waitForFunction(() => /cells/.test(document.querySelector('#composer-status')?.textContent ?? ''));
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
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  assert.match(await status.textContent() ?? '', /5 cells read as \\frac\{a\}\{b\}/);

  // Cells stay in the field exactly as typed -- nothing is silently discarded.
  assert.equal(await page.locator('#composer-source').inputValue(), FRACTION);
});

test('an out-of-scope construct refuses at submit, with the product message and the cells kept', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-refuse-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  await page.keyboard.type(UNKNOWN_SYMBOL);
  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());
  await page.locator('#composer-error:not([hidden])').waitFor();

  const message = await page.locator('#composer-error').textContent();
  assert.match(message ?? '', /isn't supported yet/i);
  assert.match(message ?? '', /LaTeX/, 'the refusal points at the way forward');
  assert.doesNotMatch(message ?? '', /offset|U\+|cell \d/i, 'developer detail must not reach the author');
  assert.equal(await page.locator('#composer-status').textContent(), message, 'the refusal is announced too');
  assert.equal(await page.locator('#composer-source').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#composer-source').inputValue(), UNKNOWN_SYMBOL, 'the cells are not thrown away');
});

test('a typed letter is read as its computer-braille cell, and said out loud', { timeout: 90_000 }, async (t) => {
  // Supersedes the old "QWERTY stays gated" assertion, which pinned 8bc05ae's
  // outright refusal of letter keys. That refusal is genuinely gone: with the
  // input table measured rather than configured, there is no cells-only mode
  // left to fall back to, and a letter decodes to the cell it spells.
  //
  // What replaces the guarantee is disclosure, not silence. 8bc05ae's stated
  // worry was input being SILENTLY reinterpreted as mathematics; the status
  // line names both the reading and the mode on every keystroke, so an author
  // who typed prose by mistake hears it immediately.
  const { app, page } = await launch('omniya-nemeth-letter-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  await page.keyboard.type(OPEN_FRACTION);
  await page.keyboard.type('a');

  assert.equal(
    await page.locator('#composer-source').inputValue(),
    `${OPEN_FRACTION}\u2801`,
    'the a becomes the letter-a cell, and the cells already entered survive'
  );
  assert.equal(await page.locator('#composer-error').isVisible(), false, 'this is no longer an error');
  const status = await page.locator('#composer-status').textContent() ?? '';
  assert.match(status, /computer braille/i, 'and the reading is announced, so it is never silent');
});

test('automatic detection reads a device with no setting, and says which reading it used', { timeout: 90_000 }, async (t) => {
  // The whole point of the default: the contributor had their display set to
  // computer braille correctly and was still refused on every keystroke,
  // because they had no way to know a picker existed. Nothing is configured
  // here -- this is a fresh profile.
  const { app, page } = await launch('omniya-nemeth-auto-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  await page.keyboard.type('#2+#2 .k #4');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  const status = await page.locator('#composer-status').textContent() ?? '';
  assert.match(status, /read as 2\+2=4/, 'decoded without anyone choosing a table');
  assert.match(status, /computer braille/i, 'and names the reading, so a wrong guess is audible');
  assert.equal(await page.locator('#composer-source').inputValue(), '⠼⠆⠬⠼⠆⠀⠨⠅⠀⠼⠲');

  await page.keyboard.press('Enter');
  const article = page.locator('article.napkin-article').first();
  await article.locator('mjx-assistive-mml math, math').first().waitFor();
  assert.match(await article.locator('mjx-assistive-mml math, math').first().innerHTML(), />4<\/mn>/);
});

test('automatic detection leaves a raw-cell buffer alone and announces no mode', { timeout: 90_000 }, async (t) => {
  // A display sending real cells must not be told it is being decoded through
  // anything -- silence here is the signal that nothing was reinterpreted.
  const { app, page } = await launch('omniya-nemeth-auto-cells-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  await page.keyboard.insertText(FRACTION);
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  const status = await page.locator('#composer-status').textContent() ?? '';
  assert.match(status, /read as/);
  assert.doesNotMatch(status, /computer braille/i);
  assert.equal(await page.locator('#composer-source').inputValue(), FRACTION, 'cells pass through untouched');
});

test('equation mode persists after Enter until Escape asks for text', { timeout: 120_000 }, async (t) => {
  // Reported by an alpha tester on 2026-08-23: "After I'm done entering an
  // equation, I hit enter and I'm ready to enter in another equation. I
  // expected the equation editor to still be up ... It would be nice if it
  // stayed in equation mode until I told it to go to the text entry mode."
  //
  // Committing used to call enterDocumentTextAuthoring(), so every equation
  // cost a Ctrl+E to get back. Escape is the way out, and it already was.
  const { app, page } = await launch('omniya-nemeth-mode-persists-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  await page.keyboard.type('#2+#2 .k #4');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  await page.keyboard.press('Enter');
  await page.locator('article.napkin-article').first()
    .locator('mjx-assistive-mml math, math').first().waitFor();

  // Still in Nemeth, with an empty field ready for the next expression.
  await page.waitForFunction(() => /Equation · Nemeth/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
  assert.equal(await page.locator('#composer-source').inputValue(), '');
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'composer-source',
    'focus stays in the field the author is already typing into'
  );
  // #composer-status is the field's aria-describedby live region -- with focus
  // never moving, it is the only channel that can tell a screen-reader user the
  // equation landed and the mode held.
  assert.match(
    await page.locator('#composer-status').textContent() ?? '',
    /added.*Nemeth/i,
    'the status names both the insert and the mode that persisted'
  );

  // A second equation goes straight in, with no Ctrl+E in between.
  await page.keyboard.type('#3+#3 .k #6');
  await page.waitForFunction(() => /read as 3\+3=6/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('article.napkin-article').length === 2);

  // Escape is the documented way back to text, and still is.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => /Text · UEB/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
});

test('the mode panel stops calling a full equation empty', { timeout: 90_000 }, async (t) => {
  // The panel is the state readout a braille reader queries; it said
  // "Equation · Nemeth · empty" with 22 cells in the field because
  // syncCommandContentEmpty() updated commandState without re-rendering chrome.
  const { app, page } = await launch('omniya-nemeth-contentempty-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  assert.match(await page.locator('#mode-panel').textContent() ?? '', /empty/i);
  await page.keyboard.type('#2+#2 .k #4');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  assert.doesNotMatch(
    await page.locator('#mode-panel').textContent() ?? '',
    /empty/i,
    'a field holding a complete expression is not empty'
  );
});
