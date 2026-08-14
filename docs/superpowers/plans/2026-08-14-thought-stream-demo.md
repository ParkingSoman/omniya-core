# Thought-Stream Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a headed Electron demo that works one coherent derivative problem across multiple napkin items in ≤2 minutes.

**Architecture:** A gated Playwright Electron scenario (not in default `test:e2e`) drives the real UI with short pauses. Helpers mirror `test/e2e/inline-editing.test.js`. Draft Backspace uses the existing `undoNemethStep` path.

**Tech Stack:** Electron, Playwright `_electron`, Node test runner, guided Nemeth replacement session.

**Spec:** `docs/superpowers/specs/2026-08-14-thought-stream-demo-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| Create: `test/demo/thought-stream-demo.test.js` | Headed coherent workflow scenario + assertions |
| Modify: `package.json` | `test:demo:thought` script (`OMNIYA_HEADLESS=0`) |
| Modify: `test/e2e/launch-electron.js` | No change required if demo imports it and overrides `OMNIYA_HEADLESS` |
| Docs already exist | Spec; optional one-line mention in user guide only if needed |

Keep the demo **out of** `test/e2e/*.test.js` so `npm run test:e2e` stays headless/fast.

### Proven Nemeth cell sequences (domain-verified)

- Equation A \(x^{2}+3x\): `⠭` `⠘` `⠆` `⠐` `⠬` `⠼` `⠒` `⠭`
- Deliberate mistake before finishing A: type `⠽` after `⠭`, Backspace, then continue with `⠘`…
- Equation B \(2x\): `⠼` `⠆` `⠭`
- Equation C \(2x+3\): `⠼` `⠆` `⠭` `⠬` `⠼` `⠒`

---

### Task 1: Scaffold headed demo test + npm script

**Files:**
- Create: `test/demo/thought-stream-demo.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add npm script**

In `package.json` scripts:

```json
"test:demo:thought": "OMNIYA_HEADLESS=0 OMNIYA_THOUGHT_DEMO=1 node --test --test-concurrency=1 test/demo/thought-stream-demo.test.js"
```

- [ ] **Step 2: Create failing/skeleton test that launches headed and creates a napkin**

```js
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { electronLaunchEnv } from '../e2e/launch-electron.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAUSE_MS = 200;

async function pause(page) {
  await page.waitForTimeout(PAUSE_MS);
}

async function launch() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'omniya-thought-demo-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({
      OMNIYA_TEST_USER_DATA_DIR: dataDirectory,
      OMNIYA_HEADLESS: '0'
    })
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  return { app, page, dataDirectory };
}

test('thought-stream demo: differentiate x^2+3x across napkin items', { timeout: 120_000 }, async (t) => {
  const { app, page } = await launch();
  t.after(() => app.close().catch(() => {}));

  await page.getByRole('button', { name: 'New napkin' }).click();
  await page.getByLabel('Napkin name').fill('Derivative scratch');
  await page.getByRole('button', { name: 'Create napkin' }).click();
  await pause(page);

  // Full scenario filled in Task 2–3
  assert.equal(await page.getByRole('button', { name: 'Derivative scratch' }).count(), 1);
});
```

- [ ] **Step 3: Run script once to confirm headed launch**

```bash
npm run test:demo:thought
```

Expected: pass on napkin create (window visible).

- [ ] **Step 4: Commit**

```bash
git add package.json test/demo/thought-stream-demo.test.js
git commit -m "test: scaffold headed thought-stream demo runner"
```

---

### Task 2: Helpers for text, Nemeth cells, navigation

**Files:**
- Modify: `test/demo/thought-stream-demo.test.js`

- [ ] **Step 1: Add helpers**

```js
async function addTextItem(page, text) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('radio', { name: 'Text' }).check();
  await page.getByLabel('Content', { exact: true }).fill(text);
  await page.locator('#composer-form').evaluate((form) => form.requestSubmit());
  await page.locator('#composer-dock').waitFor({ state: 'hidden' });
}

async function addBlankEquation(page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('radio', { name: 'Equation' }).check();
  await page.getByLabel('Content', { exact: true }).press('Enter');
  await page.locator('#replacement-dock').waitFor();
  return page.locator('article.napkin-article').last();
}

async function feedCells(page, cells) {
  const input = page.getByLabel('Replacement input', { exact: true });
  for (const cell of cells) {
    await input.fill(cell);
    await pause(page);
  }
}

async function submitReplacement(page) {
  const input = page.getByLabel('Replacement input', { exact: true });
  await input.press('Enter');
  await page.locator('#replacement-dock').waitFor({ state: 'hidden' });
}

async function focusArticle(page, index) {
  const article = page.locator('article.napkin-article').nth(index);
  await article.focus();
  await pause(page);
  return article;
}

async function enterExplore(page, article) {
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current));
  await pause(page);
}
```

- [ ] **Step 2: Commit helpers**

```bash
git add test/demo/thought-stream-demo.test.js
git commit -m "test: add thought-stream demo interaction helpers"
```

---

### Task 3: Full coherent scenario + assertions

**Files:**
- Modify: `test/demo/thought-stream-demo.test.js`

- [ ] **Step 1: Implement scenario body**

Inside the test, after napkin create:

1. `addTextItem(page, 'find dy/dx for y = x^2 + 3x')`
2. `addBlankEquation` → feed `⠭` → feed wrong `⠽` → assert two letters or status → `Backspace` → assert back to `x` → feed `⠘⠆⠐⠬⠼⠒⠭` → submit  
   Assert article has `msup` with base `x` and `+` / `3` / `x` present in MathML or visible text.
3. `focusArticle` equation A (index 1) → `enterExplore` → ArrowDown into structure (read) → Escape leave if needed
4. `addBlankEquation` → feed `⠼⠆⠭` → submit (equation B = 2x)
5. Navigate to A again (`ArrowUp` / focus), `enterExplore`, brief read of later term
6. `addBlankEquation` → feed `⠼⠆⠭⠬⠼⠒` → submit (equation C = 2x+3)
7. Assert `article.napkin-article` count === 4 (1 text + 3 equations); C contains `2`, `x`, `+`, `3`

If Explorer steps flake, keep Enter+ArrowDown+pause but do not fail the demo solely on speech explorer — prefer asserting napkin contents. Prefer including explore if stable within timeout.

- [ ] **Step 2: Run headed demo**

```bash
npm run test:demo:thought
```

Expected: PASS in ≤120s wall time; window visible; final assertions hold.

- [ ] **Step 3: Confirm default e2e does not pick it up**

```bash
node --test --test-concurrency=1 --test-name-pattern='thought-stream' 'test/e2e/*.test.js'
```

Expected: 0 tests matched / no thought-stream file run.

- [ ] **Step 4: Commit**

```bash
git add test/demo/thought-stream-demo.test.js
git commit -m "test: headed thought-stream demo for derivative scratch workflow"
```

---

### Task 4: Push branch (no merge to main)

- [ ] **Step 1: Push**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Report**

Tell the user how to watch: `npm run test:demo:thought` from `/tmp/omniya-paper-writing-workflow`.

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Headed Electron watchable demo | 1, 3 |
| Coherent multi-item problem | 3 |
| Backspace recovery | 3 |
| Navigate/read prior work | 3 |
| ≤2 minutes | PAUSE_MS=200 + short cell lists |
| Not in default e2e | `test/demo/` + script |
| Isolation /tmp user data | launch helper |
| No merge to main | Task 4 push only |
