# Persistent Math Tree

Equations are edited through one application-owned MathML tree. `data-omniya-id`
attributes are stable source identities; MathJax semantic IDs, speech, Braille,
and visual markup are derived runtime projections and are never persisted.

The explorer bridge captures a semantic focus as either a canonical node or an
exact sibling range. Structural edits resolve only those stable IDs, replace
the focused fragment, and restore focus after enrichment. A failed conversion
or validation leaves the persisted tree untouched.

`src/domain/nemeth/` is a pure compiler boundary. It accepts Unicode Braille,
Braille ASCII, and normalized cells and returns a neutral AST, deterministic
LaTeX, diagnostics, and cell source maps. Strict mode rejects incomplete input;
incremental mode only synthesizes closing delimiters at end of input. The
traceability manifest is intentionally machine-readable so each BANA 2022 rule
family can be reviewed with independently authored fixtures.

LaTeX remains an import/export interoperability format. It is not the normal
editing surface. The renderer's inline editor uses the focused subtree's
Nemeth, and commits through the main-process structural transaction boundary.

MathJax is pinned to the tested 4.x runtime and the app remains offline-only;
no CDN fallback is permitted.
