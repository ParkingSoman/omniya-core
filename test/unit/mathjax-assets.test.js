import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function exists(relativePath) {
  await access(path.join(projectRoot, relativePath));
}

test('MathJax accessibility runtime assets are present locally', async () => {
  await Promise.all([
    exists('src/renderer/mathjax-config.js'),
    exists('node_modules/@mathjax/src/bundle/tex-mml-chtml.js'),
    exists('node_modules/@mathjax/src/bundle/sre/speech-worker.js'),
    exists('node_modules/@mathjax/src/bundle/sre/mathmaps/en.json'),
    exists('node_modules/@mathjax/mathjax-newcm-font/chtml/woff2/mjx-ncm-ml.woff2')
  ]);

  const html = await readFile(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
  const config = await readFile(path.join(projectRoot, 'src/renderer/mathjax-config.js'), 'utf8');
  const renderer = await readFile(path.join(projectRoot, 'src/renderer/app.js'), 'utf8');
  assert.match(html, /src="\.\/mathjax-config\.js"/);
  assert.match(html, /src="\.\.\/\.\.\/node_modules\/@mathjax\/src\/bundle\/tex-mml-chtml\.js"/);
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(config, /a11y\/assistive-mml/);
  assert.match(config, /enableEnrichment: true/);
  assert.match(config, /enableSpeech: true/);
  assert.doesNotMatch(renderer, /appendMathML|native\/fallback/i);
  assert.match(renderer, /typesetPromise/);
  assert.doesNotMatch(renderer, /data-semantic-owns|restoreMathJaxSiblingNavigation/);
});
