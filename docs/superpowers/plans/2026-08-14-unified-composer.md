# Unified Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `#composer-source` for text, equation, and subtree edit; `Ctrl+[` → Command; Escape → cancel; retire `#replacement-dock` as a product UI.

**Architecture:** Keep `replacement-session` / guided Nemeth domain logic, but bind it to the unified composer field. Command state gains optional `replaceScopeLabel`. Hide `#replacement-dock` permanently. `submitComposer` commits text, new equations, or subtree replaces without opening a second dock.

**Tech Stack:** Electron renderer (`src/renderer/app.js`, `index.html`), `src/domain/command-mode.js`, Node test runner + Playwright e2e.

**Spec:** [`docs/superpowers/specs/2026-08-14-unified-composer-design.md`](../specs/2026-08-14-unified-composer-design.md)

**Worktree:** `/Users/shonusengupta/omniya-core/.worktrees/testing` on branch `testing`.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/domain/command-mode.js` | Drop `q`; optional `replaceScopeLabel` in status; `t` refuse when replacing |
| `src/renderer/index.html` | Command button; hide/remove replacement-dock chrome; composer always has source |
| `src/renderer/app.js` | Key remap; unified Nemeth/LaTeX on composer; `E` opens composer; no dock UI |
| `src/renderer/styles.css` | Minor: Command button, ensure dock hidden |
| `test/unit/command-mode.test.js` | Domain key/status tests |
| `test/e2e/ueb-text-command-mode.test.js` | Rewrite for Ctrl+[, Escape cancel, unified equation path |
| `test/e2e/unified-composer.test.js` | New: equation field stays; subtree E; no replacement-dock |
| `docs/HUMAN-TESTING.md` | Key map + unified path |

---

### Task 1: Domain — cancel via Escape policy; status replace scope; drop `q`

**Files:**
- Modify: `src/domain/command-mode.js`
- Modify: `test/unit/command-mode.test.js`

- [ ] **Step 1: Write failing tests**

In `test/unit/command-mode.test.js` add/replace:

```js
test('q is unknown (cancel is Escape outside the machine)', () => {
  const s = enterCommand(createCommandState({ itemKind: 'text' }));
  const r = applyCommandKey(s, 'q');
  assert.equal(r.action, undefined);
  assert.match(r.announcement, /Unknown command/i);
});

test('formatStatus includes replacing scope label', () => {
  const s = createCommandState({
    itemKind: 'equation',
    equationMethod: 'nemeth',
    contentEmpty: true,
    replaceScopeLabel: 'integral'
  });
  assert.match(formatStatus(s), /replacing: integral/i);
});

test('t refuses when replaceScopeLabel is set', () => {
  const s = enterCommand(createCommandState({
    itemKind: 'equation',
    contentEmpty: true,
    replaceScopeLabel: 'term'
  }));
  const r = applyCommandKey(s, 't');
  assert.equal(r.state.itemKind, 'equation');
  assert.match(r.announcement, /Can’t switch to Text|Cannot switch to Text|replacing/i);
});
```

Remove any test that expects `q` → `action: 'cancel'`.

- [ ] **Step 2: Run — expect FAIL**

`node --test test/unit/command-mode.test.js`

- [ ] **Step 3: Implement**

In `createCommandState`, add `replaceScopeLabel = null`.

In `formatStatus` for equation:

```js
const scope = state.replaceScopeLabel ? ` · replacing: ${state.replaceScopeLabel}` : '';
return `${mode} · Equation · ${state.equationMethod === 'latex' ? 'LaTeX' : 'Nemeth'} · ${fill}${scope}`;
```

Remove `if (key === 'q') return ... cancel`.

At start of `t` handler, if `state.replaceScopeLabel`:

```js
return { state, announcement: "Can't switch to Text while replacing mathematics." };
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/domain/command-mode.js test/unit/command-mode.test.js
git commit -m "$(cat <<'EOF'
feat: drop Command q; add replace-scope status for unified composer

EOF
)"
```

---

### Task 2: Key remap — `Ctrl+[` Command, Escape cancel

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `test/e2e/ueb-text-command-mode.test.js`

- [ ] **Step 1: Update e2e helpers and tests**

Replace `enterCommand` helper:

```js
async function enterCommand(page) {
  await page.keyboard.press('Control+[');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
}
```

Add / replace coverage:

```js
test('Ctrl+[ enters Command; Escape cancels composer', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-cmd-chord-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await page.keyboard.type('hello');
  await page.keyboard.press('Control+[');
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  await page.keyboard.press('Escape');
  await page.locator('#composer-dock[hidden], #composer-dock').waitFor();
  // composer dock hidden OR reading actions visible:
  await page.getByRole('button', { name: 'Add item' }).waitFor();
  assert.equal(await page.locator('article.napkin-article').count(), 0);
});
```

Update existing tests that press Escape to enter Command → use `Control+[`. Update help asserts: no “Escape enters Command”; expect `Ctrl+[` / Escape cancel; no `q` cancel.

Remove or rewrite `replacement Escape enters Command...` — Escape must **cancel** dock/composer, not enter Command. (Full dock removal is Task 4–5; for this task if dock still exists, Escape should cancel replacement OR returnToRead.)

- [ ] **Step 2: Run e2e — expect FAIL**

- [ ] **Step 3: Wire `app.js`**

1. Remove Escape→`enterCommand` in composer Insert path. Escape (Insert or Command) while add/edit → `returnToRead()` (cancel).
2. On `keydown`, if `(event.ctrlKey || event.metaKey) && event.key === '['` and Insert (add/edit or active math session): preventDefault; `enterCommand`; `syncModePanel`.
3. Remove `q` from `commandKeys` set; cancel only via Escape / discard buttons.
4. Replacement path (until dock removed): Escape → `cancelReplacementEditor` / returnToRead, **not** enterCommand.
5. Update all help strings that say “Escape enters Command · q cancels” → “Ctrl+[ enters Command · Escape cancels”.
6. Braille full-cell → Command unchanged on composer UEB path.

- [ ] **Step 4: e2e PASS for chord/cancel tests that don’t require full dock removal yet**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js test/e2e/ueb-text-command-mode.test.js
git commit -m "$(cat <<'EOF'
feat: Ctrl+[ enters Command; Escape cancels authoring

EOF
)"
```

---

### Task 3: HTML — Command button; hide replacement dock

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css` (if needed)
- Modify: `src/renderer/app.js` (wire button click)

- [ ] **Step 1: Failing e2e assert**

```js
test('composer has Command button; replacement dock stays hidden', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-cmd-btn-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await page.getByRole('button', { name: 'Command' }).waitFor();
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
  await page.getByRole('button', { name: 'Command' }).click();
  await page.waitForFunction(() => /Command/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: HTML**

In `#composer-dock` bar (near Back to reading), add:

```html
<button id="composer-command" type="button">Command</button>
```

Keep `#replacement-dock` in DOM for now but add `hidden` permanently in HTML (or `hidden` + `aria-hidden="true"`), and never show it from JS after Task 5. For this task: set `hidden` in markup and remove Replace/Cancel as the active path from help copy.

Wire in `app.js`:

```js
elements['composer-command'].addEventListener('click', () => {
  if (mode !== 'add' && mode !== 'edit' && !replacementSession) return;
  commandState = enterCommand(commandState);
  syncModePanel(commandState);
});
```

Add `composer-command` to elements list.

- [ ] **Step 4: e2e PASS**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/app.js test/e2e/ueb-text-command-mode.test.js
git commit -m "$(cat <<'EOF'
feat: add Command button; keep replacement dock hidden

EOF
)"
```

---

### Task 4: `renderComposer` — Equation keeps the field

**Files:**
- Modify: `src/renderer/app.js`
- Create: `test/e2e/unified-composer.test.js`

- [ ] **Step 1: Failing e2e**

```js
test('command x keeps composer-source visible', { timeout: 60_000 }, async (t) => {
  const { app, page } = await launch('omniya-unified-x-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('x');
  await page.waitForFunction(() => /Equation · Nemeth/i.test(document.querySelector('#mode-panel')?.textContent ?? ''));
  assert.equal(await page.locator('#composer-source').isVisible(), true);
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
  const help = await page.locator('#composer-help').textContent();
  assert.doesNotMatch(help ?? '', /opens the replacement writer/i);
});
```

Share `launch` / `openComposer` / `enterCommand` via import from a small helper or duplicate minimal launch (match existing e2e style; duplication OK if no shared module yet).

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Fix `renderComposer`**

In `renderComposer()` (~379+):

- Never hide `#composer-source` for equation.
- Help text for equation Insert:

```js
'Nemeth: type cells · LaTeX: type source · Ctrl+[ Command · Escape cancels'
```

- Remove branch that implies Enter opens replacement writer.
- Ensure `composer-source` not `hidden`; `required` only for text submit validation as needed.

When `commandState.itemKind === 'equation'`, still show the textarea (class may switch `nemeth-inline-editor` / `latex-inline-editor` for styling only).

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js test/e2e/unified-composer.test.js
git commit -m "$(cat <<'EOF'
feat: keep composer field visible for Equation mode

EOF
)"
```

---

### Task 5: Bind guided Nemeth/LaTeX to `#composer-source` (new equations)

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `test/e2e/unified-composer.test.js`

- [ ] **Step 1: Failing e2e**

```js
test('equation Nemeth in composer commits without replacement dock', { timeout: 90_000 }, async (t) => {
  const { app, page } = await launch('omniya-unified-nemeth-');
  t.after(() => app.close().catch(() => {}));
  await openComposer(page);
  await enterCommand(page);
  await page.keyboard.type('x'); // Equation Nemeth
  await page.keyboard.type('i');
  await page.locator('#composer-source').focus();
  await page.keyboard.type('#1'); // ASCII Nemeth digit path used in fixtures
  await page.keyboard.press('Control+[');
  await page.keyboard.type('n');
  await page.locator('article.napkin-article').first().waitFor({ timeout: 15_000 });
  assert.equal(await page.locator('#replacement-dock').isVisible(), false);
  assert.equal(await page.locator('#composer-dock').isVisible(), false);
});
```

Adjust `#1` / submit gestures to whatever minimal Nemeth commit already works in unit/e2e fixtures (e.g. type cells that `applyNemethCell` accepts). Prefer a known-good single immediate cell from existing inline-editing tests.

- [ ] **Step 2: Run — FAIL** (today `n` on empty equation opens dock)

- [ ] **Step 3: Implement composer-bound session**

Refactor so math authoring state lives beside the composer:

1. Introduce `composerMathSession` (or reuse `replacementSession` name) started when:
   - user switches to Equation with empty content, or
   - opens subtree replace (Task 6).
2. On `#composer-source` `input`/`keydown` while `itemKind === 'equation'` && Insert:
   - Nemeth: gate with `isAllowedNemethCellInput`; feed `applyNemethCell` / boundary; mirror prefix in field like today’s dock.
   - LaTeX: `setLatexSource` on the session from field value.
3. Change `submitComposer` empty-equation branch: **do not** `openReplacementEditor`. Instead:
   - If session has commitable draft → `submitReplacement` / addItem with math document.
   - If still empty shell → either refuse (“Enter Nemeth or LaTeX”) or commit empty equation only if product already allows — prefer refuse with composer error.
4. Ensure `openReplacementEditor` is **not** called from submit path. Leave function temporarily for Task 6 rewrite or delete call sites.
5. Preview: if dock had `renderDraftPreview` into article, port a minimal version for add-flow only if needed for e2e; else commit-on-`n` without live preview is OK for v1 if tests only check committed article.

Concrete submit sketch:

```js
if (!editing && type === 'equation') {
  if (!composerMathSession) { /* error: nothing to commit */ return; }
  const result = await submitReplacement(composerMathSession, { convertLatexToMathML: ... });
  state = addItem(state, { type: 'equation', note: '', math: result.document });
  // cleanup session, returnToRead, save...
  return;
}
```

Start session when `set-type` → equation:

```js
composerMathSession = startReplacementSession({
  document: null,
  target: /* root for new empty math — match openReplacementEditor isNew path */,
  method: commandState.equationMethod
});
```

Inspect current `openReplacementEditor(..., isNew=true)` for the exact `startReplacementSession` args and reuse them.

- [ ] **Step 4: PASS e2e**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js test/e2e/unified-composer.test.js
git commit -m "$(cat <<'EOF'
feat: author Nemeth and LaTeX in the unified composer field

EOF
)"
```

---

### Task 6: Subtree `E` opens unified composer (equation-only)

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `test/e2e/unified-composer.test.js`

- [ ] **Step 1: Failing e2e**

Use existing napkin with an equation (create via Task 5 path or fixture). Explore → `E` → assert `#composer-source` visible, `#replacement-dock` hidden, mode panel matches `/replacing/i`, Command `t` refused.

```js
test('E opens unified composer for subtree replace', { timeout: 90_000 }, async (t) => {
  // setup: create equation item, enter explorer, press E
  // assert composer visible, replacement-dock hidden
  // Control+[ , t → still equation / refusal on mode-panel
  // Escape → back to read, math unchanged
});
```

Write the setup using the same Playwright patterns as `inline-editing.test.js` / Task 5 commit path — copy the shortest working explore+E sequence from existing e2e.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement**

Replace `openReplacementEditor(article)` call sites (explorer `E`, article `E`) with `openComposerForMathReplace(article, focus)`:

1. `mode = 'edit'` or a dedicated `mode = 'replace'` if cleaner — prefer reusing `edit` with flags: `mathReplaceArticleId`, `replaceScopeLabel` on commandState.
2. Show `#composer-dock`, focus `#composer-source`, start `composerMathSession` with existing document + target focus (copy from current `openReplacementEditor`).
3. `commandState = createCommandState({ itemKind: 'equation', equationMethod, contentEmpty: true, replaceScopeLabel: focus.speech || 'selection' })`.
4. Hide reading actions similarly to add/edit.
5. Delete or gut `openReplacementEditor` UI (no `#replacement-dock.hidden = false`).
6. Escape / discard → cancel session without writing; clear `replaceScopeLabel`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js test/e2e/unified-composer.test.js
git commit -m "$(cat <<'EOF'
feat: open subtree E edits in the unified composer

EOF
)"
```

---

### Task 7: Remove dead replacement-dock UI + help/docs

**Files:**
- Modify: `src/renderer/index.html` (remove dock markup or leave `hidden` stub)
- Modify: `src/renderer/app.js` (remove dock listeners / elements if unused)
- Modify: `docs/HUMAN-TESTING.md`
- Modify: keyboard help static copy in `index.html`

- [ ] **Step 1: Update HUMAN-TESTING** for Ctrl+[, Escape cancel, unified field, no replacement dock, Command button.

- [ ] **Step 2: Grep for `replacement-dock`, `Escape enters Command`, `q cancels`, `replacement writer` — fix stragglers.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html src/renderer/app.js docs/HUMAN-TESTING.md
git commit -m "$(cat <<'EOF'
docs: HUMAN-TESTING and chrome cleanup for unified composer

EOF
)"
```

---

### Task 8: Full verification + push

- [ ] **Step 1:** `npm test` — new/changed unit tests pass; pre-existing Rule 15.12 / 21.12 may still fail (document only).

- [ ] **Step 2:**  
  `node --test --test-concurrency=1 test/e2e/ueb-text-command-mode.test.js test/e2e/unified-composer.test.js`  
  All PASS.

- [ ] **Step 3:** `git push origin testing`

- [ ] **Step 4:** Report SHAs and summary.

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| `Ctrl+[` Command; Escape cancel; no `q` | 1, 2 |
| Command button | 3 |
| One field; `x` doesn’t hide source | 4 |
| Nemeth/LaTeX in composer; no dock for add | 5 |
| Subtree `E` same composer; `t` refused | 1, 6 |
| Retire replacement-dock product UI | 3, 5, 6, 7 |
| HUMAN-TESTING / help | 2, 7 |
| Verify + push | 8 |

## Self-review notes

- No TBD placeholders in steps; Task 5 requires reading existing `openReplacementEditor`/`isNew` session bootstrap — implementer must copy those args exactly, not invent a second session API.
- `replacementSession` variable may be renamed to `composerMathSession` in Task 5 for clarity; update all references in the same commit.
- Do not reintroduce Escape→Command.
