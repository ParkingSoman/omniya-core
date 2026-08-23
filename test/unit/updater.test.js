import assert from 'node:assert/strict';
import test from 'node:test';

import { createUpdateHealth, shouldRunWindowsAutoUpdate, startWindowsAutoUpdate } from '../../src/main/updater.js';

test('runs on packaged win32 builds outside of automated tests', () => {
  assert.equal(
    shouldRunWindowsAutoUpdate({ platform: 'win32', isPackaged: true, isAutomatedTest: false }),
    true
  );
});

test('does not run on darwin', () => {
  assert.equal(
    shouldRunWindowsAutoUpdate({ platform: 'darwin', isPackaged: true, isAutomatedTest: false }),
    false
  );
});

test('does not run when unpackaged (npm start from source)', () => {
  assert.equal(
    shouldRunWindowsAutoUpdate({ platform: 'win32', isPackaged: false, isAutomatedTest: false }),
    false
  );
});

test('does not run under the automated-test flag', () => {
  assert.equal(
    shouldRunWindowsAutoUpdate({ platform: 'win32', isPackaged: true, isAutomatedTest: true }),
    false
  );
});

test('a stalled update check is reported once, after enough consecutive failures', () => {
  // The outage this exists for: every check 404ing for days with nothing but a
  // console.error in a packaged app, while testers believed they were current.
  const stalls = [];
  const health = createUpdateHealth({ stalledAfter: 3, onStalled: (info) => stalls.push(info) });

  health.recordFailure();
  health.recordFailure();
  assert.deepEqual(stalls, [], 'a couple of failures is a flaky network, not a stall');

  health.recordFailure();
  assert.deepEqual(stalls, [{ consecutiveFailures: 3 }]);

  // Once told, stay quiet: the point is to report a stall, not to count errors.
  health.recordFailure();
  health.recordFailure();
  assert.equal(stalls.length, 1);
});

test('a successful check clears the stall, and a later stall can be reported again', () => {
  const stalls = [];
  const health = createUpdateHealth({ stalledAfter: 2, onStalled: (info) => stalls.push(info) });

  health.recordFailure();
  health.recordSuccess();
  health.recordFailure();
  assert.deepEqual(stalls, [], 'the run was broken by a success, so it is not consecutive');

  health.recordFailure();
  assert.equal(stalls.length, 1);

  health.recordSuccess();
  health.recordFailure();
  health.recordFailure();
  assert.equal(stalls.length, 2, 'recovering and stalling again is worth saying again');
});

test('one failed check counts once, even though electron-updater reports it twice', () => {
  // It emits 'error' and rejects the same check. Counting both would halve the
  // threshold and report a stall after half as long an outage as intended.
  const stalls = [];
  const listeners = {};
  const autoUpdater = {
    on: (event, fn) => { listeners[event] = fn; },
    checkForUpdates: () => {
      listeners.error?.(new Error('404'));
      return Promise.reject(new Error('404'));
    }
  };
  return startWindowsAutoUpdate({
    stalledAfter: 2,
    onStalled: (info) => stalls.push(info),
    loadAutoUpdater: async () => autoUpdater
  }).then(({ health }) => {
    assert.equal(health.consecutiveFailures, 1, 'the initial check counted exactly once');
    assert.deepEqual(stalls, []);
  });
});
