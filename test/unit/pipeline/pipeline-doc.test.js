import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const PATH = 'docs/contributor-pipeline.md';
const doc = readFileSync(PATH, 'utf8');

test('every workflow file is listed with the branch it must live on', () => {
  // The `Lives on` column is the only place that says which branch a file has to
  // be on, and getting it wrong does not warn anybody. GitHub starts an
  // `on: issues` or `on: issue_comment` workflow from the DEFAULT branch's copy
  // only, so a copy on `testing` alone is never read: the contributor writes
  // `@claude`, nothing happens, and there is no failed run to look at.
  //
  // A new workflow that never reaches this table is one nobody knows to move.
  const workflows = readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'));
  assert.ok(workflows.length >= 5, 'expected the pipeline workflows to exist');

  for (const file of workflows) {
    const row = doc
      .split('\n')
      .find((line) => line.startsWith('|') && line.includes(`.github/workflows/${file}`));
    assert.ok(row, `docs/contributor-pipeline.md has no row for ${file}`);
    assert.match(
      row,
      /\|\s*`(main|testing)`\s*\|/,
      `the row for ${file} must name the branch it lives on`
    );
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

test('the maintainer is told that they merge, what the pipeline does first, and what to change on main', () => {
  const maintainerHalf = doc.split('## If you maintain this repository')[1] ?? '';

  assert.match(maintainerHalf, /Nothing merges by itself/);
  assert.match(maintainerHalf, /ready-for-maintainer/);
  assert.match(maintainerHalf, /needs-maintainer/);
  // The ruleset needs no bypass any more, because nothing here merges.
  assert.match(maintainerHalf, /testing-guard/);
  assert.match(maintainerHalf, /no `--admin` flag|uses no `--admin`/);
  // GitHub closes an issue from `Fixes` only for the default branch.
  assert.match(maintainerHalf, /pipeline-close-issue\.yml/);
  // The rollout order is the one thing that breaks if it is guessed.
  assert.match(maintainerHalf, /Merge the one into `main` first/);
  assert.match(maintainerHalf, /pipeline-on-main/);
});
