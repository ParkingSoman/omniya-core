import assert from 'node:assert/strict';
import test from 'node:test';

import { decide } from '../../../scripts/ci/hand-off.mjs';
import { citedNumbers, justifiedByTheCode, loadCodeRules, ruleNumbers, standingNoteSection } from '../../../scripts/ci/standing-note.mjs';

// A set big enough to be trusted, for the pure tests.
const rules = (...extra) => new Set([...Array.from({ length: 220 }, (_, i) => `1.${i + 1}`), ...extra]);
const nemethFile = { filename: 'src/domain/nemeth/parser.js', status: 'modified', additions: 5, deletions: 1 };
const testFile = { filename: 'test/unit/nemeth/script-run.test.js', status: 'modified', additions: 9, deletions: 0 };
const base = { files: [nemethFile, testFile], filesComplete: true, fixBranch: true, mergeable: 'MERGEABLE', missing: [] };

const body = (section) => `## What changed\nx\n\n## Reverses a standing note\n${section}\n\nFixes #73\n`;

test('the real Nemeth Code text in this repository is readable and holds the rules the owner relies on', () => {
  const real = loadCodeRules();
  assert.ok(real instanceof Set, 'the Code text loads');
  assert.ok(real.size >= 200, `many rule numbers (${real.size})`);
  assert.ok(real.has('14.8.8'), 'Rule 14.8.8: any other symbol or situation preserves the level already in effect');
  assert.ok(real.has('19.1'));
  for (const invented of ['99.99.99', '14.8.88', '0.0', '14.99']) assert.ok(!real.has(invented), invented);
});

test('ruleNumbers reads a rule or heading number only where a line of the Code starts with it', () => {
  const text = '14.8.8   Any other symbol keeps the level.\n  14.9     Use of Level Indicators\nthe fraction 14.5 is not a rule\n   Example 14-94: x\n';
  assert.deepEqual([...ruleNumbers(text)].sort(), ['14.8.8', '14.9']);
  assert.equal(ruleNumbers('').size, 0);
  assert.equal(ruleNumbers(undefined).size, 0);
});

test('loadCodeRules fails closed: a missing file, an empty one or a tiny one gives nothing', () => {
  assert.equal(loadCodeRules(() => { throw new Error('missing'); }), null);
  assert.equal(loadCodeRules(() => ''), null);
  assert.equal(loadCodeRules(() => '14.8.8   one rule only\n'), null);
});

test('standingNoteSection is the text under the heading, up to the next heading', () => {
  assert.equal(standingNoteSection(body('Because Rule 14.8.8.')).trim(), 'Because Rule 14.8.8.\n\nFixes #73');
  assert.equal(standingNoteSection('## Reverses a standing note\nA\n## Gates\nB\n').trim(), 'A');
  assert.equal(standingNoteSection('## Gates\nB\n'), '');
  assert.equal(standingNoteSection(undefined), '');
  assert.equal(standingNoteSection('   ###reverses a standing note\nX').trim(), 'X');
});

test('citedNumbers needs the word Rule, BANA, Nemeth or section next to the number', () => {
  assert.deepEqual([...citedNumbers('Rule 14.8.8 says so')], ['14.8.8']);
  assert.deepEqual([...citedNumbers('BANA 6.2.3, and rule 5.1.1.')].sort(), ['5.1.1', '6.2.3']);
  assert.deepEqual([...citedNumbers('Nemeth_2022 section 14.8.8 (line 6947)')], ['14.8.8']);
  assert.deepEqual([...citedNumbers('node 20.1 and version 2.3.4 and 14.8.8 alone')], []);
  assert.deepEqual([...citedNumbers('')], []);
});

test('a reversal that cites a real rule and changes the Nemeth code is answered by the Code', () => {
  const real = rules('14.8.8');
  assert.equal(justifiedByTheCode({ body: body('The Code agrees (Rule 14.8.8).'), files: base.files, codeRules: real }), true);
  assert.equal(justifiedByTheCode({ body: body('See BANA 14.8.8.'), files: base.files, codeRules: real }), true);
});

test('anything less than all three conditions leaves the reversal for a person', () => {
  const real = rules('14.8.8');
  // no citation, only words
  assert.equal(justifiedByTheCode({ body: body('The Code agrees.'), files: base.files, codeRules: real }), false);
  // a number that is not in the Code
  assert.equal(justifiedByTheCode({ body: body('Rule 99.99.99 says so.'), files: base.files, codeRules: real }), false);
  // a real number cited somewhere else in the body, not in the section
  assert.equal(justifiedByTheCode({ body: `Rule 14.8.8 is in the intro.\n${body('Because I said so.')}`, files: base.files, codeRules: real }), false);
  // the pull request does not change the Nemeth code
  assert.equal(justifiedByTheCode({ body: body('Rule 14.8.8.'), files: [testFile, { filename: 'docs/x.md' }], codeRules: real }), false);
  assert.equal(justifiedByTheCode({ body: body('Rule 14.8.8.'), files: [{ filename: 'src/renderer/app.js' }], codeRules: real }), false);
  // the Code text could not be read, or is too small
  assert.equal(justifiedByTheCode({ body: body('Rule 14.8.8.'), files: base.files, codeRules: null }), false);
  assert.equal(justifiedByTheCode({ body: body('Rule 14.8.8.'), files: base.files, codeRules: new Set(['14.8.8']) }), false);
  assert.equal(justifiedByTheCode({ body: body('Rule 14.8.8.'), files: base.files, codeRules: undefined }), false);
});

test('the hand-off still holds a reversal by default, and releases one the Code answers', () => {
  const cited = body('Why this report outweighs it: Rule 14.8.8, the Code agrees.');
  // the old call shape, with no Code text, keeps the hold
  assert.deepEqual(decide({ ...base, body: cited }), { action: 'protected', reason: 'standing-note' });
  assert.deepEqual(decide({ ...base, body: cited, codeRules: rules('14.8.8') }), { action: 'merge' });
  // not answered: held
  assert.deepEqual(decide({ ...base, body: body('The Code agrees.'), codeRules: rules('14.8.8') }), { action: 'protected', reason: 'standing-note' });
  assert.deepEqual(decide({ ...base, body: body('Rule 99.99.99.'), codeRules: rules('14.8.8') }), { action: 'protected', reason: 'standing-note' });
  assert.deepEqual(decide({ ...base, files: [testFile], body: cited, codeRules: rules('14.8.8') }), { action: 'protected', reason: 'standing-note' });
  // a body without the heading is untouched by any of this
  assert.deepEqual(decide({ ...base, body: 'Fixes #5.', codeRules: rules('14.8.8') }), { action: 'merge' });
});

test('releasing a standing note does not release anything else the hand-off holds', () => {
  const cited = body('Rule 14.8.8.');
  const real = rules('14.8.8');
  const sneaky = [nemethFile, { filename: '.github/workflows/pipeline-x.yml', status: 'modified' }];
  assert.equal(decide({ ...base, files: sneaky, body: cited, codeRules: real }).reason, 'automation');
  assert.equal(decide({ ...base, mergeable: 'CONFLICTING', body: cited, codeRules: real }).reason, 'conflict');
  assert.equal(decide({ ...base, fixBranch: false, body: cited, codeRules: real }).reason, 'not-a-fix-branch');
  assert.equal(decide({ ...base, filesComplete: false, body: cited, codeRules: real }).reason, 'automation');
  const weakened = [nemethFile, { filename: 'test/unit/nemeth/a.test.js', status: 'modified', additions: 1, deletions: 9 }];
  assert.equal(decide({ ...base, files: weakened, body: cited, codeRules: real }).reason, 'test-weakened');
  const removed = [nemethFile, { filename: 'test/unit/nemeth/a.test.js', status: 'removed', additions: 0, deletions: 9 }];
  assert.equal(decide({ ...base, files: removed, body: cited, codeRules: real }).reason, 'test-removed');
  assert.deepEqual(decide({ ...base, missing: ['e2e'], body: cited, codeRules: real }), { action: 'not-green', missing: ['e2e'] });
});
