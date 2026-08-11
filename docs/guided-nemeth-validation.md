# Guided Nemeth validation

Omniya does not implement a second mathematical navigator. MathJax 4's
Expression Explorer owns the populated expression tree: Down enters a more
detailed subexpression, Up returns to a containing expression, and Left/Right
move among siblings at the current level. The official keyboard contract is
documented in the [MathJax Explorer keyboard commands](https://docs.mathjax.org/en/v4.0/basic/explorer-commands.html)
and the [accessibility components guide](https://docs.mathjax.org/en/latest/web/components/accessibility.html).
The renderer bridge captures the node MathJax has selected and maps it to the
persistent `data-omniya-id`; it does not reproduce MathJax's arrow-key logic.

The one additional movement operation is `nextEmptyFocus()`. It is used only
for persisted required holes, which have no mathematical content for MathJax
to focus. It is a slot fallback for guided writing, not a parallel navigator.
Once a hole is filled, the user returns to MathJax's normal arrow navigation.

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
then exposes the focused numerator cells after an ArrowDown navigation. The
inline writing test inserts a fraction, moves to the persisted denominator
hole with Tab, commits the denominator, and checks the resulting whole
expression Braille. This catches errors that domain-only tests cannot, such as
lost focus, stale rendering, or Braille attached to the wrong transient node.

## Scope of comparisons

SRE and MathCAT are MathML-to-Nemeth readers, not reverse Nemeth parsers. They
validate the rendered projection and navigation scope. Guided input is tested
separately as local structural transitions, with BANA rule references on every
registered operation. A passing projection comparison therefore does not turn
an unsupported input sequence into a claim of complete Nemeth authoring.
