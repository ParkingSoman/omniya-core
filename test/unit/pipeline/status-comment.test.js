import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHOR,
  MARKER,
  NOTIFY,
  STATES,
  findStatusComment,
  renderNotice,
  renderStatus
} from '../../../scripts/ci/status-comment.mjs';

test('every state renders and starts with the marker', () => {
  for (const state of STATES) {
    const text = renderStatus(state, { repo: 'a/b', pr: 7 });
    assert.ok(text.startsWith(MARKER), state);
  }
});

test('the ready state carries one link per platform, as link text, for pull request 7', () => {
  const text = renderStatus('ready', { repo: 'a/b', pr: 7 });
  assert.match(text, /\[Download for Mac, Apple Silicon\]\(https:\/\/github\.com\/a\/b\/releases\/download\/pr-7\/Omniya-Core-mac-arm64\.zip\)/);
  assert.match(text, /\[Download for Windows\]\(https:\/\/github\.com\/a\/b\/releases\/download\/pr-7\/Omniya-Core-Setup-x64\.exe\)/);
  // The contributor is told the two things to write, and that the links do not change.
  assert.match(text, /@claude/);
  assert.match(text, /@claude it works/);
  assert.match(text, /links stay the same/);
});

test('only the ready state has download links, so no state can offer a build that is not checked', () => {
  for (const state of STATES.filter((s) => s !== 'ready')) {
    assert.doesNotMatch(renderStatus(state), /releases\/download/, state);
  }
});

test('the ready state refuses a pull request number that is not digits', () => {
  assert.throws(() => renderStatus('ready', { repo: 'a/b', pr: '7/../x' }), /digits/);
  assert.throws(() => renderStatus('ready', { repo: 'a/b' }), /digits/);
});

test('an unknown state is refused', () => {
  assert.throws(() => renderStatus('done'), /unknown state/);
});

test('no state talks about checks, logs, pull requests, files or branches', () => {
  // The reader is not a programmer and reads with a screen reader. A technical
  // word here is a word they have to ask someone about.
  for (const state of STATES) {
    const text = renderStatus(state, { repo: 'a/b', pr: 7 }).replace(MARKER, '').replace(/\(https[^)]*\)/g, '');
    assert.doesNotMatch(text, /pull request|branch|\blog\b|workflow|\.yml|\.js\b|\bPR\b/i, state);
  }
});

test('the status comment is found by marker AND author, and the newest one wins', () => {
  const comments = [
    { id: 1, login: AUTHOR, body: `${MARKER}\nold` },
    { id: 2, login: AUTHOR, body: 'an explanation from the agent' },
    { id: 3, login: 'somebody', body: `${MARKER}\npasted by a person` },
    { id: 4, login: AUTHOR, body: `${MARKER}\nnewer` }
  ];
  assert.equal(findStatusComment(comments).id, 4);
  assert.equal(findStatusComment(comments.slice(0, 3)).id, 1, 'a pasted marker from a person is ignored');
  assert.equal(findStatusComment([{ id: 9, login: AUTHOR, body: 'no marker' }]), undefined);
});

test('the agent explanation is never taken for the status comment', () => {
  // The reason `gh issue comment --edit-last` is not used: both are by the same bot.
  assert.equal(findStatusComment([{ id: 1, login: AUTHOR, body: 'I changed the letter rule.' }]), undefined);
});

test('an edit sends no notification, so the states that need one post a new comment', () => {
  // GitHub does not notify anybody when a comment is edited. A contributor who
  // cannot glance at the page would never learn the build is ready.
  assert.deepEqual(NOTIFY, ['ready', 'sent', 'maintainer', 'failed']);
  for (const state of NOTIFY) assert.ok(STATES.includes(state), state);
});

test('the notice has no marker, so it is never mistaken for the status comment', () => {
  for (const state of NOTIFY) {
    const notice = renderNotice(state, { repo: 'a/b', issue: 22, statusId: 99 });
    assert.ok(!notice.includes(MARKER), state);
    assert.equal(findStatusComment([{ id: 1, login: AUTHOR, body: notice }]), undefined, state);
  }
});

test('the ready notice points at the one comment that holds the links, and says what to write', () => {
  const notice = renderNotice('ready', { repo: 'a/b', issue: 22, statusId: 99 });
  assert.match(notice, /\[Open the download links\]\(https:\/\/github\.com\/a\/b\/issues\/22#issuecomment-99\)/);
  assert.match(notice, /@claude it works/);
  assert.doesNotMatch(notice, /releases\/download/, 'the links live in one place');
});

test('a state that has no notice is refused, and an id that is not digits is refused', () => {
  assert.throws(() => renderNotice('working'), /no notice/);
  assert.throws(() => renderNotice('ready', { repo: 'a/b', issue: 22, statusId: '9; x' }), /digits/);
});

test('no notice talks about checks, logs, pull requests, files or branches', () => {
  for (const state of NOTIFY) {
    const text = renderNotice(state, { repo: 'a/b', issue: 22, statusId: 99 }).replace(/\(https[^)]*\)/g, '');
    assert.doesNotMatch(text, /pull request|branch|\blog\b|workflow|\.yml|\.js\b|\bPR\b/i, state);
  }
});
