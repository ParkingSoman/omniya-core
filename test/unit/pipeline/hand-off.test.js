import assert from 'node:assert/strict';
import test from 'node:test';

import { OPEN_LINE, REQUIRED_CHECKS, decide, fixIssue, handedOff, handOff, mergeGreen, notGreen, protectedPath } from '../../../scripts/ci/hand-off.mjs';

const green = (name, at = '2026-10-10T10:00:00Z') => ({ name, conclusion: 'success', completed_at: at });

test('the three checks testing-guard requires are the three that are read', () => {
  assert.deepEqual(REQUIRED_CHECKS, ['unit', 'nemeth', 'e2e']);
});

test('all three green means nothing is missing', () => {
  assert.deepEqual(notGreen([green('unit'), green('nemeth'), green('e2e'), green('pipeline-on-main')]), []);
});

test('a missing check counts as not green', () => {
  assert.deepEqual(notGreen([green('unit'), green('nemeth')]), ['e2e']);
});

test('a failed check is named', () => {
  assert.deepEqual(
    notGreen([green('unit'), { name: 'nemeth', conclusion: 'failure', completed_at: '2026-10-10T10:00:00Z' }, green('e2e')]),
    ['nemeth']
  );
});

test('the newest run of a check decides: a later pass replaces an earlier failure, and the other way round', () => {
  const failed = (at) => ({ name: 'unit', conclusion: 'failure', completed_at: at });
  assert.deepEqual(
    notGreen([failed('2026-10-10T09:00:00Z'), green('unit', '2026-10-10T10:00:00Z'), green('nemeth'), green('e2e')]),
    []
  );
  assert.deepEqual(
    notGreen([green('unit', '2026-10-10T09:00:00Z'), failed('2026-10-10T10:00:00Z'), green('nemeth'), green('e2e')]),
    ['unit']
  );
});

test('a cancelled or still-running check is not green', () => {
  assert.deepEqual(
    notGreen([
      { name: 'unit', conclusion: 'cancelled', completed_at: '2026-10-10T10:00:00Z' },
      { name: 'nemeth', conclusion: null, completed_at: null },
      green('e2e')
    ]),
    ['unit', 'nemeth']
  );
});

// decide(): what happens to a fix the contributor approved. No GitHub in here.
const clean = { filesComplete: true, fixBranch: true, files: [{ filename: 'src/domain/nemeth/parser.js' }, { filename: 'test/unit/nemeth/parser.test.js' }], mergeable: 'MERGEABLE', body: 'Fixes #5.', missing: [] };

test('a clean fix with green checks is set to merge', () => {
  assert.deepEqual(decide(clean), { action: 'merge' });
});

test('a fix may merge by itself only if every file is in the automatic zone of the map', () => {
  const outside = [
    '.github/workflows/pr-checks.yml', '.github/contributors.yml', '.github/prompts/agent.md',
    'scripts/ci/hand-off.mjs', 'scripts/nemeth-coverage.mjs', 'scripts/lab/x.mjs', 'test/helpers/mathml-compare.js', 'test/unit/pipeline/hand-off.test.js', 'CODEOWNERS', '.github/CODEOWNERS',
    '.claude/settings.json', '.claude/skills/pipeline-change/SKILL.md', 'package.json', 'package-lock.json',
    'electron-builder.yml', '.npmrc', 'CLAUDE.md', 'test/corpus/nemeth-v1.json', 'test/corpus/sources/Nemeth_2022.txt'
  ];
  for (const filename of outside) {
    assert.deepEqual(
      decide({ ...clean, files: [...clean.files, { filename }] }),
      { action: 'protected', reason: 'automation' },
      filename
    );
  }
});

test('a file renamed OUT of a place a fix may not touch is protected, whatever it is called now', () => {
  const renamed = { filename: 'docs/old-ci.mjs', previous_filename: 'scripts/ci/verify-branch.mjs', status: 'renamed' };
  assert.deepEqual(decide({ ...clean, files: [renamed] }), { action: 'protected', reason: 'automation' });
  assert.deepEqual(
    decide({ ...clean, files: [{ filename: '.github/workflows/x.yml', previous_filename: 'docs/x.yml' }] }),
    { action: 'protected', reason: 'automation' }
  );
});

test('the allowlist fails closed on a path that is odd, empty or only looks like a safe one', () => {
  for (const odd of ['', undefined, '/src/a.js', 'src/../.github/workflows/a.yml', 'src\\..\\x', 'Src/a.js', 'srcs/a.js', './src/a.js', 'docs']) {
    assert.equal(protectedPath(odd), true, String(odd));
  }
  for (const fine of ['src/domain/nemeth/parser.js', 'test/unit/nemeth/parser.test.js', 'docs/nemeth-v2/coverage.md', 'test/e2e/x.test.js']) {
    assert.equal(protectedPath(fine), false, fine);
  }
});

test('a fix that deletes a test file is protected', () => {
  assert.deepEqual(
    decide({ ...clean, files: [...clean.files, { filename: 'test/unit/nemeth/old.test.js', status: 'removed' }] }),
    { action: 'protected', reason: 'test-removed' }
  );
  // Deleting source is ordinary.
  assert.equal(decide({ ...clean, files: [{ filename: 'src/domain/old.js', status: 'removed' }] }).action, 'merge');
});

test('a change that was not listed in full is protected, because part of it was never looked at', () => {
  assert.deepEqual(decide({ ...clean, filesComplete: false }), { action: 'protected', reason: 'automation' });
  assert.deepEqual(decide({ ...clean, filesComplete: undefined }), { action: 'protected', reason: 'automation' });
});

test('a test file that loses more lines than it gains is protected, one that grows is not', () => {
  const edit = (additions, deletions) => ({ ...clean, files: [...clean.files, { filename: 'test/unit/nemeth/parser.test.js', status: 'modified', additions, deletions }] });
  assert.deepEqual(decide(edit(2, 9)), { action: 'protected', reason: 'test-weakened' });
  assert.equal(decide(edit(9, 2)).action, 'merge');
  assert.equal(decide(edit(4, 4)).action, 'merge', 'an expectation that changed with the behaviour is ordinary');
  // Source and docs may shrink.
  assert.equal(decide({ ...clean, files: [{ filename: 'src/domain/a.js', status: 'modified', additions: 1, deletions: 30 }] }).action, 'merge');
});

test('hand-off sends the fix to the maintainer when the file list and the file count disagree', () => {
  const f = fakeGh({ files: [{ filename: 'src/a.js' }], changedFiles: 4 });
  const result = handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP' }, f.gh);
  assert.equal(result.merge, false);
  assert.equal(result.reason, 'automation');
  const lines = f.calls.map((c) => c.line);
  assert.ok(!lines.some((l) => l.includes('--auto')), 'auto-merge is not asked for');
  assert.ok(!lines.some((l) => l.startsWith('api repos/a/b/statuses/')), 'the status is not set');
});

test('hand-off sends the fix to the maintainer when the branch moved while it was being checked', () => {
  const calls = [];
  let views = 0;
  const gh = (args, options = {}) => {
    calls.push({ line: args.join(' '), token: options.token });
    if (args[0] === 'pr' && args[1] === 'view') {
      views += 1;
      return JSON.stringify({ headRefOid: views === 1 ? 'abc123' : 'def456', mergeable: 'MERGEABLE', body: '', changedFiles: 1 });
    }
    if (args[1]?.includes('/check-runs')) {
      return ['unit', 'nemeth', 'e2e'].map((name) => JSON.stringify({ name, conclusion: 'success', completed_at: '2026-10-10T10:00:00Z' })).join('\n');
    }
    if (args[1]?.includes('/files')) return JSON.stringify({ filename: 'src/a.js' });
    return '';
  };
  const result = handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP' }, gh);
  assert.equal(result.merge, false);
  assert.equal(result.reason, 'moved');
  const lines = calls.map((c) => c.line);
  assert.ok(!lines.some((l) => l.includes('--auto')), 'auto-merge is not asked for');
  assert.ok(!lines.some((l) => l.startsWith('api repos/a/b/statuses/')), 'the status is not set');
});

test('only the pipeline\'s own branch in this repository, into testing, can merge by itself', () => {
  assert.deepEqual(decide({ ...clean, fixBranch: false }), { action: 'protected', reason: 'not-a-fix-branch' });
  assert.deepEqual(decide({ ...clean, fixBranch: undefined }), { action: 'protected', reason: 'not-a-fix-branch' });
  for (const viewOverride of [{ isCrossRepository: true }, { baseRefName: 'main' }, { headRefName: 'feature/x' }, { state: 'CLOSED' }]) {
    const f = fakeGh({ files: [{ filename: 'src/a.js' }], viewOverride });
    const result = handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP' }, f.gh);
    assert.equal(result.merge, false, JSON.stringify(viewOverride));
    assert.equal(result.reason, 'not-a-fix-branch');
    assert.ok(!f.calls.some((c) => c.line.includes('--auto')), 'auto-merge is not asked for');
  }
});

test('a test file moved out of test/ counts as deleted', () => {
  const moved = { filename: 'src/old.test.js', previous_filename: 'test/unit/old.test.js', status: 'renamed', additions: 0, deletions: 0 };
  assert.deepEqual(decide({ ...clean, files: [...clean.files, moved] }), { action: 'protected', reason: 'test-removed' });
  const kept = { filename: 'test/unit/new-name.test.js', previous_filename: 'test/unit/old.test.js', status: 'renamed', additions: 0, deletions: 0 };
  assert.equal(decide({ ...clean, files: [...clean.files, kept] }).action, 'merge');
});

test('taking the pull request out of draft uses the App token, never the built-in one', () => {
  for (const files of [[{ filename: 'src/a.js' }], [{ filename: '.github/workflows/x.yml' }]]) {
    const f = fakeGh({ files });
    handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP' }, f.gh);
    const ready = f.calls.find((c) => c.line.startsWith('pr ready 9'));
    assert.ok(ready, 'the pull request is taken out of draft');
    assert.equal(ready.token, 'APP');
  }
  const f = fakeGh({ files: [{ filename: 'src/a.js' }] });
  assert.throws(() => handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner' }, f.gh), /MERGE_TOKEN/);
  assert.ok(!f.calls.some((c) => c.line.startsWith('pr ready')), 'nothing is done without the token');
});

test('a conflicting pull request is protected', () => {
  assert.deepEqual(decide({ ...clean, mergeable: 'CONFLICTING' }), { action: 'protected', reason: 'conflict' });
});

test('a body that reverses a standing note is protected, on its own line only', () => {
  assert.deepEqual(
    decide({ ...clean, body: 'Fixes #5.\n\n## reverses a standing note\nCLAUDE.md said not to.' }),
    { action: 'protected', reason: 'standing-note' }
  );
  for (const heading of ['# Reverses a standing note', '###Reverses a standing note', '  ## REVERSES A STANDING NOTE']) {
    assert.equal(decide({ ...clean, body: `Fixes #5.\n\n${heading}\nx` }).reason, 'standing-note', heading);
  }
  assert.equal(decide({ ...clean, body: 'This does not reverse a standing note.' }).action, 'merge');
});

test('checks that are not green hold a clean fix, with the names', () => {
  assert.deepEqual(decide({ ...clean, missing: ['e2e'] }), { action: 'not-green', missing: ['e2e'] });
});

test('protected wins over not green, because the maintainer reads it either way', () => {
  assert.equal(decide({ ...clean, mergeable: 'CONFLICTING', missing: ['unit'] }).action, 'protected');
});

// handOff() with a stand-in for `gh`: the ORDER and the TOKENS matter.
function fakeGh({ files, changedFiles, viewOverride, mergeable = 'MERGEABLE', body = '', conclusion = 'success' }) {
  const calls = [];
  const gh = (args, options = {}) => {
    calls.push({ line: args.join(' '), token: options.token });
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ headRefOid: 'abc123', mergeable, body, changedFiles: changedFiles ?? files.length, isCrossRepository: false, baseRefName: 'testing', headRefName: 'claude/fix-5-x', state: 'OPEN', ...viewOverride });
    if (args[1]?.includes('/check-runs')) {
      return ['unit', 'nemeth', 'e2e'].map((name) => JSON.stringify({ name, conclusion, completed_at: '2026-10-10T10:00:00Z' })).join('\n');
    }
    if (args[1]?.includes('/files')) return files.map((f) => JSON.stringify(f)).join('\n');
    return '';
  };
  return { gh, calls };
}

test('a clean fix: the status is set, then auto-merge is asked for with the merge token, pinned to the commit', () => {
  const f = fakeGh({ files: [{ filename: 'src/a.js' }] });
  const result = handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP' }, f.gh);
  assert.equal(result.merge, true);
  const lines = f.calls.map((c) => c.line);
  const status = lines.findIndex((l) => l.startsWith('api repos/a/b/statuses/abc123') && l.includes('context=contributor-tested') && l.includes('state=success'));
  const merge = lines.findIndex((l) => l.startsWith('pr merge 9') && l.includes('--auto') && l.includes('--squash') && l.includes('--match-head-commit abc123'));
  assert.ok(status >= 0 && merge > status, 'the status comes first');
  assert.equal(f.calls[merge].token, 'APP');
  assert.equal(f.calls[status].token, 'APP', 'the status is posted with the App token, not the built-in one');
  assert.ok(f.calls.some((c) => c.line.includes('issues/5/comments') && c.line.includes('merge by itself')));
  assert.ok(!lines.some((l) => l.includes('ready-for-maintainer')));
});

test('a protected fix: no status, no auto-merge, needs-owner, and the maintainer is asked', () => {
  const f = fakeGh({ files: [{ filename: '.github/workflows/x.yml' }] });
  const result = handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP' }, f.gh);
  assert.equal(result.merge, false);
  const lines = f.calls.map((c) => c.line);
  assert.ok(!lines.some((l) => l.includes('statuses/') || l.startsWith('pr merge')));
  assert.ok(lines.some((l) => l.includes('--add-label needs-owner')));
  assert.ok(lines.some((l) => l.includes('pulls/9/requested_reviewers') && l.includes('reviewers[]=owner')));
  assert.ok(lines.some((l) => l.includes('issues/5/comments') && l.includes('changes the automation itself')));
});

test('a fix whose checks are not green is not set to merge and is not taken out of draft', () => {
  const f = fakeGh({ files: [{ filename: 'src/a.js' }], conclusion: 'failure' });
  const result = handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP' }, f.gh);
  assert.equal(result.sent, false);
  const lines = f.calls.map((c) => c.line);
  assert.ok(!lines.some((l) => l.includes('statuses/') || l.startsWith('pr merge') || l.startsWith('pr ready')));
  assert.ok(lines.some((l) => l.includes('--add-label needs-owner')));
});

test('with no merge token it refuses before it sets the status', () => {
  const f = fakeGh({ files: [{ filename: 'src/a.js' }] });
  assert.throws(() => handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner' }, f.gh), /MERGE_TOKEN/);
  assert.ok(!f.calls.some((c) => c.line.includes('statuses/')));
});

test('a conflicting fix is not sent to the maintainer: the contributor is told it is being brought up to date', () => {
  const f = fakeGh({ files: [{ filename: 'src/a.js' }], mergeable: 'CONFLICTING' });
  const result = handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP' }, f.gh);
  assert.equal(result.reason, 'conflict');
  assert.equal(result.merge, false);
  const lines = f.calls.map((c) => c.line);
  assert.ok(f.calls.some((c) => c.line.includes('issues/5/comments') && c.line.includes('bringing it up to date')), 'the contributor is told');
  assert.ok(!lines.some((l) => l.includes('needs-owner')), 'no person is needed');
  assert.ok(!lines.some((l) => l.includes('statuses/abc123')), 'no lock is set');
  assert.ok(!lines.some((l) => l.startsWith('pr merge')), 'nothing merges');
  assert.ok(!lines.some((l) => l.startsWith('pr ready')), 'it stays a draft');
  assert.ok(!lines.some((l) => l.startsWith('workflow run')), 'this job starts nothing; the next job does');
});

test('a confirmation no agent read is pinned: any head commit but the one the gate saw is not merged', () => {
  const same = fakeGh({ files: [{ filename: 'src/a.js' }] });
  assert.equal(handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP', expectedSha: 'abc123' }, same.gh).merge, true);
  const other = fakeGh({ files: [{ filename: 'src/a.js' }] });
  const result = handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP', expectedSha: 'def456' }, other.gh);
  assert.equal(result.merge, false);
  assert.equal(result.reason, 'moved');
  assert.ok(!other.calls.some((c) => c.line.includes('statuses/') || c.line.startsWith('pr merge')));
});

// Merge first (`confirmed: false`): the checks are green and nobody has tried the fix yet.
const first = (f, extra = {}) => handOff({ issue: 5, pr: 9, repo: 'a/b', reviewer: 'owner', mergeToken: 'APP', confirmed: false, ...extra }, f.gh);

test('merge first: a clean green fix merges without closing the issue, and the issue hears nothing yet', () => {
  const f = fakeGh({ files: [{ filename: 'src/a.js' }], body: 'What changed.\n\nFixes #5\n' });
  const result = first(f);
  assert.equal(result.merge, true);
  assert.equal(OPEN_LINE, 'Fix for');
  const lines = f.calls.map((c) => c.line);
  const status = lines.findIndex((l) => l.startsWith('api repos/a/b/statuses/abc123') && l.includes('context=contributor-tested') && l.includes('alpha'));
  const body = lines.findIndex((l) => l.startsWith('api -X PATCH repos/a/b/pulls/9') && l.includes('body=What changed.\n\nFix for #5\n'));
  const merge = lines.findIndex((l) => l.startsWith('pr merge 9') && l.includes('--body Fix for #5') && l.includes('--match-head-commit abc123'));
  assert.ok(status >= 0 && body > status && merge > body, 'status, then the closing line is taken out, then the merge');
  assert.equal(f.calls[body].token, 'APP');
  assert.ok(!lines.some((l) => /Fixes #5/.test(l) && l.startsWith('pr merge')), 'the merge must not close the issue');
  assert.ok(!lines.some((l) => l.includes('issues/5/comments')), 'the contributor hears when the alpha holds it, not now');
  assert.ok(lines.some((l) => l.startsWith('pr comment 9') && l.includes('Merge first')));
});

test('merge first: a fix that is not ready says nothing and changes nothing', () => {
  for (const f of [
    fakeGh({ files: [{ filename: 'src/a.js' }], conclusion: 'failure' }),
    fakeGh({ files: [{ filename: 'src/a.js' }], mergeable: 'CONFLICTING' })
  ]) {
    const result = first(f);
    assert.equal(result.merge, false);
    const writes = f.calls.map((c) => c.line).filter((l) => !l.startsWith('pr view') && !l.startsWith('api repos/a/b/commits/') && !l.startsWith('api repos/a/b/pulls/9/files'));
    assert.deepEqual(writes, [], 'no label, no comment, no status, no draft change');
  }
});

test('merge first: a fix a person must read is held, and the contributor is told once', () => {
  const f = fakeGh({ files: [{ filename: '.github/workflows/x.yml' }] });
  const result = first(f);
  assert.equal(result.merge, false);
  assert.equal(result.sent, true);
  const lines = f.calls.map((c) => c.line);
  assert.ok(!lines.some((l) => l.includes('statuses/') || l.startsWith('pr merge')));
  assert.ok(lines.some((l) => l.includes('--add-label needs-owner')));
  assert.ok(lines.some((l) => l.includes('issues/5/comments') && l.includes('state held')));
  // The label says it was told. The next run says nothing.
  const again = fakeGh({ files: [{ filename: '.github/workflows/x.yml' }], viewOverride: { labels: [{ name: 'needs-owner' }] } });
  first(again);
  assert.deepEqual(again.calls.map((c) => c.line).filter((l) => !l.startsWith('pr view') && (l.includes('comment') || l.includes('label') || l.startsWith('pr ready'))), []);
});

test('merge first: a stale needs-owner does not stop a fix that is now clean and green', () => {
  const f = fakeGh({ files: [{ filename: 'src/a.js' }], viewOverride: { labels: [{ name: 'needs-owner' }] } });
  assert.equal(first(f).merge, true);
});

test('fixIssue: only the pipeline\'s own fix branches into testing, opened by the pipeline, naming one issue', () => {
  const pr = { isCrossRepository: false, baseRefName: 'testing', headRefName: 'claude/fix-5-x', body: 'x\n\nFixes #5', author: { login: 'app/omniya-pipeline' } };
  assert.equal(fixIssue(pr), '5');
  assert.equal(fixIssue({ ...pr, body: 'x\n\nFix for #5' }), '5', 'a fix handed off before is still a fix');
  for (const login of ['app/github-actions', 'omniya-bot', 'omniya-pipeline[bot]']) assert.equal(fixIssue({ ...pr, author: { login } }), '5', login);
  assert.equal(fixIssue({ ...pr, author: { login: 'boss' } }, 'boss'), '5', 'the owner');
  assert.equal(fixIssue({ ...pr, author: { login: 'listed-contributor' } }, 'boss'), '', 'anyone else with write access waits for the owner');
  assert.equal(fixIssue({ ...pr, author: undefined }), '');
  assert.equal(fixIssue({ ...pr, isCrossRepository: true }), '');
  assert.equal(fixIssue({ ...pr, baseRefName: 'main' }), '');
  assert.equal(fixIssue({ ...pr, headRefName: 'pipeline/x' }), '');
  assert.equal(fixIssue({ ...pr, headRefName: 'claude/fix-6-x' }), '', 'the branch names another issue');
  assert.equal(fixIssue({ ...pr, headRefName: 'claude/fix-55-x' }), '', '#5 is not #55');
});

test('handedOff: the merge status on the CURRENT head, nothing else', () => {
  assert.equal(handedOff({ statusCheckRollup: [{ context: 'contributor-tested', state: 'SUCCESS' }] }), true);
  assert.equal(handedOff({ statusCheckRollup: [{ context: 'contributor-tested', state: 'PENDING' }] }), false);
  assert.equal(handedOff({ statusCheckRollup: [{ name: 'unit', conclusion: 'SUCCESS' }] }), false);
  assert.equal(handedOff({}), false);
});

// mergeGreen() over a list of pull requests, each with its own issue.
function listGh(prs, issues, failOn = 0) {
  const calls = [];
  const gh = (args, options = {}) => {
    calls.push({ line: args.join(' '), token: options.token });
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(prs);
    const issue = /^repos\/a\/b\/issues\/(\d+)$/.exec(args[1] ?? '');
    if (args[0] === 'api' && issue) {
      if (Number(issue[1]) === failOn) throw new Error('boom');
      return JSON.stringify(issues[issue[1]]);
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      const pr = prs.find((p) => String(p.number) === args[2]);
      return JSON.stringify({ headRefOid: 'abc123', mergeable: 'MERGEABLE', body: pr.body, changedFiles: 1, isCrossRepository: false, baseRefName: 'testing', headRefName: pr.headRefName, state: 'OPEN', labels: [] });
    }
    if (args[1]?.includes('/check-runs')) return ['unit', 'nemeth', 'e2e'].map((name) => JSON.stringify({ name, conclusion: 'success', completed_at: 'x' })).join('\n');
    if (args[1]?.includes('/files')) return JSON.stringify({ filename: 'src/a.js' });
    return '';
  };
  return { gh, calls };
}
const fixPr = (number, issue, over = {}) => ({ number, body: `x\n\nFixes #${issue}`, headRefName: `claude/fix-${issue}-x`, isCrossRepository: false, baseRefName: 'testing', author: { login: 'app/omniya-pipeline' }, statusCheckRollup: [], ...over });

test('mergeGreen: every open fix is looked at; closed issues, design questions and other branches are left alone', () => {
  const prs = [fixPr(9, 5), fixPr(10, 6), fixPr(11, 7), fixPr(12, 8, { headRefName: 'product/x' }), fixPr(13, 4)];
  const issues = { 5: { state: 'open', labels: [] }, 6: { state: 'closed', labels: [] }, 7: { state: 'open', labels: [{ name: 'needs-design' }] }, 4: { state: 'open', labels: [] } };
  const g = listGh(prs, issues, 4);
  const results = mergeGreen({ repo: 'a/b', mergeToken: 'APP', reviewer: 'owner' }, g.gh);
  assert.deepEqual(results.map((r) => [r.pr, r.outcome.split(':')[0]]), [[9, 'merging'], [10, 'skip'], [11, 'skip'], [13, 'error']]);
  assert.equal(g.calls.filter((c) => c.line.startsWith('pr merge')).length, 1);
  assert.ok(g.calls.some((c) => c.line.startsWith('pr merge 9')));
});

test('mergeGreen: one pull request only, when asked', () => {
  const g = listGh([fixPr(9, 5), fixPr(10, 6)], { 5: { state: 'open', labels: [] }, 6: { state: 'open', labels: [] } });
  assert.deepEqual(mergeGreen({ repo: 'a/b', mergeToken: 'APP', reviewer: 'owner', only: '10' }, g.gh).map((r) => r.pr), [10]);
});

test('mergeGreen: a head that moved after its hand-off is handed off again; the same head is left alone', () => {
  const issues = { 5: { state: 'open', labels: [] }, 6: { state: 'open', labels: [] } };
  const done = [{ context: 'contributor-tested', state: 'SUCCESS' }];
  const g = listGh([fixPr(9, 5, { body: 'x\n\nFix for #5' }), fixPr(10, 6, { body: 'x\n\nFix for #6', statusCheckRollup: done })], issues);
  const results = mergeGreen({ repo: 'a/b', mergeToken: 'APP', reviewer: 'owner' }, g.gh);
  assert.deepEqual(results.map((r) => [r.pr, r.outcome]), [[9, 'merging'], [10, 'skip: this commit was handed off']]);
  const lines = g.calls.map((c) => c.line);
  assert.ok(lines.some((l) => l.startsWith('pr merge 9') && l.includes('--body Fix for #5')));
  assert.ok(!lines.some((l) => l.startsWith('api -X PATCH')), 'the closing line was already changed: no second edit');
});

test('mergeGreen: a fix branch someone else opened is not merged first', () => {
  const g = listGh([fixPr(9, 5, { author: { login: 'listed-contributor' } })], { 5: { state: 'open', labels: [] } });
  assert.deepEqual(mergeGreen({ repo: 'a/b', mergeToken: 'APP', reviewer: 'owner' }, g.gh), []);
  assert.ok(!g.calls.some((c) => c.line.startsWith('pr merge')));
});
