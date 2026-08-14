# BANA Rules 17-24 review readiness

This handoff is generated from the canonical coverage ledger at commit
`b5ef0ed5f2f52e6bd3219a9c7c60d4c3f4ce1378`. The machine-readable companion
is [`bana-rules17-24-readiness.json`](bana-rules17-24-readiness.json).

Normative source fingerprints:

- BANA 2022 PDF: `fc2324a522b4ee053923b6f28ccd05c7a1caad280531e26df35ef46479559e68`
- 2025 errata PDF: `f9f97b0912c61eb2ca0ab3d4474cfd4021b1bb89d0722808bf13e3c3d5e2db84`

## Source and implementation audit

Rules 17-24 contain 466 source rows, of which 447 are applicable. Every
applicable row has an implemented disposition, verified implementation, and
exact operation or context-policy ownership. The 19 excluded rows are the
already-approved document/spatial exclusions; this audit adds no exclusions
and grants no family-level or inferred implementation credit.

## Exact remaining automated evidence

Counts below include applicable official examples only. A missing screenshot
is not visual evidence, even when the corresponding Electron JSON result
already proves the nonvisual contract.

| Rule | Rows | Applicable | Examples | Missing creation/edit/navigation/whole/focused/undo | Missing persistence | Missing visual | Next creation | Next visual |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 17 | 83 | 81 | 62 | 0 | 0 | 62 | none | `example-17-1` |
| 18 | 30 | 29 | 21 | 21 | 21 | 21 | `example-18-1` | `example-18-1` |
| 19 | 60 | 45 | 35 | 26 | 29 | 32 | `example-19-5` | `example-19-1` |
| 20 | 64 | 63 | 52 | 52 | 52 | 52 | `example-20-1` | `example-20-1` |
| 21 | 54 | 54 | 41 | 41 | 41 | 41 | `example-21-1` | `example-21-1` |
| 22 | 67 | 67 | 52 | 52 | 52 | 52 | `example-22-1` | `example-22-1` |
| 23 | 81 | 81 | 57 | 57 | 57 | 57 | `example-23-1` | `example-23-1` |
| 24 | 27 | 27 | 25 | 25 | 25 | 25 | `example-24-1` | `example-24-1` |

Totals: 274 missing creation/editing/navigation/whole/focused/undo workflows,
277 missing persistence results, and 342 missing reviewed visual evidence
sets.

Rule 17 has complete JSON results for all 62 applicable official examples,
but none has a canonical four-phase screenshot set in
`docs/bana-visual-evidence.json`; therefore no Rule 17 example receives visual
credit. Rule 19 additionally has three older workflows whose persistence
contract remains open and six nonvisual results without a complete visual set.

## Runtime attempt and continuation order

After `npm ci --include=dev`, the isolated macOS Electron binary initialization
ended before launch with `SIGABRT`. No example ran, no screenshot was created,
and no evidence was credited. This ends only that runtime attempt.

When a functioning Electron runtime is available, resume in this order:

1. Capture and inspect four-phase screenshots for Rule 17 beginning with
   `example-17-1`, without changing its already-proven JSON result.
2. Run Rule 18 sequentially beginning with `example-18-1`.
3. Resume Rule 19 creation at `example-19-5`; separately repair visual review
   and persistence beginning with `example-19-1`.
4. Run Rules 20-24 sequentially beginning with `example-20-1`,
   `example-21-1`, `example-22-1`, `example-23-1`, and `example-24-1`.

For every passing case, require creation, editing, MathJax navigation,
whole/focused Braille, undo/redo, persistence, and input/committed/focused/edit
screenshots from the same run. Inspect the images before adding them to the
visual index. Stop a sequence at the first semantic or lifecycle failure;
never merge partial or synthetic evidence.

## Human review readiness

No qualified-transcriber or blind-contributor decision is claimed here.
Every applicable row remains pending independent human review. Once the
separate human-review ledger tooling is integrated, reviewers should use its
source-bound, artifact-hashed workflow; automated evidence must not mutate
human review status.
