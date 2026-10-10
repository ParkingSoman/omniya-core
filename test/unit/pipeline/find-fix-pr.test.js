import assert from 'node:assert/strict';
import test from 'node:test';

import { matchFixPrs } from '../../../scripts/ci/find-fix-pr.mjs';

const pr = (over = {}) => ({
  number: 26,
  headRefName: 'claude/fix-22-english-letter',
  isCrossRepository: false,
  body: 'What changed.\n\nFixes #22',
  ...over
});

test('a pull request from this repository, on a claude/fix- branch, ending in the Fixes line, matches', () => {
  assert.deepEqual(matchFixPrs([pr()], 22).map((p) => p.number), [26]);
});

test('the Fixes line is anchored: #2 does not match #22, and #22 does not match #220', () => {
  assert.equal(matchFixPrs([pr()], 2).length, 0);
  assert.equal(matchFixPrs([pr({ body: 'x\n\nFixes #220' })], 22).length, 0);
});

test('a body that only mentions the number in a sentence does not match', () => {
  assert.equal(matchFixPrs([pr({ body: 'This is related to Fixes #22 in some way.\n\nmore text' })], 22).length, 0);
});

test('trailing whitespace after the Fixes line is allowed, and the first letter may be lower case', () => {
  assert.equal(matchFixPrs([pr({ body: 'x\nfixes #22  \n' })], 22).length, 1);
});

test('a fork never matches, whatever its branch is called', () => {
  assert.equal(matchFixPrs([pr({ isCrossRepository: true })], 22).length, 0);
});

test('a branch outside the claude/fix- prefix never matches', () => {
  assert.equal(matchFixPrs([pr({ headRefName: 'feat/something' })], 22).length, 0);
  assert.equal(matchFixPrs([pr({ headRefName: 'testing' })], 22).length, 0);
});

test('two matches are both returned, so the caller can refuse to guess', () => {
  assert.equal(matchFixPrs([pr({ number: 1 }), pr({ number: 2 })], 22).length, 2);
});

test('a missing body is not a match and does not throw', () => {
  assert.equal(matchFixPrs([pr({ body: null })], 22).length, 0);
});

test('an issue number that is not digits is refused', () => {
  assert.throws(() => matchFixPrs([pr()], '22; rm -rf /'), /digits/);
  assert.throws(() => matchFixPrs([pr()], ''), /digits/);
});
