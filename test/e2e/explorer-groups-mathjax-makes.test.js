import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  chooseMethod, enterExplorer, explorerSpeech, getMathNodes, insertEquation, launchApp, press, settle
} from './launch-electron.js';

// MathJax groups some parts for the reader that are not one part of the saved
// equation: "x plus 1" inside a root, "negative y" in "x + -y", a bracketed group.
// The reader can stand on them, so r, a and o have to work there too.

async function start(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-groups-e2e-'));
  const { electronApp, page } = await launchApp({ dataDirectory });
  t.after(() => electronApp.close().catch(() => {}));
  return page;
}

async function editAt(page, latex, walk, op, typed) {
  await insertEquation(page, { method: 'latex', source: latex });
  await enterExplorer(page, 0);
  await settle(page, 500);
  for (const key of walk) { await press(page, key); await settle(page, 150); }
  await page.keyboard.press(op);
  await page.locator('#composer-dock').waitFor({ state: 'visible', timeout: 5_000 });
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill(typed);
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await settle(page, 400);
  return (await getMathNodes(page))[0].attrs.source.replaceAll(' ', '');
}

const CASES = [
  ['replace the inside of a root', '\\sqrt{x+1}', ['ArrowDown'], 'r', '-3', '\\sqrt{-3}'],
  ['add after the inside of a root', '\\sqrt{x+1}', ['ArrowDown'], 'a', '+z', '\\sqrt{x+1+z}'],
  ['add before the inside of a root', '\\sqrt{x+1}', ['ArrowDown'], 'o', 'w', '\\sqrt{wx+1}'],
  ['replace "negative y"', 'x+-y', ['ArrowDown', 'ArrowRight', 'ArrowRight'], 'r', 'z', 'x+z'],
  ['replace a bracketed group', '(a+b)(c+d)', ['ArrowDown'], 'r', 'q', 'q(c+d)'],
  ['replace the bottom of a fraction', '\\frac{a+b}{c+d}', ['ArrowDown', 'ArrowRight'], 'r', 'q', '\\frac{a+b}{q}']
];

for (const [name, latex, walk, op, typed, expected] of CASES) {
  test(`${name}: r, a and o work on a group MathJax made`, { timeout: 90_000 }, async (t) => {
    const page = await start(t);
    assert.equal(await editAt(page, latex, walk, op, typed), expected);
  });
}

test('on the invisible "times" between two brackets, what is typed goes in at that spot', { timeout: 90_000 }, async (t) => {
  const page = await start(t);
  await insertEquation(page, { method: 'latex', source: '(a+b)(c+d)' });
  await enterExplorer(page, 0);
  await settle(page, 500);
  await press(page, 'ArrowDown');
  let stops = 0;
  while (!/times/i.test(await explorerSpeech(page) ?? '') && stops < 8) { await press(page, 'ArrowRight'); await settle(page, 200); stops += 1; }
  assert.match(await explorerSpeech(page) ?? '', /times/i, 'the reader reaches the times between the brackets');
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible', timeout: 5_000 });
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('+');
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await settle(page, 400);
  assert.equal((await getMathNodes(page))[0].attrs.source.replaceAll(' ', ''), '(a+b)+(c+d)');
});
