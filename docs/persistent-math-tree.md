# Persistent Math Tree

Equations are edited through one application-owned MathML tree. `data-omniya-id`
attributes are stable source identities; MathJax semantic IDs, speech, Braille,
and visual markup are derived runtime projections and are never persisted.
Persisted application state is schema version 2; equation items contain only a
`math` object with `formatVersion: 2`, canonical MathML, and the stable focus.

The explorer bridge captures a semantic focus as either a canonical node or an
exact sibling range. Structural edits resolve only those stable IDs, replace
the focused fragment, and restore focus after enrichment. A failed conversion
or validation leaves the persisted tree untouched.

`src/domain/guided-nemeth/` is a bounded transition boundary. It accepts one
normalized Nemeth cell or one named operation at a time, derives context from
the focused tree node, and returns an immutable MathML document, focus, inverse
patch, or an explicit pending/choice/rejected result. It never exposes a
whole-expression reverse parser or stores a hidden parser stack. The standards
ledger and interaction decisions are documented in
[`guided-nemeth-ledger.md`](guided-nemeth-ledger.md) and
[`guided-nemeth-interaction-decisions.md`](guided-nemeth-interaction-decisions.md).

LaTeX remains an explicit import/export interoperability format. It is not the
normal editing surface. The renderer's inline editor is a native input proxy
for one-cell transitions and commits through the main-process structural
transaction boundary.

MathJax is pinned to the tested 4.x runtime and the app remains offline-only;
no CDN fallback is permitted.
