# BANA guided Nemeth worker context

This is the authoritative implementation brief for rule workers. Read it before
the assigned BANA pages, then inspect only the linked entry points and the files
owned by the assignment. Historical design notes and chat transcripts are not
requirements.

## Accepted architecture

- Canonical sanitized MathML is the only persisted mathematical authority.
  Stable `data-omniya-id` values identify source nodes across rendering and
  replacement. See `src/domain/math-tree.js`.
- MathJax owns rendering, speech, Nemeth projection, and navigation of populated
  mathematics. See `src/renderer/math-explorer-bridge.js`.
- Pressing E freezes the exact MathJax focus as a canonical node or contiguous
  sibling range. Editing must never broaden to a convenient ancestor.
- A replacement draft starts empty. Nemeth and LaTeX are alternate producers of
  replacement MathML. Submit performs one exact splice and one undo entry;
  cancellation never mutates the equation. See `src/domain/replacement-session.js`.
- New-equation writing is the same replacement workflow with an empty-root
  target.

## Guided Nemeth boundary

The transition engine accepts one bounded local BANA construction at a time.
It is not a completed-expression parser. Registry rows use exactly one policy:

- `immediate`: a complete standalone code commits as soon as it is recognized.
- `atomic-sequence`: one inseparable bounded construction is buffered locally
  and commits on local Enter.
- `structural-followup`: a local code modifies an existing draft object, moves
  between its slots, or closes it.

The implementation may insert tokens, compose a bounded token, open or close a
MathML structure, move between structural slots, decorate the focused draft
object, or set a BANA-defined local mode. Functions, integrals, sums, products,
and similar notation remain compositional unless BANA defines an inseparable
local construction. See `src/domain/guided-nemeth/index.js`.

Do not introduce an expression grammar, AST, precedence engine, operand
inference, unrestricted Nemeth buffer, whole-expression Nemeth parser, parallel
navigator, per-cell persistence, broad operation palette, or example-specific
dispatcher branch.

## Sources and exclusions

- Normative manual: `/private/tmp/Nemeth_2022.pdf`, SHA-256
  `fc2324a522b4ee053923b6f28ccd05c7a1caad280531e26df35ef46479559e68`.
- Normative errata: `/private/tmp/Nemeth_2022_Errata_2025.pdf`, SHA-256
  `f9f97b0912c61eb2ca0ab3d4474cfd4021b1bb89d0722808bf13e3c3d5e2db84`.
- Rendered PDF pages and printed Braille are authoritative. Extracted text is an
  index only. SRE and MathCAT are independent checks, not normative authorities.
- Approved exclusions are Rule 25 spatial arrangements, chemistry, and Rule 26
  provisions that cannot operate on an equation tree.

## Evidence contract

`docs/bana-source-inventory.json` is the sequential source ledger.
`docs/bana-electron-official-corpus.json` describes attributable real-app cases.
`docs/bana-coverage.json` and `docs/bana-audit-table.md` are generated outputs.
Do not hand-edit generated outputs to claim coverage.

Every applicable official example must use actual Nemeth input through the real
Electron renderer for creation and exact-focus editing. A case must assert the
canonical MathML, whole-expression Braille, focused Braille, preserved
surrounding identities, focus restoration, undo/redo, and the normal transaction
path. Representative family coverage cannot replace an official example.

Visual evidence must come from the same passing Electron execution. Depending on
the construction, capture labeled input, rendered creation, focused navigation,
and post-edit states. A screenshot containing only an unexplained glyph is not
evidence of a rule.

Use the rule-scoped commands exposed by `scripts/run-bana-tests.mjs` and
`scripts/run-bana-electron-corpus.mjs`. Never treat a renderer launch failure,
blank page, static fixture, or LaTeX-substituted workflow as a passing Electron
result.

## Escalate only shared questions

Ordinary rule failures belong to the rule worker. Escalate when an existing
generic operation cannot express the standard, a shared interface must change,
two source rows conflict, the normative source is genuinely ambiguous, exact
MathJax focus cannot be restored, or correct BANA output cannot be represented
through the current MathML plus minimal source intent.

