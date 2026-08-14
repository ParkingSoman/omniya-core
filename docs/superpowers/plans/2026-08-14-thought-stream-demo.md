# Thought-Stream Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a headed Electron demo that works one coherent definite-integral problem across napkin items in ≤60s (hard cap 120s).

**Architecture:** A gated Playwright Electron scenario (not in default `test:e2e`) drives the real UI with short pauses. Helpers mirror `test/e2e/inline-editing.test.js`. Draft Backspace uses `undoNemethStep`. Explorer navigation seeks by speech role/braille (tree shape for `\int_a^b x` differs from bare `\int_a^b`).

**Tech Stack:** Electron, Playwright `_electron`, Node test runner, guided Nemeth replacement session.

**Spec:** `docs/superpowers/specs/2026-08-14-thought-stream-demo-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| Create: `test/demo/thought-stream-demo.test.js` | Headed coherent workflow scenario + assertions |
| Modify: `package.json` | `test:demo:thought` script (`OMNIYA_HEADLESS=0`) |
| Docs | Spec + friction log |

Keep the demo **out of** `test/e2e/*.test.js` so `npm run test:e2e` stays headless/fast.

### Proven Explorer paths for `\int_a^b x`

- Integrand `x`: Down, Right, Right (Right from group = sibling)
- Group: Down from root
- Base `∫`: Down from group
- Lower `a`: Right from base
- Upper `b`: Right, Right from base

---

### Task 1: Scaffold headed demo test + npm script

**Files:**
- Create: `test/demo/thought-stream-demo.test.js`
- Modify: `package.json`

- [x] **Step 1: Add npm script**
- [x] **Step 2: Create failing/skeleton test that launches headed and creates a napkin**
- [x] **Step 3: Run script once to confirm headed launch**
- [x] **Step 4: Commit**

---

### Task 2: Helpers for text, Nemeth cells, navigation

**Files:**
- Modify: `test/demo/thought-stream-demo.test.js`

- [x] **Step 1: Add helpers** (`feedCell`, `goToIntegralBase`, bound/integrand openers, choice resolve)
- [x] **Step 2: Commit helpers**

---

### Task 3: Full coherent scenario + assertions

**Files:**
- Modify: `test/demo/thought-stream-demo.test.js`

Scenario (integral, per design spec — supersedes early derivative sketch):

1. Napkin “Quarter-circle integral”
2. Equation problem `\int_a^b x` with deliberate wrong cell → Backspace → finish
3. Explore root → Base → lower bound (read)
4. E-replace lower `a→0`, upper `b→1`
5. E-replace integrand `x` with `\sqrt{1-x^2}` (refuse root scope)
6. Explore nested radical; author follow-on `\pi/4`
7. Assert 2 articles; bounds `∫,0,1`; radical; `\pi` and `4`

- [x] **Step 1: Implement scenario body**
- [x] **Step 2: Run headed demo** — PASS ~50s (`npm run test:demo:thought`)
- [x] **Step 3: Confirm default e2e does not pick it up**
- [x] **Step 4: Commit**

---

### Task 4: Push branch (no merge to main)

- [x] **Step 1: Push** (ongoing on `codex/paper-writing-workflow`)
- [x] **Step 2: Report**

Watch: `cd /tmp/omniya-paper-writing-workflow && npm run test:demo:thought`

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Headed Electron watchable demo | 1, 3 |
| Coherent multi-item integral problem | 3 |
| Backspace recovery | 3 |
| Navigate/read prior work + E replace | 3 |
| ≤60s target / ≤120s hard | CELL/BEAT/SUBMIT pauses |
| Not in default e2e | `test/demo/` + script |
| Isolation /tmp user data | launch helper |
| No merge to main | Task 4 push only |
