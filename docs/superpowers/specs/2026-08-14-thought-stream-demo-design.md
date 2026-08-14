# Thought-stream writing workflow demo

Date: 2026-08-14  
Branch / worktree: `codex/paper-writing-workflow` @ `/tmp/omniya-paper-writing-workflow`  
Status: approved for planning (do not merge to `main` yet)

## Problem

Existing tests prove individual Nemeth constructions and BANA mappings. They do not show what it looks like when someone **uses the app as a workspace** to work a coherent math problem: write a step, go back and read an earlier expression, then write the next step informed by that reading.

## Goals

1. A **headed** Electron/Playwright scenario someone can watch locally.
2. One **coherent problem** across multiple napkin items (not disconnected one-offs).
3. Real workflow beats: cell-by-cell Nemeth authoring, **Backspace** draft undo, submit, Explorer navigation, **E** subtree replace (if time allows), item-to-item navigation.
4. Runtime **~60–90 seconds**, hard cap **2 minutes**.
5. Isolated: this worktree/branch only; temp `OMNIYA_TEST_USER_DATA_DIR`; not part of default `npm run test:e2e`.

## Non-goals

- Full research paper / multi-section document model
- CI-default headed runs
- New math constructions beyond what the registry already supports reliably
- Merging to `main` in this phase
- Contaminating other worktrees or writing BANA evidence into shared `docs/`

## Audience experience

Run something like:

```bash
npm run test:demo:thought
```

Electron window is visible (`OMNIYA_HEADLESS=0`). Pauses between beats (~150–300ms) make the napkin readable. The test still asserts pass/fail.

## Scenario

**Problem:** differentiate \(y = x^{2} + 3x\) in small scratch steps.

| Beat | Action |
|------|--------|
| 1 | Create napkin; add text item: short prompt (“find dy/dx”) |
| 2 | Add equation A; author \(x^{2}+3x\) with a deliberate wrong cell, **Backspace**, fix, submit |
| 3 | Re-enter A; Explorer to the \(x^{2}\) term (read prior work) |
| 4 | Add equation B: \(2x\); submit |
| 5 | Return to A; Explorer toward the linear term |
| 6 | Add equation C: \(2x+3\); submit |
| 7 | If clock allows: E-replace a small piece of C; otherwise skip |

Final napkin: 1 text + 3 equations with expected MathML/structure.

## Architecture

- **Driver:** Playwright `_electron`, helpers patterned on `test/e2e/inline-editing.test.js` and `test/e2e/launch-electron.js`.
- **Surface:** real renderer (`src/renderer/app.js`) + guided Nemeth replacement dock; draft Backspace via `undoNemethStep` in `src/domain/replacement-session.js`.
- **Pacing:** explicit `waitForTimeout` / status waits between cells and beats; no free-form recording layer.
- **Gating:** dedicated npm script; not imported by `test:e2e` glob runners that must stay headless/fast.
- **Isolation:** `mkdtemp` under `/tmp` for user data; work only in `/tmp/omniya-paper-writing-workflow`.

## Success criteria

- Human can watch the full coherent workflow in ≤2 minutes.
- Automated assertions confirm text + three equations and key structural content (e.g. superscript on A; final sum on C).
- Demo does not write evidence artifacts into the repo.
- Branch remains separate from `main` and other active worktrees.

## Risks

| Risk | Mitigation |
|------|------------|
| MathJax Explorer timing flakiness | Reuse proven waits from inline-editing / navigation e2e; keep exploration shallow |
| Cell sequences ambiguous (pending prefixes) | Prefer registry-proven cells from existing e2e (e.g. `⠭` / `⠘` / `⠆`) |
| Overrunning 2 minutes | Cap cell count; skip beat 7 if needed; keep pauses ≤300ms |

## Prerequisite already on this branch

Draft **Backspace** undoes the last Nemeth replacement step (`undoNemethStep` + dock wiring + unit/e2e coverage). The demo should exercise that path in beat 2.
