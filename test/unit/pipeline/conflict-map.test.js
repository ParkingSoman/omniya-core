import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMap,
  parseMergeTree,
  renderMap,
  selectFixPrs,
  suggestOrder
} from '../../../scripts/ci/conflict-map.mjs';

const OID = '4b2a1f791648f6ce426d9221759600de77a38bb1';

test('parseMergeTree: a clean merge is one tree id and nothing else', () => {
  assert.deepEqual(parseMergeTree(`${OID}\n`), { clean: true, files: [] });
});

test('parseMergeTree: names the conflicted files and ignores the messages after them', () => {
  const out = [
    OID,
    'src/domain/nemeth/alphabets.json',
    'docs/nemeth-v2/coverage.md',
    '',
    'Auto-merging src/domain/nemeth/lexer.js',
    'CONFLICT (content): Merge conflict in src/domain/nemeth/alphabets.json',
    ''
  ].join('\n');
  assert.deepEqual(parseMergeTree(out), {
    clean: false,
    files: ['docs/nemeth-v2/coverage.md', 'src/domain/nemeth/alphabets.json']
  });
});

test('parseMergeTree: a file named twice (one per stage) is listed once', () => {
  const out = `${OID}\na.json\na.json\na.json\n\nCONFLICT (content): Merge conflict in a.json\n`;
  assert.deepEqual(parseMergeTree(out).files, ['a.json']);
});

const pr = (number, branch, extra = {}) => ({
  number,
  headRefName: branch,
  isCrossRepository: false,
  baseRefName: 'testing',
  ...extra
});

test('selectFixPrs: only same-repo claude/fix- branches into testing', () => {
  const kept = selectFixPrs([
    pr(53, 'claude/fix-51-theta'),
    pr(55, 'fix/equation-reading'),
    pr(56, 'claude/fix-9-x', { isCrossRepository: true }),
    pr(57, 'claude/fix-9-y', { baseRefName: 'main' }),
    pr(58, 'claude/fix-60-ok')
  ]);
  assert.deepEqual(kept.map((p) => p.number), [53, 58]);
});

test('selectFixPrs: a PR a person already has to look at is left out, so it costs no run on every push', () => {
  const stuck = pr(59, 'claude/fix-52-a', { labels: [{ name: 'needs-maintainer' }] });
  const fine = pr(60, 'claude/fix-56-b', { labels: [{ name: 'ready-for-maintainer' }] });
  assert.deepEqual(selectFixPrs([stuck, fine]).map((p) => p.number), [60]);
  // Asking for it by number overrides the label: that is how the owner retries it.
  // (The caller then narrows the list to the numbers named.)
  assert.deepEqual(selectFixPrs([stuck, fine], { include: [59] }).map((p) => p.number), [59, 60]);
});

test('buildMap: separates PRs that conflict with testing from PRs that are fine', () => {
  const map = buildMap({
    prs: [pr(53, 'claude/fix-51-theta'), pr(59, 'claude/fix-52-dollar'), pr(63, 'claude/fix-62-mixed')],
    againstTesting: {
      53: { clean: false, files: ['src/domain/nemeth/alphabets.json'] },
      59: { clean: false, files: ['src/domain/nemeth/symbols.json'] },
      63: { clean: true, files: [] }
    },
    pairs: {
      '53+59': { clean: true, files: [] },
      '53+63': { clean: true, files: [] },
      '59+63': { clean: true, files: [] }
    }
  });
  assert.deepEqual(map.conflicting.map((p) => p.number), [53, 59]);
  assert.deepEqual(map.clean.map((p) => p.number), [63]);
  assert.deepEqual(map.conflicting[0].files, ['src/domain/nemeth/alphabets.json']);
});

test('buildMap: records which other PRs a PR will collide with after they merge', () => {
  const map = buildMap({
    prs: [pr(59, 'claude/fix-52-a'), pr(60, 'claude/fix-56-b'), pr(61, 'claude/fix-58-c')],
    againstTesting: {
      59: { clean: true, files: [] },
      60: { clean: true, files: [] },
      61: { clean: true, files: [] }
    },
    pairs: {
      '59+60': { clean: false, files: ['src/domain/nemeth/symbols.json'] },
      '59+61': { clean: true, files: [] },
      '60+61': { clean: false, files: ['src/domain/nemeth/symbols.json'] }
    }
  });
  const by = Object.fromEntries(map.prs.map((p) => [p.number, p.collidesWith]));
  assert.deepEqual(by[59], [{ number: 60, files: ['src/domain/nemeth/symbols.json'] }]);
  assert.deepEqual(by[60].map((c) => c.number), [59, 61]);
  assert.deepEqual(by[61].map((c) => c.number), [60]);
});

test('suggestOrder: the PR that collides with the fewest others goes first, ties by number', () => {
  const order = suggestOrder([
    { number: 59, collidesWith: [{ number: 60 }] },
    { number: 60, collidesWith: [{ number: 59 }, { number: 61 }] },
    { number: 61, collidesWith: [{ number: 60 }] },
    { number: 63, collidesWith: [] }
  ]);
  assert.deepEqual(order, [63, 59, 61, 60]);
});

test('renderMap: says in words what conflicts, and names no PR that does not', () => {
  const map = buildMap({
    prs: [pr(53, 'claude/fix-51-theta'), pr(63, 'claude/fix-62-mixed')],
    againstTesting: {
      53: { clean: false, files: ['src/domain/nemeth/alphabets.json'] },
      63: { clean: true, files: [] }
    },
    pairs: { '53+63': { clean: true, files: [] } }
  });
  const text = renderMap(map);
  assert.match(text, /#53/);
  assert.match(text, /src\/domain\/nemeth\/alphabets\.json/);
  assert.doesNotMatch(text, /#63[^\n]*conflict/i);
});

test('renderMap: says plainly when nothing conflicts', () => {
  const map = buildMap({
    prs: [pr(63, 'claude/fix-62-mixed')],
    againstTesting: { 63: { clean: true, files: [] } },
    pairs: {}
  });
  assert.match(renderMap(map), /No open fix PR conflicts with testing/);
  assert.equal(map.conflicting.length, 0);
});
