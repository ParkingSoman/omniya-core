# BANA Electron visual evidence

The official corpus runner records visual evidence at the same time as the
real Nemeth creation and editing assertions. This is intentionally a second
evidence layer: canonical MathML and Braille can be correct while a derived
MathJax layout shows an unintended gap, a blank equation, or multiple visual
containers.

Run a review shard with screenshots enabled:

```text
BANA_ELECTRON_OFFICIAL=1 \
BANA_RULE=19 \
BANA_ELECTRON_SCREENSHOTS=1 \
BANA_ELECTRON_SCREENSHOT_DIR=/tmp/omniya-bana-rule-19-shots \
BANA_ELECTRON_RESULTS=/tmp/bana-rule-19-visual.json \
node --test test/e2e/bana-official-corpus.test.js
```

Every executable creation and editing case always checks, in the live
renderer, that there is exactly one MathJax equation container and one source
MathML root, that the container has non-zero geometry, and that authored
Nemeth blank cells do not become visible full-width `mjx-mspace` gaps. With
`BANA_ELECTRON_SCREENSHOTS=1`, a review case records an evidence set rather
than a single decorative image:

| Phase | What the reviewer must be able to see | Claim supported |
| --- | --- | --- |
| `input` | The bounded Nemeth cells and local-choice/status UI before submission, with the untouched source expression still visible | The rule was authored through the intended Nemeth interaction, not pasted as an invisible fixture |
| `committed` | The complete committed expression in the application | The authored cells became one canonical MathML expression and the rendered form is visually usable |
| `focused` | MathJax Explorer’s selected scope immediately before `E` | The hierarchical reading location is the scope that enters editing |
| `editing` | The edited expression after the exact replacement, with surrounding structure still visible | Editing changed the selected subtree rather than replacing or splitting the whole equation |

The phases are context-dependent. A non-rendering policy row does not require
an equation screenshot. An applicable equation example requires at least
`input` and `creation`; a row credited for editing requires `focused` and
`editing` as well. Each JSON screenshot entry includes a short claim and the
canonical table links the phases individually, so an outside contributor can
inspect what each artifact proves. The runner saves a PNG for each phase and
records its path and claim in the JSON evidence artifact.

The generated rule audit links these artifacts when a shard is imported. A
visual pass is never inferred from a unit test or static corpus row. The
screenshots are review evidence for the final rendered rule, while the DOM
geometry assertions keep the regression gate repeatable in CI.
