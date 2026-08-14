import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { _electron as electron } from 'playwright';
import { chooseMethod, chooseType, electronLaunchEnv } from './launch-electron.js';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);

async function launch(prefix = 'omniya-replacement-') {
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
  return { app, page, dataDirectory };
}

async function addBlankEquation(page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await chooseType(page, 'equation');
  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());
  await page.locator('#replacement-dock').waitFor();
  return page.locator('article.napkin-article').last();
}

async function commitDraft(page, source, method = 'latex') {
  await chooseMethod(page, method);
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.fill(source);
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  const article = page.locator('article.napkin-article').last();
  await article.locator('mjx-container').waitFor();
  return article;
}

test('Replace button and Enter share one guarded submit transaction', { timeout: 60_000 }, async (t) => {
  const run = async (mode) => {
    const { app, page } = await launch(`omniya-submit-parity-${mode}-`);
    const article = await addBlankEquation(page);
    await chooseMethod(page, 'nemeth');
    const input = page.getByLabel('Replacement input', { exact: true });
    await input.fill('⠭');
    if (mode === 'enter') await input.press('Enter');
    else await page.getByRole('button', { name: 'Replace' }).click();
    await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
    const snapshot = await page.evaluate(() => ({
      dockHidden: document.querySelector('#replacement-dock').hidden,
      mathml: document.querySelector('article.napkin-article:last-of-type math')?.outerHTML,
    }));
    await app.close();
    return { snapshot };
  };
  t.after(() => {});
  const enter = await run('enter');
  const button = await run('button');
  assert.equal(enter.snapshot.dockHidden, true);
  assert.equal(button.snapshot.dockHidden, true);
  assert.equal(enter.snapshot.mathml, button.snapshot.mathml);
});

test('invalid replacement remains open and does not mutate the source', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-submit-invalid-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const before = await article.locator('math').evaluate((node) => node.outerHTML);
  await page.getByRole('button', { name: 'Replace' }).click();
  assert.equal(await page.locator('#replacement-dock').isVisible(), true);
  assert.match(await page.locator('#replacement-status').textContent(), /empty|incomplete/i);
  assert.equal(await article.locator('math').evaluate((node) => node.outerHTML), before);
});

test('new equations use the same empty Nemeth replacement draft and commit once', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch();
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  assert.equal(await page.evaluate(() => document.querySelector('#replacement-method input[value="nemeth"]')?.checked), true);
  await page.getByLabel('Replacement input', { exact: true }).fill('⠭⠬⠁');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelectorAll('article.napkin-article math mi').length === 2);
  assert.equal(await article.locator('math mi').count(), 2);
  assert.equal(await article.locator('math mo').count(), 1);
  assert.match(await article.locator('mjx-container').textContent(), /x/);
  assert.match(await article.locator('mjx-container').textContent(), /a/);
});

test('Backspace undoes the last Nemeth draft cell without canceling the replacement', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-backspace-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  await input.fill('⠭');
  await page.waitForFunction(() => document.querySelector('article.napkin-article:last-of-type math mi')?.textContent === 'x');
  await input.fill('⠽');
  await page.waitForFunction(() => document.querySelectorAll('article.napkin-article:last-of-type math mi').length === 2);

  await input.press('Backspace');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('Undid last Nemeth input'));
  assert.equal(await article.locator('math mi').count(), 1);
  assert.equal(await article.locator('math mi').textContent(), 'x');
  assert.equal(await page.locator('#replacement-dock').isVisible(), true);

  await input.press('Backspace');
  await page.waitForFunction(() => (document.querySelector('article.napkin-article:last-of-type math')?.children?.length ?? 0) === 0);
  assert.equal(await page.locator('#replacement-dock').isVisible(), true);

  await input.fill('⠵');
  await page.waitForFunction(() => document.querySelector('article.napkin-article:last-of-type math mi')?.textContent === 'z');
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math mi').textContent(), 'z');
});

test('BANA Rule 3 numeric decimals are authored cell by cell and edited at a MathJax-selected numeral', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-rule3-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA 3.2.3 Examples 3-5/3-6: the numeric indicator, lower-cell digits,
  // and decimal point are independent local transitions. No expression-sized
  // Nemeth buffer is used.
  for (const cell of ['⠼', '⠒', '⠨', '⠂', '⠲']) {
    await input.fill(cell);
    await page.waitForTimeout(60);
  }
  assert.equal(await article.locator('math > mn').textContent(), '3.14');
  assert.equal(await input.inputValue(), '');
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠼⠒⠨⠂⠲');

  // Navigate the populated equation with the real Explorer, freeze the exact
  // numeral, and replace only that node with another locally-authored number.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  const replacementInput = page.getByLabel('Replacement input', { exact: true });
  for (const cell of ['⠼', '⠶', '⠨', '⠴']) {
    await replacementInput.fill(cell);
    await page.waitForTimeout(60);
  }
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math > mn').textContent(), '7.0');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠼⠶⠨⠴');
});

test('renderer applies immediate, structural-followup, and atomic Nemeth codes in one real draft', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-policies-');
  t.after(() => app.close().catch(() => {}));

  // Immediate: an ordinary integral is inserted as soon as its single BANA
  // cell is received. This is a renderer event, not a direct domain call.
  const integralArticle = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.fill('⠮');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('Draft updated'));
  assert.equal(await page.locator('#replacement-dock').isVisible(), true);
  assert.equal(await page.locator('#replacement-input').inputValue(), '');
  assert.equal(await integralArticle.locator('math mo').textContent(), '∫');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await integralArticle.locator('mjx-container').waitFor();
  assert.equal(await integralArticle.locator('mjx-speech[aria-braillelabel]').count() > 0, true);
  assert.equal(await integralArticle.locator('math mo').textContent(), '∫');

  // Structural follow-up: the fraction separator moves focus from the
  // numerator to the denominator. The separator itself never becomes a
  // MathML token in the draft.
  const fractionArticle = await addBlankEquation(page);
  const fractionInput = page.getByLabel('Replacement input', { exact: true });
  await fractionInput.fill('⠹');
  await page.waitForFunction(() => document.querySelector('article.napkin-article:last-of-type mfrac') !== null);
  await fractionInput.fill('⠭');
  await page.waitForFunction(() => document.querySelector('article.napkin-article:last-of-type mfrac mi')?.textContent === 'x');
  await fractionInput.fill('⠌');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('fraction.next.denominator'));
  assert.equal(await fractionArticle.locator('mfrac').count(), 1);
  assert.equal(await fractionArticle.locator('mfrac > mo').count(), 0);

  // Atomic sequence: the uncontracted right arrow is held in the bounded
  // local buffer until Enter. The draft is unchanged while the four cells
  // arrive; the first Enter commits only the arrow, and the second submits
  // the replacement transaction.
  const arrowInput = page.getByLabel('Replacement input', { exact: true });
  await arrowInput.fill('⠫⠒⠒⠕');
  // Boundedly held: longer arrows share this prefix, so status may say the
  // sequence can continue; Enter still commits the exact uncontracted arrow.
  // The input mirrors the pending cells for braille review until that commit.
  await page.waitForFunction(() => document.querySelector('#replacement-input')?.value === '⠫⠒⠒⠕');
  assert.match(await page.locator('#replacement-status').textContent(), /may continue|Press Enter/i);
  assert.equal(await fractionArticle.locator('mfrac mo').count(), 0);
  await arrowInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('Local code committed'));
  assert.equal(await fractionArticle.locator('mfrac > *').nth(1).textContent(), '→');
  await arrowInput.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await fractionArticle.locator('math mfrac').count(), 1);
  assert.deepEqual(await fractionArticle.locator('math mfrac > *').evaluateAll((nodes) => nodes.map((node) => node.textContent)), ['x', '→']);
});

test('Nemeth integral creation and MathJax sign navigation edit preserve the local follow-up structure', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-integral-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rule 23.12 gives the ordinary integral a standalone cell. A
  // repeated integral is a structural follow-up on that already-created
  // operator, not an expression-sized parse.
  await input.fill('⠮');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('operator.integral'));
  await input.fill('⠮');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('integral.extend'));
  assert.equal(await article.locator('math > mo').textContent(), '∬');
  assert.equal(await input.inputValue(), '');
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠮⠮');

  // Re-enter through MathJax Explorer and edit the exact focused operator.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label')?.toLowerCase().includes('integral'));
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠮⠮');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await input.fill('⠮');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('operator.integral'));
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math > mo').textContent(), '∫');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠮');
});

test('Nemeth integral bounds are created locally and MathJax navigation edits only the selected bound', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-integral-bounds-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA 23.12 writes the ordinary integral first, then composes its lower
  // and upper bounds with the generic Rule 14 script transitions. Every fill
  // is one local cell; there is no expression-sized Nemeth buffer.
  for (const cell of ['⠮', '⠰', '⠁', '⠘', '⠃']) {
    await input.fill(cell);
    await page.waitForFunction((value) => {
      const status = document.querySelector('#replacement-status')?.textContent ?? '';
      return status.includes(value) || status.includes('Draft updated');
    }, cell === '⠮' ? 'operator.integral' : cell === '⠰' ? 'script.subscript' : cell === '⠘' ? 'script.superscript' : 'letter');
  }
  await page.waitForFunction(() => document.querySelector('article.napkin-article:last-of-type math > msubsup') !== null);
  assert.equal(await article.locator('math > msubsup').count(), 1);
  assert.deepEqual(await article.locator('math > msubsup > *').evaluateAll((nodes) => nodes.map((node) => node.textContent)), ['∫', 'a', 'b']);
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  // SRE includes the Rule 14 baseline-return indicator because the bounded
  // script is the complete rendered expression. This is an output projection
  // detail; the authored local cells remain exactly ⠮⠰⠁⠘⠃.
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠮⠰⠁⠘⠃⠐');

  // Navigate through the real MathJax Explorer to the lower bound, freeze E,
  // and replace only that focused MathML child.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label')?.toLowerCase().includes('underscript'));
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠁');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  assert.match(await page.locator('#replacement-scope').textContent(), /lower|a/i);
  await chooseMethod(page, 'nemeth');
  await input.fill('⠵');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('letter.z'));
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.deepEqual(await article.locator('math > msubsup > *').evaluateAll((nodes) => nodes.map((node) => node.textContent)), ['∫', 'z', 'b']);
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠮⠰⠵⠘⠃⠐');
});

test('Nemeth degree decoration is created as one local code and MathJax edits its base only', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-degree-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rule 23.10 writes a degree as the bounded local code ~.* after its
  // base. The degree does not become a free mo token while the cells arrive.
  for (const cell of ['⠼', '⠔', '⠴', '⠘', '⠨', '⠡']) {
    await input.fill(cell);
    // Input events are serialized by the renderer; give that one-cell event
    // a turn before sending the next cell without making the test depend on
    // the wording of an intermediate announcement.
    await page.waitForTimeout(75);
  }
  assert.equal(await article.locator('math > msup').count(), 0);
  // The visible value is only the current bounded local code, never an
  // expression-sized passage buffer.
  assert.equal(await input.inputValue(), '⠘⠨⠡');
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('article.napkin-article:last-of-type math > msup') !== null);
  assert.equal(await article.locator('math > msup').count(), 1);
  assert.deepEqual(await article.locator('math > msup > *').evaluateAll((nodes) => nodes.map((node) => node.textContent)), ['90', '°']);
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠼⠔⠴⠘⠨⠡');

  // MathJax owns populated-tree navigation. ArrowDown enters the base of the
  // superscripted degree, so E freezes only 90, not the degree decoration.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => Boolean(document.querySelector('mjx-speech')?.getAttribute('aria-label')));
  const focusedDegreeChild = await article.locator('mjx-speech').last().getAttribute('aria-label');
  assert.match(focusedDegreeChild, /90|base|degree|superscript/i);
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  assert.match(await page.locator('#replacement-scope').textContent(), /base|90/i);
  await chooseMethod(page, 'nemeth');
  await input.fill('⠙');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.deepEqual(await article.locator('math > msup > *').evaluateAll((nodes) => nodes.map((node) => node.textContent)), ['d', '°']);
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠙⠘⠨⠡');
});

test('renderer creates a nested script and radical through compositional Nemeth cells', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-nested-create-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rules 14.4 and 16.1 are composed as local operations: x, a
  // superscript indicator followed by the radical opener, y, another
  // superscript indicator, z, and the radical terminator. No complete-passage
  // buffer is involved; each cell either updates the current slot or closes
  // the one structure it is already inside.
  for (const cell of ['⠭', '⠘', '⠜', '⠽', '⠘', '⠵', '⠻']) {
    await input.fill(cell);
    const expected = cell === '⠻' ? 'radical.end' : cell === '⠘' ? 'Nemeth sequence may continue' : 'Draft updated';
    await page.waitForFunction((value) => document.querySelector('#replacement-status')?.textContent?.includes(value), expected);
  }
  assert.equal(await article.locator('math > msup').count(), 1);
  assert.equal(await article.locator('math > msup > msqrt').count(), 1);
  assert.deepEqual(await article.locator('math > msup > msqrt > msup > mi').allTextContents(), ['y', 'z']);

  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭⠘⠜⠽⠘⠘⠵⠘⠻');
});

test('MathJax navigation edits a nested Nemeth subexpression without widening the target', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-nested-edit-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });
  for (const cell of ['⠭', '⠘', '⠜', '⠽', '⠘', '⠵', '⠻']) {
    await input.fill(cell);
    const expected = cell === '⠻' ? 'radical.end' : cell === '⠘' ? 'Nemeth sequence may continue' : 'Draft updated';
    await page.waitForFunction((value) => document.querySelector('#replacement-status')?.textContent?.includes(value), expected);
  }
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-container').waitFor();

  // Root -> exponent -> radicand is the real MathJax Explorer path. At this
  // point the semantic focus is the inner y^z node, not its containing radical
  // or the outer x^... expression.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label')?.includes('Radicand y to the z-th power'));
  // SRE's focused-radicand projection includes the level-return indicators
  // needed to describe the nested y^z scope in isolation.
  assert.equal(await page.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠽⠘⠘⠵⠘');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  const scope = await page.locator('#replacement-scope').textContent();
  assert.match(scope, /Radicand y to the z-th power/);

  // Replace only y^z with z^z. The outer x^sqrt(...) tree must remain intact.
  await chooseMethod(page, 'nemeth');
  for (const cell of ['⠵', '⠘', '⠵']) {
    await input.fill(cell);
    const expected = cell === '⠘' ? 'Nemeth sequence may continue' : 'Draft updated';
    await page.waitForFunction((value) => document.querySelector('#replacement-status')?.textContent?.includes(value), expected);
  }
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.deepEqual(await article.locator('math > msup > msqrt > msup > mi').allTextContents(), ['z', 'z']);
  assert.equal(await article.locator('math > msup > mi').first().textContent(), 'x');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭⠘⠜⠵⠘⠘⠵⠘⠻');
});

test('Nemeth modifier creation and MathJax base navigation edit preserve the overbar scope', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-modifier-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // Rule 15.2.2 contracted overbar is a local structural follow-up. The
  // first cell inserts x immediately; the bar waits only for Enter and then
  // wraps that focused atom. It is not a passage buffer.
  await input.fill('⠭');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('letter.x'));
  await input.fill('⠱');
  await page.waitForFunction(() => document.querySelector('#replacement-input')?.value === '⠱');
  assert.equal(await article.locator('math mover').count(), 0);
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('modifier.bar-over'));
  assert.equal(await article.locator('math > mover > mi').textContent(), 'x');
  assert.equal(await article.locator('math > mover > mo').textContent(), '¯');

  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭⠱');

  // MathJax owns navigation: root -> the bar's base. E must freeze that
  // exact descendant, not the mover ancestor or its overscript.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label')?.startsWith('x bar'));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'Base x');
  assert.equal(await page.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  assert.match(await page.locator('#replacement-scope').textContent(), /Base x/);

  await chooseMethod(page, 'nemeth');
  await input.fill('⠵');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('letter.z'));
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.deepEqual(await article.locator('math > mover > mi').allTextContents(), ['z']);
  assert.equal(await article.locator('math > mover > mo').textContent(), '¯');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠵⠱');
});

test('Nemeth function creation and MathJax argument navigation edit preserve application structure', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-function-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rule 18.1's abbreviated function name is one bounded atomic code.
  // Enter commits only `sin`; the following x is a separate local token and
  // MathJax derives the application relationship from the resulting tree.
  for (const cell of ['⠎', '⠊', '⠝']) {
    await input.fill(cell);
    await page.waitForFunction((value) => document.querySelector('#replacement-status')?.textContent?.includes(value), cell === '⠝' ? 'Nemeth sequence may continue' : 'Nemeth sequence may continue');
  }
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('function.sin'));
  await input.fill('⠭');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('letter.x'));
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠎⠊⠝⠀⠭');

  // Explorer navigation reaches the application argument through the same
  // root -> application -> argument path used for any MathML expression.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'x');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  assert.match(await page.locator('#replacement-scope').textContent(), /x/);
  await chooseMethod(page, 'nemeth');
  await input.fill('⠵');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('letter.z'));
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.deepEqual(await article.locator('math mi').allTextContents(), ['sin', 'z']);
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠎⠊⠝⠀⠵');
});

test('Nemeth geometry atom creation and MathJax whole-scope editing preserve the local code', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-geometry-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rule 17.1's diamond is a bounded atomic construction. Its two cells
  // are held locally until Enter, and no other expression text is parsed.
  await input.fill('⠫⠙');
  await page.waitForFunction(() => document.querySelector('#replacement-input')?.value === '⠫⠙');
  assert.equal(await article.locator('math > mo').count(), 0);
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('shape.diamond'));
  assert.equal(await article.locator('math > mo').textContent(), '◊');
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠫⠙');

  // A whole-expression Explorer focus is still an exact replacement target.
  // Editing it with another bounded BANA shape code must not leave a stale
  // diamond or widen beyond the equation root.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label')?.includes('lozenge'));
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠫⠙');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await input.fill('⠫⠲');
  await page.waitForFunction(() => document.querySelector('#replacement-input')?.value === '⠫⠲');
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('shape.square'));
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math > mo').textContent(), '□');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠫⠲');
});

test('Nemeth cancellation owns its content and MathJax edits only the canceled term', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-cancellation-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rule 12.1.1: opening cancellation, one local term, and closing
  // cancellation. The empty content slot is a real MathML hole until x is
  // entered; the closer is a structural follow-up, not passage parsing.
  for (const cell of ['⠪', '⠭', '⠻']) {
    await input.fill(cell);
    await page.waitForFunction((value) => document.querySelector('#replacement-status')?.textContent?.includes(value), cell === '⠪' ? 'cancellation.start' : cell === '⠻' ? 'cancellation.end' : 'letter.x');
  }
  assert.equal(await article.locator('math > menclose[notation="updiagonalstrike"] > mi').textContent(), 'x');
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠪⠭⠻');

  // Explorer Down enters the canceled content. E must replace x, not the
  // enclosing menclose, preserving the cancellation indicators and scope.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'x');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await input.fill('⠵');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math > menclose[notation="updiagonalstrike"] > mi').textContent(), 'z');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠪⠵⠻');
});

test('Nemeth fraction creation and MathJax numerator navigation edit preserve the denominator', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-fraction-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rule 13.2 local sequence: opener, numerator, fraction-line
  // structural follow-up, denominator. The line is never inserted as an
  // arbitrary operator; it moves the draft into the owned denominator slot.
  for (const cell of ['⠹', '⠭', '⠌', '⠽']) {
    await input.fill(cell);
    await page.waitForFunction((value) => document.querySelector('#replacement-status')?.textContent?.includes(value), cell === '⠹' ? 'fraction.start.simple' : cell === '⠌' ? 'fraction.next.denominator' : 'Draft updated');
  }
  assert.deepEqual(await article.locator('math > mfrac > *').allTextContents(), ['x', 'y']);
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠹⠭⠌⠽⠼');

  await article.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'Numerator x');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await input.fill('⠵');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.deepEqual(await article.locator('math > mfrac > *').allTextContents(), ['z', 'y']);
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠹⠵⠌⠽⠼');
});

test('Nemeth left-subscript choice creates multiscripts and MathJax edits the owned base', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-prescript-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rule 14.5.1 starts with a left-subscript indicator before the base.
  // Dot 6 + x is locally ambiguous with an English-letter indicator, so the
  // author chooses the standards-defined left-subscript operation explicitly.
  await input.fill('⠰');
  await input.fill('⠭');
  await page.getByRole('button', { name: 'Begin left-subscript construction' }).click();
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('letter.x'));
  await input.fill('⠐');
  await input.fill('⠝');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('letter.n'));
  assert.equal(await article.locator('math > mmultiscripts').count(), 1);
  assert.equal(await article.locator('math > mmultiscripts > mprescripts + mi').textContent(), 'x');
  assert.equal(await article.locator('math > mmultiscripts > mi').first().textContent(), 'n');
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠰⠭⠐⠝');

  // MathJax exposes the base as the navigable descendant of this prescript
  // projection. Editing it must retain the left-subscript child and its
  // stable multiscript wrapper.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'Base n');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠝');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await input.fill('⠵');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math > mmultiscripts > mi').first().textContent(), 'z');
  assert.equal(await article.locator('math > mmultiscripts > mprescripts + mi').textContent(), 'x');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠰⠭⠐⠵');
});

test('Nemeth typeform scope creation and MathJax inner editing preserve the bold MathML scope', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-typeform-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rule 7.3.5: open bold mathematical-expression scope, compose a+b,
  // then close the scope. Each scope marker is a bounded local code; the
  // expression itself is still built one token at a time.
  for (const cell of ['⠠', '⠄', '⠸']) await input.fill(cell);
  await input.press('Enter');
  for (const cell of ['⠁', '⠬', '⠃']) await input.fill(cell);
  for (const cell of ['⠸', '⠠', '⠄']) await input.fill(cell);
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('typeform.scope.bold.close'));
  assert.equal(await article.locator('math > mstyle[mathvariant="bold"] > mrow > mi').count(), 2);
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠁⠬⠃');

  // Explorer enters the bold expression's first identifier. Replacing it
  // must retain the mstyle scope and the plus/second identifier.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'a');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠁');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await input.fill('⠵');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math > mstyle[mathvariant="bold"] > mrow > mi').first().textContent(), 'z');
  assert.deepEqual(await article.locator('math > mstyle[mathvariant="bold"] > mrow > mi').allTextContents(), ['z', 'b']);
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠵⠬⠃');
});

test('Nemeth comparison creation and MathJax relation navigation edit preserve both operands', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-comparison-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });

  // BANA Rules 20.1 and 21.5: x, the bounded less-than relation, and y are
  // independent local transitions. The relation code itself is never a
  // whole-expression parse.
  for (const cell of ['⠭', '⠐', '⠅', '⠽']) await input.fill(cell);
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('letter.y'));
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭⠀⠐⠅⠀⠽');

  // Explorer relation navigation reaches the relation itself and then the
  // right operand. Replace only y and preserve x <.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'y');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠽');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await input.fill('⠵');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.deepEqual(await article.locator('math mi').allTextContents(), ['x', 'z']);
  assert.equal(await article.locator('math mo').textContent(), '<');
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭⠀⠐⠅⠀⠵');
});

test('MathJax-focused Nemeth editing replaces only the selected subtree with an atomic code', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-nemeth-subtree-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  await commitDraft(page, 'x+x', 'latex');
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'x');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'plus');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'x');
  await page.waitForFunction(() => {
    const speech = document.querySelector('mjx-speech');
    return Boolean(speech?.getAttribute('aria-braillelabel'));
  });
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').count() > 0, true);
  assert.equal(await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel'), '⠭');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.fill('⠫⠒⠒⠕');
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('Local code committed'));
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  // MathML may retain an application-owned mrow around the original sibling
  // row, so assert the semantic leaves rather than presentation wrapper
  // boundaries: one original x, the original plus, and the new arrow.
  assert.deepEqual(await article.locator('math mi').allTextContents(), ['x']);
  assert.deepEqual(await article.locator('math mo').allTextContents(), ['+', '→']);
  const wholeBraille = await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel');
  assert.ok(wholeBraille, 'committed replacement must expose a whole-expression Nemeth projection');
  assert.match(wholeBraille, /⠫/, 'the whole-expression projection must include the replacement arrow');
});

test('MathJax-selected duplicate subexpressions replace only the selected node', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-duplicate-replacement-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  await commitDraft(page, 'x+x', 'latex');
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'x');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'plus');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'x');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await page.getByLabel('Replacement input', { exact: true }).fill('⠵');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  const source = await article.locator('math').evaluate((node) => [...node.querySelectorAll('mi')].map((n) => n.textContent));
  assert.deepEqual(source, ['x', 'z']);
});

test('nested numerator replacement preserves the containing fraction', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-numerator-replacement-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  await commitDraft(page, '\\frac{a+b}{c}', 'latex');
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('mjx-speech')?.getAttribute('aria-label') === 'Numerator a plus b');
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'nemeth');
  await page.getByLabel('Replacement input', { exact: true }).fill('⠵');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math mfrac').count(), 1);
  assert.deepEqual(await article.locator('math mfrac > *').evaluateAll((nodes) => nodes.map((node) => node.textContent)), ['z', 'c']);
});

test('LaTeX is an alternate replacement draft and cancel or invalid input leaves the source unchanged', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-latex-replacement-');
  t.after(() => app.close().catch(() => {}));
  const article = await addBlankEquation(page);
  await commitDraft(page, 'a+b', 'latex');
  await article.focus();
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'latex');
  await page.getByLabel('Replacement input', { exact: true }).fill('x^2+\\sqrt{y}');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.match(await article.locator('mjx-container').textContent(), /a/);
  assert.match(await article.locator('mjx-container').textContent(), /b/);

  await article.focus();
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await chooseMethod(page, 'latex');
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.fill('\\frac{');
  await page.getByRole('button', { name: 'Replace' }).click();
  assert.match(await page.locator('#replacement-status').textContent(), /convert|empty|invalid|incomplete/i);
  assert.match(await article.locator('mjx-container').textContent(), /a/);
  await input.fill('x^3');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math msup').count(), 1);
});

test('six-key input feeds the same Nemeth draft transition as Unicode cells', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-six-key-replacement-');
  t.after(() => app.close().catch(() => {}));
  await page.evaluate(() => { globalThis.__omniyaBrailleSimulation = true; });
  const article = await addBlankEquation(page);
  const input = page.getByLabel('Replacement input', { exact: true });
  await page.keyboard.down('f');
  await page.keyboard.down('s');
  await page.keyboard.down('d');
  await page.keyboard.up('f');
  await page.keyboard.up('s');
  await page.keyboard.up('d');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  assert.equal(await article.locator('math mi').count(), 1);
  assert.equal(await article.locator('math mi').textContent(), 'l');
  assert.equal(await input.count(), 1);

  // The same six-key path must also work after MathJax has handed navigation
  // to the focused populated expression. This is a real subtree replacement,
  // not merely a creation smoke test.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => {
    const current = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current;
    return current?.getAttribute('data-semantic-speech-none') === 'l'
      || current?.getAttribute('data-speech') === 'l'
      || current?.getAttribute('aria-label') === 'l';
  });
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await page.keyboard.down('f');
  await page.keyboard.down('s');
  await page.keyboard.down('k');
  await page.keyboard.down('l');
  await page.keyboard.up('f');
  await page.keyboard.up('s');
  await page.keyboard.up('k');
  await page.keyboard.up('l');
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  const editedIdentifiers = await article.locator('math mi').allTextContents();
  const braille = await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel');
  assert.ok(editedIdentifiers.length >= 1 && editedIdentifiers.every((value) => value === 'z'), `six-key edit must leave no stale identifier: ${editedIdentifiers.join(',')}; braille=${braille}`);
  assert.match(braille, /^⠵+$/, `six-key edit must expose only the replacement cell: ${braille}`);
});
