import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/contributor-signoff.yml';
const source = readFileSync(PATH, 'utf8');
const workflow = loadYaml(source);

// The file explains its own rules in comments, so a comment can say the exact
// string a "this must not appear" assertion is looking for. Searching `code`
// keeps the assertion about the workflow instead of about the prose around it.
const code = source
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const triggers = workflow.on ?? workflow[true];
const allowlistJob = workflow.jobs?.allowlist;
const mergeJob = workflow.jobs?.merge;
const steps = mergeJob?.steps ?? [];
const runOf = (id) => steps.find((s) => s.id === id)?.run ?? '';

test('only an allowlisted closer merges', () => {
  // Closing an issue merges into `testing`, and a merge to `testing` reaches
  // every alpha tester with Windows installing it in the background. So the
  // question "who may close this issue and have it ship" is the same question
  // `.github/contributors.yml` already answers, and it is answered in that one
  // place rather than a second time here.
  assert.deepEqual(triggers?.issues?.types, ['closed']);
  assert.ok(allowlistJob, 'expected an `allowlist` job');

  const check = (allowlistJob.steps ?? []).map((s) => s.run ?? '').join('\n');
  assert.match(check, /scripts\/ci\/allowlist\.mjs/, 'the gate must be the allowlist script');
  assert.match(
    JSON.stringify(allowlistJob.steps),
    /github\.event\.sender\.login/,
    'the gate reads the person who pressed close'
  );

  // `not_planned` is GitHub's own word for "closed without doing it". Tidying a
  // stale report is not a sign-off, and this is the only close reason the API
  // distinguishes.
  assert.match(
    allowlistJob.if ?? '',
    /state_reason\s*!=\s*'not_planned'/,
    'closing as not planned must not merge anything'
  );

  // And the merge job must actually wait on the gate. A `needs` without the
  // `if`, or an `if` without the `needs`, both read as gated and are not.
  assert.ok([].concat(mergeJob?.needs ?? []).includes('allowlist'));
  assert.match(mergeJob?.if ?? '', /needs\.allowlist\.outputs\.allowed\s*==\s*'true'/);
});

test('only a green pull request is merged', () => {
  // The contributor can tell you the bug is gone on her machine. That is the one
  // thing nobody else can tell you, and it is not the same question as whether
  // the change is safe for everybody else. So this file asks GitHub to merge and
  // lets GitHub refuse.
  //
  // `--admin` is the flag that would make this file the thing deciding. Without
  // it, `testing-guard` still requires the checks to have passed, and a red pull
  // request is refused here exactly as it would be under a person's finger.
  assert.doesNotMatch(code, /--admin/, 'the checks are the gate, not this workflow');

  // Only pull requests into `testing`. A `Fixes #<n>` line on something aimed at
  // `main` must never be what a close merges.
  assert.match(runOf('find'), /--base testing/, 'only pull requests into testing are candidates');

  // Exactly one match, or nothing is merged. A text search for `#12` also
  // returns `#120` and any body that mentions the number in a sentence, so the
  // search narrows and the `jq` filter decides.
  assert.match(runOf('find'), /\[Ff\]ixes #/, 'the join is the Fixes line contributor-fix.yml writes');
  assert.match(runOf('find'), /\+ \$n \+ "\[\[:space:\]\]\*\$"/, 'and it is anchored, so #12 does not match #120');
  const merge = steps.find((s) => s.id === 'merge');
  assert.ok(merge, 'expected a merge step');
  assert.match(
    merge.if ?? '',
    /steps\.find\.outputs\.count\s*==\s*'1'/,
    'a merge must happen only when exactly one pull request claims the issue'
  );

  // And an ambiguous or empty result is still answered. Silence is the worst
  // outcome in this file: she believes she shipped a fix, and nothing happened.
  const noMatch = steps.find((s) => /count\s*!=\s*'1'/.test(s.if ?? ''));
  assert.ok(noMatch, 'expected a step for the no-match and many-match cases');
  assert.match(noMatch.run ?? '', /gh issue comment/, 'and it must say so on the issue she just closed');
});

test('a refused merge says why', () => {
  // The most likely refusal, by a wide margin, is `testing-guard` not listing
  // `github-actions[bot]` as a bypass actor. That is a repository setting, and
  // nobody watching this thread can see it. A red tick in the Actions tab is not
  // an answer to somebody who thinks she is finished.
  const report = steps.find((s) => /steps\.merge\.outputs\.merged\s*==\s*'false'/.test(s.if ?? ''));
  assert.ok(report, 'expected a step that reports a refused merge');

  assert.match(report.run ?? '', /gh pr comment/, 'the refusal goes on the pull request');
  assert.match(report.run ?? '', /gh issue comment/, 'and the issue she closed is told to look there');
  assert.match(
    JSON.stringify(report.env ?? {}),
    /steps\.merge\.outputs\.error/,
    'the exact error must be carried into the comment, not summarised away'
  );
  assert.match(report.run ?? '', /testing-guard/, 'and the likely cause must be named in plain words');

  // The job does not fail. A red run every time somebody closes an issue reads
  // as a broken pipeline and trains everyone to ignore the Actions tab.
  const merge = steps.find((s) => s.id === 'merge');
  assert.doesNotMatch(
    merge.run ?? '',
    /^\s*set -euo pipefail\s*$/m,
    'the merge step must survive a non-zero gh exit long enough to report it'
  );
  assert.match(merge.run ?? '', /merged=false/, 'a refusal is carried in an output, not in the exit code');
});
