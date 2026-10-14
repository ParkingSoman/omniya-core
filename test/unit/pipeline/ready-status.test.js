import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load } from 'js-yaml';

import { CHECKS_BY_WORKFLOW, notGreen } from '../../../scripts/ci/green.mjs';
import { CONTEXT, READY, WAITING, decideStatus, ownerApproved, readyStatus } from '../../../scripts/ci/ready-status.mjs';
import { CHECKS_BY_WORKFLOW as SHIPPER_CHECKS, notGreen as shipperNotGreen } from '../../../scripts/ci/ship-pipeline-pr.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

test('green means the same here as it does to the shipper', () => {
  // Two copies, until the shipper next changes. They must not drift: a commit one calls green and the other calls red is a hole.
  assert.deepEqual(CHECKS_BY_WORKFLOW, SHIPPER_CHECKS);
  const runs = [{ id: 1, path: '.github/workflows/pr-checks.yml', created_at: 't', conclusion: 'success' }, { id: 2, path: '.github/workflows/fake.yml', created_at: 't', conclusion: 'success' }];
  const jobsOf = () => ['unit', 'nemeth', 'e2e', 'pack-mac', 'pack-win'].map((name) => ({ name, conclusion: 'success' }));
  assert.deepEqual(notGreen(runs, jobsOf), shipperNotGreen(runs, jobsOf));
  assert.deepEqual(notGreen(runs, jobsOf), ['pack-mac', 'pack-win'], 'a look-alike workflow counts for nothing');
});

test('only the owner\'s approval of THIS commit counts, and the latest decision wins', () => {
  const r = (login, state, commit_id, at) => ({ user: { login }, state, commit_id, submitted_at: at });
  assert.equal(ownerApproved([r('owner', 'APPROVED', SHA, '1')], 'owner', SHA), true);
  // Someone else's approval is not the owner's.
  assert.equal(ownerApproved([r('a-contributor', 'APPROVED', SHA, '1')], 'owner', SHA), false);
  // An approval of an older commit is not an approval of this one.
  assert.equal(ownerApproved([r('owner', 'APPROVED', OTHER, '1')], 'owner', SHA), false);
  // A later "changes requested", or a dismissed approval, takes it back.
  assert.equal(ownerApproved([r('owner', 'APPROVED', SHA, '1'), r('owner', 'CHANGES_REQUESTED', SHA, '2')], 'owner', SHA), false);
  assert.equal(ownerApproved([r('owner', 'APPROVED', SHA, '1'), r('owner', 'DISMISSED', SHA, '2')], 'owner', SHA), false);
  // A comment is not a decision, so it does not take an approval back.
  assert.equal(ownerApproved([r('owner', 'APPROVED', SHA, '1'), r('owner', 'COMMENTED', SHA, '2')], 'owner', SHA), true);
  // Approved again after a request for changes.
  assert.equal(ownerApproved([r('owner', 'CHANGES_REQUESTED', SHA, '1'), r('owner', 'APPROVED', SHA, '2')], 'owner', SHA), true);
  assert.equal(ownerApproved([], 'owner', SHA), false);
});

test('success needs the owner\'s approval AND green checks, and a success is never turned back into a wait', () => {
  const base = { mode: 'review', isFix: false, existing: null };
  assert.deepEqual(decideStatus({ ...base, approved: true, green: true }), { post: true, state: 'success', description: READY });
  assert.equal(decideStatus({ ...base, approved: true, green: false }).state, 'pending');
  assert.equal(decideStatus({ ...base, approved: false, green: true }).state, 'pending', 'green alone is not enough');
  for (const mode of ['opened', 'review']) {
    for (const approved of [true, false]) {
      const out = decideStatus({ mode, isFix: false, approved, green: false, existing: { state: 'success', description: 'The contributor tested this build' } });
      assert.equal(out.post, false, `${mode}, approved ${approved}`);
    }
  }
});

test('a new pull request says what it waits for, and never writes over a status that is already there', () => {
  assert.deepEqual(decideStatus({ mode: 'opened', isFix: false, approved: false, green: false, existing: null }), { post: true, state: 'pending', description: WAITING.owner });
  assert.deepEqual(decideStatus({ mode: 'opened', isFix: true, approved: false, green: false, existing: null }), { post: true, state: 'pending', description: WAITING.contributor });
  assert.equal(decideStatus({ mode: 'opened', isFix: false, approved: false, green: false, existing: { state: 'pending', description: 'x' } }).post, false);
});

test('after an approval the box says it waits for the checks, and says so once', () => {
  const out = decideStatus({ mode: 'review', isFix: false, approved: true, green: false, existing: { state: 'pending', description: WAITING.owner } });
  assert.deepEqual(out, { post: true, state: 'pending', description: WAITING.checks });
  assert.equal(decideStatus({ mode: 'review', isFix: false, approved: true, green: false, existing: { state: 'pending', description: WAITING.checks } }).post, false);
});

test('a fix branch is left to the hand-off until the owner approves it', () => {
  // The hand-off owns the contributor's own status. Saying "waiting for the owner" before the contributor spoke would be false.
  const out = decideStatus({ mode: 'review', isFix: true, approved: false, green: true, existing: null });
  assert.equal(out.post, false);
  // The owner may still approve a fix. Then it is ready.
  assert.equal(decideStatus({ mode: 'review', isFix: true, approved: true, green: true, existing: null }).state, 'success');
});

function fakeGh({ prs, statuses = [], reviews = [], conclusion = 'success' }) {
  const calls = [];
  const gh = (args, opts = {}) => {
    calls.push({ args, token: opts.token });
    const where = args.find((a) => a.startsWith('repos/')) ?? '';
    if (where.endsWith('/pulls') && where.includes('/commits/')) return JSON.stringify(prs);
    if (where.endsWith('/statuses') && where.includes('/commits/')) return JSON.stringify(statuses);
    if (where.endsWith('/reviews')) return reviews.map((r) => JSON.stringify(r)).join('\n');
    if (where.endsWith('/actions/runs')) {
      return JSON.stringify([{ id: 11, path: '.github/workflows/pr-checks.yml', created_at: 't', conclusion }, { id: 12, path: '.github/workflows/pr-build.yml', created_at: 't', conclusion }]);
    }
    if (/\/actions\/runs\/1[12]\/jobs$/.test(where)) {
      const names = where.includes('/runs/11/') ? ['unit', 'nemeth', 'e2e'] : ['pack-mac', 'pack-win'];
      return JSON.stringify(names.map((name) => ({ name, conclusion })));
    }
    return '';
  };
  return { gh, calls };
}
const pr = (over = {}) => ({ number: 102, state: 'open', base: 'testing', head: SHA, ref: 'pipeline/x', fork: false, ...over });
const input = { repo: 'a/b', owner: 'owner', sha: SHA, mergeToken: 'APP' };
const posts = (calls) => calls.filter((c) => c.args[1]?.startsWith('repos/a/b/statuses/'));

test('the owner approves a green commit: one status is posted, with the App token, on that commit', () => {
  const f = fakeGh({ prs: [pr()], reviews: [{ user: { login: 'owner' }, state: 'APPROVED', commit_id: SHA, submitted_at: '1' }] });
  const out = readyStatus({ ...input, mode: 'review' }, f.gh);
  assert.equal(out[0].state, 'success');
  const [post] = posts(f.calls);
  assert.equal(post.token, 'APP');
  assert.ok(post.args[1].endsWith(`/statuses/${SHA}`));
  assert.ok(post.args.includes(`context=${CONTEXT}`) && post.args.includes('state=success'));
});

test('no status is posted when the checks are red, the approval is someone else\'s, or the commit moved', () => {
  const approval = { user: { login: 'owner' }, state: 'APPROVED', commit_id: SHA, submitted_at: '1' };
  for (const setup of [
    { prs: [pr()], reviews: [approval], conclusion: 'failure' },
    { prs: [pr()], reviews: [{ ...approval, user: { login: 'a-contributor' } }] },
    { prs: [pr()], reviews: [{ ...approval, commit_id: OTHER }] },
    { prs: [pr({ head: OTHER })], reviews: [approval] },
    { prs: [pr({ fork: true })], reviews: [approval] },
    { prs: [pr({ base: 'main' })], reviews: [approval] },
    { prs: [pr({ state: 'closed' })], reviews: [approval] }
  ]) {
    const f = fakeGh(setup);
    const out = readyStatus({ ...input, mode: 'review' }, f.gh);
    assert.ok(!posts(f.calls).some((c) => c.args.includes('state=success')), JSON.stringify(setup).slice(0, 80));
    assert.ok(out.every((r) => r.state !== 'success'));
  }
});

test('a pull request that opens gets a waiting status, and one that already has a status is left alone', () => {
  const fresh = fakeGh({ prs: [pr()] });
  readyStatus({ ...input, mode: 'opened' }, fresh.gh);
  assert.ok(posts(fresh.calls)[0].args.includes(`description=${WAITING.owner}`));
  const there = fakeGh({ prs: [pr()], statuses: [{ state: 'success', description: 'x' }] });
  readyStatus({ ...input, mode: 'opened' }, there.gh);
  assert.equal(posts(there.calls).length, 0);
});

test('refuses a bad commit, a bad mode, or no App token before touching GitHub', () => {
  const f = fakeGh({ prs: [] });
  assert.throws(() => readyStatus({ ...input, sha: 'main', mode: 'review' }, f.gh), /40 hex/);
  assert.throws(() => readyStatus({ ...input, mode: 'both' }, f.gh), /mode/);
  assert.throws(() => readyStatus({ ...input, mode: 'review', mergeToken: '' }, f.gh), /MERGE_TOKEN/);
  assert.equal(f.calls.length, 0);
});

test('the privileged workflow runs from testing, in the locked environment, never runs the pull request\'s code, and asks the App for statuses only', () => {
  const yml = readFileSync('.github/workflows/pipeline-ready.yml', 'utf8');
  const wf = load(yml);
  assert.deepEqual(Object.keys(wf.on).sort(), ['pull_request_target', 'workflow_run']);
  assert.equal(wf.jobs.ready.environment, 'pipeline');
  assert.deepEqual([...yml.matchAll(/^\s*ref:\s*(.+)$/gm)].map((m) => m[1].trim()), ['testing'], 'the only checkout is testing');
  const app = wf.jobs.ready.steps.find((s) => s.id === 'app');
  assert.deepEqual(Object.keys(app.with).filter((k) => k.startsWith('permission-')), ['permission-statuses']);
  assert.equal(app.with['permission-statuses'], 'write');
  assert.doesNotMatch(yml, /run:[^\n]*\$\{\{/, 'no expression inside a run line');
  assert.doesNotMatch(yml, /CLAUDE_CODE_OAUTH_TOKEN/, 'no agent');
  // Only a pull request from this repository.
  assert.match(wf.jobs.ready.if.replace(/\s+/g, ' '), /head\.repo\.full_name == github\.repository/);
  assert.match(wf.jobs.ready.if.replace(/\s+/g, ' '), /head_repository\.full_name == github\.repository/);
});

test('the review ping holds no secret and asks for no permission, because a review runs the pull request\'s own copy of the file', () => {
  const yml = readFileSync('.github/workflows/pipeline-review-ping.yml', 'utf8');
  const wf = load(yml);
  assert.deepEqual(wf.permissions, {});
  assert.doesNotMatch(yml, /secrets\.|environment:/);
  assert.equal(wf.jobs.ping.if, "github.event.review.state == 'approved'");
  // The privileged workflow listens for exactly this file's name.
  assert.ok(load(readFileSync('.github/workflows/pipeline-ready.yml', 'utf8')).on.workflow_run.workflows.includes(wf.name));
});
