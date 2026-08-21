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

test('QWERTY stays gated: a typed letter is refused, and the cells already entered survive', { timeout: 90_000 }, async (t) => {
  // Commit 8bc05ae ("gate Nemeth QWERTY") is a standing product decision, and
  // test/e2e/ueb-text-command-mode.test.js asserts the same thing for an empty
  // field. This adds the case that decides the design: the old engine cleared
  // the WHOLE field on a bad keystroke, throwing away correct work.
  const { app, page } = await launch('omniya-nemeth-qwerty-');
  t.after(() => app.close().catch(() => {}));
  await enterNemethMode(page);

  await page.keyboard.type(OPEN_FRACTION);
  await page.keyboard.type('a');

  assert.equal(
    await page.locator('#composer-source').inputValue(),
    OPEN_FRACTION,
    'the a is stripped and the four good cells are kept'
  );
  assert.equal(await page.locator('#composer-source').getAttribute('aria-invalid'), 'true');
  const message = await page.locator('#composer-error').textContent();
  assert.match(message ?? '', /braille cells only|LaTeX|x in Command mode/i, 'matches the existing product assertion');
  assert.match(message ?? '', /"a"/, 'and names the character that was refused');
});

test('Ctrl+D opens the braille input table picker, and the choice decodes computer-braille ASCII and persists', { timeout: 90_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-nemeth-braille-table-'));
  const launchWith = async () => {
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
  };

  const first = await launchWith();
  t.after(() => first.app.close().catch(() => {}));
  await enterNemethMode(first.page);

  // Off by default: '2' is refused exactly like ordinary QWERTY typing.
  await first.page.keyboard.type('2');
  await first.page.locator('#composer-error:not([hidden])').waitFor();
  assert.match(await first.page.locator('#composer-error').textContent() ?? '', /braille cells only/i);

  await first.page.keyboard.press('Control+d');
  const dialog = first.page.locator('#braille-table-picker');
  await dialog.waitFor({ state: 'visible' });
  const noneOption = first.page.locator('#braille-table-menu [data-value="none"]');
  const comp8Option = first.page.locator('#braille-table-menu [data-value="en-us-comp8"]');

  // Opens with the current choice both focused and checked.
  assert.equal(await noneOption.getAttribute('aria-checked'), 'true');
  assert.equal(await noneOption.evaluate((el) => el === document.activeElement), true);

  // Arrowing moves focus only -- it must NOT apply the option arrowed past
  // (that was the bug this menu used to have) and must NOT close the dialog.
  await first.page.keyboard.press('ArrowDown');
  assert.equal(await comp8Option.evaluate((el) => el === document.activeElement), true, 'focus moved to the arrowed-to option');
  assert.equal(await comp8Option.getAttribute('aria-checked'), 'false', 'arrowing onto it does not apply it');
  assert.equal(await noneOption.getAttribute('aria-checked'), 'true', 'the original choice is untouched');
  assert.equal(await dialog.isVisible(), true, 'the dialog stays open while arrowing between options');

  // Escape closes without applying whatever was merely focused.
  await first.page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await first.page.locator('#composer-source').isVisible(), true, 'focus returns to the field');
  await first.page.keyboard.press('Control+d');
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await noneOption.getAttribute('aria-checked'), 'true', 'reopening shows the choice from before, unaffected by the earlier arrowing');

  // Enter on the focused option applies it and closes the dialog.
  await first.page.keyboard.press('ArrowDown');
  await first.page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await first.page.locator('#composer-source').isVisible(), true, 'focus returns to the field');

  // On now: '#2+#2' (numeric indicator, digit, plus, numeric indicator, digit)
  // decodes and parses as ordinary Nemeth arithmetic.
  await first.page.keyboard.type('#2+#2');
  await first.page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  assert.match(await first.page.locator('#composer-status').textContent() ?? '', /read as 2\+2/);
  assert.equal(await first.page.locator('#composer-error').isVisible(), false);

  await first.app.close();

  // Relaunch against the same userData dir: the choice survived the process.
  const second = await launchWith();
  t.after(() => second.app.close().catch(() => {}));
  await enterNemethMode(second.page);
  await second.page.keyboard.press('Control+d');
  await second.page.locator('#braille-table-picker').waitFor({ state: 'visible' });
  assert.equal(
    await second.page.locator('#braille-table-menu [data-value="en-us-comp8"]').getAttribute('aria-checked'),
    'true',
    'the picker reopens with the persisted choice already selected'
  );
});
