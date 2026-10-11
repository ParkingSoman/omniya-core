import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenReader, voiceOver } from '@guidepup/guidepup';
import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from '../e2e/launch-electron.js';

// Phase 0 gate, layer 3: a REAL screen reader against the editor spike.
// macOS runs VoiceOver. Windows runs NVDA. Guidepup picks by platform.
// This file needs the CI setup in .github/workflows/screen-reader.yml.
// It is not part of `npm run test:e2e`.
//
// The page has two text boxes with the same words. "control" is a plain
// contenteditable with no equation. "editor" is the ProseMirror spike with an
// inline equation. Walking both tells a fault in the editor apart from a limit
// of the test harness. Every step is saved as a transcript.
//
// What each platform asserts:
//   NVDA       every step speaks, and the equation is named when the caret arrives.
//   VoiceOver  the editor is no more silent than the control. VoiceOver speech
//              through Guidepup was silent on most keys in CI runs 1 to 3, so
//              the absolute gate waits until the control proves the harness works.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'test/artifacts/screen-reader');
const MAC = process.platform === 'darwin';
const DOC_START = MAC ? 'Meta+ArrowUp' : 'Control+Home';

const transcript = [];

async function step(walk, label, action) {
  await screenReader.clearSpokenPhraseLog();
  await action();
  // The reader speaks after the key lands. Wait for speech, up to 3 seconds.
  let spoken = [];
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 300));
    spoken = (await screenReader.spokenPhraseLog()).filter((p) => p.trim() !== '');
    if (spoken.length > 0) break;
  }
  const last = await screenReader.lastSpokenPhrase();
  transcript.push({ walk, label, last, spoken });
  // Judged at the end, so one silent step does not hide the rest of the walk.
  return { label, last, spoken };
}

// Press keys the same way for both boxes. In the editor, the fifth right-arrow
// leaves the caret before the space and the sixth arrives at the equation.
async function walk(name) {
  const steps = [];
  steps.push(await step(name, 'go to start of document', () => screenReader.press(DOC_START)));
  for (let i = 1; i <= 9; i += 1) {
    steps.push(await step(name, `arrow right ${i}`, () => screenReader.press('ArrowRight')));
  }
  steps.push(await step(name, 'arrow left', () => screenReader.press('ArrowLeft')));
  return steps;
}

// VoiceOver must enter the web area and put its cursor on the box before it
// follows the caret. Setup steps are recorded but not asserted.
async function voiceOverFocus(page, selector, namePattern) {
  await page.click(selector);
  await voiceOver.interact();
  for (let i = 0; i < 12; i += 1) {
    await voiceOver.next();
    const phrase = await voiceOver.lastSpokenPhrase();
    transcript.push({ walk: 'setup', label: `find ${namePattern} (${i + 1})`, last: phrase, spoken: [phrase] });
    if (namePattern.test(phrase)) return;
  }
}

const silentCount = (steps) => steps.filter((s) => s.spoken.length === 0).length;

test('real screen reader walks the control box and the editor', async () => {
  const app = await electron.launch({
    args: [path.join(root, 'src/renderer/dev/spike-main.cjs')],
    // A real reader needs a visible window, so override the headless default.
    env: electronLaunchEnv({ OMNIYA_HEADLESS: '0' }),
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#editor [contenteditable="true"] .math-node');
    await app.evaluate(({ app: a, BrowserWindow }) => {
      a.focus({ steal: true });
      const win = BrowserWindow.getAllWindows()[0];
      win.show();
      win.focus();
    });
    await page.bringToFront();
    await screenReader.start();
    try {
      if (MAC) await voiceOverFocus(page, '#control', /Control/i);
      else await page.click('#control');
      const control = await walk('control');

      if (MAC) await voiceOverFocus(page, '#editor [contenteditable="true"]', /Napkin/i);
      else await page.click('#editor [contenteditable="true"]');
      const editor = await walk('editor');

      if (MAC) {
        assert.ok(
          silentCount(editor) <= silentCount(control),
          `editor is silent on ${silentCount(editor)} steps, the plain control on ${silentCount(control)}`,
        );
      } else {
        assert.deepEqual(editor.filter((s) => s.spoken.length === 0).map((s) => s.label), [], 'every step must speak');
        const arrive = editor.find((s) => s.label === 'arrow right 6');
        assert.match(arrive.spoken.join(' '), /x squared/i, 'the equation is named when the caret arrives');
      }
    } finally {
      await screenReader.stop();
    }
  } finally {
    await app.close();
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(
      path.join(outDir, `${process.platform}.json`),
      JSON.stringify(transcript, null, 2),
    );
  }
});
