import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  chooseMethod,
  enterExplorer,
  explorerSpeech,
  getMathNodes,
  insertEquation,
  launchApp,
  mathNodeLocator,
  paragraphTexts,
  selectEquation,
  settle
} from './launch-electron.js';

async function startSession(t, prefix = 'omniya-mathjax-e2e-') {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const session = await launchApp({ dataDirectory });
  t.after(() => session.electronApp.close().catch(() => {}));
  return { ...session, dataDirectory };
}

/** Wait for the explorer to land on something other than `previous`; return it. */
async function waitForSpeechChange(page, previous) {
  await page.waitForFunction((was) => {
    const holder = document.activeElement?.closest?.('.math-render')
      ?? document.querySelector('.math-node .math-render');
    const item = globalThis.MathJax?.startup?.document?.getMathItemsWithin?.(holder)?.[0];
    const label = item?.explorers?.speech?.current?.getAttribute?.('data-semantic-speech-none');
    return Boolean(label) && label !== was;
  }, previous);
  return explorerSpeech(page);
}

/** Press a navigation key and return the new speech. */
async function moveAndRead(page, key, previous) {
  await page.keyboard.press(key);
  return waitForSpeechChange(page, previous);
}

/** Press a key that must NOT move the explorer, give it time to, and return the speech. */
async function pressAndExpectStay(page, key) {
  await page.keyboard.press(key);
  await settle(page, 150);
  return explorerSpeech(page);
}

/** Leave the explorer with Escape and wait until the document has focus. */
async function leaveExplorerWithEscape(page) {
  // After Cancel or a commit the explorer takes focus back a moment later.
  await page.waitForFunction(() => Boolean(document.activeElement?.closest('.math-node')));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return Boolean(active?.closest('#editor-host')) && !active.closest('.math-node');
  });
  await settle(page);
}

const mathmlOf = async (page, index = 0) => (await getMathNodes(page))[index].attrs.mathml;
const textOfMathml = (mathml) => mathml.replace(/<[^>]+>/g, '').replace(/\s+/g, '');

test('recovers from corrupt local napkin data without leaving the app unusable', { timeout: 60_000 }, async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-corrupt-e2e-'));
  const corrupt = '{not valid json';
  await writeFile(path.join(dataDirectory, 'napkins.json'), corrupt, 'utf8');
  const { electronApp, page } = await launchApp({ dataDirectory });
  t.after(() => electronApp.close().catch(() => {}));

  assert.equal(await page.getByRole('heading', { name: 'Untitled Napkin' }).count(), 1);
  assert.equal(await page.getByRole('alert').filter({ hasText: 'could not be read' }).count(), 1);
  // A default napkin is usable: the document opens empty and takes typing.
  assert.equal(await mathNodeLocator(page).count(), 0);
  await page.keyboard.type('Still works');
  assert.match(await page.locator('#editor-host [contenteditable="true"]').textContent(), /Still works/);

  const files = await readdir(dataDirectory);
  const recovery = files.find((name) => name.includes('.corrupt-'));
  assert.ok(recovery, `a recovery copy is preserved (found ${files.join(', ')})`);
  assert.equal(await readFile(path.join(dataDirectory, recovery), 'utf8'), corrupt);
});

test('renders accessible MathML and supports complete tree navigation', { timeout: 90_000 }, async (t) => {
  const { page, externalRequests } = await startSession(t);
  const node = await insertEquation(page, { method: 'latex', source: 'a+b' });
  const container = node.locator('mjx-container');
  const math = container.locator('math');

  assert.equal(await math.count(), 1);
  assert.equal(await math.getAttribute('xmlns'), 'http://www.w3.org/1998/Math/MathML');
  assert.equal(await math.getAttribute('aria-hidden'), null);
  assert.equal(await math.locator('mi').count(), 2);
  assert.equal(await math.locator('mo').count(), 1);
  await container.locator('mjx-speech').waitFor({ state: 'attached' });
  assert.equal(await container.locator('mjx-speech').count(), 1);
  const semanticRelationships = await container.locator('[data-semantic-id][data-semantic-children]').evaluateAll(
    (nodes) => nodes.map((el) => ({
      children: el.getAttribute('data-semantic-children'),
      owns: el.getAttribute('data-semantic-owns')
    }))
  );
  assert.ok(semanticRelationships.length > 0);
  assert.ok(semanticRelationships.every(({ owns }) => owns));
  // In the document the equation is one named image, and its name is the speech.
  assert.equal(await node.getAttribute('role'), 'img');
  assert.equal(await node.getAttribute('aria-label'), 'a plus b');

  await enterExplorer(page);
  // While the explorer walks the parts, the wrapper's image role is lifted.
  assert.equal(await node.getAttribute('role'), null);
  const root = await explorerSpeech(page);
  const first = await moveAndRead(page, 'ArrowDown', root);
  assert.equal(first, 'a');
  const operator = await moveAndRead(page, 'ArrowRight', first);
  assert.equal(operator, 'plus');
  const second = await moveAndRead(page, 'ArrowRight', operator);
  assert.equal(second, 'b');
  assert.equal(await pressAndExpectStay(page, 'ArrowRight'), second, 'Right should stop at the final sibling');

  assert.equal(await moveAndRead(page, 'ArrowLeft', second), operator);
  assert.equal(await moveAndRead(page, 'ArrowLeft', operator), first);
  assert.equal(await pressAndExpectStay(page, 'ArrowLeft'), first, 'Left should stop at the first sibling');

  const topLevel = await moveAndRead(page, 'ArrowUp', first);
  assert.equal(topLevel, 'a plus b');
  assert.equal(await pressAndExpectStay(page, 'Home'), topLevel);

  // Escape returns to the document with the equation still selected, and the
  // image name comes back.
  await leaveExplorerWithEscape(page);
  assert.equal(await node.getAttribute('role'), 'img');
  assert.equal(await page.evaluate(() => globalThis.__omniyaTesting.editor.selectedMath() !== null), true);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('.math-node mjx-container')));
  await page.keyboard.press('Escape');
  assert.deepEqual(externalRequests, []);
});

test('replaces a whole equation through LaTeX; an incomplete draft leaves it unchanged', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-edit-e2e-');
  const node = await insertEquation(page, { method: 'latex', source: '\\frac{a^2+\\sqrt{b}}{c}' });
  const math = node.locator('mjx-container math');

  assert.equal(await math.locator('mfrac').count(), 1);
  assert.equal(await math.locator('msup').count(), 1);
  assert.equal(await math.locator('msqrt').count(), 1);
  const original = await mathmlOf(page);

  await enterExplorer(page);
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('\\frac{');
  await page.getByRole('button', { name: 'Replace' }).click();
  assert.match(await page.locator('#composer-status').textContent(), /convert|incomplete|empty/i);
  assert.equal(await page.locator('#composer-dock').isVisible(), true, 'a refused draft keeps the dock open');
  assert.equal(await mathmlOf(page), original, 'and the equation is unchanged');
  assert.equal(await math.locator('mfrac').count(), 1);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.equal(await mathmlOf(page), original, 'cancel leaves the equation unchanged');

  // Cancel returns to the explorer on the same equation. Replace for real.
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('.math-node')));
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('x^3');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });

  assert.equal(await mathNodeLocator(page).count(), 1, 'the same equation is edited in place');
  const after = await mathmlOf(page);
  assert.match(after, /<msup/);
  assert.doesNotMatch(after, /<mfrac/);
  assert.equal(textOfMathml(after), 'x3');
});

test('uses MathJax table navigation for matrix cells', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-table-e2e-');
  const node = await insertEquation(page, { method: 'latex', source: '\\begin{matrix}a&b\\\\c&d\\end{matrix}' });
  assert.equal(await node.locator('mjx-container math mtable').count(), 1);
  assert.equal(await node.locator('mjx-container math mtr').count(), 2);
  assert.equal(await node.locator('mjx-container math mtd').count(), 4);

  await enterExplorer(page);
  const initial = await explorerSpeech(page);
  const firstRow = await moveAndRead(page, 'ArrowDown', initial);
  const firstCell = await moveAndRead(page, 'ArrowDown', firstRow);
  const rightCell = await moveAndRead(page, 'Shift+ArrowRight', firstCell);
  assert.notEqual(rightCell, firstCell);
  const lowerCell = await moveAndRead(page, 'Shift+ArrowDown', rightCell);
  assert.notEqual(lowerCell, rightCell);
  assert.notEqual(lowerCell, firstCell);
});

/**
 * r on the explorer's current part opens the dock on exactly that part: the
 * dock names the same speech the explorer had. Cancel returns to the explorer.
 */
async function assertCurrentFocusCanBeReplaced(page) {
  const speech = await explorerSpeech(page);
  assert.ok(speech, 'the explorer is on a part');
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#composer-heading').textContent(), `Replacing: ${speech}`);
  assert.equal(await page.locator('#replacement-scope').textContent(), `Selected: ${speech}`);
  assert.doesNotMatch(await page.locator('#composer-status').textContent(), /cannot|unsafe|safe/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
}

test('every navigable nested focus opens the exact replacement draft', { timeout: 120_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-edit-focus-e2e-');
  await insertEquation(page, { method: 'latex', source: '\\frac{a^2+\\sqrt{b}}{c}' });
  await insertEquation(page, { method: 'latex', source: '\\begin{matrix}a&b\\\\c&d\\end{matrix}' });

  // Each prefix is replayed from the equation root. This exercises the real
  // MathJax explorer, rather than invoking the bridge with a made-up id.
  const prefixes = [
    [],
    ['ArrowDown'],
    ['ArrowDown', 'ArrowDown'],
    ['ArrowDown', 'ArrowDown', 'ArrowRight'],
    ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight'],
    ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight']
  ];
  const seen = new Set();
  for (const prefix of prefixes) {
    await enterExplorer(page, 0);
    for (const key of prefix) {
      await page.keyboard.press(key);
      await settle(page, 150);
    }
    seen.add(await explorerSpeech(page));
    await assertCurrentFocusCanBeReplaced(page);
    await leaveExplorerWithEscape(page);
  }
  assert.ok(seen.size > 3, `the prefixes reach distinct parts (${[...seen].join(' | ')})`);

  await enterExplorer(page, 1);
  for (const key of ['ArrowDown', 'ArrowDown']) {
    await page.keyboard.press(key);
    await settle(page, 150);
  }
  await assertCurrentFocusCanBeReplaced(page);
  await leaveExplorerWithEscape(page);

  await enterExplorer(page, 1);
  for (const key of ['ArrowDown', 'ArrowDown', 'Shift+ArrowRight', 'Shift+ArrowDown']) {
    await page.keyboard.press(key);
    await settle(page, 150);
  }
  await assertCurrentFocusCanBeReplaced(page);
});

test('Enter then r, a, and o open the dock on the same focus', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-enter-edit-e2e-');
  await insertEquation(page, { method: 'latex', source: 'a+b' });
  await enterExplorer(page);
  const root = await explorerSpeech(page);
  const part = await moveAndRead(page, 'ArrowDown', root);

  const cases = [
    ['r', 'Replacing'],
    ['a', 'Appending after'],
    ['o', 'Prepending before']
  ];
  for (const [key, verb] of cases) {
    await page.keyboard.press(key);
    await page.locator('#composer-dock').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#composer-heading').textContent(), `${verb}: ${part}`);
    assert.equal(await page.locator('#replacement-scope').textContent(), `Selected: ${part}`);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('#composer-dock').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('.math-node')));
    assert.equal(await explorerSpeech(page), part, 'cancel puts the explorer back on the same part');
  }
});

test('r still replaces after explorer navigation moves focus off the equation', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-edit-keys-e2e-');
  await insertEquation(page, { method: 'latex', source: 'a+b' });
  await enterExplorer(page);
  await page.keyboard.press('ArrowDown');
  await settle(page);
  // Blur leaves focus on the body. No focus event fires, so the explorer is
  // still the equation being read.
  await page.evaluate(() => document.activeElement.blur());
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true);

  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  assert.match(await page.locator('#composer-heading').textContent(), /Replacing/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
});

test('r opens the dock on the focused part during the explorer focus handoff', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-focus-handoff-e2e-');
  await insertEquation(page, { method: 'latex', source: '\\frac{a^2+\\sqrt{b}}{c}' });
  await selectEquation(page);

  await page.keyboard.press('Enter');
  // Deliberately do not wait for the explorer. This models the real VoiceOver
  // timing, where r can arrive while MathJax hands focus to its speech proxy.
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  assert.match(await page.locator('#replacement-scope').textContent(), /^Selected: \S/);
  assert.doesNotMatch(await page.locator('#save-status').textContent(), /cannot be edited safely|unsafe/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  // The key that arrived early must not have been typed over the selected equation.
  assert.equal((await getMathNodes(page)).length, 1, 'the equation is still there');
  assert.deepEqual(await paragraphTexts(page), ['[math]'], 'no letter was typed into the document');
});

// The race behind the CI failure of the test above, made certain: the explorer
// is held back for 1.5s, so a key pressed in that gap would reach the editor.
// With an equation selected, an ordinary letter there replaces the equation.
test('keys pressed before the explorer is ready are not typed over the selected equation', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-early-key-e2e-');
  await insertEquation(page, { method: 'latex', source: 'a+b' });
  await selectEquation(page);
  await page.evaluate(() => {
    const editor = globalThis.__omniyaTesting.editor;
    const { pos } = editor.selectedMath();
    editor.mathView(pos).ready = new Promise((resolve) => setTimeout(resolve, 1500));
  });

  await page.keyboard.press('Enter');
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible', timeout: 15_000 });
  assert.match(await page.locator('#composer-heading').textContent(), /Replacing/i);
  assert.equal((await getMathNodes(page)).length, 1, 'the equation is still there');
  assert.deepEqual(await paragraphTexts(page), ['[math]'], 'no letter was typed into the document');
  await page.keyboard.press('Escape');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
});

test('r on the y^2 term replaces that term, not the whole equation', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-y2-term-e2e-');
  await insertEquation(page, { method: 'latex', source: 'y^2+x^2+z^2' });
  const original = await mathmlOf(page);
  await enterExplorer(page);
  const root = await explorerSpeech(page);
  await moveAndRead(page, 'ArrowDown', root);

  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  const heading = await page.locator('#composer-heading').textContent();
  assert.doesNotMatch(heading, /whole equation/i);
  assert.match(heading, /y squared/i);
  assert.match(await page.locator('#replacement-scope').textContent(), /y squared/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  assert.equal(await mathmlOf(page), original, 'cancel leaves the equation unchanged');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('.math-node')));
  assert.equal(await explorerSpeech(page), 'y squared', 'and the explorer is still on the term');
});

test('r replaces the x^4 term, not the whole x^4+x^3 equation', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-x4-term-e2e-');
  await insertEquation(page, { method: 'latex', source: 'x^4+x^3' });
  await enterExplorer(page);
  const root = await explorerSpeech(page);
  await moveAndRead(page, 'ArrowDown', root);

  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  const heading = await page.locator('#composer-heading').textContent();
  assert.match(heading, /fourth/i);
  assert.doesNotMatch(heading, /whole equation/i);
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('y');
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });

  assert.equal(await mathNodeLocator(page).count(), 1, 'edited in place, not added');
  const text = textOfMathml(await mathmlOf(page));
  assert.match(text, /x3/);
  assert.doesNotMatch(text, /x4/);
  assert.notEqual(text, 'y');
  assert.match(text, /y/);
  // What was typed replaced a part, so the equation has no single source.
  assert.equal((await getMathNodes(page))[0].attrs.source, '');
});

test('a inserts after the focused node instead of replacing it', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-append-e2e-');
  await insertEquation(page, { method: 'latex', source: 'x^3' });
  await enterExplorer(page);
  await page.keyboard.press('a');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  assert.match(await page.locator('#composer-heading').textContent(), /Appending after/i);
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('+1');
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });

  const text = textOfMathml(await mathmlOf(page));
  assert.match(text, /x3/);
  assert.match(text, /1/);
  assert.match(text, /\+/);
  assert.ok(text.indexOf('3') < text.indexOf('+'), `the new part comes after (${text})`);
});

test('o inserts before the focused node', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-prepend-e2e-');
  await insertEquation(page, { method: 'latex', source: 'x^3' });
  await enterExplorer(page);
  await page.keyboard.press('o');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  assert.match(await page.locator('#composer-heading').textContent(), /Prepending before/i);
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('1+');
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });

  const text = textOfMathml(await mathmlOf(page));
  assert.match(text, /x3/);
  assert.ok(text.indexOf('1') < text.indexOf('x'), `the new part comes before (${text})`);
});

test('r on a later equation edits that equation, not the first', { timeout: 120_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-multi-eq-e2e-');
  await insertEquation(page, { method: 'latex', source: '\\frac{a^{2}+\\sqrt{b+c^{3}}}{x^{4}+x^{3}+y}' });
  await insertEquation(page, { method: 'latex', source: '(x^{2}+y^{2})^{n}+\\frac{1}{z_{i}^{2}}' });
  await insertEquation(page, { method: 'latex', source: 'x^{4}+x^{3}' });
  const before = await getMathNodes(page);
  assert.equal(before.length, 3);

  await enterExplorer(page, 2);
  const root = await explorerSpeech(page);
  const part = await moveAndRead(page, 'ArrowDown', root);
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('y');
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });

  const after = await getMathNodes(page);
  assert.equal(after.length, 3);
  assert.equal(after[0].attrs.mathml, before[0].attrs.mathml, 'the first equation is untouched');
  assert.equal(after[1].attrs.mathml, before[1].attrs.mathml, 'and so is the second');
  assert.notEqual(after[2].attrs.mathml, before[2].attrs.mathml, `the third changed (replaced "${part}")`);

  // Reading the first now names its own parts, not the third's.
  await enterExplorer(page, 0);
  const firstRoot = await explorerSpeech(page);
  const down = await moveAndRead(page, 'ArrowDown', firstRoot);
  await moveAndRead(page, 'ArrowDown', down);
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  const heading = await page.locator('#composer-heading').textContent();
  assert.match(heading, /a squared/i);
  assert.doesNotMatch(heading, /whole equation/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });

  const mathCount = await page.evaluate(() => {
    const math = globalThis.MathJax?.startup?.document?.math;
    return typeof math?.length === 'number' ? math.length : Array.from(math || []).length;
  });
  assert.ok(mathCount <= 12, `MathJax item leak: ${mathCount} items for 3 equations`);
});

// After a commit by parts the equation is redrawn and the dock that had focus is
// hidden. Focus must land back on the edited part, or the next arrow key reaches
// nothing, even though the explorer's current speech already reads the edit.
test('after a replace by parts the explorer holds keyboard focus on the edited part', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-commit-focus-e2e-');
  await insertEquation(page, { method: 'latex', source: 'x^4+x^3' });
  await enterExplorer(page);
  const root = await explorerSpeech(page);
  await moveAndRead(page, 'ArrowDown', root);
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('y');
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  // The dock hides first; the explorer is put back a moment later.
  await page.waitForFunction(() => Boolean(document.activeElement?.closest('.math-node')), null, { timeout: 5_000 });
  await page.waitForFunction(() => {
    const holder = document.querySelector('.math-node .math-render');
    const item = globalThis.MathJax.startup.document.getMathItemsWithin(holder)[0];
    return item.explorers.speech.current?.getAttribute?.('data-semantic-speech-none') === 'y';
  }, null, { timeout: 5_000 });
  assert.equal(await explorerSpeech(page), 'y');
});

test('o on the second equation prepends in that equation, not the first', { timeout: 90_000 }, async (t) => {
  const { page } = await startSession(t, 'omniya-mathjax-second-eq-e2e-');
  await insertEquation(page, { method: 'latex', source: 'x^4+x^4+x^3' });
  await insertEquation(page, { method: 'latex', source: 'y^4+3' });
  const before = await getMathNodes(page);

  await enterExplorer(page, 1);
  const root = await explorerSpeech(page);
  await moveAndRead(page, 'ArrowDown', root);
  await page.keyboard.press('o');
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  assert.match(await page.locator('#composer-heading').textContent(), /Prepending before/i);
  await chooseMethod(page, 'latex');
  await page.locator('#composer-source').fill('z+');
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });

  const after = await getMathNodes(page);
  assert.equal(after[0].attrs.mathml, before[0].attrs.mathml, 'the first equation is untouched');
  assert.notEqual(after[1].attrs.mathml, before[1].attrs.mathml);
  const text = textOfMathml(after[1].attrs.mathml);
  assert.ok(text.indexOf('z') >= 0 && text.indexOf('z') < text.indexOf('y'), `z comes before y (${text})`);
});
