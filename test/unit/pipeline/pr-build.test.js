import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/pr-build.yml';
const source = readFileSync(PATH, 'utf8');
const workflow = loadYaml(source);

const triggers = workflow.on ?? workflow[true];

test('a new push replaces the assets under the same tag', () => {
  // This workflow's own comment tells the contributor, in writing:
  //
  //   "If this pull request changes again, these links stay the same and the
  //    files behind them are replaced. Download again rather than looking for
  //    a new link."
  //
  // That sentence is the reason `contributor-followup.yml` pushes to the pull
  // request's branch instead of opening a second one. So it is not a nicety --
  // it is the contract the follow-up loop is built on top of, and it holds only
  // if all four things below stay true together.
  //
  // The contributor is blind and is the only person with a braille display. A
  // link that silently stops being the current build costs her a test round she
  // cannot get back, and she has no way to tell a stale asset from a bad fix.

  // 1. A push to an open pull request rebuilds at all. Without `synchronize`
  //    the follow-up run pushes and nothing happens: the thread keeps the links
  //    it had, still pointing at the first build.
  assert.ok(
    (triggers?.pull_request?.types ?? []).includes('synchronize'),
    'a push to the branch must rebuild, or the follow-up loop hands back a stale build'
  );
  assert.deepEqual(triggers?.pull_request?.branches, ['testing']);

  // 2. The tag is derived from the pull request number, in every job. A tag
  //    carrying the commit sha would be a NEW release, with new links, on every
  //    round.
  const packMac = workflow.jobs?.['pack-mac'];
  const packWin = workflow.jobs?.['pack-win'];
  const comment = workflow.jobs?.comment;
  for (const [name, job] of [['pack-mac', packMac], ['pack-win', packWin], ['comment', comment]]) {
    assert.ok(job, `expected a \`${name}\` job`);
    const runs = (job.steps ?? []).map((s) => s.run ?? '').join('\n');
    assert.match(
      runs,
      /pr-\$\{?(env:)?PR_NUMBER\}?/,
      `${name} must address the release by pull request number, not by commit`
    );
  }

  // And the tag is assigned from the number and nothing else. The sha appears
  // legitimately elsewhere in these jobs -- `--target "$HEAD_SHA"` points the
  // release at the commit it was built from -- so the check has to be on the
  // assignment, not on the word.
  for (const [name, job] of [['pack-mac', packMac], ['pack-win', packWin]]) {
    const assignments = (job.steps ?? [])
      .flatMap((s) => (s.run ?? '').split('\n'))
      .filter((line) => /^\s*\$?(TAG|tag)\s*=/.test(line));
    assert.ok(assignments.length >= 1, `expected ${name} to assign a release tag`);
    for (const line of assignments) {
      assert.doesNotMatch(line, /HEAD_SHA/, `${name} must not tag by commit sha: every round would get new links`);
    }
  }

  // 3. The upload overwrites. Without `--clobber` the second round's upload
  //    fails on an asset that already exists, and the link keeps serving the
  //    first build with a green tick next to it.
  const uploads = [packMac, packWin]
    .flatMap((job) => job.steps ?? [])
    .map((s) => s.run ?? '')
    .filter((run) => run.includes('gh release upload'));
  assert.ok(uploads.length >= 2, 'expected an upload in each pack job');
  for (const run of uploads) {
    assert.match(run, /--clobber/, 'an upload without --clobber leaves the previous build in place');
  }

  // 4. One comment, edited. A thread that grows a near-identical comment per
  //    round is noise to scroll past and worse to hear read aloud -- and by
  //    round four the newest link is twenty comments below the oldest.
  const commentRun = (comment.steps ?? []).map((s) => s.run ?? '').join('\n');
  assert.match(commentRun, /--edit-last/, 'the build comment must be edited in place');
  assert.match(commentRun, /--create-if-none/, 'and written the first time');
});
