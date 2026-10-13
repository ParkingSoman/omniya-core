import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { voiceOver } from '/Users/shonusengupta/omniya-core/.claude/worktrees/equation-reading/node_modules/@guidepup/guidepup/lib/index.js';
import { _electron as electron } from '/Users/shonusengupta/omniya-core/.claude/worktrees/equation-reading/node_modules/playwright/index.mjs';
import { electronLaunchEnv } from '/Users/shonusengupta/omniya-core/.claude/worktrees/equation-reading/test/e2e/launch-electron.js';

const root = '/Users/shonusengupta/omniya-core/.claude/worktrees/equation-reading';
const osa = (script) => { try { return execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim(); } catch (e) { return `ERR ${e.message.split('\n').slice(-2).join(' ')}`; } };
const mi = (n) => `<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>${n}</mi></math>`;
const YEX = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>y</mi><mo>=</mo><mi>x</mi></math>';
const NAPKIN = { schemaVersion: 3, activeNapkinId: 'n1', napkins: [{ id: 'n1', name: 'VO probe', doc: { type: 'doc', content: [
  { type: 'title', content: [{ type: 'text', text: 'VO probe' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'A ' }, { type: 'math', attrs: { mathml: mi('y'), source: 'y', sourceKind: 'latex' } }, { type: 'math', attrs: { mathml: mi('z'), source: 'z', sourceKind: 'latex' } }, { type: 'text', text: ' B' }] },
  { type: 'paragraph', content: [{ type: 'math', attrs: { mathml: YEX, source: 'y=x', sourceKind: 'latex' } }] },
] } }] };

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-vo-'));
await writeFile(path.join(dataDirectory, 'napkins.json'), JSON.stringify(NAPKIN));
const app = await electron.launch({ args: ['.'], cwd: root, env: electronLaunchEnv({ OMNIYA_HEADLESS: '0', OMNIYA_TEST_USER_DATA_DIR: dataDirectory }) });
const out = { steps: [] };
try {
  const page = await app.firstWindow();
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.math-node[aria-braillelabel]').length === 3, null, { timeout: 60000 });
  await app.evaluate(({ app: a, BrowserWindow }) => { a.focus({ steal: true }); const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
  await page.bringToFront();
  await page.click('#editor-host [contenteditable="true"]');
  const vo = (q) => osa(`tell application "VoiceOver" to return ${q}`);
  if (vo('enabled of caption window') !== 'true') {
    execFileSync('/System/Library/CoreServices/VoiceOver.app/Contents/MacOS/VoiceOverStarter', { timeout: 30000, stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 5000));
  }
  osa('tell application "VoiceOver" to set enabled of braille window to true');
  out.vo = { caption: vo('enabled of caption window'), braille: vo('enabled of braille window') };
  await page.bringToFront();
  await page.click('#editor-host [contenteditable="true"]');
  await new Promise((r) => setTimeout(r, 1500));
  // Poll the last phrase fast, so a phrase said between two keys is not missed.
  let seen = []; let stop = false;
  const poll = (async () => { while (!stop) { const p = vo('content of last phrase'); if (p && seen[seen.length - 1] !== p) seen.push(p); await new Promise((r) => setTimeout(r, 120)); } })();
  const key = async (code, label, mods = '') => {
    seen = [];
    osa(`tell application "System Events" to key code ${code}${mods ? ` using {${mods}}` : ''}`);
    await new Promise((r) => setTimeout(r, 1800));
    out.steps.push({ label, said: [...seen] });
  };
  const sel = () => page.evaluate(() => { const s = globalThis.__omniyaTesting.editor.view.state.selection; return [s.from, s.node?.type.name ?? null, s.$from.parent.type.name]; });
  await key(126, 'doc start', 'command down');
  await key(125, 'down to body');
  for (let i = 1; i <= 8; i += 1) await key(124, `right ${i}`);
  for (let i = 1; i <= 5; i += 1) await key(123, `left ${i}`);
  await key(125, 'down to lone equation line');
  out.afterDown = await sel();
  await key(36, 'Enter');
  out.afterEnter = { sel: await sel(), explorerOpen: await page.evaluate(() => Boolean(document.activeElement?.closest('.math-node'))), paragraphs: await page.evaluate(() => globalThis.__omniyaTesting.editor.getJSON().content.length) };
  stop = true; await poll;
} finally {
  osa('tell application "System Events" to key code 96 using {command down}');
  await new Promise((r) => setTimeout(r, 3000));
  execFileSync('pkill', ['-x', 'scrod'], { stdio: 'ignore' });
  await app.close();
  console.log(JSON.stringify(out, null, 1));
}
