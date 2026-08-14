# Thought-stream writing workflow demo

Date: 2026-08-14  
Branch / worktree: `codex/paper-writing-workflow` @ `/tmp/omniya-paper-writing-workflow`  
Status: implemented (do not merge to `main` yet)

## Problem

Existing tests prove individual Nemeth constructions and BANA mappings. They do not show what it looks like when someone **uses the app as a workspace** to work a coherent math problem: write a step, go back and read an earlier expression, then write the next step informed by that reading.

## Goals

1. A **headed** Electron/Playwright scenario someone can watch locally.
2. One **coherent definite-integral problem** across multiple napkin items.
3. Real workflow beats: cell-by-cell Nemeth authoring, **Backspace** draft undo, submit, Explorer navigation, **E** subtree replace on bounds, follow-on equations.
4. Runtime target **~15–40 seconds**, hard cap **60 seconds** (dense, not leisurely).
5. Isolated: this worktree/branch only; temp `OMNIYA_TEST_USER_DATA_DIR`; not part of default `npm run test:e2e`.

## Non-goals

- Full research paper / multi-section document model
- CI-default headed runs
- New math constructions beyond what the registry already supports reliably
- Merging to `main` in this phase
- Contaminating other worktrees or writing BANA evidence into shared `docs/`

## Audience experience

```bash
npm run test:demo:thought
```

Electron window is visible (`OMNIYA_HEADLESS=0`). Short pauses keep it watchable without stretching past ~40s.

## Scenario

**Problem:** evaluate \(\int_0^1 2x\,dx\) in scratch steps.

| Beat | Action |
|------|--------|
| 1 | Text item: problem statement |
| 2 | Equation A: author \(\int_a^b\) (with deliberate wrong cell → **Backspace** → finish `⠮⠰⠁⠘⠃`) |
| 3 | Explore lower bound → **E** → replace \(a\) with \(0\) |
| 4 | Explore upper bound → **E** → replace \(b\) with \(1\) |
| 5 | Equation B: antiderivative \(x^{2}\) (informed by prior integral) |
| 6 | Equation C: evaluated result \(1\) |

## Architecture

- Driver: `test/demo/thought-stream-demo.test.js` (outside `test/e2e/`)
- Script: `npm run test:demo:thought`
- Surface: real renderer + guided Nemeth dock; draft Backspace via `undoNemethStep`
- Isolation: `/tmp` user-data dirs; worktree `/tmp/omniya-paper-writing-workflow`

## Success criteria

- Watchable dense integral workflow in ≤60s
- Assertions on bounds `∫,0,1`, antiderivative `x^2`, result `1`, and 4 napkin articles
- No evidence artifacts written into the repo
- Branch stays off `main`
