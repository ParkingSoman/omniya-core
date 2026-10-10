import assert from 'node:assert/strict';
import test from 'node:test';

import { REQUIRED_CHECKS, notGreen } from '../../../scripts/ci/hand-off.mjs';

const green = (name, at = '2026-10-10T10:00:00Z') => ({ name, conclusion: 'success', completed_at: at });

test('the three checks testing-guard requires are the three that are read', () => {
  assert.deepEqual(REQUIRED_CHECKS, ['unit', 'nemeth', 'e2e']);
});

test('all three green means nothing is missing', () => {
  assert.deepEqual(notGreen([green('unit'), green('nemeth'), green('e2e'), green('pipeline-on-main')]), []);
});

test('a missing check counts as not green', () => {
  assert.deepEqual(notGreen([green('unit'), green('nemeth')]), ['e2e']);
});

test('a failed check is named', () => {
  assert.deepEqual(
    notGreen([green('unit'), { name: 'nemeth', conclusion: 'failure', completed_at: '2026-10-10T10:00:00Z' }, green('e2e')]),
    ['nemeth']
  );
});

test('the newest run of a check decides: a later pass replaces an earlier failure, and the other way round', () => {
  const failed = (at) => ({ name: 'unit', conclusion: 'failure', completed_at: at });
  assert.deepEqual(
    notGreen([failed('2026-10-10T09:00:00Z'), green('unit', '2026-10-10T10:00:00Z'), green('nemeth'), green('e2e')]),
    []
  );
  assert.deepEqual(
    notGreen([green('unit', '2026-10-10T09:00:00Z'), failed('2026-10-10T10:00:00Z'), green('nemeth'), green('e2e')]),
    ['unit']
  );
});

test('a cancelled or still-running check is not green', () => {
  assert.deepEqual(
    notGreen([
      { name: 'unit', conclusion: 'cancelled', completed_at: '2026-10-10T10:00:00Z' },
      { name: 'nemeth', conclusion: null, completed_at: null },
      green('e2e')
    ]),
    ['unit', 'nemeth']
  );
});
