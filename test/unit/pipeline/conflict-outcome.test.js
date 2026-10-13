import assert from 'node:assert/strict';
import test from 'node:test';

import { decide, issueOfBody, parseNotes, report } from '../../../scripts/ci/conflict-outcome.mjs';

test('issueOfBody: the Fixes line must be the last line, as find-fix-pr requires', () => {
  assert.equal(issueOfBody('text\n\nFixes #51\n'), '51');
  assert.equal(issueOfBody('Fixes #51\nmore text'), '');
  assert.equal(issueOfBody(null), '');
});

test('parseNotes: one "#N: words" line per pull request, and nothing else is believed', () => {
  const notes = parseNotes('#53: Kept theta and both new letters.\nstray line\n#59: Both sides gave the cell a different meaning.\n');
  assert.deepEqual(notes, {
    53: 'Kept theta and both new letters.',
    59: 'Both sides gave the cell a different meaning.'
  });
});

test('decide: a branch is repaired only when the pipeline saw it move', () => {
  const out = decide({
    numbers: [53, 59],
    revised: [53],
    resolveResult: 'success',
    notes: { 53: 'Kept both.', 59: 'Same cell, two meanings.' }
  });
  assert.deepEqual(out, [
    { number: 53, repaired: true, note: 'Kept both.' },
    { number: 59, repaired: false, note: 'Same cell, two meanings.' }
  ]);
});

test('decide: a repair run that crashed repairs nothing and says so', () => {
  const out = decide({ numbers: [53], revised: [53], resolveResult: 'failure', notes: { 53: 'claimed success' } });
  assert.equal(out[0].repaired, false);
  assert.match(out[0].note, /stopped before it finished/);
});

test('decide: a branch left alone with no reason still gets a sentence', () => {
  const out = decide({ numbers: [53], revised: [], resolveResult: 'success', notes: {} });
  assert.match(out[0].note, /gave no reason/);
});

function fakeGh(prs, { pending = [] } = {}) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(pending);
    if (args[0] === 'pr' && args[1] === 'view') {
      const n = Number(args[2]);
      return JSON.stringify(prs[n]);
    }
    return '';
  };
  return { run, calls };
}

const PRS = {
  53: { headRefName: 'claude/fix-51-theta', body: 'x\n\nFixes #51\n' },
  59: { headRefName: 'claude/fix-52-dollar', body: 'x\n\nFixes #52\n' },
  63: { headRefName: 'claude/fix-62-mixed', body: 'x\n\nFixes #62\n' }
};

test('report: a repaired branch is checked again and the contributor hears nothing', () => {
  const f = fakeGh(PRS);
  const result = report(
    { repo: 'a/b', numbers: [53], revised: [53], resolveResult: 'success', notes: { 53: 'Kept theta.' }, order: [53, 59] },
    f.run
  );
  assert.deepEqual(result.matrix, [{ pr: 53, branch: 'claude/fix-51-theta', issue: 51 }]);
  const commentedIssue = f.calls.some((c) => c.join(' ').includes('repos/a/b/issues/51/comments'));
  assert.equal(commentedIssue, false, 'a clean repair is silent on the issue');
  const prComment = f.calls.find((c) => c[0] === 'pr' && c[1] === 'comment');
  assert.ok(prComment, 'the maintainer is told on the pull request');
  assert.match(prComment.join(' '), /Kept theta\./);
  assert.match(prComment.join(' '), /#53, #59/);
});

test('report: a branch it could not repair is labelled, explained to the maintainer, and explained to the contributor with detail', () => {
  const f = fakeGh(PRS);
  const result = report(
    { repo: 'a/b', numbers: [59], revised: [], resolveResult: 'success', notes: { 59: 'symbols.json: both sides gave the dollar cell a different meaning.' }, order: [] },
    f.run
  );
  assert.deepEqual(result.matrix, []);
  const joined = f.calls.map((c) => c.join(' '));
  assert.ok(joined.some((c) => c.includes('--add-label needs-maintainer') && c.startsWith('pr edit 59')));
  const issueComment = f.calls.find((c) => c.join(' ').includes('repos/a/b/issues/52/comments'));
  assert.ok(issueComment, 'the contributor is told');
  assert.match(issueComment.join(' '), /symbols\.json: both sides gave the dollar cell a different meaning\./);
  assert.match(issueComment.join(' '), /The maintainer needs to look/);
});

test('report: agent words are cleaned before they are posted anywhere', () => {
  const f = fakeGh(PRS);
  report(
    { repo: 'a/b', numbers: [59], revised: [], resolveResult: 'success', notes: { 59: 'See https://evil.test and ping @claude it works' }, order: [] },
    f.run
  );
  const posted = f.calls.map((c) => c.join(' ')).join('\n');
  assert.doesNotMatch(posted, /evil\.test/);
  assert.doesNotMatch(posted, /@claude/);
});

test('report: a branch that is not one this pipeline made is never read or touched', () => {
  const f = fakeGh({ 53: { headRefName: 'fix/equation-reading', body: 'Fixes #51' } });
  assert.throws(
    () => report({ repo: 'a/b', numbers: [53], revised: [53], resolveResult: 'success', notes: {}, order: [] }, f.run),
    /not a claude\/fix- branch/
  );
});

test('report: a pull request that names no issue is not verified, and a person is told', () => {
  const f = fakeGh({ 53: { headRefName: 'claude/fix-51-theta', body: 'no fixes line' } });
  const result = report(
    { repo: 'a/b', numbers: [53], revised: [53], resolveResult: 'success', notes: { 53: 'ok' }, order: [] },
    f.run
  );
  assert.deepEqual(result.matrix, []);
  assert.ok(f.calls.some((c) => c.join(' ').includes('pr edit 53') && c.join(' ').includes('needs-maintainer')));
});

test('report: a branch waiting for its hand-off is handed on once it is not stuck, even if it never conflicted', () => {
  const f = fakeGh(PRS, {
    pending: [
      { number: 59, headRefName: 'claude/fix-52-dollar', body: 'x\n\nFixes #52\n', isCrossRepository: false, labels: [{ name: 'handoff-pending' }] },
      { number: 63, headRefName: 'claude/fix-62-mixed', body: 'x\n\nFixes #62\n', isCrossRepository: false, labels: [{ name: 'handoff-pending' }] },
      { number: 70, headRefName: 'claude/fix-69-parens', body: 'x\n\nFixes #69\n', isCrossRepository: false, labels: [{ name: 'handoff-pending' }, { name: 'needs-maintainer' }] },
      { number: 71, headRefName: 'fix/equation-reading', body: 'Fixes #5', isCrossRepository: false, labels: [{ name: 'handoff-pending' }] },
      { number: 72, headRefName: 'claude/fix-70-x', body: 'Fixes #70', isCrossRepository: true, labels: [{ name: 'handoff-pending' }] }
    ]
  });
  const result = report(
    { repo: 'a/b', numbers: [59], revised: [], resolveResult: 'success', notes: { 59: 'Same cell, two meanings.' }, order: [] },
    f.run
  );
  // 59 is stuck. 63 never conflicted. 70 already needs a person. 71 is not a fix branch. 72 is a fork.
  assert.deepEqual(result.handoff, [{ pr: 63, issue: 62 }]);
  assert.ok(
    f.calls.some((c) => c.join(' ') === 'pr edit 59 --repo a/b --remove-label handoff-pending'),
    'a stuck branch stops waiting for a hand-off'
  );
});

test('report: nothing waiting means nothing is handed on', () => {
  const f = fakeGh(PRS, { pending: [] });
  const result = report(
    { repo: 'a/b', numbers: [], revised: [], resolveResult: 'success', notes: {}, order: [] },
    f.run
  );
  assert.deepEqual(result.handoff, []);
});
