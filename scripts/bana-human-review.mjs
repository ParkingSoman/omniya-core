import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const ROLES = Object.freeze({
  'qualified-nemeth-transcriber': 'transcriber',
  'blind-contributor': 'blindContributor'
});
const OUTCOMES = new Set(['accepted', 'changes-requested']);
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const execFileAsync = promisify(execFile);

const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (record, message) => {
  throw new Error(`Human review ${record?.id ?? '<unknown>'}: ${message}`);
};
const pendingState = () => ({ status: 'pending', reviewIds: [] });

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};

export function humanReviewRowFingerprint(row) {
  const { humanReview: _humanReview, transcriberReview: _transcriberReview, ...auditedRow } = row;
  return digest(JSON.stringify(canonicalize(auditedRow)));
}

async function defaultValidateReviewedCommit(commit, { repositoryDirectory }) {
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: repositoryDirectory });
    return true;
  } catch {
    return false;
  }
}

export async function applyHumanReviews(coverage, ledger, {
  baseDirectory = process.cwd(),
  repositoryDirectory = process.cwd(),
  validateReviewedCommit = defaultValidateReviewedCommit
} = {}) {
  if (ledger?.schemaVersion !== 1 || !Array.isArray(ledger.reviews)) {
    throw new Error('Human review ledger must use schemaVersion 1 and contain a reviews array.');
  }
  const rowsById = new Map((coverage.rows ?? []).map((row) => [row.id, row]));
  const recordIds = new Set();
  const decisions = new Map();

  for (const record of ledger.reviews) {
    if (!record?.id || recordIds.has(record.id)) fail(record, 'id must be non-empty and unique.');
    recordIds.add(record.id);
    const role = ROLES[record.role];
    if (!role) fail(record, `role must be one of ${Object.keys(ROLES).join(', ')}.`);
    if (typeof record.reviewerId !== 'string' || !record.reviewerId.trim()) fail(record, 'reviewerId is required.');
    if (!COMMIT.test(record.reviewedCommit ?? '')) fail(record, 'reviewedCommit must be a full 40-character Git commit.');
    if (!await validateReviewedCommit(record.reviewedCommit, { repositoryDirectory })) {
      fail(record, 'reviewedCommit is not in the current repository history.');
    }
    if (!Number.isFinite(Date.parse(record.reviewedAt)) || new Date(record.reviewedAt).toISOString() !== record.reviewedAt) {
      fail(record, 'reviewedAt must be an exact UTC ISO-8601 timestamp.');
    }
    if (record.role === 'qualified-nemeth-transcriber' &&
        (typeof record.qualificationAttestation !== 'string' || !record.qualificationAttestation.trim())) {
      fail(record, 'qualificationAttestation is required for a qualified Nemeth transcriber.');
    }
    if (record.role === 'blind-contributor' && record.independenceAttestation !== true) {
      fail(record, 'independenceAttestation must be true for a blind contributor.');
    }
    for (const field of ['sourcePdfSha256', 'errataPdfSha256']) {
      if (!SHA256.test(record.sourceHashes?.[field] ?? '')) fail(record, `${field} must be a SHA-256 digest.`);
      if (record.sourceHashes[field] !== coverage.source?.[field]) fail(record, `${field} does not match the current normative source.`);
    }
    if (!Array.isArray(record.artifacts) || record.artifacts.length === 0) fail(record, 'at least one hashed evidence artifact is required.');
    for (const artifact of record.artifacts) {
      if (typeof artifact.path !== 'string' || !artifact.path.trim() || path.isAbsolute(artifact.path)) fail(record, 'artifact paths must be non-empty and relative.');
      const resolved = path.resolve(baseDirectory, artifact.path);
      const relative = path.relative(path.resolve(baseDirectory), resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) fail(record, `artifact path escapes the ledger directory: ${artifact.path}`);
      if (!SHA256.test(artifact.sha256 ?? '')) fail(record, `artifact ${artifact.path} must declare a SHA-256 digest.`);
      let contents;
      try { contents = await readFile(resolved); } catch (error) { fail(record, `artifact ${artifact.path} cannot be read: ${error.message}`); }
      if (digest(contents) !== artifact.sha256) fail(record, `artifact ${artifact.path} digest does not match.`);
    }
    if (!Array.isArray(record.decisions) || record.decisions.length === 0) fail(record, 'at least one row decision is required.');
    const decidedRows = new Set();
    for (const decision of record.decisions) {
      const auditedRow = rowsById.get(decision.rowId);
      if (!auditedRow) fail(record, `decision references unknown row ${decision.rowId}.`);
      if (decidedRows.has(decision.rowId)) fail(record, `contains duplicate decisions for ${decision.rowId}.`);
      decidedRows.add(decision.rowId);
      if (!SHA256.test(decision.rowSha256 ?? '') || decision.rowSha256 !== humanReviewRowFingerprint(auditedRow)) {
        fail(record, `decision for ${decision.rowId} rowSha256 does not match the current audited row.`);
      }
      if (!OUTCOMES.has(decision.outcome)) fail(record, `decision for ${decision.rowId} has invalid outcome ${decision.outcome}.`);
      if (decision.outcome === 'changes-requested' && (typeof decision.notes !== 'string' || !decision.notes.trim())) {
        fail(record, `changes-requested decision for ${decision.rowId} requires notes.`);
      }
      const key = `${decision.rowId}\0${role}`;
      const values = decisions.get(key) ?? [];
      values.push({ reviewId: record.id, outcome: decision.outcome });
      decisions.set(key, values);
    }
  }

  const rows = (coverage.rows ?? []).map((row) => {
    const humanReview = {};
    for (const role of Object.values(ROLES)) {
      const values = decisions.get(`${row.id}\0${role}`) ?? [];
      humanReview[role] = values.length === 0 ? pendingState() : {
        status: values.some(({ outcome }) => outcome === 'changes-requested') ? 'changes-requested' : 'reviewed',
        reviewIds: values.map(({ reviewId }) => reviewId).sort()
      };
    }
    return {
      ...row,
      transcriberReview: humanReview.transcriber.status === 'reviewed' ? 'reviewed' : 'pending',
      humanReview
    };
  });
  return { ...coverage, humanReview: { ledgerSchemaVersion: 1, acceptedRecords: ledger.reviews.length }, rows };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const fingerprintsOnly = process.argv.includes('--fingerprints');
  const args = process.argv.slice(2).filter((value) => value !== '--check' && value !== '--fingerprints');
  const coveragePath = args[0] ?? 'docs/bana-coverage.json';
  if (fingerprintsOnly) {
    const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
    const requested = new Set(args.slice(1));
    const rows = (coverage.rows ?? []).filter((row) => requested.size === 0 || requested.has(row.id));
    if (requested.size > 0 && rows.length !== requested.size) throw new Error('One or more requested human-review row IDs are unknown.');
    for (const row of rows) console.log(`${row.id}\t${humanReviewRowFingerprint(row)}`);
    return;
  }
  const ledgerPath = args[1] ?? 'docs/bana-human-reviews.json';
  const outputPath = args[2] ?? coveragePath;
  const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  const result = await applyHumanReviews(coverage, ledger, { baseDirectory: path.dirname(path.resolve(ledgerPath)) });
  if (!checkOnly) await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`BANA human review ledger validated: ${ledger.reviews.length} records${checkOnly ? '' : `; output ${outputPath}`}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
