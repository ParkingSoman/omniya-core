import assert from 'node:assert/strict';
import test from 'node:test';

import { REQUIRED_CHECKS, handOff, isConflicting, notGreen } from '../../../scripts/ci/hand-off.mjs';

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

// ---- the conflict check ---------------------------------------------------

/** A stand-in `gh`. `mergeable` is what GitHub answers, one answer per ask. */
function fakeGh({ mergeable = ['MERGEABLE'], checks = ['unit', 'nemeth', 'e2e'] } = {}) {
  const calls = [];
  const asks = [...mergeable];
  const run = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'pr' && args[1] === 'view' && args.includes('mergeable')) return `${asks.length > 1 ? asks.shift() : asks[0]}\n`;
    if (args[0] === 'pr' && args[1] === 'view') return 'abc123\n';
    if (args[0] === 'api' && args[1].includes('/check-runs')) {
      return checks.map((name) => JSON.stringify({ name, conclusion: 'success', completed_at: '2026-10-10T10:00:00Z' })).join('\n');
    }
    return '';
  };
  return { run, calls };
}
const args = { issue: 51, pr: 53, repo: 'a/b', reviewer: 'owner' };
const noSleep = () => {};

test('isConflicting: waits while GitHub is still working it out, and says yes only to CONFLICTING', () => {
  assert.equal(isConflicting('53', 'a/b', fakeGh({ mergeable: ['UNKNOWN', 'UNKNOWN', 'CONFLICTING'] }).run, noSleep), true);
  assert.equal(isConflicting('53', 'a/b', fakeGh({ mergeable: ['UNKNOWN', 'MERGEABLE'] }).run, noSleep), false);
  assert.equal(isConflicting('53', 'a/b', fakeGh({ mergeable: ['UNKNOWN'] }).run, noSleep, 3), false, 'no answer is not a conflict');
});

test('a conflicting branch is not handed on: the repair starts, and the contributor is told once', () => {
  const f = fakeGh({ mergeable: ['CONFLICTING'] });
  const result = handOff({ ...args, mode: 'check-conflicts' }, f.run, noSleep);
  assert.equal(result.sent, false);
  assert.equal(result.updating, true);
  assert.ok(f.calls.includes('workflow run pipeline-conflicts.yml --repo a/b --ref testing -f pr_numbers=53'));
  // The request to send it on afterwards is a label, which cannot be dropped like a queued run.
  assert.ok(f.calls.includes('pr edit 53 --repo a/b --add-label handoff-pending'));
  assert.ok(!f.calls.some((c) => c.startsWith('pr ready')), 'it must not leave draft');
  assert.equal(f.calls.filter((c) => c.includes('issues/51/comments')).length, 1);
});

test('a clean branch goes on as before', () => {
  const f = fakeGh({ mergeable: ['MERGEABLE'] });
  const result = handOff({ ...args, mode: 'check-conflicts' }, f.run, noSleep);
  assert.equal(result.sent, true);
  assert.ok(f.calls.some((c) => c.startsWith('pr ready 53')));
  assert.ok(!f.calls.some((c) => c.startsWith('workflow run')));
});

test('if-green says nothing when the checks are not green, because the repair already said what failed', () => {
  const f = fakeGh({ checks: ['unit'] });
  const result = handOff({ ...args, mode: 'if-green' }, f.run, noSleep);
  assert.equal(result.sent, false);
  assert.deepEqual(f.calls.filter((c) => c.includes('comment') || c.includes('needs-maintainer')), []);
});

test('if-green hands on when the checks are green, and does not ask about conflicts again', () => {
  const f = fakeGh({ mergeable: ['CONFLICTING'] });
  const result = handOff({ ...args, mode: 'if-green' }, f.run, noSleep);
  assert.equal(result.sent, true);
  assert.ok(!f.calls.some((c) => c.includes('mergeable')));
});

test('the plain mode still stops, loudly, on red checks', () => {
  const f = fakeGh({ checks: ['unit'] });
  const result = handOff(args, f.run, noSleep);
  assert.equal(result.sent, false);
  assert.ok(f.calls.some((c) => c.includes('--add-label needs-maintainer')));
});
