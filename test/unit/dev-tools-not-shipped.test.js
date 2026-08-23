/**
 * Pins the three independent things that keep the dev inspector out of a
 * shipped build. Cheap assertions on source text, because the failure they
 * guard against is a refactor that looks harmless -- a static import added for
 * convenience, an exclusion dropped while tidying a config -- and whose
 * consequence is a debug panel appearing in a blind user's app.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

test('the dev directory is excluded from the packaged app', () => {
  // The load-bearing guarantee: with no file in the asar, the dynamic import in
  // app.js has nothing to find, whatever the runtime flags say.
  assert.match(read('electron-builder.yml'), /!src\/renderer\/dev\{,\/\*\*\/\*\}/);
});

test('app.js reaches the dev tools only through a dynamic import', () => {
  const app = read('src/renderer/app.js');
  assert.doesNotMatch(
    app,
    /^import .* from '\.\/dev\//m,
    'a static import would make the excluded directory a hard dependency and break the packaged build'
  );
  assert.match(app, /import\('\.\/dev\/index\.js'\)/);
  assert.match(app, /appInfo\?\.devTools/, 'and only behind the flag');
});

test('the dev flag needs an unpackaged app AND an explicit opt-in', () => {
  // Neither condition alone is enough: a developer running `npm start` without
  // the variable gets nothing, and a packaged build can never get it.
  const main = read('src/main.js');
  assert.match(main, /!app\.isPackaged && process\.env\.OMNIYA_DEV_TOOLS === '1'/);
  assert.match(main, /--omniya-dev-tools/);
});

test('input capture ships, but renders and persists nothing on its own', () => {
  // It has to ship: the input paths that go wrong belong to people running
  // packaged builds. What must NOT ship is anything that shows or stores it.
  const capture = read('src/renderer/input-capture.js');
  assert.doesNotMatch(capture, /localStorage|sessionStorage|indexedDB|fetch\(|writeFile/);
  assert.doesNotMatch(capture, /aria-live|createElement/, 'capture observes; the dev panel is what draws');
});
