import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runCoverage } from '../../../scripts/nemeth-coverage.mjs';
import { NemethUnsupportedError, parseNemeth } from '../../../src/domain/nemeth/index.js';

// The corpus gate: grades the parser against all 613 cases in the Tier-1
// correctness corpus. Every case lands in exactly one of four buckets --
// PASS, REFUSE, DISAGREE, ERROR (see scripts/nemeth-coverage.mjs for the
// exact definitions). Most cases REFUSE today because the parser supports a
// deliberately narrow slice; that is expected and correct.
//
// What this file actually gates is DISAGREE and ERROR, not PASS: a REFUSE
// is an honest "not supported yet", but a DISAGREE is the parser silently
// producing wrong mathematics, and an ERROR is the parser claiming success
// while handing MathJax LaTeX it rejects. Both are bugs. Neither is allowed
// to exist un-looked-at -- each must be named here with a reason, or this
// test fails. Widening either allowlist is a decision for a human to make
// on purpose, not something that should happen as a side effect of an
// unrelated change.
//
// `runCoverage` (imported from scripts/nemeth-coverage.mjs, the same
// function that generates docs/nemeth-v2/coverage.md) is run exactly once
// here so this file's assertions and the committed report are provably
// looking at the same computation.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const corpusPath = path.join(projectRoot, 'test', 'corpus', 'nemeth-v1.json');
const reportPath = path.join(projectRoot, 'docs', 'nemeth-v2', 'coverage.md');

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const coverage = await runCoverage(corpus);

// Every DISAGREE case, with why it is not (yet) being fixed. Investigated by
// hand against the corpus, not guessed:
const DISAGREE_ALLOWLIST = {
  'mathcat-rules:mmultiscripts_82_a_1':
    'Corpus target is <mmultiscripts><mi>x</mi><mi>a</mi><mi>n</mi></mmultiscripts>; our parser ' +
    'always emits <msubsup>. Same cells (`⠭⠰⠁⠘⠝`) are ALSO the corpus case ' +
    '"msubsup_82_a_1", whose target IS <msubsup> and which PASSes -- MathCAT accepts ' +
    'either encoding as correct for this input, and our parser deterministically ' +
    'produces the one that matches one of the two, never the other.',
  'mathcat-rules:nested_sup_mmultiscripts_74_b_1':
    'Same situation as mmultiscripts_82_a_1: identical cells (`⠝⠘⠭⠘⠘⠽`) also appear as ' +
    '"nested_sup_74_b_1", whose <msup>-nested target matches our output and PASSes. ' +
    'The mmultiscripts-encoded twin does not, because we never emit <mmultiscripts>.',
  'mathcat-rules:number_space_after':
    'Cells are `⠼⠆` (just the numeral "2") -- identical to the cells for ' +
    'number_space_before and number_space_before_and_after. The corpus target adds a ' +
    'trailing <mtext>&#xA0;</mtext> that has no corresponding content anywhere in the ' +
    'cells string. Looks like a corpus-import artifact (the space these three cases are ' +
    'named for is not actually encoded in `cells`), not a parser bug -- reported per the ' +
    'task brief, not fixed, since the corpus itself is out of scope for this task.',
  'mathcat-rules:number_space_before':
    'Same cells (`⠼⠆`) and same situation as number_space_after, mirrored: the target ' +
    'adds a LEADING <mtext>&#xA0;</mtext> with nothing in `cells` to justify it.',
  'mathcat-rules:number_space_before_and_after':
    'Same cells (`⠼⠆`) again; target adds <mtext>&#xA0;</mtext> on both sides.'
};

// No ERROR cases exist today. Kept as a real allowlist (not just an
// `assert.equal(0)`) so the same discipline applies if one ever appears:
// named, with a reason, on purpose.
const ERROR_ALLOWLIST = {};

// Sourced from the coverage run at the time this gate was written -- see
// docs/nemeth-v2/coverage.md. This is a floor, not a target: later tasks
// raise it as the parser's scope grows. It must never silently drop.
const PASS_BASELINE = 9;

test('every corpus case lands in exactly one bucket, and the buckets sum to the corpus size', () => {
  const sum = coverage.totals.PASS + coverage.totals.REFUSE + coverage.totals.DISAGREE + coverage.totals.ERROR;
  assert.equal(sum, corpus.cases.length);
  assert.equal(coverage.results.length, corpus.cases.length);
});

test('DISAGREE: every case is in the allowlist with a reason, and the allowlist has no stale entries', () => {
  const actualIds = new Set(coverage.disagrees.map((r) => r.case.id));
  const allowedIds = new Set(Object.keys(DISAGREE_ALLOWLIST));

  for (const id of actualIds) {
    assert.ok(
      allowedIds.has(id),
      `DISAGREE case "${id}" is not in DISAGREE_ALLOWLIST -- a parsed-but-wrong result must be looked at ` +
        'and explicitly recorded, not left silent. See docs/nemeth-v2/coverage.md for the full detail.'
    );
    assert.ok(
      typeof DISAGREE_ALLOWLIST[id] === 'string' && DISAGREE_ALLOWLIST[id].trim().length > 0,
      `DISAGREE_ALLOWLIST entry for "${id}" must have a non-empty reason`
    );
  }
  for (const id of allowedIds) {
    assert.ok(actualIds.has(id), `DISAGREE_ALLOWLIST lists "${id}" but it no longer disagrees -- remove the stale entry`);
  }
});

test('ERROR: every case is in the allowlist with a reason, and the allowlist has no stale entries', () => {
  const actualIds = new Set(coverage.errors.map((r) => r.case.id));
  const allowedIds = new Set(Object.keys(ERROR_ALLOWLIST));

  for (const id of actualIds) {
    assert.ok(
      allowedIds.has(id),
      `ERROR case "${id}" is not in ERROR_ALLOWLIST -- this is a parser bug (a crash, or LaTeX MathJax ` +
        'rejected), not a legitimate refusal. See docs/nemeth-v2/coverage.md for the full detail.'
    );
    assert.ok(
      typeof ERROR_ALLOWLIST[id] === 'string' && ERROR_ALLOWLIST[id].trim().length > 0,
      `ERROR_ALLOWLIST entry for "${id}" must have a non-empty reason`
    );
  }
  for (const id of allowedIds) {
    assert.ok(actualIds.has(id), `ERROR_ALLOWLIST lists "${id}" but it no longer errors -- remove the stale entry`);
  }
});

test('ERROR count is currently zero', () => {
  // Not redundant with the allowlist test above: this pins today's actual
  // state so a newly-introduced ERROR is loud even before anyone thinks to
  // check the (currently empty) allowlist.
  assert.equal(coverage.totals.ERROR, 0);
});

test(`PASS count has not regressed below the pinned baseline (${PASS_BASELINE})`, () => {
  assert.ok(
    coverage.totals.PASS >= PASS_BASELINE,
    `PASS count dropped to ${coverage.totals.PASS}, below the pinned baseline of ${PASS_BASELINE}`
  );
});

// Soiffer's smoke test: "y = 2 sin x" (mathcat-rules:num_indicator_9_a_4).
// This is the expression MathCAT's maintainer used to reject an AI-written
// Nemeth back-translator -- it is this project's public tripwire. Blanks
// (the braille space cells around "=" and around "sin") are unsupported
// today, so this case REFUSES. It must refuse *cleanly* -- a clean REFUSE is
// the honest, correct outcome for an out-of-scope construct; a crash would
// not be. It must become PASS by the end of Task 5.
test('Soiffer smoke test (mathcat-rules:num_indicator_9_a_4, "y = 2 sin x") refuses cleanly today -- must PASS by end of Task 5', () => {
  const soiffer = corpus.cases.find((c) => c.id === 'mathcat-rules:num_indicator_9_a_4');
  assert.ok(soiffer, 'corpus is missing the Soiffer smoke-test case');

  assert.throws(() => parseNemeth(soiffer.cells), NemethUnsupportedError);

  const classified = coverage.results.find((r) => r.case.id === 'mathcat-rules:num_indicator_9_a_4');
  assert.equal(classified.bucket, 'REFUSE', 'Soiffer smoke test must REFUSE, not ERROR or DISAGREE -- an out-of-scope construct is not a bug');
});

test('committed docs/nemeth-v2/coverage.md summary is current with this run', () => {
  const report = readFileSync(reportPath, 'utf8');
  const bucketRow = (bucket) => {
    const match = report.match(new RegExp(`\\| ${bucket} \\| (\\d+) \\|`));
    assert.ok(match, `coverage.md is missing a summary row for ${bucket}`);
    return Number(match[1]);
  };

  assert.equal(bucketRow('PASS'), coverage.totals.PASS, 'coverage.md PASS count is stale -- run `npm run nemeth:coverage` and commit the result');
  assert.equal(bucketRow('REFUSE'), coverage.totals.REFUSE, 'coverage.md REFUSE count is stale -- run `npm run nemeth:coverage` and commit the result');
  assert.equal(bucketRow('DISAGREE'), coverage.totals.DISAGREE, 'coverage.md DISAGREE count is stale -- run `npm run nemeth:coverage` and commit the result');
  assert.equal(bucketRow('ERROR'), coverage.totals.ERROR, 'coverage.md ERROR count is stale -- run `npm run nemeth:coverage` and commit the result');

  const totalMatch = report.match(/\*\*Total\*\* \| \*\*(\d+)\*\*/);
  assert.ok(totalMatch, 'coverage.md is missing the total row');
  assert.equal(Number(totalMatch[1]), corpus.cases.length);
});
