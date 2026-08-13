import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { _electron as electron } from 'playwright';
import { operationRegistry, LOCAL_COMMIT_POLICIES } from '../../src/domain/guided-nemeth/index.js';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);

function smokeMappings() {
  const seen = new Set();
  return operationRegistry().filter((mapping) => {
    if (mapping.action !== 'insert-token' && mapping.action !== 'insert-numeric' && mapping.action !== 'open-structure') return false;
    if (!mapping.cells?.length || mapping.cells.includes(' ')) return false;
    // One representative per exact local code keeps this loaded-renderer
    // smoke corpus bounded while the source-row corpus remains exhaustive.
    const key = mapping.cells.join('');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

test('loaded Electron accepts the representative declarative Nemeth registry corpus', { timeout: 180_000 }, async (t) => {
  if (process.env.BANA_ELECTRON_REGISTRY !== '1') {
    t.skip('Set BANA_ELECTRON_REGISTRY=1 to run the loaded registry corpus; the ordinary suite remains focused.');
    return;
  }
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-bana-registry-'));
  const app = await electron.launch({ args: ['.'], cwd: projectRoot, env: { ...process.env, OMNIYA_TEST_USER_DATA_DIR: dataDirectory } });
  t.after(() => app.close().catch(() => {}));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  const mappings = smokeMappings().filter((mapping) => !process.env.BANA_ELECTRON_MAPPING_ID || mapping.id === process.env.BANA_ELECTRON_MAPPING_ID);
  assert.ok(mappings.length > 0, `registry smoke corpus unexpectedly small: ${mappings.length}`);
  for (const mapping of mappings) {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('radio', { name: 'Equation' }).check();
    await page.getByLabel('Content', { exact: true }).press('Enter');
    await page.locator('#replacement-dock').waitFor();
    const input = page.getByLabel('Replacement input', { exact: true });
    await input.fill(mapping.cells.join(''));
    if (mapping.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE) await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('#replacement-status')?.textContent);
    const status = await page.locator('#replacement-status').textContent();
    assert.doesNotMatch(status ?? '', /not valid|incomplete|cannot/i, `${mapping.id} rejected in loaded Electron`);
    if (await page.locator('#replacement-choices:not([hidden])').count()) {
      const choice = page.locator('.replacement-choice').filter({ hasText: mapping.id });
      assert.equal(await choice.count(), 1, `${mapping.id} must be an explicit local choice when its code is ambiguous`);
      await choice.click();
    }
    const localInput = await input.inputValue();
    await input.press('Enter');
    if (mapping.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE && await page.locator('#replacement-dock').isVisible()) {
      await input.press('Enter');
    } else if (localInput && await page.locator('#replacement-dock').isVisible()) {
      // An immediate code held for bounded lookahead consumes the first Enter
      // as its short-code disambiguator and the second as the replacement.
      await input.press('Enter');
    }
    if (await page.locator('#replacement-dock').isVisible()) {
      const submit = page.getByRole('button', { name: 'Replace' });
      if (!(await submit.count())) continue;
      await submit.waitFor();
      await page.waitForFunction(() => {
        const button = document.querySelector('#replacement-submit');
        return button && !button.disabled;
      });
      await submit.click();
    }
    try {
      await page.locator('#replacement-dock').waitFor({ state: 'hidden', timeout: 2_000 });
    } catch (error) {
      const draftValue = await input.inputValue().catch(() => '');
      const choices = await page.locator('#replacement-choices').textContent().catch(() => '');
      throw new Error(`${mapping.id} (${mapping.commitPolicy}, ${mapping.cells.join('')}) did not submit; status=${status}; input=${draftValue}; choices=${choices}`, { cause: error });
    }
  }
});
