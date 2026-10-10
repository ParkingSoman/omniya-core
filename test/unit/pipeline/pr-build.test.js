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

test('the pipeline can start a build by hand, for a pull request number', () => {
  // See the comment in pr-build.yml: a bot-opened pull request's own run is held
  // for approval, so `pipeline-fix.yml` and `pipeline-followup.yml` dispatch it.
  const dispatch = triggers?.workflow_dispatch;
  assert.ok(dispatch, 'expected a workflow_dispatch trigger');
  assert.equal(dispatch.inputs?.pr_number?.required, true);
  // A dispatched run has no `github.event.pull_request`, so each place that read
  // it must fall back, or the release tag would be `pr-` and the build for #26
  // would overwrite the next one.
  const uses = (needle) =>
    [...source.matchAll(/\$\{\{[^}]*\}\}/g)].map((m) => m[0]).filter((expr) => expr.includes(needle));

  const numbers = uses('github.event.pull_request.number');
  assert.ok(numbers.length >= 4, 'expected the number to be read in the group and in three jobs');
  for (const expr of numbers) assert.match(expr, /inputs\.pr_number/, `needs the dispatch fallback: ${expr}`);

  const shas = uses('github.event.pull_request.head.sha');
  assert.ok(shas.length >= 2, 'expected the head sha in both packaging jobs');
  for (const expr of shas) assert.match(expr, /github\.sha/, `needs the dispatch fallback: ${expr}`);
});


test('the pull request run and the dispatched run do not cancel each other', () => {
  // Measured on pull request #26. Every real check was green, and the pull
  // request still showed red `pack-mac`, `pack-win` and `comment`. They were
  // cancelled runs: the run the pipeline dispatched shared a concurrency group
  // with the pull request's own run, and `cancel-in-progress` killed one for the
  // other. A cancelled run is red on a pull request.
  const group = workflow.concurrency?.group ?? '';
  assert.match(group, /github\.event_name/, 'the event must be part of the group');
  assert.match(group, /inputs\.pr_number/);
  assert.equal(workflow.concurrency['cancel-in-progress'], true, 'a newer push still replaces an older build of the same kind');
});

test('a pull request run is skipped for the pipeline\'s own branches, and nothing else is', () => {
  // The pipeline builds its own pull requests by dispatch. Letting the
  // `pull_request` run build them too built every fix twice, and the second run
  // is the one GitHub holds for approval. A pull request written by hand still
  // builds as before.
  const skip = "github.event_name != 'pull_request' || !startsWith(github.head_ref, 'claude/fix-')";
  assert.equal(workflow.jobs['pack-mac'].if, skip);
  assert.equal(workflow.jobs['pack-win'].if, skip);
  // No `if:` may be put on the required checks to do the same. A skipped job
  // satisfies a required status check, which would let a red pull request merge.
  // They are in `pr-checks.yml`, and that file has no `if` on `unit`, `nemeth` or `e2e`.
  const checks = loadYaml(readFileSync('.github/workflows/pr-checks.yml', 'utf8'));
  for (const name of ['unit', 'nemeth', 'e2e']) assert.equal(checks.jobs[name].if, undefined, name);
});

test('the pipeline can ask for a build that does not comment on the pull request', () => {
  // The links go on the ISSUE, in the status comment, once the checks AND the
  // build are green. A comment on the pull request is one the contributor never
  // reads, and one more thing for the maintainer to scroll past.
  assert.equal(triggers.workflow_dispatch.inputs.quiet.required, false);
  assert.equal(workflow.jobs.comment.if, "inputs.quiet != 'true'");
});
