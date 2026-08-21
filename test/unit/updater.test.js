import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRunWindowsAutoUpdate } from '../../src/main/updater.js';

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
