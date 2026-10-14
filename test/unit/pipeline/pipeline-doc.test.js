import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const PATH = 'docs/contributor-pipeline.md';
const doc = readFileSync(PATH, 'utf8');

test('every workflow file is listed with the branch it lives on', () => {
  // A new workflow that never reaches this table is one nobody knows exists.
  // `testing` is the default branch, so every row names it.
  const workflows = readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'));
  assert.ok(workflows.length >= 5, 'expected the pipeline workflows to exist');

  for (const file of workflows) {
    const row = doc
      .split('\n')
      .find((line) => line.startsWith('|') && line.includes(`.github/workflows/${file}`));
    assert.ok(row, `docs/contributor-pipeline.md has no row for ${file}`);
    assert.match(row, /\|\s*`testing`\s*\|/, `the row for ${file} must name the branch it lives on`);
  }
});

test('the contributor is told the two phrases that drive the loop, and not to close the issue', () => {
  // The whole loop rests on things the contributor has to know, and none is
  // discoverable from the GitHub interface. `@claude` in a comment starts another
  // round. `@claude it works` sends the fix to the maintainer. Closing the issue
  // does neither, and a contributor who closes it believes they shipped.
  //
  // A pipeline whose controls are only in the maintainer's half of this page is
  // a pipeline the contributor cannot drive.
  const [contributorHalf] = doc.split('## If you maintain this repository');

  assert.match(contributorHalf, /@claude/, 'the contributor half must name the word that starts a round');
  assert.match(contributorHalf, /@claude it works/, 'and the phrase that says it is done');
  assert.match(contributorHalf, /Do not close the issue/);
  assert.doesNotMatch(contributorHalf, /[Cc]losing the issue is what merges/, 'closing no longer merges anything');
  // And that the links do not change, because the alternative is her hunting for
  // a new comment that will never be posted.
  assert.match(contributorHalf, /same links|links already in the/i);
  // The contributor never needs the pull request, so the half they hear does not send them there.
  assert.doesNotMatch(contributorHalf, /pull request|branch|workflow/i);
});

test('the maintainer is told that they merge, and that testing is the default branch', () => {
  const maintainerHalf = doc.split('## If you maintain this repository')[1] ?? '';

  assert.match(maintainerHalf, /Nothing merges by itself/);
  assert.match(maintainerHalf, /ready-for-maintainer/);
  assert.match(maintainerHalf, /needs-owner/);
  // The ruleset needs no bypass any more, because nothing here merges.
  assert.match(maintainerHalf, /testing-guard/);
  assert.match(maintainerHalf, /no `--admin` flag|uses no `--admin`/);
  // GitHub closes an issue from `Fixes` for the default branch, which is `testing`.
  assert.match(maintainerHalf, /`testing` is the default branch/);
  // The split between a default branch and a working branch is gone.
  assert.doesNotMatch(maintainerHalf, /stub|pipeline-on-main|pipeline-close-issue/);
});
