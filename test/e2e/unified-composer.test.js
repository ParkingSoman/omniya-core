import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  enterExplorer,
  explorerSpeech,
  getMathNodes,
  insertEquation,
  launchApp,
  mathNodeLocator,
  openEquationDock
} from './launch-electron.js';

async function launch(t, prefix) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const { electronApp, page } = await launchApp({ dataDirectory });
  t.after(() => electronApp.close().catch(() => {}));
  return page;
}

const modePanel = (page) => page.locator('#mode-panel').textContent().then((text) => text ?? '');
function modePanelReads(page, pattern) {
  return page.waitForFunction(
    (source) => new RegExp(source, 'i').test(document.querySelector('#mode-panel')?.textContent ?? ''),
    pattern.source
  );
}
const tokens = (page) => page.locator('.math-node math').first().evaluate((node) =>
  [...node.querySelectorAll('mi, mn, mo')].map((el) => el.textContent).join('|')
);

test('Word\'s key opens the equation field, and Ctrl+E / Ctrl+L pick the method while it is empty', { timeout: 60_000 }, async (t) => {
  const page = await launch(t, 'omniya-unified-x-');
  assert.equal(await page.locator('#composer-dock').isVisible(), false, 'closed until asked');
  await openEquationDock(page, null);
  assert.equal(await page.locator('#composer-source').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source');

  await page.keyboard.press('Control+e');
  await modePanelReads(page, /Equation · Nemeth/);
  assert.match(await page.locator('#composer-source').getAttribute('class') ?? '', /nemeth-inline-editor/);
  assert.equal(await page.evaluate(() => document.querySelector('#replacement-method input[value="nemeth"]').checked), true);

  await page.keyboard.press('Control+l');
  await modePanelReads(page, /Equation · LaTeX/);
  assert.match(await page.locator('#composer-source').getAttribute('class') ?? '', /latex-inline-editor/);
  assert.equal(await page.evaluate(() => document.querySelector('#replacement-method input[value="latex"]').checked), true);
  assert.equal(await page.locator('#composer-source').isVisible(), true, 'the field stays visible throughout');
});

test('an empty equation submit is refused and inserts nothing', { timeout: 60_000 }, async (t) => {
  const page = await launch(t, 'omniya-unified-empty-eq-');
  await openEquationDock(page, 'nemeth');
  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => /Enter Nemeth or LaTeX/i.test(document.querySelector('#composer-error')?.textContent ?? ''));
  assert.equal(await page.locator('#composer-dock').isVisible(), true, 'the dock stays open');
  assert.equal(await mathNodeLocator(page).count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'composer-source', 'focus is back in the field');
});

test('r opens the dock for a part, Ctrl+T refuses while replacing, and Escape leaves the equation unchanged', { timeout: 90_000 }, async (t) => {
  const page = await launch(t, 'omniya-unified-e-');
  await insertEquation(page, { method: 'latex', source: 'x+1' });
  const beforeTokens = await tokens(page);
  assert.equal(beforeTokens, 'x|+|1');
  const before = (await getMathNodes(page))[0].attrs.mathml;

  await enterExplorer(page);
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#composer-source').isVisible(), true);
  assert.match(await modePanel(page), /replacing/i);

  // Ctrl+T is the UEB-grade chord. While replacing mathematics it must refuse
  // rather than drop the replacement target.
  await page.keyboard.press('Control+t');
  await modePanelReads(page, /Can't switch to Text|Equation/);
  assert.doesNotMatch(await modePanel(page), /Text · UEB/i);
  assert.equal(await page.locator('#composer-dock').isVisible(), true, 'the replacement is still open');

  await page.keyboard.press('Escape');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.equal(await tokens(page), beforeTokens);
  assert.equal((await getMathNodes(page))[0].attrs.mathml, before);
  // Escape in the dock returns to the explorer, still on the equation.
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('.math-node')));
  assert.ok(await explorerSpeech(page));
});

test('a opens the append dock on the part being read', { timeout: 60_000 }, async (t) => {
  const page = await launch(t, 'omniya-unified-append-');
  await insertEquation(page, { method: 'latex', source: 'x^3' });
  await enterExplorer(page);
  const speech = await explorerSpeech(page);
  await page.keyboard.press('a');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#composer-heading').textContent(), `Appending after: ${speech}`);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
});
