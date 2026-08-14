import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { applyHumanReviews } from '../../scripts/bana-human-review.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const execFileAsync = promisify(execFile);
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const source = {
  sourcePdfSha256: 'a'.repeat(64),
  errataPdfSha256: 'b'.repeat(64)
};
const coverage = {
  source,
  rows: [
    { id: 'bana-2022:1.1', disposition: 'implemented-context-policy', transcriberReview: 'pending' },
    { id: 'bana-2022:1.2', disposition: 'excluded-document-format', transcriberReview: 'pending' }
  ]
};

test('an empty canonical ledger leaves both human review roles pending', async () => {
  const result = await applyHumanReviews(coverage, { schemaVersion: 1, reviews: [] }, { baseDirectory: process.cwd() });
  assert.equal(result.rows[0].transcriberReview, 'pending');
  assert.deepEqual(result.rows[0].humanReview, {
    transcriber: { status: 'pending', reviewIds: [] },
    blindContributor: { status: 'pending', reviewIds: [] }
  });
  assert.deepEqual(result.humanReview, { ledgerSchemaVersion: 1, acceptedRecords: 0 });
});

test('accepted source-bound records independently close each human review role', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bana-human-review-'));
  const artifact = 'independent review notes\n';
  await writeFile(path.join(directory, 'review.txt'), artifact);
  const common = {
    reviewerId: 'reviewer-pseudonym',
    reviewedAt: '2026-08-13T12:00:00.000Z',
    reviewedCommit: 'c'.repeat(40),
    sourceHashes: source,
    artifacts: [{ path: 'review.txt', sha256: sha256(artifact) }],
    decisions: [{ rowId: 'bana-2022:1.1', outcome: 'accepted' }]
  };
  const ledger = { schemaVersion: 1, reviews: [
    { ...common, id: 'transcriber-1', role: 'qualified-nemeth-transcriber', qualificationAttestation: 'Reviewer attests current Nemeth transcription qualification.' },
    { ...common, id: 'blind-1', role: 'blind-contributor', independenceAttestation: true }
  ] };

  const result = await applyHumanReviews(coverage, ledger, { baseDirectory: directory });
  assert.equal(result.rows[0].transcriberReview, 'reviewed');
  assert.deepEqual(result.rows[0].humanReview.transcriber, { status: 'reviewed', reviewIds: ['transcriber-1'] });
  assert.deepEqual(result.rows[0].humanReview.blindContributor, { status: 'reviewed', reviewIds: ['blind-1'] });
  assert.equal(result.rows[1].humanReview.transcriber.status, 'pending');
});

test('review validation rejects stale sources, tampered artifacts, and unknown rows', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bana-human-review-invalid-'));
  await writeFile(path.join(directory, 'review.txt'), 'actual');
  const record = {
    id: 'transcriber-1',
    role: 'qualified-nemeth-transcriber',
    reviewerId: 'reviewer-pseudonym',
    qualificationAttestation: 'Qualified Nemeth transcriber.',
    reviewedAt: '2026-08-13T12:00:00.000Z',
    reviewedCommit: 'c'.repeat(40),
    sourceHashes: { ...source, sourcePdfSha256: 'd'.repeat(64) },
    artifacts: [{ path: 'review.txt', sha256: sha256('expected') }],
    decisions: [{ rowId: 'bana-2022:missing', outcome: 'accepted' }]
  };

  await assert.rejects(
    applyHumanReviews(coverage, { schemaVersion: 1, reviews: [record] }, { baseDirectory: directory }),
    /sourcePdfSha256.*does not match|unknown row|digest does not match/
  );
});

test('changes-requested records remain visible without marking a row reviewed', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bana-human-review-changes-'));
  await writeFile(path.join(directory, 'review.txt'), 'notes');
  const ledger = { schemaVersion: 1, reviews: [{
    id: 'blind-changes', role: 'blind-contributor', reviewerId: 'blind-reviewer',
    independenceAttestation: true, reviewedAt: '2026-08-13T12:00:00.000Z', reviewedCommit: 'd'.repeat(40),
    sourceHashes: source, artifacts: [{ path: 'review.txt', sha256: sha256('notes') }],
    decisions: [{ rowId: 'bana-2022:1.1', outcome: 'changes-requested', notes: 'Observed result differs.' }]
  }] };
  const result = await applyHumanReviews(coverage, ledger, { baseDirectory: directory });
  assert.deepEqual(result.rows[0].humanReview.blindContributor, { status: 'changes-requested', reviewIds: ['blind-changes'] });
  assert.equal(result.rows[0].transcriberReview, 'pending');
});

test('the release gate names transcriber and blind-contributor review independently', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bana-human-review-gate-'));
  const coveragePath = path.join(directory, 'coverage.json');
  const row = {
    id: 'bana-2022:1.1', kind: 'provision', disposition: 'implemented-context-policy', evidenceScope: 'source-policy',
    transcriberReview: 'pending', humanReview: { transcriber: pendingState(), blindContributor: pendingState() },
    verified: { source: true, implementation: true, contextPolicy: true }
  };
  await writeFile(coveragePath, JSON.stringify({ schemaVersion: 2, rows: [row] }));
  await assert.rejects(
    execFileAsync(process.execPath, ['scripts/bana-coverage-gate.mjs', coveragePath], { cwd: root }),
    (error) => /qualified transcriber review is pending/.test(error.stderr) && /blind-contributor review is pending/.test(error.stderr)
  );

  row.transcriberReview = 'reviewed';
  row.humanReview = {
    transcriber: { status: 'reviewed', reviewIds: ['transcriber-1'] },
    blindContributor: { status: 'reviewed', reviewIds: ['blind-1'] }
  };
  await writeFile(coveragePath, JSON.stringify({ schemaVersion: 2, rows: [row] }));
  const { stdout } = await execFileAsync(process.execPath, ['scripts/bana-coverage-gate.mjs', coveragePath], { cwd: root });
  assert.match(stdout, /coverage gate passed/);
});

function pendingState() {
  return { status: 'pending', reviewIds: [] };
}
