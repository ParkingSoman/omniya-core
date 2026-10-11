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
// Every step records what the reader said. The transcript is saved so a person
// can read it later. A step that speaks nothing fails the run.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'test/artifacts/screen-reader');
const MAC = process.platform === 'darwin';
const DOC_START = MAC ? 'Meta+ArrowUp' : 'Control+Home';

const transcript = [];
async function step(label, action) {
  await screenReader.clearSpokenPhraseLog();
  await action();
  // The reader speaks after the key lands. Give it a moment.
  await new Promise((r) => setTimeout(r, 600));
  const spoken = await screenReader.spokenPhraseLog();
  const last = await screenReader.lastSpokenPhrase();
  transcript.push({ label, last, spoken });
  assert.ok(spoken.length > 0, `${label}: the reader said nothing`);
  return { last, spoken };
}

test('real screen reader walks text, equation and text again', async () => {
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
      await page.click('#editor [contenteditable="true"]');

      if (MAC) {
        // The first CI run showed VoiceOver parked on the window ("web content,
        // inside of a group") and silent on every key. VoiceOver must enter
        // the web area and put its cursor on the editor before it follows the
        // caret. Setup steps are recorded but not asserted.
        await voiceOver.interact();
        for (let i = 0; i < 12; i += 1) {
          await voiceOver.next();
          const phrase = await voiceOver.lastSpokenPhrase();
          transcript.push({ label: `find the editor (${i + 1})`, last: phrase, spoken: [phrase] });
          if (/Napkin/i.test(phrase)) break;
        }
      }

      await step('go to start of document', () => screenReader.press(DOC_START));
      for (let i = 1; i <= 6; i += 1) {
        await step(`arrow right ${i} (inside "Solve ")`, () => screenReader.press('ArrowRight'));
      }
      const onMath = await step('arrow right 7 (onto the equation)', () => screenReader.press('ArrowRight'));
      assert.match(
        onMath.spoken.join(' '),
        /x squared/i,
        'moving onto the equation must speak it by name',
      );
      await step('arrow right 8 (past the equation)', () => screenReader.press('ArrowRight'));
      await step('arrow left (back onto the equation)', () => screenReader.press('ArrowLeft'));
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
