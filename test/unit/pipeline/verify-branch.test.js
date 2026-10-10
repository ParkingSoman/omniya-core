import assert from 'node:assert/strict';
import test from 'node:test';

import { pickRun, tail, verifyBranch } from '../../../scripts/ci/verify-branch.mjs';

const REPO = 'a/b';
const BRANCH = 'claude/fix-22-x';
const SHA = 'abc123';

// A fake `gh` that remembers what it was asked and answers like GitHub would.
function fakeGh({ conclusions = {}, startDelayPolls = 0, shaOf = SHA } = {}) {
  const calls = [];
  let clock = 1_000_000;
  const polls = {};
  const runs = { 'pr-checks.yml': 501, 'pr-build.yml': 502 };
  const gh = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'api') return `${shaOf}\n`;
    if (args[0] === 'workflow') return '';
    if (args[0] === 'run' && args[1] === 'list') {
      const workflow = args[args.indexOf('--workflow') + 1];
      polls[workflow] = (polls[workflow] ?? 0) + 1;
      if (polls[workflow] <= startDelayPolls) return '[]';
      const finished = polls[workflow] > startDelayPolls + 1;
      return JSON.stringify([
        // An older run on the same commit, from an earlier round. It must be ignored.
        { databaseId: 1, headSha: SHA, createdAt: new Date(clock - 3_600_000).toISOString(), status: 'completed', conclusion: 'failure' },
        {
          databaseId: runs[workflow],
          headSha: SHA,
          createdAt: new Date(clock + 5_000).toISOString(),
          status: finished ? 'completed' : 'in_progress',
          conclusion: finished ? (conclusions[workflow] ?? 'success') : null
        }
      ]);
    }
    if (args[0] === 'run' && args[1] === 'view') return `log for ${args[2]}\n`;
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
  return { gh, calls, now: () => clock, sleep: async (ms) => { clock += ms; } };
}

test('both runs green means green, and both were dispatched on the branch', async () => {
  const f = fakeGh();
  const result = await verifyBranch(f, { repo: REPO, branch: BRANCH, pr: 26, pollMs: 10 });
  assert.equal(result.green, true);
  assert.equal(result.sha, SHA);
  assert.ok(f.calls.includes(`workflow run pr-checks.yml --repo ${REPO} --ref ${BRANCH}`));
  assert.ok(f.calls.some((c) => c.startsWith('workflow run pr-build.yml') && c.includes('pr_number=26') && c.includes('quiet=true')));
});

test('one red run means not green, and the log of that run, and only that run, is kept', async () => {
  const f = fakeGh({ conclusions: { 'pr-checks.yml': 'failure' } });
  const result = await verifyBranch(f, { repo: REPO, branch: BRANCH, pr: 26, pollMs: 10 });
  assert.equal(result.green, false);
  assert.deepEqual(result.failed, ['pr-checks.yml']);
  assert.match(result.log, /pr-checks\.yml run 501: failure/);
  assert.match(result.log, /log for 501/);
  assert.doesNotMatch(result.log, /pr-build\.yml/);
});

test('a cancelled run is not green', async () => {
  const f = fakeGh({ conclusions: { 'pr-build.yml': 'cancelled' } });
  const result = await verifyBranch(f, { repo: REPO, branch: BRANCH, pr: 26, pollMs: 10 });
  assert.equal(result.green, false);
});

test('it waits for a run that has not appeared yet', async () => {
  const f = fakeGh({ startDelayPolls: 3 });
  const result = await verifyBranch(f, { repo: REPO, branch: BRANCH, pr: 26, pollMs: 10 });
  assert.equal(result.green, true);
});

test('a run that never appears is a fault, not a red check', async () => {
  const f = fakeGh({ startDelayPolls: 10_000 });
  await assert.rejects(
    verifyBranch(f, { repo: REPO, branch: BRANCH, pr: 26, pollMs: 60_000, appearMs: 120_000 }),
    /did not start/
  );
});

test('a branch outside claude/fix- is refused before anything is dispatched', async () => {
  const f = fakeGh();
  await assert.rejects(verifyBranch(f, { repo: REPO, branch: 'testing', pr: 26 }), /refusing branch/);
  assert.equal(f.calls.length, 0);
});

test('a pull request number that is not digits is refused before anything is dispatched', async () => {
  const f = fakeGh();
  await assert.rejects(verifyBranch(f, { repo: REPO, branch: BRANCH, pr: '26; echo' }), /digits/);
  assert.equal(f.calls.length, 0);
});

test('pickRun ignores a run on another commit and a run from before the dispatch', () => {
  const runs = [
    { databaseId: 1, headSha: 'other', createdAt: '2026-10-10T10:00:10Z' },
    { databaseId: 2, headSha: SHA, createdAt: '2026-10-10T09:00:00Z' },
    { databaseId: 3, headSha: SHA, createdAt: '2026-10-10T10:00:05Z' },
    { databaseId: 4, headSha: SHA, createdAt: '2026-10-10T10:00:09Z' }
  ];
  const notBefore = Date.parse('2026-10-10T10:00:00Z');
  assert.equal(pickRun(runs, { sha: SHA, notBefore }).databaseId, 4, 'the newest match');
  assert.equal(pickRun(runs, { sha: 'none', notBefore }), undefined);
});

test('tail keeps the end of a long log, where the failure is', () => {
  const text = `${'start\n'.repeat(50)}THE FAILURE`;
  const cut = tail(text, 40);
  assert.match(cut, /THE FAILURE$/);
  assert.match(cut, /earlier output cut/);
  assert.equal(tail('short'), 'short');
});
