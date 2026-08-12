# Guided Nemeth validation

Omniya does not implement a second mathematical navigator. MathJax 4's
Expression Explorer owns the populated expression tree: Down enters a more
detailed subexpression, Up returns to a containing expression, and Left/Right
move among siblings at the current level. The official keyboard contract is
documented in the [MathJax Explorer keyboard commands](https://docs.mathjax.org/en/v4.0/basic/explorer-commands.html)
and the [accessibility components guide](https://docs.mathjax.org/en/latest/web/components/accessibility.html).
The renderer bridge captures the node MathJax has selected and maps it to the
persistent `data-omniya-id`; it does not reproduce MathJax's arrow-key logic.

Replacement drafts start at an empty MathML root, so no second navigator is
needed. During authoring, a structural transition focuses the required slot it
just created. Once populated, that draft is rendered through MathJax and the
same Explorer navigation is used for further replacement sessions.

## Accuracy layers

The tests deliberately use three separate evidence sources:

1. BANA Nemeth Code 2022 and its October 2025 errata are normative. The fixed
   fixtures in `test/fixtures/nemeth-braille-fixtures.js` retain reviewed
   Unicode cells and identify the applicable rule/example.
2. MathJax's bundled SRE is an independent runtime projection. The unit suite
   asks SRE for Nemeth after Omniya's LaTeX-to-canonical-MathML conversion and
   checks both complete expressions and extracted focused subtrees.
3. A ported subset of the open-source [MathCAT Nemeth suite](https://github.com/daisy/MathCAT/tree/main/tests/braille/Nemeth)
   is kept in `test/fixtures/mathcat-braille-fixtures.js`. The ported cases
   cover absolute values and overlines, powers, multiscript inverses, bounded
   unions, conjugates, quadratics, indexed roots, functions containing
   fractions, nested and indexed radicals, factorials, and associative set
   expressions. MathCAT is a valuable outside regression corpus, but it is
   not treated as a replacement for BANA when the projects differ.

The Electron suite checks the same contract at the accessibility boundary:
MathJax's explorer speech node exposes the reviewed whole-expression cells,
then exposes focused subexpressions after ArrowDown/Left/Right navigation.
Replacement tests commit nested drafts and check the resulting whole-expression
Braille. This catches errors that domain-only tests cannot, such as lost focus,
stale rendering, or Braille attached to the wrong transient node.

## Electron conformance matrix

The machine-readable companion to this matrix is
[`guided-nemeth-electron-evidence.json`](guided-nemeth-electron-evidence.json).
It is intentionally stricter than a list of test names: every `verified` row
records the BANA rules, the exact loaded-Electron creation and editing test
names, the concrete Nemeth cells (or six-key gesture), and the required whole
and focused Braille assertions. `test/unit/nemeth-electron-evidence.test.js`
loads that ledger and the live test source so a renamed, removed, or weakened
workflow fails the unit gate. Rows marked `gap` or `deferred` are not release
evidence and must not be described as covered.

The BANA ledger and the live Electron suite are one review surface. A ledger
row is not considered workflow-covered merely because its mapping and SRE
projection pass unit tests. For each implemented construction family, the
matrix below records the real renderer test that creates it, the renderer test
that edits it at a MathJax-selected scope, and the observable evidence. When a
family has no row here, that is an explicit Electron gap, not an implied
pass.

| Capability and input policy | Creation in the loaded app | Editing in the loaded app | Evidence required in the test |
| --- | --- | --- | --- |
| Ordinary tokens and immediate codes | `test/e2e/inline-editing.test.js` — `new equations use the same empty Nemeth replacement draft and commit once`; `renderer applies immediate, structural-followup, and atomic Nemeth codes in one real draft` (integral `⠮`) | `MathJax-focused Nemeth editing replaces only the selected subtree with an atomic code` (the replacement is entered as Nemeth after navigating to the second `x`) | Empty-root creation, actual Unicode cells through the renderer, immediate draft MathML, final saved MathML, and SRE Braille label presence |
| Structural follow-ups | `renderer applies immediate, structural-followup, and atomic Nemeth codes in one real draft` (fraction opener `⠹`, numerator `⠭`, separator `⠌`) | `nested numerator replacement preserves the containing fraction` and `MathJax-selected duplicate subexpressions replace only the selected node` | The separator changes the focused slot without becoming an `<mo>`, the containing structure survives, and only the selected node changes |
| Bounded atomic constructions (arrows and other multi-cell local rows) | `renderer applies immediate, structural-followup, and atomic Nemeth codes in one real draft` (right arrow `⠫⠒⠒⠕` remains in the local input until Enter) | `MathJax-focused Nemeth editing replaces only the selected subtree with an atomic code` | Incomplete local input leaves the draft unchanged, first Enter commits only the local code, second Enter submits one exact replacement, and the whole expression exposes the new Braille |
| Scripts, radicals, modifiers, and nested composition | The creation path is exercised by the shared Nemeth draft transition and the domain/accuracy fixtures; a dedicated loaded-app creation row is required before claiming this family complete | `every navigable nested focus opens the exact replacement draft`, `nested numerator replacement preserves the containing fraction`, and the focused replacement workflow in `inline-editing.test.js` | MathJax ArrowDown/ArrowRight reaches the exact base, script, radical, or numerator; E opens that scope; submit preserves all surrounding MathML and restores focus |
| Nested script/radical composition | `test/e2e/inline-editing.test.js` — `renderer creates a nested script and radical through compositional Nemeth cells` enters `x`, superscript, radical, `y`, superscript, `z`, and terminator; no LaTeX is used | `MathJax navigation edits a nested Nemeth subexpression without widening the target` navigates root → exponent → radicand, presses E, and replaces only `y^z` with `z^z` | Exact nested MathML, whole-expression BANA/SRE Braille, focused-radicand Braille including required level returns, preserved outer `x^√(...)`, and exact post-submit projection |
| Matrix navigation and cell scope | `test/e2e/mathjax-navigation.test.js` — `uses MathJax table navigation for matrix cells` verifies the loaded MathJax table | `every navigable nested focus opens the exact replacement draft` reaches a matrix cell and a row/range scope; a Nemeth construction/editing row is still required for matrix authoring | Table navigation, row/cell speech, exact `data-omniya-id` target, and no broad ancestor replacement |
| Input equivalence | `six-key input feeds the same Nemeth draft transition as Unicode cells` creates `l` with a real six-key chord; Unicode-cell creation is covered by the rows above | The same test path is reused for replacement drafts; future BANA rows must run both Unicode and six-key input through the same fixture | Unicode Braille, Braille ASCII, display input, and six-key simulation reach identical transition results and saved MathML |
| Whole-expression and deep navigation safety | `test/e2e/mathjax-navigation.test.js` — `renders accessible MathML and supports complete tree navigation` and `E opens the exact replacement even during the explorer focus handoff` | `every navigable nested focus opens the exact replacement draft` and `MathJax-selected duplicate subexpressions replace only the selected node` | Real Explorer arrows, focus handoff, duplicate subexpressions, nested scopes, cancellation, and absence of the former “cannot be edited safely” path |

The fixture equations used to seed an already-populated tree may use LaTeX so
that a test can isolate navigation and replacement. That is not Nemeth
coverage. A test counts as Nemeth coverage only when the construction or
replacement itself enters Unicode Braille, exact Braille ASCII, or a simulated
six-key chord through the renderer. Each new BANA ledger row must add, or link
to, both a creation test and an editing test with the navigation path, local
input policy (`immediate`, `atomic-sequence`, or `structural-followup`),
expected MathML, whole-expression and focused Braille assertions, and the
persistence/undo behavior where applicable.

### Keeping the matrix current

When a mapping is added or its BANA interpretation changes, update the ledger,
the mapping-integrity report, the domain/accuracy fixtures, and this matrix in
the same change. The Electron test name is intentionally written in the table
instead of referring only to a file, so a renamed or deleted workflow is easy
to detect in review. The release check should fail if a registry row has no
linked Electron evidence or if the linked test no longer exercises the stated
policy. MathCAT and SRE remain independent projection checks; neither can
substitute for the loaded-app creation and editing workflow.

Run `npm run test:nemeth-electron-links` with the conformance report. This
small guard is intentionally structural rather than a substitute for Electron:
it fails when one of the named creation/editing workflows is removed or renamed,
so the written BANA evidence cannot silently outlive the test that proves it.
The JSON evidence test additionally requires concrete Nemeth input, Explorer
navigation, and whole/focused Braille assertion categories for every row that is
marked `verified`.

## Scope of comparisons

SRE and MathCAT are MathML-to-Nemeth readers, not reverse Nemeth parsers. They
validate the rendered projection and navigation scope. Guided input is tested
separately as local structural transitions, with BANA rule references on every
registered operation. A passing projection comparison therefore does not turn
an unsupported input sequence into a claim of complete Nemeth authoring.
