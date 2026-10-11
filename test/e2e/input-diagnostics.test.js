/**
 * The diagnostics dump, end to end in the real app.
 *
 * Unit tests cover the formatting; what they cannot show is that the capture is
 * actually attached to the live field, sees what the dock did to a keystroke,
 * and produces a report a contributor could paste back. That whole chain is the
 * point: the bug it exists for survived three rounds of email precisely because
 * nothing observable connected "I typed this" to "the app stored that".
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getMathNodes, launchApp, mathNodeLocator, openEquationDock } from './launch-electron.js';

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
const diagnostics = (page) => page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());

test('the diagnostics report captures what the field received in the running app', { timeout: 90_000 }, async (t) => {
  const { page } = await launch(t, 'omniya-diagnostics-');
  await openEquationDock(page, 'nemeth');
  await page.keyboard.type('#2+#2');
  await readStatus(page, 'read as');

  // Built from the app's own live state, not from a fixture.
  const report = await diagnostics(page);
  assert.ok(report, 'the app can produce a report');

  assert.match(report, /Omniya Core — braille input diagnostics/);
  assert.match(report, /Braille input table: auto \(read as en-us-comp8\)/, 'names the reading detection settled on');
  assert.match(report, /keydown .*key="#"/, 'the keystrokes the device sent are recorded');
  assert.match(report, /field="⠼⠆⠬⠼⠆"/, 'and the cells the field ended up holding');
  assert.match(report, /includes the mathematics you were typing/, 'and it discloses what it contains');
});

test('a keystroke the app consumes is visible in the report', { timeout: 90_000 }, async (t) => {
  // Six-key chording used to consume s d f j k l here, silently. It is gone,
  // but the signal that exposed it is kept, because "a handler ate the
  // keypress" is the first thing to rule out when input seems not to arrive.
  // Enter is a keystroke the dock still legitimately claims.
  const { page } = await launch(t, 'omniya-diagnostics-consumed-');
  await openEquationDock(page, 'nemeth');
  await page.keyboard.type('#2+#2');
  await readStatus(page, 'read as');
  await page.keyboard.press('Enter');

  assert.match(await diagnostics(page), /CONSUMED-BY-APP/, 'the app says it claimed the keystroke');
});

test('the report says what Enter did, both when it works and when it refuses', { timeout: 120_000 }, async (t) => {
  // An alpha tester reported equations refused on Enter and accepted on a
  // retry, and attached a log whose last line was the Enter keystroke and
  // nothing after it. The verdict is recorded by app.js, because only it knows.
  const { page } = await launch(t, 'omniya-diagnostics-commit-');
  await openEquationDock(page, 'nemeth');

  // A refusal: U+282B has no Nemeth reading, so submit raises the product
  // message. This is the case a report needs to carry and could not.
  await page.keyboard.insertText('⠭⠫⠭');
  await readStatus(page, 'cells');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /supported/i.test(document.querySelector('#composer-error')?.textContent ?? ''));

  let report = await diagnostics(page);
  assert.match(report, /commit .*verdict=refused/, 'the refusal is in the log');
  assert.match(report, /field="⠭⠫⠭"/, 'with the exact buffer that was refused');
  assert.match(report, /isn't supported yet/, 'and the message the author heard');

  // And the other outcome, so "accepted" is never inferred from silence. The
  // dock stays open after a refusal, so the same field takes the retry.
  await page.locator('#composer-source').fill('');
  await page.keyboard.type('#2+#2 .k #4');
  await readStatus(page, 'read as');
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await mathNodeLocator(page).first().locator('mjx-container').waitFor();

  report = await diagnostics(page);
  assert.match(report, /commit .*verdict=accepted/, 'a successful commit is recorded too');
  assert.equal((await getMathNodes(page)).length, 1);
});

test('the report covers the whole session, across several equations, not the last 20 lines', { timeout: 120_000 }, async (t) => {
  // Two limits used to cut this down: the log kept 50 entries and the report
  // printed 20 of them, so a dump could only ever show the tail of the last
  // expression. Nothing stateful is diagnosable from that.
  //
  // The old version of this test also typed prose first and expected it in the
  // report. Prose now goes into the document, which is deliberately not a
  // logged field ("not a document-wide key log"), so that half is not asserted.
  const { page } = await launch(t, 'omniya-diagnostics-session-');

  // Three passes through the dock: well past the old 20-line report cap and
  // the old 50-entry log cap.
  const typed = ['#2+#2 .k #4', '#3+#3 .k #6', '#4+#4 .k #8'];
  for (const [index, source] of typed.entries()) {
    await openEquationDock(page, 'nemeth');
    await page.keyboard.type(source);
    await readStatus(page, 'read as');
    await page.keyboard.press('Enter');
    await page.locator('#composer-dock').waitFor({ state: 'hidden' });
    await mathNodeLocator(page).nth(index).locator('mjx-container').waitFor();
  }

  const report = await diagnostics(page);

  assert.match(report, /everything the writing fields received since the app started/);
  assert.doesNotMatch(report, /earlier lines are not shown/, 'nothing was trimmed in a session this short');

  assert.match(report, /-- mode: Equation · Nemeth/, 'the equation mode the keys were typed in is named');
  assert.match(report, /keydown .*key="#"/);

  // Comfortably more than the twenty lines the report used to print.
  const entryLines = report.split('\n').filter((line) => /^(keydown|input|commit) /.test(line));
  assert.ok(entryLines.length > 60, `expected the whole session, got ${entryLines.length} lines`);

  // All three commits are in it, and the verdict is still the last word.
  assert.equal((report.match(/commit .*verdict=accepted/g) ?? []).length, 3);
});
