/**
 * Headed coherent writing demo from a braille-first workflow.
 *
 * Blind-author path for a nontrivial definite integral:
 * 1. Author the problem as math (not plain text): ∫_a^b with a placeholder integrand
 * 2. Explore bounds/integrand via speech + Braille labels
 * 3. E-replace the placeholder with √(1−x²), typed slowly cell-by-cell
 * 4. Explore nested radical / script structure
 * 5. Specialize bounds a→0, b→1
 * 6. Record the evaluated result π/4 as a follow-on equation
 *
 * Watch: cd /tmp/omniya-paper-writing-workflow && npm run test:demo:thought
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from '../e2e/launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CELL_MS = 850;
const BEAT_MS = 1200;

async function pause(page, ms = CELL_MS) {
  await page.waitForTimeout(ms);
}

async function launch() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-thought-demo-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({
      OMNIYA_TEST_USER_DATA_DIR: dataDirectory,
      OMNIYA_HEADLESS: '0'
    })
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  return { app, page, dataDirectory };
}

async function addBlankEquation(page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('radio', { name: 'Equation' }).check();
  await page.getByLabel('Content', { exact: true }).press('Enter');
  await page.locator('#replacement-dock').waitFor();
  await pause(page, BEAT_MS);
  return page.locator('article.napkin-article').last();
}

async function resolveChoiceIfNeeded(page, preferredOperationId) {
  const panel = page.locator('#replacement-choices');
  if (await panel.isHidden()) return;
  if (preferredOperationId) {
    const preferred = panel.locator(`.replacement-choice[data-operation-id="${preferredOperationId}"]`);
    if (await preferred.count()) {
      await preferred.click();
      await pause(page, CELL_MS);
      return;
    }
  }
  await panel.locator('.replacement-choice').first().click();
  await pause(page, CELL_MS);
}

async function feedCell(page, cell, { choiceId, statusIncludes } = {}) {
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.fill(cell);
  await pause(page, CELL_MS);
  await resolveChoiceIfNeeded(page, choiceId);
  if (statusIncludes) {
    await page.waitForFunction(
      (needle) => (document.querySelector('#replacement-status')?.textContent ?? '').includes(needle),
      statusIncludes,
      { timeout: 10_000 }
    );
  }
}

async function feedCells(page, cells) {
  for (const step of cells) {
    if (typeof step === 'string') await feedCell(page, step);
    else await feedCell(page, step.cell, step);
  }
}

async function submitReplacement(page) {
  await pause(page, BEAT_MS);
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
  await pause(page, BEAT_MS);
}

async function focusArticle(page, index) {
  const article = page.locator('article.napkin-article').nth(index);
  await article.click();
  await article.focus();
  await pause(page, BEAT_MS);
  return article;
}

async function enterExplore(page, article) {
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current),
    null,
    { timeout: 15_000 }
  );
  await pause(page, BEAT_MS);
}

async function leaveExplore(page) {
  await page.keyboard.press('Escape');
  await pause(page, BEAT_MS);
}

async function currentSpeech(page) {
  return page.evaluate(() => {
    const speech = document.querySelector('mjx-speech');
    return {
      label: speech?.getAttribute('aria-label') ?? '',
      braille: speech?.getAttribute('aria-braillelabel') ?? ''
    };
  });
}

async function exploreUntil(page, predicate, { maxSteps = 12, key = 'ArrowDown' } = {}) {
  for (let i = 0; i < maxSteps; i += 1) {
    const speech = await currentSpeech(page);
    if (predicate(speech)) return speech;
    await page.keyboard.press(key);
    await pause(page, CELL_MS);
  }
  const speech = await currentSpeech(page);
  throw new Error(`Explorer did not reach target. Last speech="${speech.label}" braille="${speech.braille}"`);
}

async function openExactReplacement(page, article, predicate, navigate = {}) {
  await enterExplore(page, article);
  await exploreUntil(page, predicate, navigate);
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  await pause(page, BEAT_MS);
}

/**
 * E must target the integrand leaf (placeholder x), not the integral/msubsup.
 * Pressing E on the operator replaces that whole subtree and the integral vanishes
 * (usage error / easy footgun — see friction log F8).
 *
 * Friction F9: ArrowDown alone often stays on the whole “integral from a to b of x”
 * utterance (braille ⠮⠰⠁⠘⠃⠐⠭). Reaching the leaf x needs Right/Down mixing.
 */
async function openIntegrandReplacement(page, article) {
  await enterExplore(page, article);
  const isIntegrandX = ({ label, braille }) => {
    if (/integral from|underscript|overscript|radicand|radical|root/i.test(label)) return false;
    if (braille.length > 2 && braille.includes('⠮')) return false; // whole-expression braille
    const brailleIsX = braille === '⠭' || braille === '⠐⠭';
    const labelIsBareX = /^(x)([,.]|\s|$)/i.test(label.trim());
    return brailleIsX || labelIsBareX;
  };

  let speech = await currentSpeech(page);
  const keys = [
    'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown',
    'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowDown',
    'ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowUp',
    'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown'
  ];
  for (let i = 0; i < keys.length; i += 1) {
    if (isIntegrandX(speech)) break;
    await page.keyboard.press(keys[i]);
    await pause(page, CELL_MS);
    speech = await currentSpeech(page);
  }
  assert.ok(
    isIntegrandX(speech),
    `refusing to E-replace: focus is not the integrand x (${JSON.stringify(speech)})`
  );
  await pause(page, BEAT_MS);
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  const scope = await page.locator('#replacement-scope').textContent();
  assert.match(scope ?? '', /x/i);
  assert.equal(
    /integral|∫/i.test(scope ?? ''),
    false,
    `replacement scope must be the integrand, not the integral (scope="${scope}")`
  );
  await pause(page, BEAT_MS);
}

/**
 * After an integrand radical exists, fixed Down/Right counts can fall into the
 * radicand. Require script-role speech (underscript/overscript) before E.
 */
async function openIntegralBoundReplacement(page, article, which) {
  await enterExplore(page, article);
  const wantLower = which === 'lower';
  const matches = ({ label, braille }) => {
    if (/radicand|radical|root|square|power|super/i.test(label)) return false;
    if (wantLower) {
      return /underscript/i.test(label) || braille === '⠁' || braille === '⠼⠴';
    }
    return /overscript/i.test(label) || braille === '⠃' || braille === '⠼⠂';
  };

  let speech = await currentSpeech(page);
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
  for (let i = 0; i < keys.length; i += 1) {
    if (matches(speech)) break;
    await page.keyboard.press(keys[i]);
    await pause(page, CELL_MS);
    speech = await currentSpeech(page);
  }
  assert.ok(matches(speech), `expected ${which} bound before E, got ${JSON.stringify(speech)}`);
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  const scope = await page.locator('#replacement-scope').textContent();
  if (wantLower) assert.match(scope ?? '', /lower|a|0|under/i);
  else assert.match(scope ?? '', /upper|b|1|over/i);
  await pause(page, BEAT_MS);
}

test('thought-stream demo: braille-authored hard definite integral workspace', { timeout: 120_000 }, async (t) => {
  const started = Date.now();
  const { app, page } = await launch();
  t.after(() => app.close().catch(() => {}));

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Quarter-circle integral');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  await pause(page, BEAT_MS);

  // Beat 1 — write the problem as mathematics: ∫_a^b x (placeholder integrand).
  // A plain text line cannot render MathML; the problem itself must be authored.
  const problem = await addBlankEquation(page);
  await feedCell(page, '⠮', { statusIncludes: 'operator.integral' });
  await feedCell(page, '⠽'); // deliberate mistake
  await page.getByLabel('Replacement input', { exact: true }).press('Backspace');
  await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent?.includes('Undid last Nemeth input'));
  await pause(page, CELL_MS);
  await feedCells(page, [
    { cell: '⠰', statusIncludes: 'pending' },
    { cell: '⠁', statusIncludes: 'letter.a' },
    { cell: '⠘' },
    { cell: '⠃', statusIncludes: 'letter.b' },
    { cell: '⠐' },
    { cell: '⠭', statusIncludes: 'letter.x' }
  ]);
  await submitReplacement(page);
  assert.match(await problem.locator('math').evaluate((n) => n.outerHTML), /msubsup/);
  assert.equal(await problem.locator('math mi').filter({ hasText: 'x' }).count() > 0, true);

  // Beat 2 — read the problem with Explorer; require Braille labels at each stop.
  await focusArticle(page, 0);
  await enterExplore(page, problem);
  const integralSpeech = await exploreUntil(page, ({ label, braille }) => /integral/i.test(label) || braille.includes('⠮'));
  assert.ok(integralSpeech.braille.length > 0, 'integral focus must expose Braille');
  const lowerSpeech = await exploreUntil(page, ({ label, braille }) => /underscript|a/i.test(label) || braille.includes('⠁'), { key: 'ArrowRight' });
  assert.ok(lowerSpeech.braille.length > 0, 'lower bound must expose Braille');
  await leaveExplore(page);

  // Beat 3 — navigate to the integrand x first, then E-replace with √(1−x²).
  // E on the integral/msubsup would replace that whole tree (friction F8).
  await openIntegrandReplacement(page, problem);
  await feedCells(page, [
    { cell: '⠜', statusIncludes: 'radical' },
    { cell: '⠼' },
    { cell: '⠂', statusIncludes: 'number.1' },
    { cell: '⠤' },
    { cell: '⠭', statusIncludes: 'letter.x' },
    { cell: '⠘' },
    { cell: '⠆', statusIncludes: 'number.2' },
    { cell: '⠻', statusIncludes: 'radical.end' }
  ]);
  await submitReplacement(page);
  const afterIntegrand = await problem.locator('math').evaluate((n) => n.outerHTML);
  assert.match(afterIntegrand, /msubsup/, 'integral with bounds must survive integrand replace');
  assert.equal(await problem.locator('math msqrt').count(), 1);
  assert.match(afterIntegrand, /msup[\s\S]*x[\s\S]*2/);

  // Beat 4 — navigate nested radical / power structure; Braille must stay present.
  await focusArticle(page, 0);
  await enterExplore(page, problem);
  await exploreUntil(page, ({ label }) => /root|square|radical|sqrt/i.test(label));
  const nested = await exploreUntil(page, ({ label, braille }) => /x|2|power|super/i.test(label) || /⠭|⠆/.test(braille));
  assert.ok(nested.braille.length > 0, 'nested radical content must expose Braille');
  await leaveExplore(page);

  // Beat 5 — specialize bounds to the unit interval by exact replacements.
  await openIntegralBoundReplacement(page, problem, 'lower');
  await feedCells(page, [
    { cell: '⠼' },
    { cell: '⠴', statusIncludes: 'number.0' }
  ]);
  await submitReplacement(page);

  await openIntegralBoundReplacement(page, problem, 'upper');
  await feedCells(page, [
    { cell: '⠼' },
    { cell: '⠂', statusIncludes: 'number.1' }
  ]);
  await submitReplacement(page);

  const boundTexts = await problem.locator('math > msubsup > *').evaluateAll((nodes) => nodes.map((n) => n.textContent));
  assert.equal(boundTexts[0], '∫');
  assert.equal(boundTexts[1], '0');
  assert.equal(boundTexts[2], '1');
  assert.equal(await problem.locator('math msqrt').count(), 1);

  // Beat 6 — after reading the specialized integral, record π/4.
  await leaveExplore(page).catch(() => {});
  const result = await addBlankEquation(page);
  await feedCells(page, [
    { cell: '⠹', statusIncludes: 'fraction.start' },
    { cell: '⠨' },
    { cell: '⠏', statusIncludes: 'π' },
    { cell: '⠌', statusIncludes: 'denominator' },
    { cell: '⠼' },
    { cell: '⠲', statusIncludes: 'number.4' },
    { cell: '⠼', statusIncludes: 'fraction.end' }
  ]);
  await submitReplacement(page);
  assert.match(await result.locator('math').evaluate((n) => n.outerHTML), /<mi[^>]*>π<\/mi>/);
  assert.match(await result.locator('math').evaluate((n) => n.outerHTML), /<mn[^>]*>4<\/mn>/);

  assert.equal(await page.locator('article.napkin-article').count(), 2);
  const elapsedMs = Date.now() - started;
  assert.ok(elapsedMs <= 120_000, `demo exceeded 2 minutes (${elapsedMs}ms)`);
});
