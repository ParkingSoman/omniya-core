import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from './launch-electron.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Phase 0 gate, layer 1b: what does a virtual screen reader say as it walks the
// spike document? This reads the accessibility tree. It is not a real reader,
// so it proves the tree carries a role and a name. It cannot prove NVDA, JAWS
// or VoiceOver announce the same thing. Layer 3 covers those.
async function vsrSource() {
  const out = await build({
    stdin: {
      contents: "import { virtual } from '@guidepup/virtual-screen-reader'; globalThis.__vsr = virtual;",
      resolveDir: root,
    },
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

test('virtual screen reader speaks the paragraph and the equation by name', async () => {
  const app = await electron.launch({
    args: [path.join(root, 'src/renderer/dev/spike-main.cjs')],
    env: electronLaunchEnv(),
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#editor [contenteditable="true"] .math-node');
    // executeJavaScript is not subject to the page's script-src policy.
    const code = await vsrSource();
    await app.evaluate(({ BrowserWindow }, src) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(src), code);
    const spoken = await page.evaluate(async () => {
      const vsr = globalThis.__vsr;
      await vsr.start({ container: document.querySelector('#editor') });
      for (let i = 0; i < 12; i += 1) await vsr.next();
      const log = await vsr.spokenPhraseLog();
      await vsr.stop();
      return log;
    });
    console.log(JSON.stringify(spoken, null, 1));
    assert.ok(spoken.some((p) => /Solve/.test(p)), 'paragraph text is spoken');
    assert.ok(spoken.some((p) => /x squared/.test(p)), 'the equation is spoken by its label');
    assert.equal(spoken.filter((p) => p === 'x' || p === '2').length, 0, 'inner MathML is not read a second time');
  } finally {
    await app.close();
  }
});
