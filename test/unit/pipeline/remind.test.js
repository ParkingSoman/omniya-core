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

const ask = (over = {}) => needsReminder({ labels: [], comments: [bot(1, 'started', 9), bot(2, 'in-alpha', 8)], now: NOW, ...over });

test('a fix a week in the alpha, with no word since, gets the reminder', () => {
  assert.deepEqual(ask(), { remind: true, reason: 'quiet-for-a-week' });
});

test('six days is not a week', () => {
  assert.equal(QUIET_DAYS, 7);
  assert.deepEqual(ask({ comments: [bot(2, 'in-alpha', 6)] }), { remind: false, reason: 'not-quiet-long-enough' });
});

test('anything newer than the alpha notice means the conversation moved on', () => {
  const moved = (c) => assert.equal(ask({ comments: [bot(2, 'in-alpha', 9), c] }).reason, 'newest-comment-is-not-in-alpha');
  moved(person(3, 'I will try it tonight', 8));
  moved(bot(3, 'reminded', 1));
  moved(bot(3, 'started', 1));
  // A person cannot write the alpha notice: only the bot's counts.
  assert.equal(ask({ comments: [{ ...bot(2, 'in-alpha', 9), user: { login: 'someone' } }] }).reason, 'newest-comment-is-not-in-alpha');
  // Only the alpha notice asks the contributor to try something now.
  for (const state of ['ready', 'revised', 'held', 'maintainer', 'closed']) {
    assert.equal(ask({ comments: [bot(2, state, 9)] }).remind, false, state);
  }
});

test('a person or an answer is awaited: no reminder', () => {
  for (const label of ['needs-owner', 'needs-maintainer', 'needs-info', 'needs-design']) {
    assert.deepEqual(ask({ labels: [label] }), { remind: false, reason: 'a-person-or-an-answer-is-awaited' }, label);
  }
});

test('the reminder carries the alpha links, and a plain "it works" after it closes the issue', () => {
  const body = renderReply('reminded', { repo: 'o/r' });
  assert.equal(replyState(body), 'reminded');
  assert.match(body, /releases\/download\/testing-app\/Omniya-Core-mac-arm64\.zip/);
  assert.match(body, /only reminder/);
  const comments = [bot(2, 'in-alpha', 9), bot(3, 'reminded', 1)];
  const said = decide({ commenter: 'blind-user', issueAuthor: 'blind-user', association: 'CONTRIBUTOR', prCount: 0, commentId: 100, issueComments: comments, headBuiltAt: '' });
  assert.deepEqual(said, { confirm: true, close: true, reason: 'ok-alpha' });
});

// A stand-in for `gh`: open issues with labels and comments, and every post recorded.
function fakeGh(issues) {
  const posts = [];
  const run = (args) => {
    if (args[0] === 'issue' && args[1] === 'list') return JSON.stringify(issues.map((i) => ({ number: i.number, labels: (i.labels ?? []).map((name) => ({ name })) })));
    const path = args.find((a) => a.startsWith('repos/')) ?? '';
    const m = /issues\/(\d+)\/comments$/.exec(path);
    if (m && args.includes('-f')) {
      const issue = issues.find((i) => String(i.number) === m[1]);
      if (issue.fail) throw new Error('boom');
      const body = args.find((a) => a.startsWith('body=')).slice(5);
      posts.push({ issue: issue.number, body });
      issue.comments.push({ id: 999, created_at: new Date(NOW).toISOString(), body, user: { login: 'github-actions[bot]' } });
      return '';
    }
    if (m) {
      const issue = issues.find((i) => String(i.number) === m[1]);
      if (issue.failRead) throw new Error('read failed');
      return issue.comments.map((c) => JSON.stringify(c)).join('\n');
    }
    if (args[0] === 'label' || args[0] === 'issue') return '';
    throw new Error('unexpected gh call: ' + args.join(' '));
  };
  return { run, posts };
}

const quiet = () => ({ number: 11, comments: [bot(1, 'in-alpha', 8)] });
const fresh = () => ({ number: 12, comments: [bot(1, 'in-alpha', 2)] });
const held = () => ({ number: 13, labels: ['needs-owner'], comments: [bot(1, 'in-alpha', 9)] });

test('whole path: the quiet issue is reminded once, and the others are left alone', () => {
  const g = fakeGh([quiet(), fresh(), held()]);
  const results = remindAll({ repo: 'o/r', now: NOW }, g.run);
  assert.deepEqual(results.map((r) => [r.issue, r.outcome]), [[11, 'reminded'], [12, 'skip'], [13, 'skip']]);
  assert.equal(g.posts.length, 1);
  assert.equal(replyState(g.posts[0].body), 'reminded');
});

test('whole path: the second run does not remind again', () => {
  const issues = [quiet()];
  const g = fakeGh(issues);
  remindAll({ repo: 'o/r', now: NOW }, g.run);
  remindAll({ repo: 'o/r', now: NOW + 30 * DAY }, g.run);
  assert.equal(g.posts.length, 1);
});

test('whole path: a dry run says what it would do and posts nothing', () => {
  const g = fakeGh([quiet()]);
  assert.deepEqual(remindAll({ repo: 'o/r', now: NOW, dry: true }, g.run).map((r) => r.outcome), ['would-remind']);
  assert.equal(g.posts.length, 0);
});

test('whole path: a failure on one issue does not stop the next', () => {
  const g = fakeGh([{ ...quiet(), number: 10, failRead: true }, quiet()]);
  const results = remindAll({ repo: 'o/r', now: NOW }, g.run);
  assert.match(results[0].reason, /^error: read failed/);
  assert.equal(results[1].outcome, 'reminded');
});
