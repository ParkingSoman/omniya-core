import assert from 'node:assert/strict';
import test from 'node:test';

import { classify, report, STALE_DAYS } from '../../../scripts/ci/backlog.mjs';

const NOW = Date.parse('2026-10-20T00:00:00Z');
const day = (n) => new Date(NOW - n * 86_400_000).toISOString();

test('a person is needed first, then a conflict, then age, else fine', () => {
  assert.equal(classify({ labels: [{ name: 'needs-owner' }], mergeable: 'CONFLICTING', updatedAt: day(30) }, NOW), 'waiting');
  assert.equal(classify({ labels: [], mergeable: 'CONFLICTING', updatedAt: day(0) }, NOW), 'conflict');
  assert.equal(classify({ labels: [], mergeable: 'MERGEABLE', updatedAt: day(STALE_DAYS + 1) }, NOW), 'stale');
  assert.equal(classify({ labels: [], mergeable: 'MERGEABLE', updatedAt: day(1) }, NOW), 'fine');
});

test('only the pipeline\'s own fix branches are reported, each with its issue', () => {
  const rows = report(
    [
      { number: 1, title: 'a', body: 'x\n\nFixes #9\n', headRefName: 'claude/fix-9-a', isCrossRepository: false, mergeable: 'MERGEABLE', labels: [], updatedAt: day(0) },
      { number: 2, title: 'b', body: '', headRefName: 'feature/x', isCrossRepository: false, mergeable: 'MERGEABLE', labels: [], updatedAt: day(0) },
      { number: 3, title: 'c', body: 'Fixes #4', headRefName: 'claude/fix-4-c', isCrossRepository: true, mergeable: 'MERGEABLE', labels: [], updatedAt: day(0) }
    ],
    NOW
  );
  assert.deepEqual(rows, [{ pr: 1, issue: '9', state: 'fine', title: 'a' }]);
});
