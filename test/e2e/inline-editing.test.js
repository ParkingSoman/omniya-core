import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { _electron as electron } from 'playwright';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);

async function launch() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-inline-'));
  const app = await electron.launch({ args: ['.'], cwd: projectRoot, env: { ...process.env, OMNIYA_TEST_USER_DATA_DIR: dataDirectory } });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.context().setOffline(true);
  return { app, page };
}

test('inline Nemeth editing replaces the focused expression and survives invalid/cancel paths', { timeout: 60_000 }, async () => {
  const { app, page } = await launch();
  try {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('radio', { name: 'Equation' }).click();
    await page.getByLabel('Content', { exact: true }).fill('a+b');
    await page.getByLabel('Content', { exact: true }).press('Enter');
    const article = page.locator('article').first();
    await article.locator('mjx-container').waitFor();
    await article.locator('mjx-speech').waitFor();
    await article.press('Enter');
    await page.waitForFunction(() => document.activeElement?.closest?.('mjx-container'));
    await page.locator('mjx-container.mjx-explorer-active').waitFor();

    await page.keyboard.press('e');
    const editor = page.locator('.nemeth-inline-editor');
    await editor.waitFor();
    assert.equal(await editor.inputValue(), '');

    await editor.fill('⠿');
    await editor.press('Enter');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.nemeth-inline-editor').count(), 1);
    assert.match(await page.locator('#save-status').textContent(), /Punctuation|cell/i);

    await editor.fill('⠵');
    await editor.press('Escape');
    assert.equal(await page.locator('.nemeth-inline-editor').count(), 0);

    await page.keyboard.press('e');
    await page.locator('.nemeth-inline-editor').fill('⠵');
    await page.locator('.nemeth-inline-editor').press('Enter');
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.nemeth-inline-editor').count(), 0);
    assert.match(await article.locator('mjx-container').textContent(), /z/i);
  } finally {
    await app.close();
  }
});

test('Braille display simulation accepts Unicode cells and six-key chords', { timeout: 60_000 }, async () => {
  const { app, page } = await launch();
  try {
    await page.evaluate(() => { globalThis.__omniyaBrailleSimulation = true; });
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('radio', { name: 'Equation' }).click();
    await page.getByLabel('Content', { exact: true }).fill('x');
    await page.getByLabel('Content', { exact: true }).press('Enter');
    const article = page.locator('article').first();
    await article.locator('mjx-container').waitFor();
    await article.locator('mjx-speech').waitFor();
    await article.press('Enter');
    await page.waitForFunction(() => document.activeElement?.closest?.('mjx-container'));
    await page.keyboard.press('e');
    const editor = page.locator('.nemeth-inline-editor');
    await editor.waitFor();
    await page.keyboard.down('f');
    await page.keyboard.down('s');
    await page.keyboard.down('d');
    await page.keyboard.up('f');
    await page.keyboard.up('s');
    await page.keyboard.up('d');
    assert.equal(await editor.inputValue(), '⠇');
    await editor.press('Enter');
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.nemeth-inline-editor').count(), 0);
    assert.match(await article.locator('mjx-container').textContent(), /l/i);
  } finally {
    await app.close();
  }
});

test('inline editing preserves the surrounding fraction when focus is inside the numerator', { timeout: 60_000 }, async () => {
  const { app, page } = await launch();
  try {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('radio', { name: 'Equation' }).click();
    await page.getByLabel('Content', { exact: true }).fill('\\frac{a+b}{c}');
    await page.getByLabel('Content', { exact: true }).press('Enter');
    const article = page.locator('article').first();
    await article.locator('mjx-container').waitFor();
    await article.locator('mjx-speech').waitFor();
    await article.press('Enter');
    await page.waitForFunction(() => document.activeElement?.closest?.('mjx-container'));
    await page.locator('mjx-container.mjx-explorer-active').waitFor();
    const initialSpeech = await article.locator('mjx-speech').getAttribute('aria-label');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction((previous) => document.querySelector('article mjx-speech')?.getAttribute('aria-label') !== previous, initialSpeech);
    await page.keyboard.press('e');
    const editor = page.locator('.nemeth-inline-editor');
    await editor.waitFor();
    await editor.fill('⠵');
    await editor.press('Enter');
    await page.waitForTimeout(800);
    assert.equal(await article.locator('math mfrac').count(), 1, await page.locator('#transcript').innerHTML());
    assert.equal(await article.locator('math mfrac > mi').count(), 2, await article.locator('math mfrac').evaluate((node) => node.outerHTML));
    assert.match(await article.locator('mjx-container').textContent(), /z/);
    assert.match(await article.locator('mjx-container').textContent(), /c/);
  } finally {
    await app.close();
  }
});

test('inline editing preserves exponent structure at a navigated child', { timeout: 60_000 }, async () => {
  const { app, page } = await launch();
  try {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('radio', { name: 'Equation' }).click();
    await page.getByLabel('Content', { exact: true }).fill('x^2');
    await page.getByLabel('Content', { exact: true }).press('Enter');
    const article = page.locator('article').first();
    await article.locator('mjx-container').waitFor();
    await article.locator('mjx-speech').waitFor();
    await article.press('Enter');
    await page.waitForFunction(() => document.activeElement?.closest?.('mjx-container'));
    await page.locator('mjx-container.mjx-explorer-active').waitFor();
    const initialSpeech = await article.locator('mjx-speech').getAttribute('aria-label');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction((previous) => document.querySelector('article mjx-speech')?.getAttribute('aria-label') !== previous, initialSpeech);
    const baseSpeech = await article.locator('mjx-speech').getAttribute('aria-label');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((previous) => document.querySelector('article mjx-speech')?.getAttribute('aria-label') !== previous, baseSpeech);
    const exponentSpeech = await article.locator('mjx-speech').getAttribute('aria-label');
    await page.keyboard.press('e');
    const editor = page.locator('.nemeth-inline-editor');
    await editor.waitFor();
    await editor.fill('⠵');
    await editor.press('Enter');
    await page.waitForTimeout(800);
    assert.equal(await article.locator('math msup').count(), 1);
    assert.match(await article.locator('mjx-container').textContent(), /x/, `navigation labels: ${initialSpeech} -> ${baseSpeech} -> ${exponentSpeech}`);
    assert.match(await article.locator('mjx-container').textContent(), /z/);

    await article.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
    await page.keyboard.press('Home');
    await page.waitForTimeout(500);
    const wholeBraille = await article.locator('mjx-speech').last().getAttribute('aria-braillelabel');
    assert.equal(wholeBraille, '⠭⠘⠵');
  } finally {
    await app.close();
  }
});

test('rendered whole and focused MathML expose reviewed Nemeth Braille for a complex fixture', { timeout: 60_000 }, async () => {
  const { app, page } = await launch();
  try {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('radio', { name: 'Equation' }).click();
    await page.getByLabel('Content', { exact: true }).fill('\\frac{a+b}{c-d}');
    await page.getByLabel('Content', { exact: true }).press('Enter');
    const article = page.locator('article').first();
    await article.locator('mjx-container').waitFor();
    await article.locator('mjx-speech').waitFor();
    await article.press('Enter');
    await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));

    const rootSpeech = article.locator('mjx-speech').last();
    const rootBraille = await rootSpeech.getAttribute('aria-braillelabel');
    assert.equal(rootBraille, '⠹⠁⠬⠃⠌⠉⠤⠙⠼');

    await page.keyboard.press('ArrowDown');
    await page.waitForFunction((previous) => document.querySelector('article mjx-speech')?.getAttribute('aria-braillelabel') !== previous, rootBraille);
    const numeratorBraille = await article.locator('mjx-speech').last().getAttribute('aria-braillelabel');
    assert.equal(numeratorBraille, '⠁⠬⠃');
  } finally {
    await app.close();
  }
});

test('writing a fraction uses the same guided editor, empty-slot traversal, and reviewed whole-expression Braille', { timeout: 60_000 }, async () => {
  const { app, page } = await launch();
  try {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('radio', { name: 'Equation' }).click();
    await page.getByLabel('Content', { exact: true }).fill('x');
    await page.getByLabel('Content', { exact: true }).press('Enter');
    const article = page.locator('article').first();
    await article.locator('mjx-container').waitFor();
    await article.locator('mjx-speech').waitFor();
    await article.press('Enter');
    await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
    await page.keyboard.press('e');
    const editor = page.locator('.nemeth-inline-editor');
    await editor.waitFor();

    await editor.fill('⠹');
    await editor.press('Tab');
    assert.match(await page.locator('#save-status').textContent(), /empty mathematical slot/i);
    await editor.fill('⠽');
    await editor.press('Enter');
    await page.waitForTimeout(700);

    assert.equal(await article.locator('math mfrac').count(), 1);
    assert.equal(await article.locator('math mfrac > mi').count(), 2, await article.locator('math mfrac').evaluate((node) => node.outerHTML));
    await article.press('Enter');
    await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
    assert.equal(await article.locator('mjx-speech').last().getAttribute('aria-braillelabel'), '⠹⠭⠌⠽⠼');
  } finally {
    await app.close();
  }
});

test('creating an empty equation opens the same guided structural editor', { timeout: 60_000 }, async () => {
  const { app, page } = await launch();
  try {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('radio', { name: 'Equation' }).click();
    await page.getByLabel('Content', { exact: true }).press('Enter');
    const editor = page.locator('.nemeth-inline-editor');
    await editor.waitFor();
    await editor.fill('⠹⠭');
    await editor.press('Tab');
    await editor.fill('⠭');
    await editor.press('Enter');
    await page.waitForTimeout(800);
    const article = page.locator('article').first();
    assert.equal(await article.locator('math mfrac').count(), 1);
    assert.equal(await article.locator('math mfrac > mi').count(), 2, await article.locator('math mfrac').evaluate((node) => node.outerHTML));
    await article.press('Enter');
    await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
    assert.equal(await article.locator('mjx-speech').last().getAttribute('aria-braillelabel'), '⠹⠭⠌⠭⠼');
  } finally {
    await app.close();
  }
});

test('Backspace in an empty inline editor creates a required structural hole', { timeout: 60_000 }, async () => {
  const { app, page } = await launch();
  try {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('radio', { name: 'Equation' }).click();
    await page.getByLabel('Content', { exact: true }).fill(String.raw`\frac{a+b}{c}`);
    await page.getByLabel('Content', { exact: true }).press('Enter');
    const article = page.locator('article').first();
    await article.locator('mjx-container').waitFor();
    await article.locator('mjx-speech').waitFor();
    await article.press('Enter');
    await page.waitForFunction(() => Boolean(document.activeElement?.closest?.('mjx-container')));
    await page.locator('mjx-container.mjx-explorer-active').waitFor();
    const initialSpeech = await article.locator('mjx-speech').getAttribute('aria-label');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction((previous) => document.querySelector('article mjx-speech')?.getAttribute('aria-label') !== previous, initialSpeech);
    await page.keyboard.press('e');
    const editor = page.locator('.nemeth-inline-editor');
    await editor.waitFor();
    await editor.press('Backspace');
    await editor.press('Enter');
    await page.waitForTimeout(700);
    assert.equal(await article.locator('math mfrac').count(), 1, await page.locator('#transcript').innerHTML());
    assert.equal(await article.locator('math mfrac > mrow[data-omniya-hole="true"]').count(), 1);
    assert.equal(await article.locator('math mfrac > mi').count(), 1);
  } finally {
    await app.close();
  }
});
