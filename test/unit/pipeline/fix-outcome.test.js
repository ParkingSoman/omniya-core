import assert from 'node:assert/strict';
import test from 'node:test';

import { decide, run } from '../../../scripts/ci/fix-outcome.mjs';
import { LABELS } from '../../../scripts/ci/reply.mjs';

test('a crashed agent job is a failure, whatever word it left', () => {
  assert.equal(decide('failure', ''), 'failed');
  assert.equal(decide('failure', 'asked'), 'failed');
});

test('a question is a question, and waits on the contributor', () => {
  assert.equal(decide('success', 'asked'), 'asked');
  // A person is not needed: the contributor is.
  assert.equal(LABELS.asked.name, 'needs-info');
});

test('a request for something new is a design decision', () => {
  assert.equal(decide('success', 'needs-design'), 'design');
  assert.equal(LABELS.design.name, 'needs-design');
});

test('blocked needs a person, and says why', () => {
  assert.equal(decide('success', 'blocked'), 'stuck');
});

test('a word that is not known is a failure, never a quiet hand-off', () => {
  // `stopped` no longer exists. The agent job fails on it before this runs, so
  // reaching here with it means something is wrong with the pipeline.
  assert.equal(decide('success', 'stopped'), 'failed');
  assert.equal(decide('success', ''), 'failed');
  assert.equal(decide('success', 'anything else'), 'failed');
});

test('both states that need a person label the issue for the maintainer', () => {
  assert.equal(LABELS.stuck.name, 'needs-owner');
  assert.equal(LABELS.failed.name, 'needs-owner');
});

test('it posts exactly one reply, with the agent words in it', () => {
  const posted = [];
  const out = run({ issue: 33, jobResult: 'success', word: 'asked', repo: 'a/b', message: 'Which key?' }, (args) => posted.push(args));
  assert.equal(out.state, 'asked');
  assert.deepEqual(posted, [{ issue: '33', state: 'asked', repo: 'a/b', message: 'Which key?' }]);
});
