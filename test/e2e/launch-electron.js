import { _electron as electron } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright Electron launches must not inherit ELECTRON_RUN_AS_NODE.
 * Cursor agent shells set that flag; without stripping it, Electron aborts with
 * "Process failed to launch!" (it behaves as Node and rejects remote debugging).
 *
 * Agent / Cursor sandbox note: Electron also fails to launch inside the default
 * Cursor command sandbox. E2E must run with full OS permissions (`all`), not
 * the sandboxed Shell tool. That failure mode looks identical to a leaked
 * ELECTRON_RUN_AS_NODE ("Process failed to launch!").
 *
 * Do not `pkill -f Electron` / Playwright globally — other worktrees may be
 * running e2e. If this worktree is wedged, kill only processes whose argv
 * contains this worktree's `node_modules/electron` path.
 *
 * OMNIYA_HEADLESS defaults on for e2e so BrowserWindows stay hidden (see
 * src/main.js). Pass OMNIYA_HEADLESS=0 to force a visible window while debugging.
 */
export function electronLaunchEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.ELECTRON_RUN_AS_NODE;
  if (env.OMNIYA_HEADLESS == null) env.OMNIYA_HEADLESS = '1';
  return env;
}

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- Word's keys (see docs/word-editor.md) ----------------------------------
export const MAC = process.platform === 'darwin';
/** Insert an equation at the caret. Alt+= on Windows, Control+= on Mac. */
export const INSERT_EQUATION = MAC ? 'Control+Equal' : 'Alt+Equal';
export const DOC_START = MAC ? 'Meta+ArrowUp' : 'Control+Home';
export const DOC_END = MAC ? 'Meta+ArrowDown' : 'Control+End';
export const UNDO = 'ControlOrMeta+z';
export const REDO = MAC ? 'Meta+Shift+z' : 'Control+y';

/**
 * Start the app on an isolated data directory and wait until the editor is up.
 * Records any http(s) request, because the app must make none.
 * Pass `napkinFile` to open a specific napkin file (OMNIYA_NAPKIN_FILE).
 */
export async function launchApp({ dataDirectory, napkinFile, env = {} } = {}) {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({
      ...(dataDirectory ? { OMNIYA_TEST_USER_DATA_DIR: dataDirectory } : {}),
      ...(napkinFile ? { OMNIYA_NAPKIN_FILE: napkinFile } : {}),
      ...env
    })
  });
  const page = await electronApp.firstWindow();
  const externalRequests = [];
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  await electronApp.context().setOffline(true);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await page.locator('#editor-host [contenteditable="true"]').waitFor();
  return { electronApp, page, externalRequests };
}

// ---- The document -----------------------------------------------------------

export const editorRoot = (page) => page.locator('#editor-host [contenteditable="true"]');

/** The editor's document as plain JSON (the same shape that is saved). */
export const getDoc = (page) => page.evaluate(() => globalThis.__omniyaTesting.editor.getJSON());

/** One string per paragraph. Text is as typed. An equation shows as `[math]`. */
export async function paragraphTexts(page) {
  const doc = await getDoc(page);
  return doc.content.map((paragraph) => (paragraph.content ?? [])
    .map((node) => (node.type === 'text' ? node.text : '[math]')).join(''));
}

/** Every equation in the document, in order: `{ pos, attrs }`. */
export function getMathNodes(page) {
  return page.evaluate(() => {
    const found = [];
    globalThis.__omniyaTesting.editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'math') found.push({ pos, attrs: node.attrs });
    });
    return found;
  });
}

export const mathNodeLocator = (page) => page.locator('#editor-host .math-node');

/**
 * The browser reports the caret to the editor just after each key. Wait that
 * moment before an action that reads the selection.
 */
export const settle = (page, ms = 120) => page.waitForTimeout(ms);

/** Press a key `times` times, settling after each. */
export async function press(page, key, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await settle(page);
  }
}

/**
 * Move the caret to the start of the document and confirm it got there. The
 * first Cmd/Ctrl+Home sent to a page that was just busy drawing an equation is
 * sometimes dropped by Chromium's simulated keyboard (a second press lands), so
 * this checks instead of assuming.
 */
export async function goToDocStart(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await press(page, DOC_START);
    const from = await page.evaluate(() => globalThis.__omniyaTesting.editor.view.state.selection.from);
    if (from === 1) return;
  }
  throw new Error('The caret did not reach the start of the document');
}

export async function focusDocument(page) {
  await editorRoot(page).focus();
  await settle(page);
}

// ---- Equations --------------------------------------------------------------

/** Pick Nemeth or LaTeX in the equation dock (the radios are visually hidden chrome). */
export async function chooseMethod(page, method) {
  const value = method === 'latex' || method === 'LaTeX' ? 'latex' : 'nemeth';
  await page.evaluate((m) => {
    const input = document.querySelector(`#replacement-method input[value="${m}"]`);
    if (input.checked) return;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Press Word's insert-equation key and wait for the dock, with its field focused. */
export async function openEquationDock(page, method = 'latex') {
  await page.keyboard.press(INSERT_EQUATION);
  await page.locator('#composer-dock').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'composer-source');
  if (method) await chooseMethod(page, method);
}

/**
 * Type an equation into the dock. LaTeX is filled whole. Nemeth is typed key by
 * key, as a braille keyboard would deliver it.
 */
export async function typeEquation(page, { method = 'latex', source }) {
  const field = page.locator('#composer-source');
  if (method === 'nemeth' || method === 'Nemeth') {
    await field.fill('');
    await page.keyboard.type(source);
  } else {
    await field.fill(source);
  }
}

/**
 * Insert an equation at the caret and wait until it is drawn. The caret ends up
 * after it, in the document. Returns the new equation's locator.
 */
export async function insertEquation(page, { method = 'latex', source }) {
  const before = await mathNodeLocator(page).count();
  await openEquationDock(page, method);
  await typeEquation(page, { method, source });
  await page.keyboard.press('Enter');
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
  const node = mathNodeLocator(page).nth(before);
  await node.locator('mjx-container').waitFor({ timeout: 30_000 });
  return node;
}

/** Select the nth equation as one unit, the way arrowing onto it does. */
export async function selectEquation(page, index = 0) {
  await page.evaluate((i) => {
    const editor = globalThis.__omniyaTesting.editor;
    const found = [];
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'math') found.push(pos);
    });
    editor.selectMath(found[i]);
    editor.focus();
  }, index);
  await settle(page);
}

/**
 * Read the nth equation by parts: select it, press Enter, and wait until the
 * explorer holds focus inside it. Returns the equation's locator.
 */
export async function enterExplorer(page, index = 0) {
  await selectEquation(page, index);
  await page.keyboard.press('Enter');
  const node = mathNodeLocator(page).nth(index);
  await node.locator('mjx-container').waitFor({ timeout: 30_000 });
  await page.waitForFunction((i) => {
    const nodes = document.querySelectorAll('#editor-host .math-node');
    return Boolean(document.activeElement && nodes[i]?.contains(document.activeElement));
  }, index);
  return node;
}

/** What the explorer is on right now: its plain speech text, or null. */
export function explorerSpeech(page) {
  return page.evaluate(() => {
    const holder = document.activeElement?.closest?.('.math-render')
      ?? document.querySelector('.math-node .math-render');
    const item = globalThis.MathJax?.startup?.document?.getMathItemsWithin?.(holder)?.[0];
    const current = item?.explorers?.speech?.current;
    return current?.getAttribute?.('data-semantic-speech-none') ?? null;
  });
}

export function mathAuthoringInput(page) {
  return page.locator('#composer-source');
}

export function mathAuthoringStatus(page) {
  return page.locator('#composer-status');
}

export function mathAuthoringSurface(page) {
  return page.locator('#composer-dock');
}
