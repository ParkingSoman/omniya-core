import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from 'playwright';
import { addEquationViaComposer, chooseMethod, chooseType, electronLaunchEnv } from './launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function launch(dataDirectory) {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({ OMNIYA_TEST_USER_DATA_DIR: dataDirectory })
  });
  const page = await electronApp.firstWindow();
  await electronApp.context().setOffline(true);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  return { electronApp, page };
}

async function startSession(t, prefix = 'omniya-mathjax-e2e-') {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const session = await launch(dataDirectory);
  t.after(async () => {
    await session.electronApp.close().catch(() => {});
  });
  return session;
}

test('recovers from corrupt local napkin data without leaving the app unusable', { timeout: 60_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-corrupt-e2e-'));
  await writeFile(path.join(dataDirectory, 'napkins.json'), '{not valid json', 'utf8');
  const session = await launch(dataDirectory);
  t.after(async () => {
    await session.electronApp.close().catch(() => {});
  });

  assert.equal(await session.page.getByRole('heading', { name: 'Untitled Napkin' }).count(), 1);
  assert.equal(await session.page.getByRole('alert').filter({ hasText: 'could not be read' }).count(), 1);
  assert.equal(await session.page.getByRole('button', { name: 'Add item' }).count(), 1);
});

async function addEquation(page, source) {
  const article = await addEquationViaComposer(page, { method: 'latex', source });
  await article.locator('mjx-speech').waitFor();
  return article;
}

async function enterEquation(page, article) {
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
}

async function speechLabel(article) {
  return article.evaluate(() => {
    const current = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current;
    return current?.getAttribute('data-semantic-speech-none')
      || current?.getAttribute('data-speech')
      || current?.getAttribute('aria-label')
      || document.querySelector('article.napkin-article mjx-speech:last-of-type')?.getAttribute('aria-label');
  });
}

async function waitForSpeechChange(page, article, previous) {
  await page.waitForFunction(
    ({ previousLabel }) => {
      const current = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current;
      return current?.getAttribute('data-semantic-speech-none') !== previousLabel;
    },
    { previousLabel: previous }
  );
}

async function assertCurrentFocusCanBeReplaced(page) {
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor();
  const status = await page.locator('#composer-status').textContent();
  assert.doesNotMatch(status, /cannot|unsafe|safe/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
}

async function resetExplorer(page, article) {
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
}

test('renders accessible MathML and supports complete tree navigation', { timeout: 60_000 }, async (t) => {
  const { page } = await startSession(t);
  const article = await addEquation(page, 'a+b');
  const container = article.locator('mjx-container');
  const math = container.locator('math');

  assert.equal(await math.count(), 1);
  assert.equal(await math.getAttribute('xmlns'), 'http://www.w3.org/1998/Math/MathML');
  assert.equal(await math.getAttribute('aria-hidden'), null);
  assert.equal(await math.locator('mi').count(), 2);
  assert.equal(await math.locator('mo').count(), 1);
  assert.equal(await container.locator('mjx-speech').count(), 1);
  const semanticRelationships = await container.locator('[data-semantic-id][data-semantic-children]').evaluateAll(
    (nodes) => nodes.map((node) => ({
      children: node.getAttribute('data-semantic-children'),
      owns: node.getAttribute('data-semantic-owns')
    }))
  );
  assert.ok(semanticRelationships.length > 0);
  assert.ok(semanticRelationships.every(({ owns }) => owns));

  await enterEquation(page, article);
  const root = await speechLabel(article);
  await page.keyboard.press('ArrowDown');
  await waitForSpeechChange(page, article, root);
  const first = await speechLabel(article);
  assert.equal(first, 'a');

  await page.keyboard.press('ArrowRight');
  await waitForSpeechChange(page, article, first);
  const operator = await speechLabel(article);
  assert.equal(operator, 'plus');

  await page.keyboard.press('ArrowRight');
  await waitForSpeechChange(page, article, operator);
  const second = await speechLabel(article);
  assert.equal(second, 'b');

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  assert.equal(await speechLabel(article), second, 'Right should stop at the final sibling');

  await page.keyboard.press('ArrowLeft');
  await waitForSpeechChange(page, article, second);
  assert.equal(await speechLabel(article), operator);
  await page.keyboard.press('ArrowLeft');
  await waitForSpeechChange(page, article, operator);
  assert.equal(await speechLabel(article), first);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  assert.equal(await speechLabel(article), first, 'Left should stop at the first sibling');

  await page.keyboard.press('ArrowUp');
  await waitForSpeechChange(page, article, first);
  const topLevel = await speechLabel(article);
  assert.equal(topLevel, 'a plus b');
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  assert.equal(await speechLabel(article), topLevel);

  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'ARTICLE');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
  assert.equal(await page.evaluate(() => document.activeElement?.closest?.('mjx-container')?.localName), 'mjx-container');
  await page.keyboard.press('Escape');
});

test('replaces a whole focused equation through the LaTeX draft without a linear composer', { timeout: 60_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-edit-e2e-');
  const article = await addEquation(page, '\\frac{a^2+\\sqrt{b}}{c}');
  const math = article.locator('mjx-container math');

  assert.equal(await math.locator('mfrac').count(), 1);
  assert.equal(await math.locator('msup').count(), 1);
  assert.equal(await math.locator('msqrt').count(), 1);
  assert.equal(await article.locator('.item-note').count(), 0);

  await article.focus();
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor();
  await chooseMethod(page, 'latex');
  const source = page.getByLabel('Replacement input', { exact: true });
  await source.fill('\\frac{');
  await page.getByRole('button', { name: 'Replace' }).click();
  assert.match(await page.locator('#composer-status').textContent(), /convert|incomplete|empty/i);
  assert.equal(await article.locator('mjx-container math mfrac').count(), 1);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-container math mfrac').waitFor();
  assert.equal(await article.locator('mjx-container math mfrac').count(), 1);

  await article.focus();
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor();
  await chooseMethod(page, 'latex');
  await page.getByLabel('Replacement input', { exact: true }).fill('x^3');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  await page.locator('article.napkin-article mjx-container').waitFor();
  assert.equal(await page.locator('article.napkin-article math msup').count(), 1);
  assert.equal(await page.locator('article.napkin-article math mfrac').count(), 0);
  assert.equal(await page.locator('article.napkin-article .item-note').count(), 0);
});

test('uses MathJax table navigation for matrix cells', { timeout: 60_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-table-e2e-');
  const article = await addEquation(page, '\\begin{matrix}a&b\\\\c&d\\end{matrix}');
  assert.equal(await article.locator('mjx-container math mtable').count(), 1);
  assert.equal(await article.locator('mjx-container math mtr').count(), 2);
  assert.equal(await article.locator('mjx-container math mtd').count(), 4);

  await enterEquation(page, article);
  const initial = await speechLabel(article);
  await page.keyboard.press('ArrowDown');
  await waitForSpeechChange(page, article, initial);
  const firstRow = await speechLabel(article);
  await page.keyboard.press('ArrowDown');
  await waitForSpeechChange(page, article, firstRow);
  const firstCell = await speechLabel(article);

  await page.keyboard.press('Shift+ArrowRight');
  await waitForSpeechChange(page, article, firstCell);
  const rightCell = await speechLabel(article);
  assert.notEqual(rightCell, firstCell);

  await page.keyboard.press('Shift+ArrowDown');
  await waitForSpeechChange(page, article, rightCell);
  assert.notEqual(await speechLabel(article), rightCell);
});

test('every navigable nested focus opens the exact replacement draft', { timeout: 60_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-edit-focus-e2e-');
  const article = await addEquation(page, '\\frac{a^2+\\sqrt{b}}{c}');

  // Each prefix is replayed from the equation root. This exercises the real
  // MathJax Explorer, rather than invoking the bridge with a fabricated ID.
  const prefixes = [
    [],
    ['ArrowDown'],
    ['ArrowDown', 'ArrowDown'],
    ['ArrowDown', 'ArrowDown', 'ArrowRight'],
    ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight'],
    ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight']
  ];
  for (const prefix of prefixes) {
    await resetExplorer(page, article);
    for (const key of prefix) await page.keyboard.press(key);
    await assertCurrentFocusCanBeReplaced(page);
  }

  // One settled move is asserted against the active MathJax semantic node,
  // not against a stale speech region retained for an ancestor. This is the
  // regression guard for exact scope capture, while the loop above exercises
  // every reachable nested focus for the no-error invariant.
  await resetExplorer(page, article);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  const focusedTargetId = await page.evaluate(() => {
    const current = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current;
    return current?.getAttribute('data-omniya-id');
  });
  assert.ok(focusedTargetId, 'MathJax focus must map to a canonical Omniya node');
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor();
  assert.equal(await page.locator('#replacement-scope').getAttribute('data-target-id'), focusedTargetId);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });

  const matrix = await addEquation(page, '\\begin{matrix}a&b\\\\c&d\\end{matrix}');
  await resetExplorer(page, matrix);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await assertCurrentFocusCanBeReplaced(page);
  await resetExplorer(page, matrix);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await assertCurrentFocusCanBeReplaced(page);
});

test('r opens the exact replacement even during the explorer focus handoff', { timeout: 60_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-focus-handoff-e2e-');
  const article = await addEquation(page, '\\frac{a^2+\\sqrt{b}}{c}');

  await article.focus();
  await page.keyboard.press('Enter');
  // Deliberately do not wait for a speech-region mutation here. This models
  // the real VoiceOver timing where E can arrive while MathJax is handing the
  // current node from the visual explorer to its speech proxy.
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor();
  assert.equal(await page.locator('#replacement-scope').getAttribute('data-target-id') !== null, true);
  assert.doesNotMatch(await page.locator('#save-status').textContent(), /cannot be edited safely|unsafe/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
});

test('switches input type without visible radios and submits a text item with Cmd+Enter or Ctrl+Enter', { timeout: 60_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-keyboard-input-e2e-');
  await page.getByRole('button', { name: 'Add item' }).click();

  await chooseType(page, 'equation');
  assert.equal(await page.evaluate(() => document.querySelector('#mode-switch input[value="equation"]')?.checked), true);
  await chooseType(page, 'text');
  assert.equal(await page.evaluate(() => document.querySelector('#mode-switch input[value="text"]')?.checked), true);

  const content = page.getByLabel('Content', { exact: true });
  await content.fill('Keyboard-created text');
  await content.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  const article = page.locator('article.napkin-article').first();
  await article.waitFor();
  assert.match(await article.textContent(), /Keyboard-created text/);
  assert.equal(await page.getByRole('heading', { name: 'Reading' }).count(), 1);
});
