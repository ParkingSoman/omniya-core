import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { decide, notGreen, ship } from '../../../scripts/ci/ship-pipeline-pr.mjs';

const SHA = 'a'.repeat(40);
const allowedAuthors = ['ParkingSoman', 'omniya-bot'];
const pr = {
  state: 'OPEN',
  baseRefName: 'testing',
  isCrossRepository: false,
  headRefName: 'pipeline/tell-contributor-when-rescued',
  headRefOid: SHA,
  author: { login: 'omniya-bot' },
  isDraft: false,
  mergeable: 'MERGEABLE'
};
const ok = (over = {}, extra = {}) =>
  decide({ pr: { ...pr, ...over }, sha: SHA, allowedAuthors, missing: [], pushers: ['omniya-bot'], files: [{ filename: 'docs/x.md', status: 'modified' }], ...extra });

test('ships a clean pipeline pull request from the owner or the session account', () => {
  assert.equal(ok().ship, true);
  assert.equal(ok({ author: { login: 'ParkingSoman' } }).ship, true);
});

test('refuses everything else, and says why', () => {
  const cases = [
    [{ state: 'MERGED' }, /not open/],
    [{ baseRefName: 'main' }, /into testing/],
    [{ isCrossRepository: true }, /fork/],
    [{ headRefName: 'claude/fix-1-x' }, /pipeline\//],
    [{ headRefName: 'feature/x' }, /pipeline\//],
    [{ author: { login: 'a-contributor' } }, /author/],
    [{ author: null }, /author/],
    [{ isDraft: true }, /draft/],
    [{ mergeable: 'CONFLICTING' }, /cleanly/],
    [{ mergeable: 'UNKNOWN' }, /cleanly/],
    [{ headRefOid: 'b'.repeat(40) }, /moved/]
  ];
  for (const [over, why] of cases) {
    const out = ok(over);
    assert.equal(out.ship, false, JSON.stringify(over));
    assert.match(out.reason, why);
  }
  assert.match(ok({}, { missing: ['e2e'] }).reason, /e2e/);
});

test('refuses a branch a contributor pushed to, or one with too much history to check', () => {
  assert.match(ok({}, { pushers: ['omniya-bot', 'a-contributor'] }).reason, /pushed to the branch/);
  assert.match(ok({}, { pushers: [] }).reason, /pushed to the branch/);
  assert.match(ok({}, { pushCount: 100 }).reason, /too many pushes/);
});

test('will not ship a change to the shipper or to the guards on the secrets', () => {
  for (const file of [
    '.github/workflows/pipeline-ship.yml',
    '.github/workflows/pr-checks.yml',
    '.github/workflows/pr-build.yml',
    '.github/actions/anything/action.yml',
    'scripts/ci/ship-pipeline-pr.mjs',
    'scripts/ci/gh.mjs',
    'scripts/ci/hand-off.mjs',
    'package.json',
    'package-lock.json',
    'test/unit/pipeline/ship-pipeline-pr.test.js',
    'test/unit/pipeline/pipeline-secrets.test.js'
  ]) {
    assert.match(ok({}, { files: [{ filename: 'docs/x.md' }, { filename: file, status: 'modified' }] }).reason, /bypass tick/, file);
  }
});

test('a protected file moved away still counts as touched', () => {
  const files = [{ filename: 'docs/old-ship.yml', previous_filename: '.github/workflows/pipeline-ship.yml', status: 'renamed' }];
  assert.match(ok({}, { files }).reason, /bypass tick/);
});

test('will not ship a change that deletes a test or moves one out of test/', () => {
  const gone = [{ filename: 'test/unit/model.test.js', status: 'removed' }];
  const moved = [{ filename: 'docs/model.test.js', previous_filename: 'test/unit/model.test.js', status: 'renamed' }];
  const added = [{ filename: 'test/unit/new.test.js', status: 'added' }];
  assert.match(ok({}, { files: gone }).reason, /deletes or moves a test/);
  assert.match(ok({}, { files: moved }).reason, /deletes or moves a test/);
  assert.equal(ok({}, { files: added }).ship, true);
});

test('a check counts only as a job of the workflow file that defines it', () => {
  const PC = '.github/workflows/pr-checks.yml';
  const PB = '.github/workflows/pr-build.yml';
  const jobs = {
    1: [['unit', 'success'], ['nemeth', 'success'], ['e2e', 'success']],
    2: [['pack-mac', 'success'], ['pack-win', 'success']],
    // A workflow added by the pull request, with jobs named like the real ones.
    3: [['unit', 'success'], ['nemeth', 'success'], ['e2e', 'success'], ['pack-mac', 'success'], ['pack-win', 'success']],
    4: [['unit', 'success'], ['nemeth', 'success'], ['e2e', 'failure']]
  };
  const jobsOf = (id) => jobs[id].map(([name, conclusion]) => ({ name, conclusion }));
  const run = (id, path, created_at, conclusion = 'success') => ({ id, path, created_at, conclusion });

  assert.deepEqual(notGreen([run(1, PC, 't1'), run(2, PB, 't1')], jobsOf), []);
  // Only a look-alike workflow is green: nothing counts.
  assert.deepEqual(notGreen([run(3, '.github/workflows/fake.yml', 't1')], jobsOf), ['unit', 'nemeth', 'e2e', 'pack-mac', 'pack-win']);
  // A real workflow whose run did not succeed counts for nothing, even if a job did.
  assert.deepEqual(notGreen([run(1, PC, 't1', 'failure'), run(2, PB, 't1')], jobsOf), ['unit', 'nemeth', 'e2e']);
  // The newest run of the real workflow decides. A later red run beats an earlier green one.
  assert.deepEqual(notGreen([run(1, PC, 't1'), run(4, PC, 't2', 'failure'), run(2, PB, 't1')], jobsOf), ['unit', 'nemeth', 'e2e']);
  assert.deepEqual(notGreen([run(4, PC, 't2'), run(2, PB, 't1')], jobsOf), ['e2e']);
});

function fakeGh({ view = pr, conclusion = 'success', mergeFails = 0, pushes = ['omniya-bot', 'omniya-bot'], files = [{ filename: 'docs/x.md', status: 'modified' }] } = {}) {
  const calls = [];
  let failures = mergeFails;
  const run = (args, opts = {}) => {
    calls.push({ args, token: opts.token });
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(view);
    if (args[0] === 'api' && args.some((a) => a.endsWith('/activity'))) return JSON.stringify(pushes.map((a) => ({ a })));
    if (args[0] === 'api' && args[1].endsWith('/files')) return files.map((f) => JSON.stringify(f)).join('\n');
    if (args.some((a) => a.endsWith('/actions/runs'))) {
      return JSON.stringify([
        { id: 11, path: '.github/workflows/pr-checks.yml', created_at: 't', conclusion },
        { id: 12, path: '.github/workflows/pr-build.yml', created_at: 't', conclusion }
      ]);
    }
    if (args.some((a) => /\/actions\/runs\/1[12]\/jobs$/.test(a))) {
      const names = args.some((a) => a.includes('/runs/11/')) ? ['unit', 'nemeth', 'e2e'] : ['pack-mac', 'pack-win'];
      return JSON.stringify(names.map((name) => ({ name, conclusion })));
    }
    if (args[0] === 'pr' && args[1] === 'merge' && failures-- > 0) throw new Error('not mergeable yet');
    return '';
  };
  return { run, calls };
}
const input = { pr: 94, sha: SHA, repo: 'a/b', allowedAuthors, mergeToken: 'app-token' };

test('sets the lock and merges, both with the App token and pinned to the commit', () => {
  const { run, calls } = fakeGh();
  assert.deepEqual(ship(input, run, () => {}), { shipped: true, reason: 'merged' });
  const status = calls.find((c) => c.args[0] === 'api' && c.args[1].includes('/statuses/'));
  assert.ok(status.args.includes('context=contributor-tested'));
  assert.equal(status.token, 'app-token');
  const merge = calls.find((c) => c.args[1] === 'merge');
  assert.equal(merge.token, 'app-token');
  assert.ok(merge.args.includes('--squash'));
  assert.equal(merge.args[merge.args.indexOf('--match-head-commit') + 1], SHA);
  assert.ok(!merge.args.includes('--admin'), 'never --admin');
  assert.ok(calls.indexOf(status) < calls.indexOf(merge), 'the lock comes before the merge');
});

test('sets no lock and merges nothing when a check is red, the branch moved, or a stranger pushed', () => {
  const setups = [
    { conclusion: 'failure' },
    { view: { ...pr, headRefOid: 'c'.repeat(40) } },
    { pushes: ['omniya-bot', 'a-contributor'] },
    { files: [{ filename: 'scripts/ci/ship-pipeline-pr.mjs', status: 'modified' }] }
  ];
  for (const setup of setups) {
    const { run, calls } = fakeGh(setup);
    assert.equal(ship(input, run, () => {}).shipped, false);
    assert.equal(calls.some((c) => c.args[0] === 'api' && c.args[1].includes('/statuses/')), false);
    assert.equal(calls.some((c) => c.args[1] === 'merge'), false);
  }
});

test('retries a merge that GitHub is not ready for, then gives up loudly', () => {
  assert.equal(ship(input, fakeGh({ mergeFails: 2 }).run, () => {}).shipped, true);
  assert.throws(() => ship(input, fakeGh({ mergeFails: 9 }).run, () => {}), /could not merge #94/);
});

test('refuses a bad sha or a missing token before touching GitHub', () => {
  const { run, calls } = fakeGh();
  assert.throws(() => ship({ ...input, sha: 'main' }, run, () => {}), /40 hex/);
  assert.throws(() => ship({ ...input, mergeToken: '' }, run, () => {}), /MERGE_TOKEN/);
  assert.equal(calls.length, 0);
});

test('the push history is asked for with parameters, so a branch name cannot add a filter', () => {
  const { run, calls } = fakeGh();
  ship(input, run, () => {});
  const ask = calls.find((c) => c.args.some((a) => a.endsWith('/activity')));
  assert.ok(ask.args.includes('--method') && ask.args.includes('GET'));
  assert.ok(ask.args.includes('ref=refs/heads/pipeline/tell-contributor-when-rescued'));
  assert.ok(!ask.args.some((a) => a.includes('?') || a.includes('&')), 'nothing from the branch name in the URL');
});

test('checks are read from workflow runs on the exact commit, not from the check-runs list', () => {
  const { run, calls } = fakeGh();
  ship(input, run, () => {});
  assert.ok(calls.some((c) => c.args.some((a) => a.endsWith('/actions/runs')) && c.args.includes(`head_sha=${SHA}`)));
  assert.ok(!calls.some((c) => c.args.some((a) => a.includes('check-runs'))), 'a name in the check-runs list can be spoofed');
});

test('the workflow runs in the locked environment, from testing, for two actors, with input only through env', () => {
  const yml = readFileSync('.github/workflows/pipeline-ship.yml', 'utf8');
  assert.match(yml, /environment: pipeline/);
  assert.match(yml, /github\.actor == github\.repository_owner \|\| github\.actor == 'omniya-bot'/);
  assert.deepEqual([...yml.matchAll(/^\s*ref:\s*(.+)$/gm)].map((m) => m[1].trim()), ['testing']);
  assert.doesNotMatch(yml, /run:[^\n]*\$\{\{/, 'no expression inside a run line');
  assert.doesNotMatch(yml, /CLAUDE_CODE_OAUTH_TOKEN/, 'no agent');
  assert.doesNotMatch(yml, /--admin/);
});
