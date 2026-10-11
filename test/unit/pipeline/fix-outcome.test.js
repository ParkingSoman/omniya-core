import assert from 'node:assert/strict';
import test from 'node:test';

import { decide } from '../../../scripts/ci/fix-outcome.mjs';

test('a crashed agent job is a failure, whatever word it left', () => {
  assert.deepEqual(decide('failure', ''), { state: 'failed', label: 'needs-maintainer' });
  assert.deepEqual(decide('failure', 'asked'), { state: 'failed', label: 'needs-maintainer' });
});

test('a question waits on the contributor, so it asks for no maintainer', () => {
  assert.deepEqual(decide('success', 'asked'), { state: 'asking', label: 'needs-info' });
});

test('a request for something new is a design decision and gets no maintainer label', () => {
  assert.deepEqual(decide('success', 'needs-design'), { state: 'design', label: null });
});

test('stopped, and any word that is not known, needs a person', () => {
  assert.deepEqual(decide('success', 'stopped'), { state: 'stuck', label: 'needs-maintainer' });
  assert.deepEqual(decide('success', ''), { state: 'stuck', label: 'needs-maintainer' });
});
