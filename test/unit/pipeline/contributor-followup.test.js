import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/pipeline-followup.yml';
const STUB = '.github/pipeline-stubs/contributor-followup.yml';
const source = readFileSync(PATH, 'utf8');
const workflow = loadYaml(source);

// The file explains its own rules in comments, so a comment can say the exact
// string a "this must not appear" assertion is looking for. Searching `code`
// rather than `source` is what keeps the assertion about the workflow instead
// of about the prose around it.
const code = source
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

// `on:` parses as the boolean true in YAML 1.1, because `on` is one of its
// reserved truthy words. Reach the trigger by whichever key survived rather
// than asserting one and getting a confusing undefined.
const stub = loadYaml(readFileSync(STUB, 'utf8'));
const triggers = stub.on ?? stub[true];

const AGENT = 'ParkingSoman/omniya-core/.github/workflows/pipeline-agent.yml@testing';
const VERIFY = 'ParkingSoman/omniya-core/.github/workflows/pipeline-verify.yml@testing';

const allowlistJob = workflow.jobs?.allowlist;

test('only a @claude comment on an ISSUE starts a run', () => {
  // Three filters, and each is load-bearing for a different reason. This test is
  // what notices when a later edit drops one of them.
  assert.deepEqual(triggers?.issue_comment?.types, ['created']);

  // The stub filters first, so a comment that cannot cost anything never starts
  // a run. The workflow that does the work checks the same things again, because
  // a stub is not a place to rely on for safety. Both must say it.
  for (const condition of [stub.jobs.call.if ?? '', allowlistJob?.if ?? '']) {
    // `issue.pull_request` exists only when the comment is on a pull request. The
    // contributor writes on the issue, so this is the NEGATION of the old rule:
    // a comment on a pull request is the maintainer's conversation.
    assert.match(condition, /!github\.event\.issue\.pull_request/, 'a comment on a pull request must not start a run');
    // `@claude` is what makes a comment cost anything.
    assert.match(condition, /contains\(\s*github\.event\.comment\.body\s*,\s*'@claude'\s*\)/, 'only a comment naming @claude may spend a run');
    // The status comment and the agent's own comments are by a bot, and one of
    // them quotes `@claude`.
    assert.match(condition, /github\.event\.comment\.user\.type\s*!=\s*'Bot'/, 'a bot comment must not start a run');
  }
});

test('the allowlist gate runs before anything is installed', () => {
  assert.ok(allowlistJob, 'expected an `allowlist` job');

  // The decision about whether to spend somebody's subscription quota must not
  // wait on an install that can fail, be slow, or be tampered with.
  const runs = (allowlistJob.steps ?? []).map((s) => s.run ?? '').join('\n');
  const uses = (allowlistJob.steps ?? []).map((s) => s.uses ?? '').join('\n');
  assert.doesNotMatch(runs, /npm ci|npm install|brew install/, 'the gate must not wait on an install');
  assert.doesNotMatch(uses, /setup-node/, 'the gate must not wait on a toolchain');
  assert.match(runs, /scripts\/ci\/allowlist\.mjs/, 'the gate must be the allowlist script');
  assert.equal(allowlistJob.steps.find((s) => s.id === 'check').env.COMMENT_AUTHOR, '${{ github.event.comment.user.login }}');

  // And the expensive job must actually wait on it. A `needs` without the `if`,
  // or an `if` without the `needs`, both read as gated and are not.
  const agent = workflow.jobs.agent;
  assert.ok([].concat(agent.needs).includes('allowlist'), 'the agent job must need the allowlist job');
  assert.match(agent.if, /needs\.allowlist\.outputs\.allowed\s*==\s*'true'/, 'and run only when the gate said true');
});

test('exactly one open fix is continued, and no fix is answered in words', () => {
  // The gate finds the fix for this issue with the one shared helper, from
  // `testing`, because `main` does not have it.
  const find = allowlistJob.steps.find((s) => s.id === 'find');
  assert.equal(find.if, "steps.check.outputs.allowed == 'true'", 'no lookup for a person the gate refused');
  assert.match(find.run, /git show "origin\/testing:scripts\/ci\/\$f"/);
  assert.match(find.run, /find-fix-pr\.mjs/);
  assert.doesNotMatch(code, /isCrossRepository/, 'the strict rule lives in the helper, not in a fourth copy');

  assert.match(workflow.jobs.agent.if, /needs\.allowlist\.outputs\.count\s*==\s*'1'/, 'two candidates are not guessed between');

  // Silence is the failure this repository has had once already.
  const nofix = workflow.jobs.nofix;
  assert.match(nofix.if, /count\s*!=\s*'1'/);
  assert.ok(nofix.steps.some((s) => /gh issue comment/.test(s.run ?? '')), 'the contributor is told');
  assert.doesNotMatch(JSON.stringify(nofix.steps), /claude-code-action/, 'saying so costs no quota');
});

test('a follow-up run is bounded, and shares the fix workflow group', () => {
  // One run per issue. A second comment queues behind the first instead of
  // racing it. And it is the SAME group as `pipeline-fix.yml`, so a comment that
  // arrives during a fix or a repair waits for it: they push to one branch.
  const group = workflow.concurrency?.group ?? '';
  assert.match(group, /github\.event\.issue\.number/);
  assert.match(group, /^contributor-issue-/);
  assert.equal(workflow.concurrency?.['cancel-in-progress'], false, 'a killed run can leave half a revision on the branch');

  // The agent's own limits (timeout, turns, subscription token) are in the shared
  // file and tested there.
  assert.equal(workflow.jobs.agent.uses, AGENT);
  assert.equal(workflow.jobs.agent.with.mode, 'comment');
  assert.deepEqual(Object.keys(workflow.jobs.agent.secrets), ['CLAUDE_CODE_OAUTH_TOKEN']);
});

test('the loop cannot feed itself', () => {
  // This file pushes, which rebuilds, which writes to the issue. The status
  // comment and the agent's comments are by `github-actions[bot]`, and the
  // status comment quotes `@claude`.
  assert.match(allowlistJob.if, /github\.event\.comment\.user\.type\s*!=\s*'Bot'/);
  // `isAllowed` in the allowlist script refuses `*[bot]` too, a step later.
  // And nothing else starts this workflow. A `pull_request` trigger would fire
  // on the push this file makes.
  assert.equal(triggers?.pull_request, undefined);
  assert.equal(triggers?.push, undefined);
  assert.equal(triggers?.issues, undefined);
});

test('no untrusted comment text reaches a run step', () => {
  // Comment bodies, issue titles and issue bodies are written by whoever typed
  // them. Only the NUMBER is safe, because GitHub guarantees it is an integer.
  // The comment body appears in the `if:` conditions, which are not a shell.
  const unsafe = /\$\{\{\s*github\.event\.(comment\.body|issue\.(title|body))\b/;
  assert.doesNotMatch(source, unsafe, 'the agent reads the thread itself; it is never pasted in');
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== 'string') continue;
      assert.doesNotMatch(step.run, /\$\{\{\s*github\.event\./, `run step must take event data through env, not inline: ${step.run}`);
    }
  }
});

test('a revision is checked and rebuilt, and an answer is not', () => {
  // A push made with the bot's token starts no `pull_request` run, so without
  // this job a revision would never be checked or rebuilt and the contributor's
  // links would keep serving the old build.
  const verify = workflow.jobs.verify;
  assert.equal(verify.uses, VERIFY);
  assert.equal(verify.if, "needs.agent.outputs.result == 'revised'", 'rebuilding on a question spends two packaging jobs on a reply');
  assert.equal(verify.with.status_before, 'revising', 'the contributor is told the build is being replaced');
  assert.equal(verify.with.pr_number, '${{ needs.agent.outputs.pr }}');
  assert.equal(verify.with.branch, '${{ needs.agent.outputs.branch }}');
  assert.doesNotMatch(source, /gh workflow run/, 'verify starts the checks');
});

test('"it works" hands the fix to the maintainer, and does not merge it', () => {
  const handoff = workflow.jobs.handoff;
  assert.equal(handoff.if, "needs.agent.outputs.result == 'approved'");
  const run = handoff.steps.map((s) => s.run ?? '').join('\n');
  assert.match(run, /scripts\/ci\/hand-off\.mjs "\$ISSUE" "\$PR"/);
  // The helper is not on `main`.
  assert.equal(handoff.steps[0].with?.ref, 'testing');
  assert.doesNotMatch(code, /gh pr merge|--admin|--auto/, 'the maintainer merges, and nobody else');
  assert.equal(handoff.permissions?.actions, undefined);
});

test('the agent cannot start, cancel or re-run workflows', () => {
  assert.equal(workflow.permissions?.actions, undefined, 'not at workflow level');
  assert.equal(workflow.jobs.agent.permissions?.actions, undefined, 'not in the job that runs the agent');
  assert.deepEqual(workflow.jobs.agent.permissions, { contents: 'write', 'pull-requests': 'write', issues: 'write' });
  assert.doesNotMatch(
    JSON.stringify([workflow.jobs.verify, workflow.jobs.handoff].map((j) => j.steps ?? [])),
    /claude-code-action/,
    'a job that can start workflows must not run an agent'
  );
});

test('a crashed agent run is told, without rewriting the comment that holds the links', () => {
  // Without this the contributor wrote `@claude` and heard nothing at all.
  const failed = workflow.jobs.failed;
  assert.ok(failed, 'expected a `failed` job');
  assert.match(failed.if, /!cancelled\(\)/, 'a status function, or the failed agent job would skip this one too');
  assert.match(failed.if, /needs\.agent\.result == 'failure'/);
  const run = failed.steps.map((s) => s.run ?? '').join('\n');
  assert.match(run, /gh issue comment/);
  assert.match(run, /needs-maintainer/);
  // The earlier links still work, and the status comment still shows them.
  assert.doesNotMatch(run, /status-comment\.mjs/);
  assert.match(run, /earlier download links still work/);
  assert.doesNotMatch(JSON.stringify(failed.steps), /claude-code-action/, 'saying so costs no quota');
});
