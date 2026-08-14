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
const CELL_MS = 550;
const BEAT_MS = 850;
const SUBMIT_MS = 1100;

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
  await pause(page, SUBMIT_MS);
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

function matchesSpeech(speech, { labelRe, brailleExact, brailleIncludes } = {}) {
  if (brailleExact?.includes(speech.braille)) return true;
  if (brailleIncludes?.some((part) => speech.braille.includes(part))) return true;
  if (labelRe && new RegExp(labelRe, 'i').test(speech.label)) return true;
  return false;
}

async function waitForSpeechMatch(page, match, { timeout = 8_000 } = {}) {
  await page.waitForFunction(({ labelRe, brailleExact, brailleIncludes }) => {
    const speech = document.querySelector('mjx-speech');
    const label = speech?.getAttribute('aria-label') ?? '';
    const braille = speech?.getAttribute('aria-braillelabel') ?? '';
    if (brailleExact && brailleExact.includes(braille)) return true;
    if (brailleIncludes && brailleIncludes.some((part) => braille.includes(part))) return true;
    if (labelRe && new RegExp(labelRe, 'i').test(label)) return true;
    return false;
  }, {
    labelRe: match.labelRe?.source ?? match.labelRe ?? null,
    brailleExact: match.brailleExact ?? null,
    brailleIncludes: match.brailleIncludes ?? null
  }, { timeout });
  return currentSpeech(page);
}

async function pressExplore(page, key) {
  await page.keyboard.press(key);
  await pause(page, CELL_MS);
}

async function exploreUntil(page, predicate, { maxSteps = 12, key = 'ArrowDown' } = {}) {
  for (let i = 0; i < maxSteps; i += 1) {
    const speech = await currentSpeech(page);
    if (predicate(speech)) return speech;
    await pressExplore(page, key);
  }
  const speech = await currentSpeech(page);
  throw new Error(`Explorer did not reach target. Last speech="${speech.label}" braille="${speech.braille}"`);
}

/** Seek a speech node by trying keys in order until the match appears. */
async function seekSpeech(page, match, keys, { maxSteps = 10 } = {}) {
  let speech = await currentSpeech(page);
  if (matchesSpeech(speech, match)) return speech;
  for (let i = 0; i < maxSteps; i += 1) {
    await pressExplore(page, keys[i % keys.length]);
    speech = await currentSpeech(page);
    if (matchesSpeech(speech, match)) return speech;
  }
  throw new Error(`seekSpeech failed for ${JSON.stringify(match)}; last=${JSON.stringify(speech)}`);
}

const INTEGRAND_X = {
  labelRe: '^(x)([,.]|\\s|$)',
  brailleExact: ['⠭', '⠐⠭']
};
const INTEGRAL_BASE = {
  labelRe: 'base integral',
  brailleExact: ['⠮']
};
const LOWER_BOUND = {
  labelRe: 'underscript',
  brailleExact: ['⠁', '⠼⠴']
};
const UPPER_BOUND = {
  labelRe: 'overscript',
  brailleExact: ['⠃', '⠼⠂']
};

/**
 * Explorer starts at the equation root after Enter (by design). Then seek the
 * edit site by role/braille. Measured 2026-08-14 for ∫_a^b x:
 *   integrand x:  Down, Right, Right  (group Right = sibling x)
 *   integral group: Down from root
 *   base ∫:       Down from group
 *   lower a:      Right from base
 *   upper b:      Right, Right from base
 */
async function goToIntegralBase(page) {
  for (let i = 0; i < 12; i += 1) {
    const speech = await currentSpeech(page);
    if (matchesSpeech(speech, INTEGRAL_BASE)) return speech;

    const onIntegrand = matchesSpeech(speech, INTEGRAND_X);
    const onGroup =
      ['⠮⠰⠁⠘⠃⠐', '⠮⠰⠼⠴⠘⠃⠐', '⠮⠰⠼⠴⠘⠂⠐', '⠮⠰⠁⠘⠂⠐'].includes(speech.braille) ||
      (speech.label === 'the integral from a to b');
    const onRoot = /press h for help/i.test(speech.label) || /integral from .+ of /i.test(speech.label);

    if (onIntegrand) {
      // Sibling integrand sits to the right of the msubsup group.
      await pressExplore(page, 'ArrowLeft');
      continue;
    }
    if (onGroup) {
      // Enter the operator — Right jumps to the integrand sibling instead.
      await pressExplore(page, 'ArrowDown');
      continue;
    }
    if (onRoot) {
      // Prefer Down into the integral group; avoid Right which can jump to x.
      await pressExplore(page, 'ArrowDown');
      continue;
    }
    await pressExplore(page, 'ArrowDown');
  }
  const speech = await currentSpeech(page);
  if (matchesSpeech(speech, INTEGRAL_BASE)) return speech;
  throw new Error(`could not reach integral base; last=${JSON.stringify(speech)}`);
}

async function openIntegrandReplacement(page, article) {
  await enterExplore(page, article);
  const speech = await seekSpeech(page, INTEGRAND_X, ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight']);
  assert.ok(matchesSpeech(speech, INTEGRAND_X), `expected integrand x, got ${JSON.stringify(speech)}`);
  await pause(page, BEAT_MS);
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  const scope = await page.locator('#replacement-scope').textContent();
  assert.match(scope ?? '', /x/i);
  assert.equal(
    /integral from|∫/i.test(scope ?? ''),
    false,
    `E scope must be integrand leaf, not root (scope="${scope}")`
  );
  await pause(page, BEAT_MS);
}

async function openIntegralBoundReplacement(page, article, which) {
  await enterExplore(page, article);
  await goToIntegralBase(page);
  if (which === 'lower') {
    await pressExplore(page, 'ArrowRight');
    await waitForSpeechMatch(page, LOWER_BOUND);
  } else {
    await pressExplore(page, 'ArrowRight');
    await waitForSpeechMatch(page, LOWER_BOUND);
    await pressExplore(page, 'ArrowRight');
    await waitForSpeechMatch(page, UPPER_BOUND);
  }
  const speech = await currentSpeech(page);
  if (which === 'lower') {
    assert.ok(matchesSpeech(speech, LOWER_BOUND), `expected lower bound, got ${JSON.stringify(speech)}`);
  } else {
    assert.ok(matchesSpeech(speech, UPPER_BOUND), `expected upper bound, got ${JSON.stringify(speech)}`);
  }
  await page.keyboard.press('e');
  await page.locator('#replacement-dock').waitFor();
  const scope = await page.locator('#replacement-scope').textContent();
  if (which === 'lower') assert.match(scope ?? '', /lower|underscript|a|0/i);
  else assert.match(scope ?? '', /upper|overscript|b|1/i);
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

  // Beat 2 — read root, then Base → Underscript a (F9).
  await focusArticle(page, 0);
  await enterExplore(page, problem);
  const rootSpeech = await currentSpeech(page);
  assert.match(rootSpeech.label, /integral/i);
  assert.ok(rootSpeech.braille.includes('⠮'), `root braille should include integral: ${rootSpeech.braille}`);
  await goToIntegralBase(page);
  await pressExplore(page, 'ArrowRight');
  const lowerSpeech = await waitForSpeechMatch(page, LOWER_BOUND);
  assert.ok(matchesSpeech(lowerSpeech, LOWER_BOUND), `expected lower bound a, got ${JSON.stringify(lowerSpeech)}`);
  await leaveExplore(page);

  // Beat 3 — specialize bounds while the integrand is still simple x.
  // Doing this after nesting √(…) drops Explorer into the radicand (F3).
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
  assert.deepEqual(
    await problem.locator('math > msubsup > *').evaluateAll((nodes) => nodes.map((n) => n.textContent)),
    ['∫', '0', '1']
  );

  // Beat 4 — navigate to integrand x, then E-replace with √(1−x²) (F8 guard).
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
  assert.deepEqual(
    await problem.locator('math > msubsup > *').evaluateAll((nodes) => nodes.map((n) => n.textContent)),
    ['∫', '0', '1']
  );

  // Beat 5 — read nested radical / power structure; Braille must stay present.
  await focusArticle(page, 0);
  await enterExplore(page, problem);
  await exploreUntil(page, ({ label }) => /root|square|radical|sqrt|radicand/i.test(label));
  const nested = await exploreUntil(page, ({ label, braille }) => /x|2|power|super/i.test(label) || /⠭|⠆/.test(braille));
  assert.ok(nested.braille.length > 0, 'nested radical content must expose Braille');
  await leaveExplore(page);

  // Beat 6 — record π/4 after reading the specialized integral.
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
