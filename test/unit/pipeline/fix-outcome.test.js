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

test('stopped, and any word that is not known, needs a person', () => {
  assert.equal(decide('success', 'stopped'), 'stuck');
  assert.equal(decide('success', ''), 'stuck');
  assert.equal(LABELS.stuck.name, 'needs-maintainer');
  assert.equal(LABELS.failed.name, 'needs-maintainer');
});

test('it posts exactly one reply, with the agent words in it', () => {
  const posted = [];
  const out = run({ issue: 33, jobResult: 'success', word: 'asked', repo: 'a/b', message: 'Which key?' }, (args) => posted.push(args));
  assert.equal(out.state, 'asked');
  assert.deepEqual(posted, [{ issue: '33', state: 'asked', repo: 'a/b', message: 'Which key?' }]);
});
