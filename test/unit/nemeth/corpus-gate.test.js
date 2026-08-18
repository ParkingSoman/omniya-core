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

// Every DISAGREE case traces back to one structural fact, not five separate
// mysteries: this corpus was built by running MathML *forward* through
// MathCAT's/SRE's Nemeth rules (MathML -> braille) and recording the
// resulting cells. That forward map is deliberately many-to-one -- braille
// correctly discards non-mathematical detail (a leading/trailing space is
// formatting, not content; more than one MathML encoding can render
// identically), so distinct MathML inputs collapse to identical cells.
// Running the corpus in reverse (cells -> our parsed MathML) is therefore
// inherently ambiguous for any case whose MathML differs from another only
// in such non-mathematical detail: the cells alone underdetermine which of
// several equally-valid source MathML trees produced them, and there is
// nothing a braille-to-MathML parser could do differently. Every entry
// below is one instance of this collapse, verified against the corpus
// itself, not guessed -- and DISAGREE = 0 is therefore not always an
// achievable target. What this gate actually enforces is that every
// DISAGREE has a verified structural reason attached, categorized by which
// side of the collapse it is, never a bare "this looks wrong" guess.
const MANY_TO_ONE_FORWARD_MAP = {
  // Sub-cause: equivalent-encoding. MathCAT accepts more than one MathML
  // shape as correct for the same subscript+superscript combination
  // (<mmultiscripts> vs. <msubsup>/nested <msup>); both forward-map to the
  // same cells. Our parser deterministically emits only the
  // <msubsup>/<msup> form, so for each pair below it matches the corpus
  // twin that chose that encoding and disagrees with the twin that chose
  // <mmultiscripts> -- not because either answer is mathematically wrong.
  'mathcat-rules:mmultiscripts_82_a_1': {
    cause: 'equivalent-encoding',
    reason:
      'Corpus target is <mmultiscripts><mi>x</mi><mi>a</mi><mi>n</mi></mmultiscripts>; our parser ' +
      'always emits <msubsup>. Same cells (`⠭⠰⠁⠘⠝`) are ALSO the corpus case ' +
      '"msubsup_82_a_1", whose target IS <msubsup> and which PASSes -- both MathML trees ' +
      'forward-map to these cells, so reversing the cells alone cannot recover which one ' +
      'the corpus intended.'
  },
  'mathcat-rules:nested_sup_mmultiscripts_74_b_1': {
    cause: 'equivalent-encoding',
    reason:
      'Same situation as mmultiscripts_82_a_1: identical cells (`⠝⠘⠭⠘⠘⠽`) also appear as ' +
      '"nested_sup_74_b_1", whose <msup>-nested target matches our output and PASSes. ' +
      'The <mmultiscripts>-encoded twin does not, because we never emit <mmultiscripts> -- ' +
      'both are valid forward-map preimages of the same cells.'
  },
  // Sub-cause: formatting-only difference. A leading/trailing non-breaking
  // space is print formatting, not mathematics, so Nemeth correctly drops
  // it -- all three MathML inputs below forward-map to the identical cells
  // `⠼⠆` ("2"). Verified directly against the corpus's own MathML for each
  // case (each is a genuinely different <math> input on purpose, not an
  // import artifact -- MathCAT is deliberately asserting that the braille
  // is insensitive to this formatting):
  //   number_space_after            <math><mn>2</mn><mtext>&#xA0;</mtext></math>
  //   number_space_before           <math><mtext>&#xA0;</mtext><mn>2</mn></math>
  //   number_space_before_and_after <math><mtext>&#xA0;</mtext><mn>2</mn><mtext>&#xA0;</mtext></math>
  // From `⠼⠆` alone it is impossible to know whether the source carried a
  // leading space, a trailing space, both, or neither -- our output `2` is
  // the only sensible answer regardless of which of the three this is.
  'mathcat-rules:number_space_after': {
    cause: 'formatting-only',
    reason:
      'Cells are `⠼⠆` (just the numeral "2") -- identical to the cells for ' +
      'number_space_before and number_space_before_and_after. The corpus target adds a ' +
      'trailing <mtext>&#xA0;</mtext> (a non-breaking space) that Nemeth braille correctly ' +
      'drops as formatting, not mathematics; the cells cannot distinguish this from the ' +
      'other two space-placement variants, so our parser producing plain `2` for all three ' +
      'is correct, not a bug.'
  },
  'mathcat-rules:number_space_before': {
    cause: 'formatting-only',
    reason:
      'Same cells (`⠼⠆`) and same situation as number_space_after, mirrored: the target ' +
      'adds a LEADING <mtext>&#xA0;</mtext>, which the cells likewise cannot encode.'
  },
  'mathcat-rules:number_space_before_and_after': {
    cause: 'formatting-only',
    reason: 'Same cells (`⠼⠆`) again; target adds <mtext>&#xA0;</mtext> on both sides, which the cells likewise cannot encode.'
  }
};

const MANY_TO_ONE_CAUSES = new Set(['equivalent-encoding', 'formatting-only']);

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

test('DISAGREE: every case is in MANY_TO_ONE_FORWARD_MAP with a categorized reason, and the map has no stale entries', () => {
  const actualIds = new Set(coverage.disagrees.map((r) => r.case.id));
  const allowedIds = new Set(Object.keys(MANY_TO_ONE_FORWARD_MAP));

  for (const id of actualIds) {
    assert.ok(
      allowedIds.has(id),
      `DISAGREE case "${id}" is not in MANY_TO_ONE_FORWARD_MAP -- a parsed-but-wrong result must be looked ` +
        'at and explicitly recorded, not left silent. See docs/nemeth-v2/coverage.md for the full detail.'
    );
    const entry = MANY_TO_ONE_FORWARD_MAP[id];
    assert.ok(
      MANY_TO_ONE_CAUSES.has(entry?.cause),
      `MANY_TO_ONE_FORWARD_MAP entry for "${id}" must have cause one of ${[...MANY_TO_ONE_CAUSES].join(', ')}`
    );
    assert.ok(
      typeof entry?.reason === 'string' && entry.reason.trim().length > 0,
      `MANY_TO_ONE_FORWARD_MAP entry for "${id}" must have a non-empty reason`
    );
  }
  for (const id of allowedIds) {
    assert.ok(actualIds.has(id), `MANY_TO_ONE_FORWARD_MAP lists "${id}" but it no longer disagrees -- remove the stale entry`);
  }
});

test('DISAGREE: the two many-to-one sub-causes are both represented as expected (2 equivalent-encoding, 3 formatting-only)', () => {
  const byCause = { 'equivalent-encoding': 0, 'formatting-only': 0 };
  for (const entry of Object.values(MANY_TO_ONE_FORWARD_MAP)) byCause[entry.cause] += 1;
  assert.equal(byCause['equivalent-encoding'], 2);
  assert.equal(byCause['formatting-only'], 3);
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
