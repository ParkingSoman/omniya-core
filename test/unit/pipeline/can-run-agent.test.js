import assert from 'node:assert/strict';
import test from 'node:test';

import { checkAccess, hasWriteAccess } from '../../../scripts/ci/can-run-agent.mjs';

test('write, maintain and admin may run the agent. triage and read may not', () => {
  for (const level of ['admin', 'maintain', 'write']) assert.equal(hasWriteAccess(level), true, level);
  for (const level of ['triage', 'read', 'none', '', undefined]) assert.equal(hasWriteAccess(level), false, String(level));
});

test('a listed contributor who only reads is refused before the agent job (issue 33)', () => {
  assert.equal(checkAccess('avery8ingram-oss', 'a/b', () => 'read\n'), 'false');
  assert.equal(checkAccess('HayleeRM', 'a/b', () => 'write\n'), 'true');
});

test('the handle reaches the API path only if it is a valid handle', () => {
  let called = false;
  assert.equal(checkAccess('x/../../orgs', 'a/b', () => { called = true; return 'write'; }), 'false');
  assert.equal(called, false);
});

test('when GitHub does not answer the run goes on, because the action checks again', () => {
  assert.equal(checkAccess('HayleeRM', 'a/b', () => { throw new Error('403'); }), 'unknown');
});
