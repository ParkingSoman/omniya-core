# Context-Efficient Luna BANA Implementation Plan

> **For agentic workers:** Complete the assigned BANA rule using the repository
> worker context, real Electron evidence, and rule-scoped gates. Do not spawn
> additional agents.

**Goal:** Complete all applicable nonspatial BANA Rules 1-24 through the guided
Nemeth editor with attributable real-Electron creation, navigation, editing,
Braille, persistence, and visual evidence.

**Architecture:** Three fresh Luna-medium workers operate in parallel rule
lanes. Every worker receives no conversation history and reads
`docs/bana-worker-context.md` plus only its assigned manual pages and code paths.
Passing rule gates and the canonical audit ledger are the routine acceptance
mechanism; the primary agent samples evidence and owns shared architecture.

**Tech stack:** JavaScript, Node test runner, Electron, MathJax/SRE, canonical
MathML, JSON evidence ledgers.

**Spec:** `docs/bana-worker-context.md`

## Global constraints

- Workers use `gpt-5.6-luna`, medium reasoning, and `fork_turns: "none"`.
- One worker context covers one rule, except large rules split at named
  subsection boundaries.
- BANA 2022 and the October 2025 errata are normative.
- No whole-expression Nemeth parser, AST, precedence engine, operand inference,
  or unrestricted buffer.
- Real Nemeth must cross the actual Electron renderer for creation and editing.
- Rule 25 spatial arrangements, chemistry, and equation-inapplicable Rule 26
  formatting are the only exclusions.

## Execution lanes

- Lane A completes Rules 3-8; Rules 1-2 already satisfy the automated evidence
  contract at the initial baseline.
- Lane B completes Rules 9-16.
- Lane C completes Rules 17-24.
- Each completed rule produces a coherent commit and compact handoff. A fresh
  worker begins the next rule from the newest accepted baseline.

## Rule completion loop

- Inspect every assigned provision, example, normative table entry, and erratum
  on the rendered source pages.
- Implement all applicable gaps through declarative local mappings and existing
  generic MathML compositions.
- Add exact official-example unit, real-Electron creation/editing/navigation,
  whole/focused Braille, undo/redo, persistence, and screenshot evidence.
- Update rule-owned source manifests and artifacts; regenerate reports through
  scripts rather than editing generated claims.
- Run the rule-scoped unit, Electron, accuracy, and audit gates and commit.
- Escalate only a concrete shared-architecture or normative conflict.

## Acceptance

- Routine passing rule commits are integrated without mandatory peer review.
- The primary samples one meaningful evidence row per completed rule and a
  complex Electron case per band milestone.
- Integration regressions reopen the responsible rule pattern.
- Final completion requires every applicable source row and official example,
  all aggregate commands, and no unsafe editable MathJax focus.

