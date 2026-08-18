# BANA source provenance

`test/corpus/sources/` holds the reference documents for the **BANA Nemeth
2022** Braille Code, pinned by SHA-256 so a future re-fetch can be verified
against what is committed here. These documents are not (yet) parsed into
corpus cases -- they exist for provenance/citation -- but their extracted
text (`.txt`) is committed alongside the PDFs.

**Do not use these PDFs to cross-check the `mathcat-rules` cases' `ref`
values in `nemeth-v1.json`.** Those `ref`s are 1972 Nemeth "green book"
section numbers (per `rules.rs`'s own header comment), not BANA Nemeth 2022
rule numbers -- see the `refScheme` field on that source record and the
caveat in `NOTICE`. BANA Nemeth 2022 (pinned below) has only 26 rules;
`mathcat-rules` `ref` values run as high as 177, and the two numbering
schemes are ambiguous for any value below 27.

| File | Official URL | SHA-256 |
|---|---|---|
| `Nemeth_2022.pdf` | https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf | `fc2324a522b4ee053923b6f28ccd05c7a1caad280531e26df35ef46479559e68` |
| `Errata_Nemeth_2022_2025-10.pdf` | https://www.brailleauthority.org/sites/default/files/2026-08/Errata%20Nemeth%20Code%202022%20Approved%2010-2025.pdf | `f17e994ab8fa4a4511e8b2aa0c853cddeea0504a04b30ed086bc4d7a76245c1e` |

Both hashes were re-verified locally with `shasum -a 256` against the
committed files during Task 2.

`Nemeth_2022.txt` and `Errata_Nemeth_2022_2025-10.txt` are plain-text
extractions of the corresponding PDFs (produced with a PDF text-extraction
tool, not hand-transcribed), committed for grep-able reference.

## Why page images are not committed

`test/corpus/sources/*.png` (and the one `*.jpg`) are per-page raster
extracts of `Nemeth_2022.pdf`, produced with `pdfimages`. They are
regenerable from the pinned PDF above and are gitignored -- do not commit
them. To regenerate:

```sh
pdfimages -png test/corpus/sources/Nemeth_2022.pdf test/corpus/sources/Nemeth_2022
```

## Why the BANA PDF was not used as a corpus source

Extracting (braille, print-math) pairs directly from `Nemeth_2022.pdf` was
evaluated and rejected for `nemeth-v1.json`: the braille extracts cleanly,
but the print math does not -- 54% of examples have dropped glyph spans, 91
are pure bitmap, and reconstructing print math from the braille side would
make the "oracle" circular with the parser it's meant to grade. The
Tier-1 corpus instead comes from two externally-maintained, independently
verified corpora (MathCAT and speech-rule-engine); see `NOTICE`.
