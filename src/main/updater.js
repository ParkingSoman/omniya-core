export function shouldRunWindowsAutoUpdate({ platform, isPackaged, isAutomatedTest }) {
  return platform === 'win32' && isPackaged && !isAutomatedTest;
}

/**
 * How many checks in a row must fail before we say so out loud.
 *
 * Checks run every 4 hours, so three is roughly half a day of silence -- long
 * enough that a flaky network or a laptop asleep on a train does not nag, short
 * enough that a genuinely stuck installation is reported the same day.
 */
export const STALLED_AFTER_CONSECUTIVE_FAILURES = 3;

/**
 * Consecutive-failure tracking for the background update check.
 *
 * This exists because of a real outage that nobody could see. Between `a1e79f2`
 * and `f72af79` the release workflow uploaded no `alpha.yml`, so every Windows
 * install asked for an update feed that returned 404, every four hours, for
 * days -- and the only trace was a `console.error` in a packaged app with no
 * console attached. Testers went on believing they were auto-updating while
 * running an old build, which is how a fixed bug keeps getting reported.
 *
 * Reports once per stall, not once per failure: the point is to tell someone
 * their updates have stopped, not to count network errors at them.
 */
export function createUpdateHealth({ stalledAfter = STALLED_AFTER_CONSECUTIVE_FAILURES, onStalled } = {}) {
  let consecutiveFailures = 0;
  let reported = false;
  return {
    recordSuccess() {
      consecutiveFailures = 0;
      reported = false;
    },
    recordFailure() {
      consecutiveFailures += 1;
      if (consecutiveFailures < stalledAfter || reported) return;
      reported = true;
      onStalled?.({ consecutiveFailures });
    },
    get consecutiveFailures() {
      return consecutiveFailures;
    }
  };
}

export async function startWindowsAutoUpdate({
  checkIntervalMs = 4 * 60 * 60 * 1000,
  stalledAfter = STALLED_AFTER_CONSECUTIVE_FAILURES,
  onStalled,
  loadAutoUpdater
} = {}) {
  const load = loadAutoUpdater ?? (async () => {
    const mod = await import('electron-updater');
    return mod.autoUpdater ?? mod.default?.autoUpdater;
  });
  const autoUpdater = await load();
  const health = createUpdateHealth({ stalledAfter, onStalled });

  autoUpdater.autoDownload = true;
  // Logging only. electron-updater emits 'error' AND rejects the check promise
  // for the same failure, so counting here as well would tick the stall
  // counter twice per outage and halve the threshold. The promise below is the
  // single place a check's outcome is recorded.
  autoUpdater.on('error', (err) => console.error('[omniya:update]', err));

  const check = () => autoUpdater.checkForUpdates()
    .then(() => health.recordSuccess())
    .catch((err) => {
      console.error('[omniya:update] check failed', err);
      health.recordFailure();
    });

  await check();
  const timer = setInterval(check, checkIntervalMs);
  timer.unref?.();

  return { autoUpdater, health, check };
}
