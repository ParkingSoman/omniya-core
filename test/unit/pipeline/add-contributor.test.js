import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowed, parseAllowlist } from '../../../scripts/ci/allowlist.mjs';
import { addHandle } from '../../../scripts/ci/add-contributor.mjs';

const file = `# Who may drive the pipeline.
#
# comment that must survive

contributors:
  - HayleeRM
  - ParkingSoman
  # - example-handle
`;

test('a new handle is inserted in alphabetical order and the comments survive', () => {
  const out = addHandle(file, 'avery8ingram-oss');
  assert.deepEqual(parseAllowlist(out), ['avery8ingram-oss', 'HayleeRM', 'ParkingSoman']);
  assert.match(out, /# comment that must survive/);
  assert.match(out, /# - example-handle/);
});

test('a handle that sorts last goes after the last entry, not after a comment', () => {
  const out = addHandle(file, 'zed');
  assert.deepEqual(parseAllowlist(out), ['HayleeRM', 'ParkingSoman', 'zed']);
  assert.ok(out.indexOf('  - zed') < out.indexOf('# - example-handle'));
});

test('a handle in the middle lands between its neighbours', () => {
  assert.deepEqual(parseAllowlist(addHandle(file, 'Mallory')), ['HayleeRM', 'Mallory', 'ParkingSoman']);
});

test('adding somebody already listed changes nothing, whatever the case', () => {
  assert.equal(addHandle(file, 'hayleerm'), file);
});

test('the result always admits the new handle and still refuses a stranger', () => {
  const handles = parseAllowlist(addHandle(file, 'newperson'));
  assert.equal(isAllowed('newperson', handles), true);
  assert.equal(isAllowed('stranger', handles), false);
});

test('an invalid handle is refused before anything is edited', () => {
  for (const bad of ['', 'a b', 'x;rm -rf', '-leading', 'trailing-', 'a'.repeat(40)]) {
    assert.throws(() => addHandle(file, bad), /not a valid GitHub handle/, bad);
  }
});

test('an allowlist it cannot read is not edited', () => {
  assert.throws(() => addHandle('nonsense', 'newperson'));
});

test('an empty list gets its first entry', () => {
  assert.deepEqual(parseAllowlist(addHandle('contributors:\n', 'first')), ['first']);
});
