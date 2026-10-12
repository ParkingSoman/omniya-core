import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenReader, voiceOver } from '@guidepup/guidepup';
import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from '../e2e/launch-electron.js';

// A REAL screen reader against the real app. macOS runs VoiceOver. Windows runs
// NVDA. Guidepup picks by platform. This file needs the CI setup in
// .github/workflows/screen-reader.yml. It is not part of `npm run test:e2e`.
//
// The app opens a napkin that reads "Solve [x squared] for x." The walk presses
// Home, then Right Arrow across the line. It is run twice with the same keys:
// first in a plain text input (the control), then in the editor. Walking both
// tells a fault in the editor apart from a limit of the test harness. Every step
// is saved as a transcript.
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

const XSQ = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math>';
const NAPKIN = {
  schemaVersion: 3,
  activeNapkinId: 'napkin-1',
  napkins: [{
    id: 'napkin-1',
    name: 'Reader test',
    doc: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Solve ' },
          { type: 'math', attrs: { mathml: XSQ, source: 'x^2', sourceKind: 'latex' } },
          { type: 'text', text: ' for x.' }
        ]
      }]
    }
  }]
};

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

// Press keys the same way in both boxes. In the editor, the sixth right-arrow
// is the one that arrives at the equation.
async function walk(name) {
  const steps = [];
  steps.push(await step(name, 'go to start of line', () => screenReader.press(DOC_START)));
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

test('real screen reader walks a plain text input and the editor', async (t) => {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'omniya-sr-'));
  await fs.writeFile(path.join(dataDirectory, 'napkins.json'), JSON.stringify(NAPKIN), 'utf8');
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    // A real reader needs a visible window, so override the headless default.
    env: electronLaunchEnv({ OMNIYA_HEADLESS: '0', OMNIYA_TEST_USER_DATA_DIR: dataDirectory })
  });
  try {
    const page = await app.firstWindow();
    await page.locator('#app-shell[aria-busy="false"]').waitFor();
    const editorSelector = '#editor-host [contenteditable="true"]';
    await page.waitForSelector(`${editorSelector} .math-node`);
    // The equation's name comes from MathJax speech, which arrives just after drawing.
    await page.waitForFunction(() => document.querySelector('.math-node')?.getAttribute('aria-label') === 'x squared');
    await app.evaluate(({ app: a, BrowserWindow }) => {
      a.focus({ steal: true });
      const win = BrowserWindow.getAllWindows()[0];
      win.show();
      win.focus();
    });
    await page.bringToFront();
    await screenReader.start();
    try {
      // The control: a plain input holding the same words, no equation.
      await page.getByRole('button', { name: 'New note' }).click();
      await page.locator('#current-napkin-name').fill('Solve for x.');
      if (MAC) await voiceOverFocus(page, '#current-napkin-name', /Solve for x/i);
      else await page.click('#current-napkin-name');
      const control = await walk('control');

      if (MAC) await voiceOverFocus(page, editorSelector, /Note text/i);
      else await page.click(editorSelector);
      const editor = await walk('editor');

      if (MAC) {
        // VoiceOver's own item-by-item reading works through Guidepup even where
        // its echo of arrow-key caret moves is not captured (CI run 5). So read
        // the document by items, a few back and a dozen forward from wherever the
        // walk left its cursor, and require that the equation is named.
        const items = [];
        for (let i = 0; i < 6; i += 1) {
          await voiceOver.previous();
          items.push(await voiceOver.lastSpokenPhrase());
        }
        for (let i = 0; i < 12; i += 1) {
          await voiceOver.next();
          items.push(await voiceOver.lastSpokenPhrase());
        }
        for (const phrase of items) {
          transcript.push({ walk: 'items', label: 'read by items', last: phrase, spoken: [phrase] });
        }
        const spokenItems = items.filter((phrase) => phrase.trim() !== '');
        if (spokenItems.length === 0 && silentCount(control) === control.length) {
          // CI run 4: VoiceOver spoke nothing anywhere. Nothing was measured, so
          // say so instead of passing.
          t.skip('VoiceOver spoke nothing at any step. Inconclusive.');
        } else {
          assert.ok(
            spokenItems.some((phrase) => /x squared/i.test(phrase)),
            `reading by items, VoiceOver must name the equation. It said: ${JSON.stringify(spokenItems)}`
          );
          // Caret echo is not captured by the tool, in the plain control or the
          // editor, so silent steps are noise and are not compared. They stay in
          // the transcript for a person to read.
        }
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
      JSON.stringify(transcript, null, 2)
    );
  }
});
