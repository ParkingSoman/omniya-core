import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { _electron as electron } from 'playwright';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const corpus = JSON.parse(await readFile(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url), 'utf8'));

function selectedCases() {
  if (process.env.BANA_ELECTRON_EXAMPLE) return corpus.cases.filter((entry) => entry.exampleNumber === process.env.BANA_ELECTRON_EXAMPLE);
  if (process.env.BANA_RULE) return corpus.cases.filter((entry) => entry.exampleNumber.startsWith(`${process.env.BANA_RULE}-`));
  return corpus.cases;
}

async function launch() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-bana-official-'));
  const app = await electron.launch({ args: ['.'], cwd: projectRoot, env: { ...process.env, OMNIYA_TEST_USER_DATA_DIR: dataDirectory } });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  return app;
}

async function createDraft(page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('radio', { name: 'Equation' }).check();
  await page.getByLabel('Content', { exact: true }).press('Enter');
  await page.locator('#replacement-dock').waitFor();
  return page.getByLabel('Replacement input', { exact: true });
}

async function feedLocalCode(page, input, cells) {
  for (const cell of cells) {
    await input.fill(cell);
    await page.waitForTimeout(18);
    const choices = page.locator('#replacement-choices .replacement-choice');
    if (await choices.count()) {
      // Official source rows are reviewed fixtures. When a local BANA code is
      // intentionally ambiguous, the corpus records the first published
      // meaning unless a future case adds an explicit choice field.
      await choices.first().click();
      await page.waitForTimeout(18);
      await input.fill('');
    }
    const status = await page.locator('#replacement-status').textContent();
    assert.doesNotMatch(status ?? '', /That Nemeth cell is not valid at this draft focus/i, `cell ${cell} rejected: ${status}`);
  }
  // Enter commits only a still-pending bounded local code. A second Enter is
  // the ordinary replacement transaction, never a passage-sized parse.
  if (await input.inputValue()) await input.press('Enter');
  await page.waitForTimeout(40);
  const choices = page.locator('#replacement-choices .replacement-choice');
  if (await choices.count()) {
    const omission = choices.filter({ hasText: 'omission.long-dash' });
    await (await omission.count() ? omission.first() : choices.first()).click();
    await page.waitForTimeout(40);
  }
  if (await page.locator('#replacement-dock').isVisible()) {
    const submit = page.getByRole('button', { name: 'Replace' });
    await submit.waitFor();
    await page.waitForFunction(() => !document.querySelector('#replacement-submit')?.disabled);
    await submit.click();
  }
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
}

test('official BANA examples execute through the real Nemeth replacement renderer', { timeout: 900_000 }, async (t) => {
  if (process.env.BANA_ELECTRON_OFFICIAL !== '1') {
    t.skip('Set BANA_ELECTRON_OFFICIAL=1 to run the sequential official-example Electron corpus.');
    return;
  }
  const cases = selectedCases();
  assert.ok(cases.length, 'official corpus selection is empty');
  const app = await launch();
  t.after(() => app.close().catch(() => {}));
  const page = await app.firstWindow();
  for (const entry of cases) {
    if (!entry.executable) {
      // Source rows whose printed example is UEB, spatial, prose, or whose
      // extracted PDF block does not contain a complete Nemeth local code are
      // retained in the corpus but are not executable equation cases. The
      // coverage ledger keeps them open for source classification rather than
      // pretending the renderer can author document-format material.
      continue;
  }
  const input = await createDraft(page);
    await feedLocalCode(page, input, entry.cells);
    const article = page.locator('article.napkin-article').last();
    await article.locator('mjx-speech[aria-braillelabel]').waitFor();
    const actual = await article.locator('mjx-speech[aria-braillelabel]').getAttribute('aria-braillelabel');
    assert.ok(actual, `${entry.exampleNumber} produced no Nemeth output`);
    if (actual !== entry.cells.join('')) console.error(JSON.stringify({example: entry.exampleNumber, cells: entry.cells.join(''), actual, mathml: await article.locator('math').evaluate((node) => node.outerHTML)}));
    assert.equal(actual, entry.cells.join(''), `${entry.exampleNumber} whole-expression Braille differs from the authored BANA cells`);
  }
});
