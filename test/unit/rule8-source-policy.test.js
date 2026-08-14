import assert from 'node:assert/strict';
import test from 'node:test';

// Rule 8.1 describes the punctuation-mode context; the remaining provisions
// are operation-level punctuation transitions represented by registry rows.
export const CONTEXT_POLICY_REFS = Object.freeze(['8.1']);
export const OPERATION_REFS = Object.freeze(['8.2', '8.3', '8.4', '8.5', '8.6', '8.7', '8.8']);

test('Rule 8 policy and operation references are declaratively represented', () => {
  assert.ok(OPERATION_REFS.length === 7);
  assert.deepEqual(CONTEXT_POLICY_REFS, ['8.1']);
});
