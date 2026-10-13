import assert from 'node:assert/strict';
import test from 'node:test';

import { describeBuild } from '../../src/main/build-info.js';

test('an alpha build is named as one and shows its full version', () => {
  const { message } = describeBuild({ version: '0.1.0-alpha.42+ab12cd3', platform: 'win32', arch: 'x64' });
  assert.match(message, /^Alpha build\n/);
  assert.match(message, /Version 0\.1\.0-alpha\.42\+ab12cd3/);
  assert.match(message, /win32, x64/);
});

test('a plain 0.1.0 is not called an alpha, so it cannot be mistaken for one', () => {
  const { message } = describeBuild({ version: '0.1.0', platform: 'darwin', arch: 'arm64' });
  assert.match(message, /^Test build or release build\n/);
  assert.doesNotMatch(message, /Alpha/);
});

test('no version means running from source', () => {
  const { message } = describeBuild({ version: '', platform: 'darwin', arch: 'arm64' });
  assert.match(message, /from source/);
});
