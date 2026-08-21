import assert from 'node:assert/strict';
import test from 'node:test';

import { checkForNewerMacBuild, isNewerAlphaBuild, parseAlphaOrdinal } from '../../src/main/mac-update-check.js';

test('parseAlphaOrdinal extracts the alpha build number', () => {
  assert.equal(parseAlphaOrdinal('0.1.0-alpha.42+ab12cd3'), 42);
  assert.equal(parseAlphaOrdinal('0.1.0-alpha.7'), 7);
});

test('parseAlphaOrdinal returns null for non-matching versions', () => {
  assert.equal(parseAlphaOrdinal('0.1.0'), null);
  assert.equal(parseAlphaOrdinal(''), null);
  assert.equal(parseAlphaOrdinal(undefined), null);
});

test('isNewerAlphaBuild compares ordinals numerically', () => {
  assert.equal(isNewerAlphaBuild('0.1.0-alpha.10', '0.1.0-alpha.9'), true);
  assert.equal(isNewerAlphaBuild('0.1.0-alpha.9', '0.1.0-alpha.10'), false);
  assert.equal(isNewerAlphaBuild('0.1.0-alpha.9', '0.1.0-alpha.9'), false);
});

test('isNewerAlphaBuild is false when either version does not match the known shape', () => {
  assert.equal(isNewerAlphaBuild('not-a-version', '0.1.0-alpha.9'), false);
  assert.equal(isNewerAlphaBuild('0.1.0-alpha.9', 'not-a-version'), false);
});

test('checkForNewerMacBuild reports availability from the manifest', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ version: '0.1.0-alpha.12+deadbee' })
  });

  const result = await checkForNewerMacBuild('0.1.0-alpha.9+abc1234', { fetchImpl });

  assert.deepEqual(result, {
    available: true,
    latestVersion: '0.1.0-alpha.12+deadbee',
    releaseUrl: 'https://github.com/ParkingSoman/omniya-core/releases/tag/testing-app'
  });
});

test('checkForNewerMacBuild reports unavailable when already current', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ version: '0.1.0-alpha.9+abc1234' })
  });

  const result = await checkForNewerMacBuild('0.1.0-alpha.9+abc1234', { fetchImpl });

  assert.equal(result.available, false);
});

test('checkForNewerMacBuild fails closed when the manifest request fails', async () => {
  const fetchImpl = async () => ({ ok: false });

  const result = await checkForNewerMacBuild('0.1.0-alpha.9+abc1234', { fetchImpl });

  assert.deepEqual(result, { available: false });
});
