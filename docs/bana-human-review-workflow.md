# BANA independent human review workflow

Automated BANA coverage is not a human conformance claim. Two independent
reviews are required for every applicable source row:

1. A qualified Nemeth transcriber reviews the normative source, cells,
   structural interpretation, and rendered result.
2. A blind contributor independently performs the application task with a
   screen reader and verifies that creation, navigation, editing, undo/redo,
   and persistence are usable and match the recorded task outcome.

Neither SRE agreement nor an Electron run can substitute for these reviews.
The canonical ledger is [`bana-human-reviews.json`](bana-human-reviews.json).
It is intentionally empty until evidence is supplied by real reviewers.

## Evidence package

The review coordinator creates a directory under `docs/human-review-evidence/`
for each review. Evidence files must be committed before their ledger record
is accepted. Use pseudonymous reviewer identifiers; do not commit names,
email addresses, certification numbers, recordings, or other personal data.

Every review package must contain a UTF-8 Markdown or JSON report recording:

- the full Git commit reviewed;
- each exact BANA row ID and printed page;
- the source and errata PDF SHA-256 values from `docs/bana-coverage.json`;
- the task steps and all evidence artifacts used;
- one `accepted` or `changes-requested` decision per row;
- enough observations for another reviewer to reproduce the decision.

Screenshots, screen-reader logs, exported napkins, or command output may be
included as additional artifacts. Every artifact listed in the ledger is
content-addressed with SHA-256. Missing files, changed bytes, stale normative
source hashes, unknown row IDs, malformed timestamps, and duplicate decisions
make validation fail.

## Qualified Nemeth-transcriber review

The transcriber starts from the cited BANA 2022 page and applicable 2025
errata, not from SRE output or the implementation. For every row, the report
records:

- exact print and BRF/source notation;
- expected Unicode Braille cells and indicator boundaries;
- the intended structure and scope (including spaces, level changes, and
  terminators);
- comparison with the application MathML, whole Braille, and focused Braille;
- any discrepancy and the final row decision.

The ledger record uses role `qualified-nemeth-transcriber` and includes a
plain-language `qualificationAttestation`. The repository records the
attestation, not private credential material.

## Blind-contributor task review

The blind contributor must not receive implementation source, registry IDs,
automated pass/fail output, or the transcriber's decision before completing
the task. The coordinator supplies only the user task, the exact Nemeth input
to enter, and the BANA citation needed to understand the task. The report
records:

- operating system, screen reader, browser/Electron, and Braille-display or
  keyboard-input versions;
- the exact creation gestures and observed announcements;
- the MathJax navigation path and focused announcement before editing;
- the edit, undo, redo, save, reopen, and observed final state;
- artifact paths for the run and one row decision.

The ledger record uses role `blind-contributor` and sets
`independenceAttestation` to `true`. A `changes-requested` decision must include
notes. It remains a blocking state and never marks the row reviewed.

## Ledger record template

Do not copy this template into the canonical ledger until a real review and
its evidence exist.

```json
{
  "id": "transcriber-2026-001",
  "role": "qualified-nemeth-transcriber",
  "reviewerId": "reviewer-pseudonym",
  "qualificationAttestation": "Reviewer attests current Nemeth transcription qualification.",
  "reviewedAt": "2026-08-13T12:00:00.000Z",
  "reviewedCommit": "0123456789abcdef0123456789abcdef01234567",
  "sourceHashes": {
    "sourcePdfSha256": "copy from docs/bana-coverage.json",
    "errataPdfSha256": "copy from docs/bana-coverage.json"
  },
  "artifacts": [
    {
      "path": "human-review-evidence/transcriber-2026-001/report.md",
      "sha256": "sha256 of the committed report"
    }
  ],
  "decisions": [
    { "rowId": "bana-2022:example-1-1", "outcome": "accepted" }
  ]
}
```

For a blind-contributor record, replace `qualificationAttestation` with
`"independenceAttestation": true`.

## Reproducible commands

From the repository root:

```sh
shasum -a 256 docs/human-review-evidence/<review-id>/*
npm run bana:review-validate
npm run bana:report
npm test
```

`bana:review-validate` validates without rewriting coverage. `bana:report`
regenerates coverage and applies the validated ledger. The release gate then
requires both `humanReview.transcriber.status` and
`humanReview.blindContributor.status` to be `reviewed` for every applicable
row. Excluded rows do not require either review. Legacy `transcriberReview`
is derived from the qualified-transcriber state and must not be edited by
hand.

## Review handoff checklist

- Confirm the review commit and normative source hashes.
- Confirm every row decision is explicit and unique within the record.
- Confirm evidence files are committed and their hashes match.
- Validate the ledger before regeneration.
- Inspect the generated row states and gate output.
- Keep reviewer decisions separate; do not let one role approve the other.
- Never change `pending` to `reviewed` without a validated human record.
