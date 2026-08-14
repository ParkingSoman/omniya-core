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
