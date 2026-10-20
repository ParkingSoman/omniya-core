import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  explorerSpeech,
  goToDocStart,
  insertEquation,
  launchApp,
  mathNodeLocator,
  paragraphTexts,
  press
} from './launch-electron.js';

// How the caret moves across equations, and how Enter reaches one.
// Reports from two testers (October 2026): Up and Down landed on blank lines,
// Enter on an equation added a blank line instead of opening it, and Left
// across two equations in a row named the second one twice.

async function start(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-moving-e2e-'));
  const session = await launchApp({ dataDirectory });
  t.after(() => session.electronApp.close().catch(() => {}));
  return session;
}

const selection = (page) => page.evaluate(() => {
  const { from, to, node } = globalThis.__omniyaTesting.editor.view.state.selection;
  return { from, to, node: node?.type.name ?? null };
});

const explorerHasFocus = (page) => page.evaluate(
  () => Boolean(document.activeElement?.closest('.math-node'))
);

test('one arrow press passes a whole equation, so a reader names it once', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await page.keyboard.type('a ');
  await insertEquation(page, { source: 'x' });
  await insertEquation(page, { source: 'y' });
  await page.keyboard.type(' b');
  await page.waitForFunction(() => document.querySelectorAll('.math-node[aria-label]').length === 2);
  assert.deepEqual(await paragraphTexts(page), ['a [math][math] b']);

  await goToDocStart(page);
  await press(page, 'ArrowRight', 2);
  const before = await selection(page);
  assert.equal(before.node, null, 'caret is in the text, before the first equation');

  const stops = [];
  for (let i = 0; i < 2; i += 1) {
    await press(page, 'ArrowRight');
    stops.push(await selection(page));
  }
  assert.deepEqual(stops.map((s) => s.node), [null, null], 'no press stops on an equation as a selected object');
  assert.deepEqual(stops.map((s) => s.from - before.from), [1, 2], 'each press passes one equation');

  for (let i = 1; i >= 0; i -= 1) {
    await press(page, 'ArrowLeft');
    const now = await selection(page);
    assert.equal(now.node, null);
    assert.equal(now.from - before.from, i, 'each Left press passes one equation');
  }
});

test('Enter on a line that holds one equation reads it by parts and adds no blank line', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await page.keyboard.type('One');
  await page.keyboard.press('Enter');
  await insertEquation(page, { source: 'x^2' });
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two');
  assert.deepEqual(await paragraphTexts(page), ['One', '[math]', 'Two']);

  // Up from "Two" and Up again reach the line with the equation. A reader
  // names the equation there, and Enter must open it.
  await press(page, 'ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.closest('.math-node'), null, { timeout: 30_000 });
  assert.equal(await explorerHasFocus(page), true, 'Enter opened the explorer');
  assert.notEqual(await explorerSpeech(page), undefined);
  assert.deepEqual(await paragraphTexts(page), ['One', '[math]', 'Two'], 'no blank line was made');
});

test('Down onto each of two equation lines in a row, and Enter, never adds blank lines', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await page.keyboard.type('Top');
  await page.keyboard.press('Enter');
  await insertEquation(page, { source: 'y=x' });
  await page.keyboard.press('Enter');
  await insertEquation(page, { source: 'z=w' });
  assert.deepEqual(await paragraphTexts(page), ['Top', '[math]', '[math]']);

  await goToDocStart(page);
  for (let i = 0; i < 2; i += 1) {
    await press(page, 'ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.closest('.math-node'), null, { timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.activeElement?.closest('.math-node'));
  }
  assert.deepEqual(await paragraphTexts(page), ['Top', '[math]', '[math]'], 'no blank line was made');
});

test('a click with no mouse (what a reader sends for Enter in browse mode) reads the equation by parts', { timeout: 90_000 }, async (t) => {
  const { page } = await start(t);
  await page.keyboard.type('Solve ');
  await insertEquation(page, { source: 'x^2' });
  const node = mathNodeLocator(page).first();
  await node.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
  });
  await page.waitForFunction(() => document.activeElement?.closest('.math-node'), null, { timeout: 30_000 });
  assert.equal(await explorerHasFocus(page), true);
});

test('Enter right after typing text still starts a new paragraph', { timeout: 60_000 }, async (t) => {
  const { page } = await start(t);
  await page.keyboard.type('Solve ');
  await insertEquation(page, { source: 'x' });
  await page.keyboard.type(' now');
  await press(page, 'ArrowLeft', 4);
  await page.keyboard.press('Enter');
  assert.deepEqual(await paragraphTexts(page), ['Solve [math]', ' now']);
});
