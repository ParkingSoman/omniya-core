# Math rendering invariants

An authored equation has one application-owned MathML source tree. Nemeth
blanks are represented by explicit `<mspace>` source nodes in that tree so
the input boundary remains available to the Braille projection and to local
structural follow-ups. MathJax may create enriched and assistive runtime
projections, but those are derived views, not additional persisted equations.

The source blank must not become a full extra word space in the visual output.
The renderer therefore suppresses the derived `mjx-mspace` visual advance in
CSS while leaving the source MathML and its accessibility metadata unchanged.
This separation is intentional: visual spacing cannot be allowed to change
Nemeth cells or tree ownership.

For diagonal fractions, the blank after a completed denominator is a local
boundary after the fraction. The guided transition engine moves the blank to
the surrounding row, so an expression such as `1/cos -cos = tan ·sin` is one
root equation with a fraction followed by sibling terms. It does not append
the following terms inside the denominator and it does not create a second
equation tree.

The regression coverage for this invariant is:

- the unit fixture `a diagonal fraction boundary keeps the following
  expression in the same root row`;
- the real Electron BANA 18.20 creation/editing case, which checks whole and
  focused Braille through MathJax; and
- the Rule 3.9 and 3.10 Electron accuracy cases, which ensure visual-space
  changes cannot suppress legitimate number indicators or decimal returns.
