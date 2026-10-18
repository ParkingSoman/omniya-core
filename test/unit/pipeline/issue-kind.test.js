import assert from 'node:assert/strict';
import test from 'node:test';

import { KINDS, kindFromLabels } from '../../../scripts/ci/issue-kind.mjs';

test('the bug label and the nemeth label send the report to the agent', () => {
  assert.equal(kindFromLabels(['bug']), 'bug');
  assert.equal(kindFromLabels(['nemeth']), 'nemeth');
});

test('the design label and the other label send the report to a person', () => {
  assert.equal(kindFromLabels(['design']), 'routed');
  assert.equal(kindFromLabels(['other']), 'routed');
});

test('no type label means bug, as every report was before there were types', () => {
  assert.equal(kindFromLabels([]), 'bug');
  assert.equal(kindFromLabels(['needs-owner']), 'bug');
});

test('two types at once go to a person', () => {
  assert.equal(kindFromLabels(['nemeth', 'design']), 'routed');
  assert.equal(kindFromLabels(['bug', 'other']), 'routed');
});

test('needs-design is the agent saying "not a bug", not a type, so it does not route', () => {
  assert.equal(kindFromLabels(['bug', 'needs-design']), 'bug');
});

test('label case does not matter', () => {
  assert.equal(kindFromLabels(['Nemeth']), 'nemeth');
  assert.equal(kindFromLabels(['Design']), 'routed');
});

test('an idea for the automation goes to a person, whatever else is on it, so filing one starts no agent', () => {
  assert.equal(kindFromLabels(['pipeline-idea']), 'routed');
  assert.equal(kindFromLabels(['Pipeline-Idea']), 'routed');
  assert.equal(kindFromLabels(['pipeline-idea', 'bug']), 'routed');
  assert.equal(kindFromLabels(['pipeline-idea', 'nemeth']), 'routed');
  // A near miss is still a bug: only the exact label routes.
  assert.equal(kindFromLabels(['pipeline-ideas']), 'bug');
});

test('there are exactly three kinds', () => {
  assert.deepEqual(KINDS, ['bug', 'nemeth', 'routed']);
});
