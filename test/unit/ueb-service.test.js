import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { translateUeb, backTranslateUeb, resolveLouTranslate, louSpawnEnv } from '../../src/main/ueb-service.js';

const bin = resolveLouTranslate();
const hasLouis = Boolean(bin && (bin === 'lou_translate' || fs.existsSync(bin)));

function existsSet(...paths) {
  const set = new Set(paths);
  return (p) => set.has(p);
}

test('resolveLouTranslate finds CLI or returns null', () => {
  const p = resolveLouTranslate();
  assert.ok(p === null || String(p).includes('lou_translate'));
});

test('OMNIYA_LOU_TRANSLATE wins over bundled helper', () => {
  const envPath = '/custom/lou_translate';
  const resourcesPath = '/app/Resources';
  const bundled = path.join(resourcesPath, 'liblouis', 'bin', 'lou_translate');
  const got = resolveLouTranslate({
    env: { OMNIYA_LOU_TRANSLATE: envPath },
    resourcesPath,
    exists: existsSet(envPath, bundled, '/opt/homebrew/bin/lou_translate'),
    homebrewCandidates: ['/opt/homebrew/bin/lou_translate'],
    platform: 'darwin'
  });
  assert.equal(got, envPath);
});

test('uses bundled helper when env is unset', () => {
  const resourcesPath = '/app/Resources';
  const bundled = path.join(resourcesPath, 'liblouis', 'bin', 'lou_translate');
  const got = resolveLouTranslate({
    env: {},
    resourcesPath,
    exists: existsSet(bundled, '/opt/homebrew/bin/lou_translate'),
    homebrewCandidates: ['/opt/homebrew/bin/lou_translate'],
    platform: 'darwin'
  });
  assert.equal(got, bundled);
});

test('uses bundled lou_translate.exe on win32', () => {
  const resourcesPath = 'C:\\app\\resources';
  const bundled = path.join(resourcesPath, 'liblouis', 'bin', 'lou_translate.exe');
  const got = resolveLouTranslate({
    env: {},
    resourcesPath,
    exists: existsSet(bundled),
    homebrewCandidates: ['/opt/homebrew/bin/lou_translate'],
    platform: 'win32'
  });
  assert.equal(got, bundled);
});

test('falls back to first existing Homebrew candidate when bundled is missing', () => {
  const resourcesPath = '/app/Resources';
  const brew = '/opt/homebrew/bin/lou_translate';
  const got = resolveLouTranslate({
    env: {},
    resourcesPath,
    exists: existsSet(brew, '/usr/local/bin/lou_translate'),
    homebrewCandidates: [brew, '/usr/local/bin/lou_translate'],
    platform: 'darwin'
  });
  assert.equal(got, brew);
});

test('returns null when nothing exists', () => {
  const got = resolveLouTranslate({
    env: {},
    resourcesPath: '/app/Resources',
    exists: () => false,
    homebrewCandidates: ['/opt/homebrew/bin/lou_translate'],
    platform: 'darwin'
  });
  assert.equal(got, null);
});

test('louSpawnEnv sets LOUIS_TABLEPATH for bundled helper', () => {
  const resourcesPath = '/app/Resources';
  const bundled = path.join(resourcesPath, 'liblouis', 'bin', 'lou_translate');
  const env = louSpawnEnv(bundled, {
    env: { PATH: '/usr/bin' },
    resourcesPath,
    platform: 'darwin'
  });
  assert.equal(env.LOUIS_TABLEPATH, path.join(resourcesPath, 'liblouis', 'tables'));
});

test('louSpawnEnv does not force LOUIS_TABLEPATH for Homebrew', () => {
  const resourcesPath = '/app/Resources';
  const env = louSpawnEnv('/opt/homebrew/bin/lou_translate', {
    env: { PATH: '/usr/bin' },
    resourcesPath,
    platform: 'darwin'
  });
  assert.equal(env.LOUIS_TABLEPATH, undefined);
});

test('g2 roundtrip hello world', { skip: !hasLouis }, async () => {
  const brl = await translateUeb('hello world', 'g2');
  assert.match(brl, /⠓/);
  const print = await backTranslateUeb(brl, 'g2');
  assert.equal(print.toLowerCase(), 'hello world');
});

test('g1 roundtrip The quick brown fox', { skip: !hasLouis }, async () => {
  const text = 'The quick brown fox';
  const brl = await translateUeb(text, 'g1');
  const print = await backTranslateUeb(brl, 'g1');
  assert.equal(print, text);
});
