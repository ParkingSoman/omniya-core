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
  decide({ pr: { ...pr, ...over }, sha: SHA, allowedAuthors, missing: [], pushers: ['omniya-bot'], files: ['docs/x.md'], ...extra });

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
    'scripts/ci/ship-pipeline-pr.mjs',
    'test/unit/pipeline/ship-pipeline-pr.test.js',
    'test/unit/pipeline/pipeline-secrets.test.js'
  ]) {
    assert.match(ok({}, { files: ['docs/x.md', file] }).reason, /bypass tick/, file);
  }
});

test('a check counts only when its newest run on that commit passed', () => {
  const runs = (list) => list.map(([name, conclusion, at]) => ({ name, conclusion, completed_at: at }));
  const all = ['unit', 'nemeth', 'e2e', 'pack-mac', 'pack-win'].map((n) => [n, 'success', '2026-10-14T10:00:00Z']);
  assert.deepEqual(notGreen(runs(all)), []);
  assert.deepEqual(notGreen(runs(all.slice(1))), ['unit']);
  // A later failure beats an earlier pass.
  assert.deepEqual(notGreen(runs([...all, ['e2e', 'failure', '2026-10-14T11:00:00Z']])), ['e2e']);
});

function fakeGh({ view = pr, conclusion = 'success', mergeFails = 0, pushes = ['omniya-bot', 'omniya-bot'], files = ['docs/x.md'] } = {}) {
  const calls = [];
  let failures = mergeFails;
  const run = (args, opts = {}) => {
    calls.push({ args, token: opts.token });
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(view);
    if (args[0] === 'api' && args[1].includes('/activity?')) return JSON.stringify(pushes.map((a) => ({ a })));
    if (args[0] === 'api' && args[1].endsWith('/files')) return files.join('\n');
    if (args[0] === 'api' && args[1].endsWith('/check-runs')) {
      return ['unit', 'nemeth', 'e2e', 'pack-mac', 'pack-win']
        .map((name) => JSON.stringify({ name, conclusion, completed_at: '2026-10-14T10:00:00Z' }))
        .join('\n');
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
    { files: ['scripts/ci/ship-pipeline-pr.mjs'] }
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

test('only GitHub Actions check runs are asked for', () => {
  const source = readFileSync('scripts/ci/ship-pipeline-pr.mjs', 'utf8');
  assert.match(source, /select\(\.app\.slug == "github-actions"\)/);
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
