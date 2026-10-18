import assert from 'node:assert/strict';
import test from 'node:test';

import { decide, replyState } from '../../../scripts/ci/confirm.mjs';
import { needsReminder, QUIET_DAYS, remindAll } from '../../../scripts/ci/remind.mjs';
import { renderReply } from '../../../scripts/ci/reply.mjs';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const ago = (days) => new Date(NOW - days * DAY).toISOString();

const bot = (id, state, days) => ({ id, created_at: ago(days), body: renderReply(state, { repo: 'o/r', pr: 5, message: 'Some words.' }), user: { login: 'github-actions[bot]' } });
const person = (id, body, days, login = 'blind-user') => ({ id, created_at: ago(days), body, user: { login } });
const legacyNotice = (id, days) => ({ id, created_at: ago(days), body: '<!-- omniya-pipeline-notice --> A test build is ready. All the automatic checks passed.\n\n[Open the download links](https://example.com)\n\nTry it, then write here.', user: { login: 'github-actions[bot]' } });
const record = { body: 'The contributor installed the build and says it works.\n\nCommit tested: ' + 'a'.repeat(40) + '\n\nunit is green.', user: { login: 'github-actions[bot]' } };

const ask = (over = {}) => needsReminder({ issueLabels: [], prLabels: [], issueComments: [bot(1, 'started', 9), bot(2, 'ready', 8)], prComments: [], now: NOW, ...over });

test('a build notice a week old, with no word from the contributor, gets the reminder', () => {
  assert.deepEqual(ask(), { remind: true, reason: 'quiet-for-a-week', noticeId: 2 });
});

test('six days is not a week', () => {
  assert.equal(QUIET_DAYS, 7);
  assert.deepEqual(ask({ issueComments: [bot(2, 'ready', 6)] }), { remind: false, reason: 'not-quiet-long-enough' });
});

test('a later revised notice does not restart the count: the contributor was already asked', () => {
  assert.equal(ask({ issueComments: [bot(2, 'ready', 9), bot(3, 'revised', 1)] }).remind, true);
});

test('the notice from before the state line existed counts as a build notice', () => {
  assert.equal(ask({ issueComments: [legacyNotice(2, 8)] }).remind, true);
  // Only the exact start, and only from the bot.
  const forged = { ...legacyNotice(2, 8), user: { login: 'someone' } };
  assert.equal(ask({ issueComments: [forged] }).reason, 'newest-comment-is-not-a-build-notice');
});

test('a contributor who wrote since the notice is not quiet: the count starts after their last word', () => {
  const thread = [bot(1, 'ready', 20), person(2, '@claude it is still wrong', 10), bot(3, 'revised', 9)];
  assert.equal(ask({ issueComments: thread }).remind, true);
  assert.equal(ask({ issueComments: [...thread.slice(0, 2), bot(3, 'revised', 3)] }).reason, 'not-quiet-long-enough');
  // They wrote last: nothing is waiting on them.
  assert.equal(ask({ issueComments: [bot(1, 'ready', 20), person(2, 'thanks, trying it', 10)] }).reason, 'newest-comment-is-not-a-build-notice');
});

test('anything but a build notice as the newest comment means the contributor is not the one awaited', () => {
  for (const state of ['asked', 'maintainer', 'failed', 'design', 'stuck', 'behind', 'sent', 'carried', 'started']) {
    assert.equal(ask({ issueComments: [bot(2, 'ready', 9), bot(3, state, 8)] }).remind, false, state);
  }
});

test('one reminder, never a second', () => {
  const thread = [bot(1, 'ready', 20), bot(2, 'reminded', 12), bot(3, 'revised', 8)];
  assert.deepEqual(ask({ issueComments: thread }), { remind: false, reason: 'already-reminded' });
});

test('a fix that waits on a person or on an answer is left alone, on the issue or the pull request', () => {
  for (const label of ['needs-owner', 'needs-maintainer', 'needs-info', 'needs-design']) {
    assert.equal(ask({ issueLabels: [label] }).remind, false, `issue ${label}`);
    assert.equal(ask({ prLabels: [label] }).remind, false, `pr ${label}`);
  }
});

test('a fix the contributor already approved is waiting on the pipeline, not on them', () => {
  assert.deepEqual(ask({ prComments: [record] }), { remind: false, reason: 'already-approved' });
  // A person writing the record words is not the hand-off.
  assert.equal(ask({ prComments: [{ ...record, user: { login: 'someone' } }] }).remind, true);
});

test('the reminder has no links of its own, points to the notice, and a plain "it works" after it is judged as before', () => {
  const notice = 'https://github.com/o/r/issues/40#issuecomment-2';
  const text = renderReply('reminded', { repo: 'o/r', pr: 5, notice });
  assert.equal(replyState(text), 'reminded');
  assert.doesNotMatch(text, /releases\/download/);
  assert.match(text, /earlier comment: https:\/\/github\.com\/o\/r\/issues\/40#issuecomment-2/);
  assert.match(text, /only reminder/);
  assert.match(text, /If it works, write: it works/);
  // An address that is not one comment of a GitHub issue is left out, not repaired.
  assert.doesNotMatch(renderReply('reminded', { notice: 'https://evil.example/x' }), /evil/);
  assert.match(renderReply('reminded', { notice: 'javascript:alert(1)' }), /my earlier comment/);

  const reminder = { id: 9, created_at: ago(0), body: text, user: { login: 'github-actions[bot]' } };
  const says = { id: 10, created_at: ago(0), body: 'it works', user: { login: 'blind-user' } };
  const base = { commenter: 'blind-user', issueAuthor: 'blind-user', association: 'CONTRIBUTOR', prCount: 1, commentId: says.id };
  // The build was made before the notice, as the contributor tried it: accepted.
  assert.deepEqual(decide({ ...base, issueComments: [bot(1, 'ready', 9), reminder, says], headBuiltAt: ago(10) }), { confirm: true, reason: 'ok' });
  // The same rule as without the reminder: a build finished after the notice is still refused.
  assert.equal(decide({ ...base, issueComments: [bot(1, 'ready', 9), reminder, says], headBuiltAt: ago(1) }).reason, 'head-rebuilt-after-build-comment');
  // A reminder alone is not a build notice.
  assert.equal(decide({ ...base, issueComments: [reminder, says], headBuiltAt: ago(10) }).reason, 'no-bot-comment');
  // And a real answer after the notice still counts: a question after the reminder is refused.
  assert.equal(decide({ ...base, issueComments: [bot(1, 'ready', 9), reminder, bot(9.5, 'asked', 0), says], headBuiltAt: ago(10) }).reason, 'newest-not-a-build');
});

// The whole path, with GitHub faked: which pull requests are asked, and what is posted.
function fakeGh({ prs, issues }) {
  const posted = [];
  const run = (args) => {
    const [cmd, sub] = args;
    if (cmd === 'pr' && sub === 'list') return JSON.stringify(prs);
    if (cmd === 'api' && args[1].includes('/comments') && args.includes('-f')) {
      posted.push({ path: args[1], body: args[args.indexOf('-f') + 1] });
      return '';
    }
    if (cmd === 'api') {
      const m = /issues\/(\d+)(\/comments)?$/.exec(args[1]);
      const issue = issues[m[1]];
      // A pull request's own comments are asked for by its number: none, unless the test says so.
      if (m[2]) return (issue?.comments ?? []).map((c) => JSON.stringify(c)).join('\n');
      if (!issue) throw new Error(`no such issue ${m[1]}`);
      return JSON.stringify({ state: issue.state ?? 'open', labels: (issue.labels ?? []).map((name) => ({ name })) });
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
  return { run, posted };
}

const pr = (number, issue, extra = {}) => ({ number, body: `Fixes #${issue}`, headRefName: `claude/fix-${issue}-x`, isCrossRepository: false, labels: [], ...extra });

test('whole path: the quiet fix is reminded once, and the others are left alone', () => {
  const fake = fakeGh({
    prs: [pr(41, 40), pr(49, 39), pr(70, 69), pr(80, 80, { headRefName: 'feat/something' })],
    issues: {
      40: { comments: [bot(1, 'ready', 9)] },
      39: { comments: [bot(1, 'ready', 2)] },
      69: { comments: [bot(1, 'ready', 9)], state: 'closed' },
      5: { comments: [] }
    }
  });
  const results = remindAll({ repo: 'o/r', now: NOW }, fake.run);
  assert.deepEqual(results.map((r) => [r.pr, r.outcome, r.reason]), [
    [41, 'reminded', 'quiet-for-a-week'],
    [49, 'skip', 'not-quiet-long-enough'],
    [70, 'skip', 'issue-is-closed'],
    [80, 'skip', 'not-a-fix-pr']
  ]);
  assert.equal(fake.posted.length, 1);
  assert.match(fake.posted[0].path, /issues\/40\/comments$/);
  assert.equal(replyState(fake.posted[0].body.replace(/^body=/, '')), 'reminded');
  assert.match(fake.posted[0].body, /earlier comment: https:\/\/github\.com\/o\/r\/issues\/40#issuecomment-1\b/);
});

test('whole path: a dry run says what it would do and posts nothing', () => {
  const fake = fakeGh({ prs: [pr(41, 40)], issues: { 40: { comments: [bot(1, 'ready', 9)] } } });
  const results = remindAll({ repo: 'o/r', now: NOW, dry: true }, fake.run);
  assert.equal(results[0].outcome, 'would-remind');
  assert.equal(fake.posted.length, 0);
});

test('whole path: a failure on one pull request does not stop the next', () => {
  const fake = fakeGh({ prs: [pr(41, 99), pr(49, 39)], issues: { 39: { comments: [bot(1, 'ready', 9)] } } });
  const results = remindAll({ repo: 'o/r', now: NOW }, fake.run);
  assert.match(results[0].reason, /^error: /);
  assert.equal(results[1].outcome, 'reminded');
});

test('whole path: the second run does not remind again', () => {
  const comments = [bot(1, 'ready', 9)];
  const fake = fakeGh({ prs: [pr(41, 40)], issues: { 40: { comments } } });
  assert.equal(remindAll({ repo: 'o/r', now: NOW }, fake.run)[0].outcome, 'reminded');
  comments.push({ id: 2, created_at: ago(0), body: fake.posted[0].body.replace(/^body=/, ''), user: { login: 'github-actions[bot]' } });
  assert.deepEqual(remindAll({ repo: 'o/r', now: NOW }, fake.run).map((r) => r.reason), ['already-reminded']);
  assert.equal(fake.posted.length, 1);
});
