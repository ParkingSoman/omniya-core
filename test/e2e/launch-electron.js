/**
 * Playwright Electron launches must not inherit ELECTRON_RUN_AS_NODE.
 * Cursor agent shells set that flag; without stripping it, Electron aborts with
 * "Process failed to launch!" (it behaves as Node and rejects remote debugging).
 *
 * Agent / Cursor sandbox note: Electron also fails to launch inside the default
 * Cursor command sandbox. E2E must run with full OS permissions (`all`), not
 * the sandboxed Shell tool. That failure mode looks identical to a leaked
 * ELECTRON_RUN_AS_NODE ("Process failed to launch!").
 *
 * Do not `pkill -f Electron` / Playwright globally — other worktrees may be
 * running e2e. If this worktree is wedged, kill only processes whose argv
 * contains this worktree's `node_modules/electron` path.
 *
 * OMNIYA_HEADLESS defaults on for e2e so BrowserWindows stay hidden (see
 * src/main.js). Pass OMNIYA_HEADLESS=0 to force a visible window while debugging.
 */
export function electronLaunchEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.ELECTRON_RUN_AS_NODE;
  if (env.OMNIYA_HEADLESS == null) env.OMNIYA_HEADLESS = '1';
  return env;
}

export async function chooseType(page, type) {
  await page.evaluate((t) => {
    const input = document.querySelector(`#mode-switch input[value="${t}"]`);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, type);
}

export async function chooseMethod(page, method) {
  const value = method === 'latex' || method === 'LaTeX' ? 'latex' : 'nemeth';
  await page.evaluate((m) => {
    const input = document.querySelector(`#replacement-method input[value="${m}"]`);
    if (input.checked) return;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Commit a new equation from the unified composer (no replacement dock). */
export async function addEquationViaComposer(page, { method = 'latex', source }) {
  await page.locator('#composer-source').waitFor();
  const field = page.locator('#composer-source');
  await field.focus();
  const chord = (method === 'nemeth' || method === 'Nemeth') ? 'Control+e' : 'Control+l';
  await page.keyboard.press(chord);
  await page.waitForFunction(() => /Equation · (Nemeth|LaTeX)/i.test(
    document.querySelector('#mode-panel')?.textContent ?? ''
  ));
  if (method === 'nemeth' || method === 'Nemeth') {
    await field.fill('');
    await page.keyboard.type(source);
  } else {
    await field.fill(source);
  }
  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());
  const article = page.locator('article.napkin-article').last();
  await article.waitFor({ timeout: 30_000 });
  await article.locator('mjx-container, math').first().waitFor({ timeout: 30_000 });
  return article;
}

/**
 * Open unified-composer math replace on a new empty equation (subtree e2es).
 * Product empty-submit no longer opens a second dock.
 */
export async function openReplacementDockOnNewEquation(page) {
  await page.locator('#composer-source').waitFor();
  await page.evaluate(async () => {
    await globalThis.__omniyaTesting.openNewEquationDock();
  });
  await page.locator('#composer-dock').waitFor();
  await page.getByLabel('Replacement input', { exact: true }).waitFor();
  return page.locator('article.napkin-article').last();
}

/** Product must not show #replacement-dock for math authoring. */
export async function assertReplacementDockHidden(page) {
  const visible = await page.locator('#replacement-dock').isVisible().catch(() => false);
  if (visible) throw new Error('#replacement-dock must stay hidden; use #composer-dock');
}

export function mathAuthoringInput(page) {
  return page.getByLabel('Replacement input', { exact: true });
}

export function mathAuthoringStatus(page) {
  return page.locator('#composer-status');
}

export function mathAuthoringSurface(page) {
  return page.locator('#composer-dock');
}

/** Math replace/add has ended; the always-on composer is document text again. */
export async function waitForDocumentComposer(page) {
  await page.locator('#composer-source').waitFor();
  await page.getByLabel('Content', { exact: true }).waitFor();
}
