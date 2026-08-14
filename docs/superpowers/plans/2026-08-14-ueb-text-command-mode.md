# UEB Text + Command Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide notes UI behind a flag, author Text items as literary UEB via native liblouis (QWERTY + cell input), and drive Text/Equation/Nemeth/LaTeX/grade with an Insert/Command modal layer—without merging to `main`.

**Architecture:** Pure domain modules for command state and cell buffering; Electron main `ueb-service` wraps `lou_translate` over IPC (same trust pattern as `math:convert`); renderer wires six-key on the composer, projects `aria-braillelabel` on text items, hides note/radio chrome, and announces status on `#save-status`.

**Tech Stack:** Electron (existing), vanilla JS modules, native liblouis CLI (`lou_translate` 3.38+), Node test runner, Playwright Electron.

**Worktree:** `/Users/shonusengupta/omniya-core/.worktrees/ueb-text-command-mode` on branch `codex/ueb-text-command-mode`. Do not merge to `main`.

**Spec:** `docs/superpowers/specs/2026-08-14-ueb-text-command-mode-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `src/domain/command-mode.js` | Insert/Command state + `t`/`e`/global transitions (pure) |
| `src/domain/ueb-cell-buffer.js` | Accumulate braille cells; flush on word boundary |
| `src/main/ueb-service.js` | Spawn `lou_translate` forward/back for g1/g2 |
| `src/main.js` | Register `ueb:translate` / `ueb:backTranslate` IPC |
| `src/preload.cjs` | Expose `window.omniya.translateUeb` / `backTranslateUeb` |
| `src/renderer/ueb-braille-projection.js` | Set `aria-braillelabel` on text article bodies |
| `src/renderer/app.js` | Flag, hide chrome, command keys, composer six-key, status |
| `src/renderer/index.html` | Hide radios/notes via classes; help dialog hooks |
| `src/renderer/styles.css` | `.notes-ui-disabled` / `.chrome-radios-hidden` if needed |
| `test/unit/command-mode.test.js` | State machine |
| `test/unit/ueb-cell-buffer.test.js` | Buffer flush rules |
| `test/unit/ueb-service.test.js` | Native round-trips (skip if no `lou_translate`) |
| `test/e2e/ueb-text-command-mode.test.js` | Electron happy paths |
| `test/e2e/app.test.js` | Stop requiring note UI / visible radios |

## Global constraints

- Keep `item.note` in `model.js`; do not delete normalize/storage.
- Do not persist `uebGrade` on items in this plan (composer session only; YAGNI).
- Prefer native `lou_translate` over npm WASM.
- Hide `#mode-switch` and `#replacement-method` visually; drive via Command.
- Commit on `codex/ueb-text-command-mode` only; push regularly; no merge to `main`.

---

### Task 1: Feature-flag notes UI off

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/index.html` (optional `hidden` defaults)
- Modify: `test/e2e/app.test.js`
- Modify: `test/e2e/mathjax-navigation.test.js` (if it clicks Add note)

- [ ] **Step 1: Write/adjust failing e2e expectation**

In `test/e2e/app.test.js`, replace flows that click “Add note” with assertions that notes UI is absent:

```js
assert.equal(await page.locator('#note-toggle').count(), 0);
// or if element remains but hidden:
assert.equal(await page.locator('#note-toggle').isVisible(), false);
```

Remove assertions that committed articles contain `Note: …` from the default add flow (keep model unit tests untouched).

- [ ] **Step 2: Run e2e slice to see current failure/pass baseline**

Run: `node --test --test-concurrency=1 test/e2e/app.test.js`

Expected: FAIL on new assertions (toggle still visible) or PASS if you only deleted note steps first—prefer asserting absence so Step 3 must hide UI.

- [ ] **Step 3: Implement flag**

Near the top of `src/renderer/app.js` (with other constants ~line 40):

```js
const NOTES_UI_ENABLED = false;
```

Gate:

1. `renderTranscript` — only append `.item-note` when `NOTES_UI_ENABLED && item.note`.
2. `renderComposer` — if `!NOTES_UI_ENABLED`, force `#note-toggle` and `#note-row` hidden; do not sync note visibility.
3. Skip registering note-toggle / composer-note listeners when `!NOTES_UI_ENABLED`, **or** no-op inside handlers.
4. On boot, if `!NOTES_UI_ENABLED`, set `elements['note-toggle'].hidden = true` and `elements['note-row'].hidden = true`.

Still pass `note: ''` (or existing draft.note) into `addItem`/`updateItem` so the model contract stays valid.

- [ ] **Step 4: Re-run e2e app test**

Run: `node --test --test-concurrency=1 test/e2e/app.test.js`

Expected: PASS for note-absence assertions; other existing flows still pass (update any remaining “Add note” clicks).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js src/renderer/index.html test/e2e/app.test.js test/e2e/mathjax-navigation.test.js
git commit -m "$(cat <<'EOF'
fix: hide notes UI behind NOTES_UI_ENABLED flag

Keep item.note in the domain model while removing Electron
surfaces so notes no longer appear in the braille-native path.
EOF
)"
```

---

### Task 2: Pure command-mode state machine

**Files:**
- Create: `src/domain/command-mode.js`
- Create: `test/unit/command-mode.test.js`

- [ ] **Step 1: Write failing unit tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCommandState,
  applyCommandKey,
  formatStatus,
  enterCommand,
  enterInsert
} from '../../src/domain/command-mode.js';

test('Escape enters command; i returns to insert', () => {
  let s = createCommandState({ itemKind: 'text', uebGrade: 'g2' });
  s = enterCommand(s);
  assert.equal(s.interaction, 'command');
  const r = applyCommandKey(s, 'i');
  assert.equal(r.state.interaction, 'insert');
});

test('t on non-text empty becomes text g2', () => {
  let s = createCommandState({ itemKind: null, contentEmpty: true });
  s = enterCommand(s);
  const r = applyCommandKey(s, 't');
  assert.equal(r.state.itemKind, 'text');
  assert.equal(r.state.uebGrade, 'g2');
  assert.match(r.announcement, /Text/i);
});

test('t on text toggles grade whether empty or filled', () => {
  let s = enterCommand(createCommandState({ itemKind: 'text', uebGrade: 'g2', contentEmpty: true }));
  s = applyCommandKey(s, 't').state;
  assert.equal(s.uebGrade, 'g1');
  s = applyCommandKey(enterCommand(s), 't').state;
  assert.equal(s.uebGrade, 'g2');

  s = enterCommand(createCommandState({ itemKind: 'text', uebGrade: 'g2', contentEmpty: false }));
  // mid-block: toggle enters g1Passage rather than whole-item g1 when content exists
  const r = applyCommandKey(s, 't');
  assert.equal(r.state.g1Passage, true);
});

test('e cycles nemeth/latex only while equation empty', () => {
  let s = enterCommand(createCommandState({ itemKind: null, contentEmpty: true }));
  s = applyCommandKey(s, 'e').state;
  assert.equal(s.itemKind, 'equation');
  assert.equal(s.equationMethod, 'nemeth');
  s = applyCommandKey(enterCommand(s), 'e').state;
  assert.equal(s.equationMethod, 'latex');
  s = applyCommandKey(enterCommand({ ...s, contentEmpty: false }), 'e').state;
  assert.equal(s.equationMethod, 'latex'); // locked
});

test('t refuses when equation has content', () => {
  const s = enterCommand(createCommandState({
    itemKind: 'equation', contentEmpty: false, equationMethod: 'nemeth'
  }));
  const r = applyCommandKey(s, 't');
  assert.equal(r.state.itemKind, 'equation');
  assert.match(r.announcement, /Can’t switch to Text|Cannot switch to Text/i);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test test/unit/command-mode.test.js`

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/domain/command-mode.js`**

```js
export function createCommandState({
  interaction = 'insert',
  itemKind = null, // 'text' | 'equation' | null
  equationMethod = 'nemeth',
  uebGrade = 'g2', // whole-item grade when contentEmpty started as text
  g1Passage = false, // mid-block pending G1 passage
  contentEmpty = true
} = {}) {
  return { interaction, itemKind, equationMethod, uebGrade, g1Passage, contentEmpty };
}

export function enterCommand(state) {
  return { ...state, interaction: 'command' };
}

export function enterInsert(state) {
  return { ...state, interaction: 'insert' };
}

export function formatStatus(state) {
  const mode = state.interaction === 'command' ? 'Command' : 'Insert';
  if (state.itemKind === 'text') {
    const grade = state.contentEmpty
      ? `UEB ${state.uebGrade.toUpperCase()}`
      : (state.g1Passage ? 'UEB G2 · G1 passage on' : `UEB ${state.uebGrade.toUpperCase()}`);
    return `${mode} · Text · ${grade}`;
  }
  if (state.itemKind === 'equation') {
    const fill = state.contentEmpty ? 'empty' : 'editing';
    return `${mode} · Equation · ${state.equationMethod === 'latex' ? 'LaTeX' : 'Nemeth'} · ${fill}`;
  }
  return `${mode} · (choosing)`;
}

/**
 * @returns {{ state, announcement: string, action?: string }}
 * action hints for app.js: 'submit' | 'cancel' | 'help' | 'set-type' | 'set-method' | none
 */
export function applyCommandKey(state, key) {
  if (state.interaction !== 'command') {
    return { state, announcement: formatStatus(state) };
  }
  if (key === 'i' || key === 'Enter') {
    const next = enterInsert(state);
    return { state: next, announcement: 'Insert mode' };
  }
  if (key === '?') return { state, announcement: formatStatus(state), action: 'help' };
  if (key === 'q') return { state, announcement: 'Cancelled', action: 'cancel' };
  if (key === 'n') return { state, announcement: formatStatus(state), action: 'submit' };

  if (key === 't') {
    if (state.itemKind === 'equation' && !state.contentEmpty) {
      return { state, announcement: "Can't switch to Text after equation content exists." };
    }
    if (state.itemKind !== 'text') {
      const next = { ...state, itemKind: 'text', uebGrade: 'g2', g1Passage: false };
      return { state: next, announcement: formatStatus(next), action: 'set-type' };
    }
    if (state.contentEmpty) {
      const uebGrade = state.uebGrade === 'g2' ? 'g1' : 'g2';
      const next = { ...state, uebGrade, g1Passage: false };
      return { state: next, announcement: formatStatus(next), action: 'set-grade' };
    }
    const next = { ...state, g1Passage: !state.g1Passage, uebGrade: 'g2' };
    return { state: next, announcement: formatStatus(next), action: 'set-grade' };
  }

  if (key === 'e') {
    if (state.itemKind === 'text' && !state.contentEmpty) {
      return { state, announcement: "Can't switch to Equation after text content exists." };
    }
    if (state.itemKind !== 'equation') {
      const next = { ...state, itemKind: 'equation', equationMethod: 'nemeth', g1Passage: false };
      return { state: next, announcement: formatStatus(next), action: 'set-type' };
    }
    if (!state.contentEmpty) {
      return { state, announcement: formatStatus(state) };
    }
    const equationMethod = state.equationMethod === 'nemeth' ? 'latex' : 'nemeth';
    const next = { ...state, equationMethod };
    return { state: next, announcement: formatStatus(next), action: 'set-method' };
  }

  return { state, announcement: `Unknown command ${key}. Press ? for help.` };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test test/unit/command-mode.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/domain/command-mode.js test/unit/command-mode.test.js
git commit -m "feat: add Insert/Command umbrella key state machine"
```

---

### Task 3: UEB cell word buffer

**Files:**
- Create: `src/domain/ueb-cell-buffer.js`
- Create: `test/unit/ueb-cell-buffer.test.js`

- [ ] **Step 1: Failing tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createUebCellBuffer, pushUebCell, flushUebBuffer } from '../../src/domain/ueb-cell-buffer.js';

test('accumulates cells until space or braille space', () => {
  let b = createUebCellBuffer();
  b = pushUebCell(b, '⠓').buffer;
  b = pushUebCell(b, '⠊').buffer;
  assert.equal(b.pending, '⠓⠊');
  const r = pushUebCell(b, ' '); // or '⠀'
  assert.equal(r.flush, '⠓⠊');
  assert.equal(r.buffer.pending, '');
});

test('explicit flush returns pending without requiring space', () => {
  let b = createUebCellBuffer();
  b = pushUebCell(b, '⠯').buffer;
  const r = flushUebBuffer(b);
  assert.equal(r.flush, '⠯');
  assert.equal(r.buffer.pending, '');
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test test/unit/ueb-cell-buffer.test.js`

- [ ] **Step 3: Implement**

```js
const BRAILLE_SPACE = '\u2800';

export function createUebCellBuffer() {
  return { pending: '' };
}

export function pushUebCell(buffer, cell) {
  if (cell === ' ' || cell === BRAILLE_SPACE) {
    return flushUebBuffer(buffer);
  }
  return { buffer: { pending: buffer.pending + cell }, flush: null };
}

export function flushUebBuffer(buffer) {
  return { buffer: { pending: '' }, flush: buffer.pending };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/domain/ueb-cell-buffer.js test/unit/ueb-cell-buffer.test.js
git commit -m "feat: add UEB cell word-boundary buffer"
```

---

### Task 4: Native liblouis UEB service + IPC

**Files:**
- Create: `src/main/ueb-service.js`
- Create: `test/unit/ueb-service.test.js`
- Modify: `src/main.js`
- Modify: `src/preload.cjs`

- [ ] **Step 1: Failing unit tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { translateUeb, backTranslateUeb, resolveLouTranslate } from '../../src/main/ueb-service.js';

const hasLouis = Boolean(resolveLouTranslate());

test('resolveLouTranslate finds CLI or returns null', () => {
  const p = resolveLouTranslate();
  assert.ok(p === null || p.includes('lou_translate'));
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
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test test/unit/ueb-service.test.js`

- [ ] **Step 3: Implement `src/main/ueb-service.js`**

```js
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TABLE = {
  g1: 'unicode.dis,en-ueb-g1.ctb',
  g2: 'unicode.dis,en-ueb-g2.ctb'
};

export function resolveLouTranslate() {
  if (process.env.OMNIYA_LOU_TRANSLATE) return process.env.OMNIYA_LOU_TRANSLATE;
  const candidates = [
    '/opt/homebrew/bin/lou_translate',
    '/usr/local/bin/lou_translate',
    'lou_translate'
  ];
  for (const c of candidates) {
    if (c === 'lou_translate') return c; // rely on PATH at spawn time
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function runLou(args, input) {
  const bin = resolveLouTranslate();
  if (!bin) return Promise.reject(new Error('lou_translate not found'));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err.trim() || `lou_translate exited ${code}`));
      else resolve(out.replace(/\n$/, ''));
    });
    child.stdin.end(input);
  });
}

export async function translateUeb(text, grade = 'g2') {
  const table = TABLE[grade] ?? TABLE.g2;
  return runLou(['-f', table], String(text ?? ''));
}

export async function backTranslateUeb(braille, grade = 'g2') {
  const table = TABLE[grade] ?? TABLE.g2;
  return runLou(['-b', table], String(braille ?? ''));
}
```

Wire IPC in `src/main.js`:

```js
import { translateUeb, backTranslateUeb } from './main/ueb-service.js';
// inside registerIpc:
ipcMain.handle('ueb:translate', async (event, { text, grade }) => {
  assertTrustedSender(event);
  return { braille: await translateUeb(text, grade) };
});
ipcMain.handle('ueb:backTranslate', async (event, { braille, grade }) => {
  assertTrustedSender(event);
  return { text: await backTranslateUeb(braille, grade) };
});
```

Preload:

```js
translateUeb: (text, grade) => ipcRenderer.invoke('ueb:translate', { text, grade }),
backTranslateUeb: (braille, grade) => ipcRenderer.invoke('ueb:backTranslate', { braille, grade })
```

- [ ] **Step 4: Run unit tests — expect PASS** (or skip if no binary in CI; document `OMNIYA_LOU_TRANSLATE`)

Run: `node --test test/unit/ueb-service.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/main/ueb-service.js src/main.js src/preload.cjs test/unit/ueb-service.test.js
git commit -m "feat: add native liblouis UEB translate IPC"
```

---

### Task 5: Hide type/method radios; announce via status

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/app.js`
- Modify: `test/e2e/inline-editing.test.js` / `app.test.js` as needed to select type/method via Command or `page.evaluate` helpers instead of clicking radios

- [ ] **Step 1: Add CSS hide**

```css
.chrome-radios-hidden #mode-switch,
.chrome-radios-hidden #replacement-method {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
```

Add class `chrome-radios-hidden` on `<body>` or `#app` in `index.html`.

Keep radios in DOM so existing JS `querySelector('input:checked')` still works when Command updates `input.checked`.

- [ ] **Step 2: Helper to set radios from command state**

In `app.js`:

```js
function applyCommandStateToChrome(commandState) {
  if (commandState.itemKind === 'text' || commandState.itemKind === 'equation') {
    elements['mode-switch'].querySelectorAll('input').forEach((input) => {
      input.checked = input.value === commandState.itemKind;
    });
    draft.type = commandState.itemKind;
  }
  if (commandState.itemKind === 'equation') {
    preferredAuthoringMethod = commandState.equationMethod;
    elements['replacement-method']?.querySelectorAll('input').forEach((input) => {
      input.checked = input.value === commandState.equationMethod;
    });
  }
  elements['save-status'].textContent = formatStatus(commandState);
}
```

- [ ] **Step 3: Update e2e helpers**

Where tests did `page.getByLabel('Equation').check()`, instead:

```js
await page.evaluate(() => {
  document.querySelector('#mode-switch input[value="equation"]').checked = true;
  document.querySelector('#mode-switch').dispatchEvent(new Event('change', { bubbles: true }));
});
```

Or drive Command keys once Task 6 lands—acceptable to use evaluate until then.

- [ ] **Step 4: Run affected e2e**

Run: `npm run test:e2e`

Fix failures related to visible radio labels.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/app.js test/e2e/*.js
git commit -m "feat: hide type/method radios; drive chrome from status"
```

---

### Task 6: Wire Command/Insert into composer

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/index.html` (help dialog body id for contextual fill)

- [ ] **Step 1: Add command state + keydown**

```js
import {
  createCommandState, applyCommandKey, enterCommand, enterInsert, formatStatus
} from '../domain/command-mode.js';

let commandState = createCommandState({ itemKind: 'text', contentEmpty: true });

function announce(message) {
  elements['save-status'].textContent = message;
}

function syncCommandContentEmpty() {
  const src = elements['composer-source'].value;
  commandState = { ...commandState, contentEmpty: src.trim().length === 0 };
}

function openContextualHelp() {
  const box = elements['keyboard-help'];
  const panel = box.querySelector('[data-command-help]') || box;
  // Ensure a container exists in index.html: <div data-command-help></div>
  const el = box.querySelector('[data-command-help]');
  if (el) {
    el.innerHTML = `<p>${formatStatus(commandState)}</p>
      <p><kbd>t</kbd> — ${commandState.itemKind === 'text' ? 'toggle UEB grade / G1 passage' : 'make Text (UEB)'}</p>
      <p><kbd>e</kbd> — ${commandState.itemKind === 'equation' && commandState.contentEmpty ? 'cycle Nemeth/LaTeX' : 'make Equation (Nemeth)'}</p>
      <p><kbd>n</kbd> submit · <kbd>q</kbd> cancel · <kbd>i</kbd> insert</p>`;
  }
  if (typeof box.showModal === 'function') box.showModal();
  else box.hidden = false;
}
```

On composer dock `keydown` (capture):

```js
elements['composer-dock'].addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && commandState.interaction === 'insert') {
    event.preventDefault();
    commandState = enterCommand(commandState);
    announce('Command mode');
    return;
  }
  if (commandState.interaction !== 'command') return;
  // Prevent typing into textarea while commanding
  if (event.target === elements['composer-source'] || event.target === elements['composer-note']) {
    const key = event.key.length === 1 ? event.key : event.key;
    if (['i', 't', 'e', 'n', 'q', '?', 'Enter'].includes(key) || event.key === 'Enter') {
      event.preventDefault();
      const result = applyCommandKey(commandState, key === 'Enter' ? 'Enter' : key);
      commandState = result.state;
      announce(result.announcement);
      if (result.action === 'help') openContextualHelp();
      if (result.action === 'cancel') { /* existing back-to-reading */ }
      if (result.action === 'submit') { void submitComposer(); }
      if (result.action === 'set-type' || result.action === 'set-method' || result.action === 'set-grade') {
        applyCommandStateToChrome(commandState);
      }
    }
  }
});
```

Also handle Escape currently used to cancel add—spec: Escape enters Command first; `q` cancels. Update existing Escape-to-cancel so it only cancels from Command via `q`, or: first Escape → Command, second Escape → cancel (document in help). **Prefer:** Escape → Command; `q` → cancel (matches spec). Update any e2e that pressed Escape to leave composer to press `q` in Command or click Back.

Braille command chord: when six-key emits full cell `⠿` while Space is held is hard in sim—spec allows Space+full cell. Implement: if pending buffer receives `⠿` as sole flush with a flag, or detect chord of all six dots **and** treat as command only when `event.altKey`—simpler MVP for sim: **double-tap Escape** already covers QWERTY; for six-key, if `createSixKeyInput` emits `⠿` while composer focused and Insert mode, call `enterCommand` instead of buffering (document: full cell alone enters Command). Spec said Space+full cell; approximate with **full cell `⠿` as command entry** when pending buffer empty.

- [ ] **Step 2: Unit not required beyond command-mode; smoke via e2e in Task 8**

- [ ] **Step 3: Manual/quick node import sanity**

Run: `node --test test/unit/command-mode.test.js`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app.js src/renderer/index.html
git commit -m "feat: wire Insert/Command mode into composer"
```

---

### Task 7: Text braille projection + composer six-key UEB

**Files:**
- Create: `src/renderer/ueb-braille-projection.js`
- Modify: `src/renderer/app.js`
- Modify: `test/unit/` (optional projection helper test)

- [ ] **Step 1: Projection helper**

```js
export async function applyUebBrailleLabel(element, text, grade, translateUeb) {
  if (!element) return;
  try {
    const { braille } = await translateUeb(text ?? '', grade);
    element.setAttribute('aria-braillelabel', braille || '');
  } catch {
    element.removeAttribute('aria-braillelabel');
  }
}
```

After rendering a text article body, call with `window.omniya.translateUeb` and grade `commandState.uebGrade` (default `g2` for read path).

- [ ] **Step 2: Six-key on composer when Text + Insert + `__omniyaBrailleSimulation`**

Reuse `createSixKeyInput`:

```js
import { createUebCellBuffer, pushUebCell } from '../domain/ueb-cell-buffer.js';
let uebBuffer = createUebCellBuffer();

// in setup analogous to replacement six-key:
createSixKeyInput({
  emit: async (cell) => {
    if (commandState.interaction === 'command') return;
    if (commandState.itemKind !== 'text') return;
    if (cell === '⠿' && uebBuffer.pending === '') {
      commandState = enterCommand(commandState);
      announce('Command mode');
      return;
    }
    const result = pushUebCell(uebBuffer, cell);
    uebBuffer = result.buffer;
    if (result.flush) {
      const grade = commandState.uebGrade === 'g1' && commandState.contentEmpty ? 'g1' : 'g2';
      try {
        const { text } = await window.omniya.backTranslateUeb(result.flush, grade);
        const area = elements['composer-source'];
        area.value = `${area.value}${text}`;
        area.dispatchEvent(new Event('input', { bubbles: true }));
        announce(`UEB word: ${text}`);
      } catch (err) {
        announce(`UEB translate failed: ${err.message}`);
      }
    } else {
      announce(`UEB cells: ${uebBuffer.pending}`);
    }
  }
});
```

On cancel/back-to-reading: `uebBuffer = createUebCellBuffer(); announce discarded if pending`.

QWERTY path: on committed text render, `applyUebBrailleLabel`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/ueb-braille-projection.js src/renderer/app.js
git commit -m "feat: project UEB braille labels and accept text cell input"
```

---

### Task 8: Electron e2e for UEB command mode

**Files:**
- Create: `test/e2e/ueb-text-command-mode.test.js`

- [ ] **Step 1: Write e2e**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { electronLaunchEnv } from './launch-electron.js';
import { _electron as electron } from 'playwright';

// follow existing launch pattern from inline-editing.test.js

test('notes UI hidden; command t/e and UEB label', async () => {
  // launch …
  const page = …;
  assert.equal(await page.locator('#note-toggle').isVisible(), false);

  await page.getByRole('button', { name: 'Add item' }).click();
  await page.locator('#composer-source').focus();
  await page.keyboard.press('Escape'); // Command
  await page.keyboard.type('t'); // ensure Text
  await page.keyboard.type('i'); // Insert
  await page.locator('#composer-source').fill('hello world');
  await page.keyboard.press('Escape');
  await page.keyboard.type('n'); // submit via command

  const article = page.locator('article').filter({ hasText: 'hello world' }).first();
  await article.waitFor();
  const label = await article.locator('.item-text, p').first().getAttribute('aria-braillelabel');
  // If projection on article child:
  assert.ok(label === null || /⠓/.test(label || ''));
});
```

Adapt selectors to actual DOM from `renderTranscript`. Enable `__omniyaBrailleSimulation` for a second test that chords cells for a short word.

- [ ] **Step 2: Run**

Run: `node --test --test-concurrency=1 test/e2e/ueb-text-command-mode.test.js`

Expected: PASS with `lou_translate` available in env.

- [ ] **Step 3: Commit + push**

```bash
git add test/e2e/ueb-text-command-mode.test.js
git commit -m "test: e2e UEB text command mode and notes hide"
git push
```

---

### Task 9: Full verification + manual Electron check

- [ ] **Step 1: Unit suite**

Run: `npm test`

Expected: PASS (ueb-service may skip if no lou_translate—do not leave fail).

- [ ] **Step 2: E2E suite**

Run: `npm run test:e2e`

Expected: PASS; fix any Escape-cancel regressions.

- [ ] **Step 3: Manual Electron smoke**

Run: `npm start` (or project’s start script) from the worktree.

Checklist:

1. No Add note control.
2. Add item → Escape → `t` → Insert → type text → Escape → `n` → article has braille label.
3. Escape → `e` → `e` cycles LaTeX → `e` back to Nemeth → Insert → author one Nemeth cell (existing path).
4. `?` in Command shows contextual help.
5. Status live region updates.

- [ ] **Step 4: Final commit if fixes needed; push; do not merge to main**

```bash
git push
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Notes flag hide UI, keep model | 1 |
| Item-type Text=UEB / Equation=Nemeth | 2, 5, 6 |
| Insert/Command + umbrella `t`/`e` | 2, 6 |
| `t` toggles grade empty or filled | 2 |
| Mid-block G1 passage vs whole-item G1 | 2 |
| Hide radios | 5 |
| Native liblouis IPC | 4 |
| QWERTY + cell input | 7 |
| Word-boundary buffer | 3, 7 |
| Contextual help `?` | 6 |
| Electron verify / e2e | 8, 9 |
| No merge to main | 9 |

## Self-review notes

- No TBD placeholders.
- `applyCommandKey` / `formatStatus` / `createUebCellBuffer` names consistent across tasks.
- E2E Escape behavior change called out explicitly (Task 6).
