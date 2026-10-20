import assert from 'node:assert/strict';
import test from 'node:test';

import { replyState } from '../../../scripts/ci/confirm.mjs';
import { LOOK_BACK_DAYS, alreadyTold, namedIssue, tellAll } from '../../../scripts/ci/in-alpha.mjs';
import { renderReply } from '../../../scripts/ci/reply.mjs';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const ALPHA = 'a'.repeat(40);
const bot = (state, days) => ({ created_at: ago(days), body: renderReply(state, { repo: 'o/r', pr: 5 }), user: { login: 'github-actions[bot]' } });

test('the issue is read from the last line, merged first or confirmed', () => {
  assert.equal(namedIssue('What changed.\n\nFix for #12\n'), '12');
  assert.equal(namedIssue('What changed.\n\nFixes #12'), '12');
  assert.equal(namedIssue('Fix for #12 and more'), '');
  assert.equal(namedIssue('See #12'), '');
  assert.equal(namedIssue(''), '');
});

test('told once: an alpha notice or a close after the merge counts, an older one does not', () => {
  const merged = ago(2);
  assert.equal(alreadyTold([bot('in-alpha', 1)], merged), true);
  assert.equal(alreadyTold([bot('closed', 1)], merged), true);
  assert.equal(alreadyTold([bot('in-alpha', 3)], merged), false, 'that one was about an earlier fix');
  assert.equal(alreadyTold([bot('ready', 1)], merged), false);
  assert.equal(alreadyTold([{ ...bot('in-alpha', 1), user: { login: 'someone' } }], merged), false, 'only the bot speaks for the pipeline');
});

// A stand-in for `gh`.
function fakeGh({ prs, issues, holds = () => 'ahead', alpha = ALPHA }) {
  const posts = [];
  const run = (args) => {
    if (args[0] === 'run' && args[1] === 'list') return JSON.stringify(alpha ? [{ headSha: alpha }] : []);
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(prs);
    const path = args.find((a) => a.startsWith('repos/')) ?? '';
    const compare = /compare\/(\w+)\.\.\.(\w+)$/.exec(path);
    if (compare) return `${holds(compare[1], compare[2])}\n`;
    const comments = /issues\/(\d+)\/comments$/.exec(path);
    if (comments && args.includes('-f')) {
      const body = args.find((a) => a.startsWith('body=')).slice(5);
      posts.push({ issue: Number(comments[1]), body });
      issues[comments[1]].comments.push({ created_at: new Date(NOW).toISOString(), body, user: { login: 'github-actions[bot]' } });
      return '';
    }
    if (comments) return issues[comments[1]].comments.map((c) => JSON.stringify(c)).join('\n');
    const issue = /issues\/(\d+)$/.exec(path);
    if (issue) return JSON.stringify({ state: issues[issue[1]].state });
    if (args[0] === 'issue' || args[0] === 'label') return '';
    throw new Error('unexpected gh call: ' + args.join(' '));
  };
  return { run, posts };
}
const merged = (number, issue, days, over = {}) => ({
  number, title: `Read the sign (#${issue})`, body: `x\n\nFix for #${issue}`, headRefName: `claude/fix-${issue}-x`,
  isCrossRepository: false, mergedAt: ago(days), mergeCommit: { oid: String(number).padStart(40, '0') }, ...over
});

test('a merged fix whose issue is open and whose merge the alpha holds is told once, with the alpha links', () => {
  const issues = { 5: { state: 'open', comments: [bot('started', 3)] } };
  const g = fakeGh({ prs: [merged(9, 5, 1)], issues });
  assert.deepEqual(tellAll({ repo: 'o/r', now: NOW }, g.run).map((r) => r.outcome), ['told']);
  assert.equal(g.posts.length, 1);
  assert.equal(replyState(g.posts[0].body), 'in-alpha');
  assert.match(g.posts[0].body, /releases\/download\/testing-app\//);
  assert.match(g.posts[0].body, /The fix: Read the sign/);
  // The next run finds it told.
  tellAll({ repo: 'o/r', now: NOW }, g.run);
  assert.equal(g.posts.length, 1);
});

test('nothing is told when the alpha does not hold the merge yet, the issue is closed, or the fix is not the pipeline\'s', () => {
  const issues = { 5: { state: 'open', comments: [] }, 6: { state: 'closed', comments: [] }, 7: { state: 'open', comments: [] }, 8: { state: 'open', comments: [] } };
  const prs = [
    merged(9, 5, 1),
    merged(10, 6, 1),
    merged(11, 7, 1, { headRefName: 'product/x' }),
    merged(12, 8, 1, { isCrossRepository: true }),
    merged(13, 8, LOOK_BACK_DAYS + 1)
  ];
  const g = fakeGh({ prs, issues, holds: () => 'behind' });
  const results = tellAll({ repo: 'o/r', now: NOW }, g.run);
  assert.deepEqual(results.map((r) => [r.pr, r.outcome]), [[9, 'skip: the alpha does not hold it yet'], [10, 'skip: the issue is closed']]);
  assert.equal(g.posts.length, 0);
});

test('two fixes for one issue in the same alpha: one notice', () => {
  const issues = { 5: { state: 'open', comments: [] } };
  const g = fakeGh({ prs: [merged(10, 5, 1), merged(9, 5, 2)], issues });
  tellAll({ repo: 'o/r', now: NOW }, g.run);
  assert.equal(g.posts.length, 1);
});

test('with no published alpha nothing is told, and a dry run posts nothing', () => {
  const issues = { 5: { state: 'open', comments: [] } };
  const none = fakeGh({ prs: [merged(9, 5, 1)], issues, alpha: '' });
  assert.equal(tellAll({ repo: 'o/r', now: NOW }, none.run)[0].outcome, 'skip: no published alpha');
  const dry = fakeGh({ prs: [merged(9, 5, 1)], issues });
  assert.equal(tellAll({ repo: 'o/r', now: NOW, dry: true }, dry.run)[0].outcome, 'would tell');
  assert.equal(none.posts.length + dry.posts.length, 0);
});

test('merged fixes are asked for by merge date, so an old fix merged today is not missed', () => {
  const issues = { 5: { state: 'open', comments: [] } };
  const g = fakeGh({ prs: [merged(9, 5, 1)], issues });
  let listed;
  const run = (args) => { if (args[0] === 'pr' && args[1] === 'list') listed = args; return g.run(args); };
  tellAll({ repo: 'o/r', now: NOW, dry: true }, run);
  assert.equal(listed[listed.indexOf('--search') + 1], `merged:>=${new Date(NOW - LOOK_BACK_DAYS * DAY).toISOString().slice(0, 10)}`);
});
