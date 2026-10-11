import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from './launch-electron.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAC = process.platform === 'darwin';
const DOC_START = MAC ? 'Meta+ArrowUp' : 'Control+Home';
const DOC_END = MAC ? 'Meta+ArrowDown' : 'Control+End';

// Phase 0 gate, layer 1: where does the caret go around an inline math atom?
// One paragraph reads "Solve [x^2] for x." The atom counts as one position.
// Positions: 1 is before "S". "Solve " is 6 characters, so 7 is just before
// the atom and 8 is just after it.
async function launch() {
  const app = await electron.launch({
    args: [path.join(root, 'src/renderer/dev/spike-main.cjs')],
    env: electronLaunchEnv(),
  });
  const page = await app.firstWindow();
  await page.waitForSelector('#editor [contenteditable="true"] .math-node');
  await page.click('#editor [contenteditable="true"]');
  return { app, page };
}

// ProseMirror reads the caret from the browser's selectionchange event, which
// fires after the key press returns. Wait for it before reading state.
async function press(page, key, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await page.waitForTimeout(80);
  }
}

const sel = (page) =>
  page.evaluate(() => {
    const { selection } = globalThis.__editor.state;
    return { from: selection.from, to: selection.to, node: selection.node?.type.name ?? null };
  });
const docText = (page) => page.evaluate(() => globalThis.__editor.state.doc.textContent);
const mathCount = (page) =>
  page.evaluate(() => {
    let n = 0;
    globalThis.__editor.state.doc.descendants((x) => { if (x.type.name === 'math') n += 1; });
    return n;
  });

test('editor root exposes role, multiline and a name', async () => {
  const { app, page } = await launch();
  try {
    const attrs = await page.$eval('#editor [contenteditable="true"]', (el) => ({
      role: el.getAttribute('role'),
      multiline: el.getAttribute('aria-multiline'),
      label: el.getAttribute('aria-label'),
    }));
    assert.deepEqual(attrs, { role: 'textbox', multiline: 'true', label: 'Napkin' });
  } finally {
    await app.close();
  }
});

test('arrow keys select the atom first, then step past it', async () => {
  const { app, page } = await launch();
  try {
    await press(page, DOC_START);
    await press(page, 'ArrowRight', 6);
    assert.deepEqual(await sel(page), { from: 7, to: 7, node: null }, 'caret before the atom');
    await press(page, 'ArrowRight');
    assert.deepEqual(await sel(page), { from: 7, to: 8, node: 'math' }, 'first press selects it');
    await press(page, 'ArrowRight');
    assert.deepEqual(await sel(page), { from: 8, to: 8, node: null }, 'second press lands after it');
    await press(page, 'ArrowLeft');
    assert.deepEqual(await sel(page), { from: 7, to: 8, node: 'math' }, 'left press selects it again');
  } finally {
    await app.close();
  }
});

test('Backspace selects the atom, then deletes it, and undo restores it', async () => {
  const { app, page } = await launch();
  try {
    await press(page, DOC_START);
    await press(page, 'ArrowRight', 8);
    assert.equal((await sel(page)).from, 8);
    await press(page, 'Backspace');
    assert.deepEqual(await sel(page), { from: 7, to: 8, node: 'math' }, 'first Backspace selects it');
    assert.equal(await mathCount(page), 1, 'still there after one press');
    await press(page, 'Backspace');
    assert.equal(await mathCount(page), 0, 'second Backspace deletes it');
    await press(page, 'ControlOrMeta+z');
    assert.equal(await mathCount(page), 1, 'one undo restores it');
    assert.equal(await docText(page), 'Solve  for x.');
  } finally {
    await app.close();
  }
});

test('typing then undo and redo', async () => {
  const { app, page } = await launch();
  try {
    await press(page, DOC_END);
    await page.keyboard.type(' ok');
    assert.ok((await docText(page)).endsWith('for x. ok'));
    await press(page, 'ControlOrMeta+z');
    assert.ok((await docText(page)).endsWith('for x.'));
    await press(page, MAC ? 'Meta+Shift+z' : 'Control+y');
    assert.ok((await docText(page)).endsWith('for x. ok'));
  } finally {
    await app.close();
  }
});
