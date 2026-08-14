/**
 * Playwright Electron launches must not inherit ELECTRON_RUN_AS_NODE.
 * Cursor (and some CI shells) set that flag, which makes the Electron binary
 * behave as Node and reject --remote-debugging-port, aborting the launch.
 */
export function electronLaunchEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
