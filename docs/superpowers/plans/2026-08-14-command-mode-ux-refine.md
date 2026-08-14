# Command-mode UX Refine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `testing`, remake Command Equation/`x`, Escape→Command in the replacement dock, Nemeth keydown gating, and an on-demand non-live `#mode-panel` focused by Command `s`.

**Architecture:** Keep the Insert/Command state machine in `src/domain/command-mode.js`. Split UI feedback: `#mode-panel` holds `formatStatus` with no live region; `#save-status` is save text only (no live). Replacement dock Escape enters Command instead of cancel; `q` discards. Nemeth Insert rejects keys that fail `normalizeCellInput` before they enter the field.

**Tech Stack:** Electron renderer (`src/renderer/app.js`), domain command-mode + guided-nemeth `normalizeCellInput`, Node test runner unit + Playwright e2e.

**Spec:** [`docs/superpowers/specs/2026-08-14-command-mode-ux-refine-design.md`](../specs/2026-08-14-command-mode-ux-refine-design.md)

**Worktree:** `/Users/shonusengupta/omniya-core/.worktrees/testing` on branch `testing`.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/domain/command-mode.js` | `x` umbrella (was `e`); `s` → `focus-status`; keep `formatStatus` |
| `src/domain/guided-nemeth/index.js` | Existing `normalizeCellInput` — allowlist source for Nemeth gate (no second alphabet) |
| `src/renderer/index.html` | Add `#mode-panel`; strip live from `#save-status` and `#replacement-status` |
| `src/renderer/app.js` | Mode panel writes; Escape in dock → Command; Command keys in dock; Nemeth keydown gate; stop live `announce` for mode |
| `test/unit/command-mode.test.js` | Domain key tests |
| `test/unit/nemeth-cell-input.test.js` | New thin tests for `isAllowedNemethCellInput` helper (or test via normalize) |
| `test/e2e/ueb-text-command-mode.test.js` | Update `e`→`x`, mode-panel, no live asserts; add Escape/`s`/Nemeth gate coverage |
| `docs/HUMAN-TESTING.md` | Key map (`x`, `s`, Escape, on-demand status) |

---

### Task 1: Domain — `x` and `s` in command-mode

**Files:**
- Modify: `src/domain/command-mode.js`
- Modify: `test/unit/command-mode.test.js`

- [ ] **Step 1: Write the failing tests**

Replace the `e` cycle test and add `s` / unknown-`e` coverage in `test/unit/command-mode.test.js`:

```js
test('x cycles nemeth/latex only while equation empty', () => {
  let s = enterCommand(createCommandState({ itemKind: null, contentEmpty: true }));
  s = applyCommandKey(s, 'x').state;
  assert.equal(s.itemKind, 'equation');
  assert.equal(s.equationMethod, 'nemeth');
  s = applyCommandKey(enterCommand(s), 'x').state;
  assert.equal(s.equationMethod, 'latex');
  s = applyCommandKey(enterCommand({ ...s, contentEmpty: false }), 'x').state;
  assert.equal(s.equationMethod, 'latex'); // locked
});

test('e in command is unknown (no alias to x)', () => {
  const s = enterCommand(createCommandState({ itemKind: 'text', contentEmpty: true }));
  const r = applyCommandKey(s, 'e');
  assert.equal(r.state.itemKind, 'text');
  assert.equal(r.action, undefined);
  assert.match(r.announcement, /Unknown command/i);
});

test('s requests focus-status', () => {
  const s = enterCommand(createCommandState({ itemKind: 'text', uebGrade: 'g2' }));
  const r = applyCommandKey(s, 's');
  assert.equal(r.action, 'focus-status');
});
```

Remove the old `e cycles nemeth/latex...` test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/command-mode.test.js`

Expected: FAIL — `x` / `s` / unknown-`e` not implemented as specified.

- [ ] **Step 3: Implement domain changes**

In `src/domain/command-mode.js`:

1. Change `if (key === 'e')` block to `if (key === 'x')` (same body).
2. Before the final unknown return, add:

```js
if (key === 's') {
  return { state, announcement: formatStatus(state), action: 'focus-status' };
}
```

3. Leave unbound `e` to fall through to `Unknown command ${key}...`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/command-mode.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/command-mode.js test/unit/command-mode.test.js
git commit -m "$(cat <<'EOF'
feat: remap Command equation umbrella to x; add s focus-status

EOF
)"
```

---

### Task 2: Nemeth allowlist helper (reuse normalizeCellInput)

**Files:**
- Create: `src/domain/nemeth-cell-input.js` (thin wrapper — keeps gate importable without pulling all of guided-nemeth into renderer tests if preferred; OR export helper next to normalize in guided-nemeth — pick **thin wrapper** for a clear unit surface)
- Create: `test/unit/nemeth-cell-input.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedNemethCellInput } from '../../src/domain/nemeth-cell-input.js';

test('allows unicode braille and ASCII braille cells', () => {
  assert.equal(isAllowedNemethCellInput('⠁'), true);
  assert.equal(isAllowedNemethCellInput('#'), true); // number prefix in ASCII braille map
  assert.equal(isAllowedNemethCellInput('1'), true);
  assert.equal(isAllowedNemethCellInput('A'), true); // ASCII braille letter cell
  assert.equal(isAllowedNemethCellInput(' '), true);
});

test('rejects lowercase latin and other non-cells', () => {
  assert.equal(isAllowedNemethCellInput('a'), false);
  assert.equal(isAllowedNemethCellInput('z'), false);
  assert.equal(isAllowedNemethCellInput('€'), false);
  assert.equal(isAllowedNemethCellInput(''), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/nemeth-cell-input.test.js`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`src/domain/nemeth-cell-input.js`:

```js
import { normalizeCellInput } from './guided-nemeth/index.js';

/** True iff key is one cell the guided Nemeth pipeline accepts. */
export function isAllowedNemethCellInput(key) {
  if (typeof key !== 'string' || key.length === 0) return false;
  // Printable keydown events are one character; ignore named keys callers filter separately.
  if (key.length !== 1) return false;
  try {
    normalizeCellInput(key);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/nemeth-cell-input.test.js`

Expected: PASS (confirm `#` / `1` / `A` are true against this worktree’s `normalizeCell`; if `#` fails, drop that assert and keep `1`/`A`/`⠁` — do not invent a second alphabet).

- [ ] **Step 5: Commit**

```bash
git add src/domain/nemeth-cell-input.js test/unit/nemeth-cell-input.test.js
git commit -m "$(cat <<'EOF'
feat: add isAllowedNemethCellInput via normalizeCellInput

EOF
)"
```

---

### Task 3: HTML — mode panel + quiet status elements

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `test/e2e/ueb-text-command-mode.test.js` (failing asserts for structure first)

- [ ] **Step 1: Write / update the failing e2e expectations**

In `test/e2e/ueb-text-command-mode.test.js`, change the help/live test to:

```js
test('mode panel is quiet and command ? help lists x and s', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-help-quiet-');
  t.after(() => app.close().catch(() => {}));

  const mode = await page.locator('#mode-panel').evaluate((el) => ({
    id: el.id,
    live: el.getAttribute('aria-live'),
    role: el.getAttribute('role'),
    tabIndex: el.tabIndex
  }));
  assert.equal(mode.live, null);
  assert.notEqual(mode.role, 'status');
  assert.equal(mode.tabIndex, -1);

  const save = await page.locator('#save-status').evaluate((el) => ({
    live: el.getAttribute('aria-live'),
    role: el.getAttribute('role')
  }));
  assert.equal(save.live, null);
  assert.notEqual(save.role, 'status');

  await openComposer(page);
  await enterCommand(page); // will be updated in Task 4 to wait on #mode-panel
  await page.keyboard.type('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard help' });
  await dialog.waitFor();
  const help = await page.locator('#keyboard-help [data-command-help]').innerText();
  assert.match(help ?? '', /Command · Text · UEB G2/i);
  assert.match(help ?? '', /\bx\b/i);
  assert.match(help ?? '', /\bs\b/i);
  assert.doesNotMatch(help ?? '', /make Equation \(Nemeth\).*e\b/i);
});
```

Also change `enterCommand` helper to wait on `#mode-panel` (will fail until Task 4 wires it — for this task only add the HTML so `#mode-panel` exists; keep helper wait flexible):

```js
async function enterCommand(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const mode = document.querySelector('#mode-panel')?.textContent ?? '';
    const save = document.querySelector('#save-status')?.textContent ?? '';
    return /Command/i.test(mode) || /Command/i.test(save);
  });
}
```

- [ ] **Step 2: Run e2e test to verify it fails**

Run: `node --test --test-concurrency=1 test/e2e/ueb-text-command-mode.test.js`

Expected: FAIL — `#mode-panel` missing and/or live attrs still present.

- [ ] **Step 3: Update HTML**

In `src/renderer/index.html` header-meta:

```html
<div class="header-meta">
  <span id="item-count">0 items</span>
  <span id="mode-panel" aria-label="Authoring mode" tabindex="-1"></span>
  <span id="save-status"></span>
</div>
```

Change `#replacement-status` to a plain paragraph (remove `role="status" aria-live aria-atomic`):

```html
<p id="replacement-status"></p>
```

Update keyboard-help authoring line if it still says only Escape/q without `x`/`s` — keep generic; contextual `[data-command-help]` is filled by JS in Task 4.

- [ ] **Step 4: Re-run e2e (may still fail on help text / Command wiring)**

Run: `node --test --test-concurrency=1 --test-name-pattern 'mode panel is quiet' test/e2e/ueb-text-command-mode.test.js`

Expected: structure asserts for `#mode-panel` / quiet `#save-status` PASS; help text may still FAIL until Task 4.

- [ ] **Step 5: Commit HTML**

```bash
git add src/renderer/index.html test/e2e/ueb-text-command-mode.test.js
git commit -m "$(cat <<'EOF'
feat: add quiet mode-panel; remove forced live status roles

EOF
)"
```

---

### Task 4: Renderer — mode panel, `x`/`s`, stop live mode announces

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `test/e2e/ueb-text-command-mode.test.js`

- [ ] **Step 1: Update e2e for `x` cycle and `s` focus**

Replace `command e cycles...` with these tests. Update every wait in this file that reads `#save-status` for Command/Insert to read `#mode-panel` instead.

```js
test('command x cycles authoring method while the composer is empty', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-x-cycle-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('x');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  assert.equal(await page.evaluate(() => document.querySelector('#mode-switch input:checked')?.value), 'equation');

  await page.keyboard.type('x');
  await page.waitForFunction(() => /Equation · LaTeX/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));

  await page.keyboard.type('x');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
});

test('command s focuses mode panel', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-s-focus-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('s');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'mode-panel');
  assert.match(await page.locator('#mode-panel').textContent(), /Command/i);
});
```

- [ ] **Step 2: Run e2e to verify fail**

Run: `node --test --test-concurrency=1 test/e2e/ueb-text-command-mode.test.js`

Expected: FAIL on mode-panel text / `x` / `s`.

- [ ] **Step 3: Wire `app.js`**

1. Add `'mode-panel'` to the `elements` id list.
2. Replace mode `announce(formatStatus...)` paths:
   - Add `function syncModePanel(state = commandState) { if (elements['mode-panel']) elements['mode-panel'].textContent = formatStatus(state); }`
   - On Escape→Command, `set-type` / `set-method` / `set-grade` / `i`: call `syncModePanel` instead of writing mode strings into `#save-status`.
   - Keep `#save-status` for Saving/Saved/Not saved/Replacement committed/Deleted… only.
3. In `handleComposerCommandKey`:
   - Use `commandKeys = new Set(['i', 't', 'x', 's', 'n', 'q', '?', 'Enter', 'e']);` so `e` is swallowed as unknown (domain message), not typed into the field.
   - On `result.action === 'focus-status'`: `elements['mode-panel']?.focus()`.
4. In `openContextualHelp`: document `x` / `s` instead of `e`:

```js
eHelp.firstChild.textContent = 'x';
eHelp.append(` — ${commandState.itemKind === 'equation' && commandState.contentEmpty ? 'cycle Nemeth/LaTeX' : 'make Equation (Nemeth)'}`);
const sHelp = document.createElement('p');
sHelp.append(document.createElement('kbd'));
sHelp.firstChild.textContent = 's';
sHelp.append(' — focus authoring mode panel');
```

5. Ensure `applyCommandStateToChrome` / `renderComposer` after `x` **does not** call `returnToRead()` and **does not** open the replacement dock. Opening the dock remains the empty-equation **submit** path (`n` / Enter submit) only.

6. Call `syncModePanel()` whenever `commandState` changes meaningfully (openAddMode, openEditMode, returnToRead reset, etc.).

- [ ] **Step 4: Run e2e to verify pass**

Run: `node --test --test-concurrency=1 test/e2e/ueb-text-command-mode.test.js`

Expected: PASS for quiet panel, `x` cycle, `s` focus, text submit (Insert waits use `#mode-panel`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js test/e2e/ueb-text-command-mode.test.js
git commit -m "$(cat <<'EOF'
feat: wire mode-panel, Command x/s, and quiet mode updates

EOF
)"
```

---

### Task 5: Replacement dock — Escape → Command; Command keys; Nemeth gate

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `test/e2e/ueb-text-command-mode.test.js` (add cases) or `test/e2e/inline-editing.test.js` if easier to open replacement

- [ ] **Step 1: Write failing e2e**

Append to `test/e2e/ueb-text-command-mode.test.js`:

```js
test('replacement Escape enters Command; q cancels; lowercase a rejected in Nemeth', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-ueb-repl-escape-');
  t.after(() => app.close().catch(() => {}));

  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('x'); // Equation Nemeth
  await page.keyboard.type('i');
  await page.keyboard.type('n'); // submit empty equation → opens replacement dock
  await page.locator('#replacement-dock:not([hidden])').waitFor();
  await page.locator('#replacement-input').waitFor();
  await page.locator('#replacement-input').focus();

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  assert.equal(await page.locator('#replacement-dock').isVisible(), true);

  await page.keyboard.type('i');
  await page.waitForFunction(() => /Insert/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));

  await page.keyboard.type('a'); // lowercase — not an ASCII braille cell in this stack
  assert.equal(await page.locator('#replacement-input').inputValue(), '');
  assert.match(await page.locator('#replacement-status').textContent(), /braille cells only|LaTeX|Command x/i);

  await page.keyboard.press('Escape');
  await page.keyboard.type('q');
  await page.locator('#replacement-dock[hidden]').waitFor();
});
```

If empty-equation submit uses a different chord than `n`, match existing `submitComposer` empty-equation behavior (Command `n` or Insert Enter). Adjust the test to whatever Task 4 left working — but the dock must open without cancelling the session.

- [ ] **Step 2: Run to verify fail**

Run: `node --test --test-concurrency=1 --test-name-pattern 'replacement Escape' test/e2e/ueb-text-command-mode.test.js`

Expected: FAIL — Escape still cancels dock and/or `a` inserts.

- [ ] **Step 3: Implement dock Escape, Command routing, Nemeth gate**

In `openReplacementEditor` keyHandler (`src/renderer/app.js`):

1. **Escape:** do not call `cancelReplacementEditor`. Instead:

```js
if (event.key === 'Escape') {
  event.preventDefault();
  event.stopPropagation();
  if (commandState.interaction === 'insert') {
    commandState = enterCommand({
      ...commandState,
      itemKind: 'equation',
      equationMethod: replacementSession.method,
      contentEmpty: !(replacementSession.method === 'latex'
        ? replacementSession.latexSource
        : (replacementSession.nemethState?.prefix || replacementSession.draft?.mathml))
      // Prefer: contentEmpty from draft emptiness helper — empty draft + empty prefix/latex
    });
    // Simpler contentEmpty:
    // contentEmpty = replacementSession has no draft tokens / empty latex / empty prefix
    syncModePanel(commandState);
  }
  return;
}
```

Define emptiness explicitly:

```js
function replacementDraftIsEmpty(session) {
  if (!session) return true;
  if (session.method === 'latex') return !String(session.latexSource ?? '').trim();
  const prefix = session.nemethState?.prefix ?? '';
  if (prefix) return false;
  // Empty guided draft: no meaningful math yet — use existing session fields;
  // if isNew and draft equals createEmptyDraftMathDocument shape, treat empty.
  const mathml = session.draft?.mathml ?? '';
  return !mathml || /data-omniya-empty|<\/math>\s*$/i.test(mathml) && !session.draft?.focus;
}
```

Keep this honest: inspect how empty drafts look in `createEmptyDraftMathDocument` / session and set `contentEmpty` from “no committed tokens + no prefix + no latex”. Prefer reading `replacementSession` the same way Command sync does for composer (`trim` on visible input + session method).

**Minimal viable emptiness:**

```js
const contentEmpty = !(
  (replacementSession.method === 'latex' && String(replacementSession.latexSource ?? '').trim()) ||
  (replacementSession.method === 'nemeth' && (replacementSession.nemethState?.prefix || editor.value.trim()))
);
// If draft preview already has structure beyond empty shell, set contentEmpty false —
// use session API if one exists; else treat any successful apply as non-empty via a flag set in consumeCell.
```

If that is too fragile, set `commandState.contentEmpty = !editor.value.trim() && !replacementSession.nemethState?.prefix` for method toggle only, and lock method after first successful `applied` cell by setting a `replacementHasContent` boolean on the closure.

2. **While Command in dock:** document-level handler currently skips `#replacement-dock`. Change so Command keys still run when the dock is open:

In the capture listener (~line 1343), **remove** `#replacement-dock` from the skip list, OR call a shared `handleCommandKeyEvent` from the replacement keyHandler when `commandState.interaction === 'command'`.

Recommended: from replacement `keyHandler`, if `commandState.interaction === 'command'`, delegate to `handleComposerCommandKey(event)` (rename mentally to `handleAuthoringCommandKey`) and return.

3. **`q` in Command** while dock open: `cancelReplacementEditor(article)` instead of `returnToRead()` only — handle via `result.action === 'cancel'` branch that checks `replacementSession`.

4. **Nemeth gate** on keydown before input (Insert only, method nemeth):

```js
import { isAllowedNemethCellInput } from '../domain/nemeth-cell-input.js';

// inside keyHandler, before Enter handling; after Escape/Command delegation:
if (commandState.interaction === 'insert' &&
    replacementSession?.method === 'nemeth' &&
    event.key.length === 1 &&
    !event.metaKey && !event.ctrlKey && !event.altKey) {
  if (!isAllowedNemethCellInput(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    editor.setAttribute('aria-invalid', 'true');
    elements['replacement-status'].textContent =
      'Nemeth mode accepts braille cells only. Switch to LaTeX with Command x while the draft is empty, or enter cells.';
    return;
  }
  editor.removeAttribute('aria-invalid');
}
```

5. **Command `x` while dock open:** `applyCommandKey` + `setReplacementMethod` when `action === 'set-method'` and draft empty; refuse when not empty (domain already no-ops method change when `!contentEmpty` if state is synced).

- [ ] **Step 4: Run e2e to verify pass**

Run: `node --test --test-concurrency=1 --test-name-pattern 'replacement Escape|command x|command s|mode panel' test/e2e/ueb-text-command-mode.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js test/e2e/ueb-text-command-mode.test.js
git commit -m "$(cat <<'EOF'
feat: Escape to Command in replacement dock; gate Nemeth QWERTY

EOF
)"
```

---

### Task 6: Docs — HUMAN-TESTING key map

**Files:**
- Modify: `docs/HUMAN-TESTING.md`

- [ ] **Step 1: Update key references**

Replace Command `e` with `x` in PM checklist and blind-contributor brief. Document:

- Escape → Command in text **and** equation/replacement
- `q` cancels
- `s` focuses authoring mode panel (on demand; not live)
- Nemeth rejects non-cell keys with field error
- Edit `E` in explorer unchanged

- [ ] **Step 2: Commit**

```bash
git add docs/HUMAN-TESTING.md
git commit -m "$(cat <<'EOF'
docs: update HUMAN-TESTING for x, s, and quiet mode panel

EOF
)"
```

---

### Task 7: Full verification + push

- [ ] **Step 1: Unit suite**

Run: `npm test`

Expected: PASS except any **pre-existing** Nemeth tip failures already documented in HUMAN-TESTING (Rule 15.12 / 21.12). Do not expand those failures. All new command/Nemeth-gate tests must pass.

- [ ] **Step 2: Focused e2e**

Run: `node --test --test-concurrency=1 test/e2e/ueb-text-command-mode.test.js`

Expected: all PASS

- [ ] **Step 3: Manual smoke (if GUI available)**

`npm start` — Add item → Escape → `x` → `x` toggles LaTeX → `x` back → `s` focuses mode panel → `i` → `n` opens dock → Escape stays in dock as Command → `i` → type `a` → error, empty field → `q` cancels.

- [ ] **Step 4: Push `testing`**

```bash
git push origin testing
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `e` → `x` umbrella | 1, 4, 6 |
| `x` toggles Nemeth↔LaTeX while empty | 1, 4, 5 |
| No silent `e` alias | 1, 4 |
| Escape in replacement → Command; `q` cancels | 5 |
| Nemeth rejects non-cells with field error | 2, 5 |
| `#mode-panel` non-live; Command `s` focuses | 3, 4 |
| No forced live for mode/save | 3, 4 |
| `x` alone does not cancel session / surprise-open as cancel | 4, 5 |
| HUMAN-TESTING updated | 6 |
| e2e/unit verification | 7 |

## Placeholder / consistency review

- No TBD steps; `isAllowedNemethCellInput` is defined in Task 2 and used in Task 5.
- Command key is `x` / `s` everywhere (not `e` for equation).
- Emptiness for dock method lock: Task 5 defines a closure flag / session-based check — implementers must pick one concrete helper and use it for both `contentEmpty` sync and `x` toggle; do not leave dual conflicting definitions.
