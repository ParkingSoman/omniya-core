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

test('the contributor is told the two words that drive the loop', () => {
  // The whole loop rests on two things the contributor has to know, and neither
  // is discoverable from the GitHub interface. `@claude` in a comment is what
  // starts another round. Closing the issue is what merges.
  //
  // A pipeline whose controls are only in the maintainer's half of this page is
  // a pipeline the contributor cannot drive.
  const [contributorHalf] = doc.split('## If you maintain this repository');

  assert.match(contributorHalf, /@claude/, 'the contributor half must name the word that starts a round');
  assert.match(
    contributorHalf,
    /[Cc]losing the issue is what merges/,
    'the contributor half must say what closing the issue does'
  );
  // And that the links do not change, because the alternative is her hunting for
  // a new comment that will never be posted.
  assert.match(contributorHalf, /same links|links already in the thread/i);
});

test('the maintainer is told what the auto-merge needs before it can work', () => {
  // `contributor-signoff.yml` runs as `github-actions[bot]`, and `testing-guard`
  // lists only the maintainer as a bypass actor. So it is refused out of the
  // box. That is a working state, not a broken one, but it is invisible: the
  // setting is in the repository configuration, not in any file here.
  const maintainerHalf = doc.split('## If you maintain this repository')[1] ?? '';

  assert.match(maintainerHalf, /testing-guard/, 'the ruleset must be named');
  assert.match(maintainerHalf, /github-actions\[bot\]/, 'and the actor that has to be added to it');
  assert.match(
    maintainerHalf,
    /contributor-signoff\.yml/,
    'and the workflow that is refused until it is'
  );
});
