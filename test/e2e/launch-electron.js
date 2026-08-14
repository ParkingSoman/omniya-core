/**
 * Playwright Electron launches must not inherit ELECTRON_RUN_AS_NODE.
 * Cursor (and some CI shells) set that flag, which makes the Electron binary
 * behave as Node and reject --remote-debugging-port, aborting the launch.
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
  await page.getByRole('button', { name: 'Add item' }).click();
  await chooseType(page, 'equation');
  if (method === 'latex' || method === 'LaTeX') {
    await chooseMethod(page, 'latex');
  }
  const field = page.locator('#composer-source');
  await field.focus();
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
 * Open the legacy isNew #replacement-dock for subtree e2es until Task 6.
 * Product empty-submit no longer opens the dock (unified composer commits instead).
 */
export async function openReplacementDockOnNewEquation(page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.locator('#composer-source').waitFor();
  await page.evaluate(async () => {
    await globalThis.__omniyaTesting.openNewEquationDock();
  });
  await page.locator('#replacement-dock').waitFor();
  return page.locator('article.napkin-article').last();
}
