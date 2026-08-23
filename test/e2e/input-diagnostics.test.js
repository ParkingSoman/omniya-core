/**
 * The diagnostics dump, end to end in the real app.
 *
 * Unit tests cover the formatting; what they cannot show is that the capture is
 * actually attached to the live field, sees what the composer did to a
 * keystroke, and produces a report a contributor could paste back. That whole
 * chain is the point -- the bug it exists for survived three rounds of email
 * precisely because nothing observable connected "I typed this" to "the app
 * stored that".
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from './launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

test('the diagnostics report captures what the field received in the running app', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-diagnostics-');
  t.after(() => app.close().catch(() => {}));

  await page.locator('#composer-source').focus();
  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
  await page.keyboard.type('#2+#2');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));

  // Built from the app's own live state, not from a fixture.
  const report = await page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());
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
  // Enter is a keystroke the composer still legitimately claims.
  const { app, page } = await launch('omniya-diagnostics-consumed-');
  t.after(() => app.close().catch(() => {}));

  await page.locator('#composer-source').focus();
  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
  await page.keyboard.type('#2+#2');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  await page.keyboard.press('Enter');

  const report = await page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());
  assert.match(report, /CONSUMED-BY-APP/, 'the app says it claimed the keystroke');
});

test('the report says what Enter did, both when it works and when it refuses', { timeout: 120_000 }, async (t) => {
  // The gap an alpha tester's report ran into on 2026-08-23: they wrote that
  // some equations were refused on Enter and accepted on a retry, and attached
  // the log -- whose last line was the Enter keystroke and nothing after it.
  // input-capture.js gates every entry on #mode-panel reading Nemeth, and Enter
  // is what ends that, so the verdict could never appear. app.js records it.
  const { app, page } = await launch('omniya-diagnostics-commit-');
  t.after(() => app.close().catch(() => {}));

  await page.locator('#composer-source').focus();
  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));

  // A refusal: U+282B has no Nemeth reading, so submit raises the product
  // message. This is the case a report needs to carry and could not.
  await page.keyboard.insertText('⠭⠫⠭');
  await page.waitForFunction(() => /cells/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /supported/i.test(document.querySelector('#composer-error')?.textContent ?? ''));

  let report = await page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());
  assert.match(report, /commit .*verdict=refused/, 'the refusal is in the log');
  assert.match(report, /field="⠭⠫⠭"/, 'with the exact buffer that was refused');
  assert.match(report, /isn't supported yet/, 'and the message the author heard');

  // And the other outcome, so "accepted" is never inferred from silence.
  await page.locator('#composer-source').fill('');
  await page.keyboard.type('#2+#2 .k #4');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  await page.keyboard.press('Enter');
  await page.locator('article.napkin-article').first()
    .locator('mjx-assistive-mml math, math').first().waitFor();

  report = await page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());
  assert.match(report, /commit .*verdict=accepted/, 'a successful commit is recorded too');
});

test('the report covers the whole session, text mode included, not the last 20 lines', { timeout: 120_000 }, async (t) => {
  // Two limits used to cut this down: the log kept 50 entries and the report
  // printed 20 of them, so a dump could only ever show the tail of the last
  // expression. Nothing stateful is diagnosable from that -- an alpha tester's
  // "refused on Enter, accepted on retry" is explained, if at all, by what
  // happened before the attempt that failed. The capture was also gated on the
  // mode panel reading Nemeth, so an author who was never in equation mode
  // produced no log at all, which looks exactly like having typed nothing.
  const { app, page } = await launch('omniya-diagnostics-session-');
  t.after(() => app.close().catch(() => {}));

  // Well past the old 20-line report cap and the old 50-entry log cap.
  await page.locator('#composer-source').focus();
  await page.keyboard.type('quadratics: the integral of x squared, worked out below ');
  await page.waitForTimeout(150);

  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
  await page.keyboard.type('#2+#2 .k #4');
  await page.waitForFunction(() => /read as/.test(document.querySelector('#composer-status')?.textContent ?? ''));
  await page.keyboard.press('Enter');
  // Not .first() -- the prose above it is an item too, and it has no math.
  await page.locator('#transcript').locator('mjx-assistive-mml math, math').first().waitFor();

  const report = await page.evaluate(() => globalThis.__omniyaTesting?.inputDiagnostics?.());

  assert.match(report, /everything the writing field received since the app started/);
  assert.doesNotMatch(report, /earlier lines are not shown/, 'nothing was trimmed in a session this short');

  // The prose typed before Ctrl+E is present -- it was invisible before.
  assert.match(report, /keydown key="q"/, 'prose typed before Ctrl+E is present -- it was invisible before');
  assert.match(report, /-- mode: Text · UEB/, 'and the mode it was typed in is named');
  assert.match(report, /-- mode: Equation · Nemeth/, 'as is the switch into equation authoring');

  // Comfortably more than the twenty lines the report used to print.
  const entryLines = report.split('\n').filter((line) => /^(keydown|input|commit) /.test(line));
  assert.ok(entryLines.length > 60, `expected the whole session, got ${entryLines.length} lines`);

  // And the verdict is still the last word.
  assert.match(report, /commit .*verdict=accepted/);
});
