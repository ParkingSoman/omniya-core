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
