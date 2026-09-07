import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/contributor-followup.yml';
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
const triggers = workflow.on ?? workflow[true];

const allowlistJob = workflow.jobs?.allowlist;
const reviseJob = workflow.jobs?.revise;

const actionStep = (reviseJob?.steps ?? []).find(
  (s) => typeof s.uses === 'string' && s.uses.startsWith('anthropics/claude-code-action')
);

test('only a @claude comment on a pull request starts a run', () => {
  // Three separate filters, and each one is load-bearing for a different
  // reason. This test is what notices when a later edit drops one of them.

  // The event. `issue_comment` covers comments on issues AND on pull requests;
  // GitHub does not have a separate one.
  assert.deepEqual(triggers?.issue_comment?.types, ['created']);

  const condition = allowlistJob?.if ?? '';

  // `github.event.issue.pull_request` is present only when the comment is on a
  // pull request. Without this line, a comment on the original bug report would
  // start a run, and there is no branch to push to from there -- the build the
  // contributor is answering lives on the pull request.
  assert.match(
    condition,
    /github\.event\.issue\.pull_request/,
    'the run must be limited to comments on pull requests'
  );

  // `@claude` is what makes a comment cost anything. Without it every "thanks,
  // testing tonight" spends a run of the maintainer's subscription quota.
  assert.match(
    condition,
    /contains\(\s*github\.event\.comment\.body\s*,\s*'@claude'\s*\)/,
    'only a comment naming @claude may spend a run'
  );
});

test('the allowlist gate runs before anything is installed', () => {
  assert.ok(allowlistJob, 'expected an `allowlist` job');

  // The decision about whether to spend somebody's subscription quota must not
  // wait on an install that can fail, be slow, or be tampered with. The script
  // parses `.github/contributors.yml` itself for exactly this reason, so the
  // job it runs in needs nothing but a checkout.
  const runs = (allowlistJob.steps ?? []).map((s) => s.run ?? '').join('\n');
  const uses = (allowlistJob.steps ?? []).map((s) => s.uses ?? '').join('\n');
  assert.doesNotMatch(runs, /npm ci|npm install|brew install/, 'the gate must not wait on an install');
  assert.doesNotMatch(uses, /setup-node/, 'the gate must not wait on a toolchain');
  assert.match(runs, /scripts\/ci\/allowlist\.mjs/, 'the gate must be the allowlist script');

  // And the expensive job must actually wait on it. A `needs` without the `if`,
  // or an `if` without the `needs`, both read as gated and are not.
  assert.ok(
    [].concat(reviseJob?.needs ?? []).includes('allowlist'),
    'the revise job must need the allowlist job'
  );
  assert.match(
    reviseJob?.if ?? '',
    /needs\.allowlist\.outputs\.allowed\s*==\s*'true'/,
    'the revise job must run only when the gate said true'
  );
});

test('a follow-up run is bounded', () => {
  // Each of these is one way the maintainer's bill could run away. They are the
  // same three `contributor-fix.yml` carries, plus one this file adds.

  // One run per pull request. A second comment queues behind the first instead
  // of racing it -- and racing matters more here than on the first round,
  // because two runs would be pushing to the same branch.
  const group = workflow.concurrency?.group ?? '';
  assert.match(group, /github\.event\.issue\.number/, 'concurrency group must be keyed on the pull request number');
  assert.equal(
    workflow.concurrency?.['cancel-in-progress'],
    false,
    'a cancelled run can leave half a revision committed on the branch being downloaded from'
  );

  // The run ends. A job with no timeout can sit until GitHub's own limit.
  assert.equal(typeof reviseJob?.['timeout-minutes'], 'number', 'the revise job needs timeout-minutes');
  assert.ok(reviseJob['timeout-minutes'] <= 120, 'the revise job timeout is too generous to be a budget');

  // The agent stops. --max-turns is the ceiling on the agent's own loop, which
  // a job timeout does not bound -- the job can end while the quota is spent.
  assert.ok(actionStep, 'expected the claude-code-action step');
  assert.match(actionStep.with?.claude_args ?? '', /--max-turns\s+\d+/, 'claude_args must set --max-turns');

  // And it draws on the subscription, not on API billing. An API key present
  // would bill per token, which is a different budget from the one every
  // comment on the thread is understood to spend.
  assert.equal(actionStep.with?.anthropic_api_key, undefined, 'no API key input: runs draw on the subscription');
  assert.doesNotMatch(code, /ANTHROPIC_API_KEY/, 'no API key anywhere in this file');
  assert.match(actionStep.with?.claude_code_oauth_token ?? '', /CLAUDE_CODE_OAUTH_TOKEN/);
});

test('the loop cannot feed itself', () => {
  // This file pushes, which rebuilds, which comments. `pr-build.yml` leaves a
  // comment on this same pull request, and the agent's own progress comment is
  // written by `github-actions[bot]`. Either could quote `@claude`.
  assert.match(
    allowlistJob?.if ?? '',
    /github\.event\.comment\.user\.type\s*!=\s*'Bot'/,
    'a bot comment must not start a run'
  );

  // `isAllowed` in the allowlist script refuses `*[bot]` too. This is the same
  // rule said one step earlier, so the loop is cut before a runner is claimed.
  // `allowed_bots` defaults to empty, which is what makes the action refuse bot
  // actors as well. Setting it would undo that, so assert nobody has.
  assert.equal(actionStep.with?.allowed_bots, undefined, 'allowed_bots must stay unset');

  // And nothing else starts this workflow. A `pull_request` trigger would fire
  // on the push this file makes.
  assert.equal(triggers?.pull_request, undefined);
  assert.equal(triggers?.push, undefined);
  assert.equal(triggers?.issues, undefined);
});

test('no untrusted comment text reaches a run step or the prompt', () => {
  // Comment bodies, issue titles and issue bodies are written by whoever typed
  // them. In a `run:` they are shell injection; in the prompt they are
  // instructions the agent may follow. Only the NUMBER is safe, because GitHub
  // guarantees it is an integer.
  const unsafe = /\$\{\{\s*github\.event\.(comment\.body|issue\.(title|body))\b/;
  assert.doesNotMatch(source, unsafe, 'the agent reads the thread itself; it is never pasted in');

  // The wider rule, and the one that catches the next field nobody thought
  // about: no event data inline in a shell at all. It goes through `env`.
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== 'string') continue;
      assert.doesNotMatch(
        step.run,
        /\$\{\{\s*github\.event\./,
        `run step must take event data through env, not inline: ${step.run}`
      );
    }
  }
});

test("the follow-up run pushes to the pull request's own branch", () => {
  // This is the whole difference between this file and `contributor-fix.yml`.
  // `pr-build.yml` publishes to a release tagged `pr-<number>` and its comment
  // tells the contributor, in writing, that her download links stay the same
  // and the files behind them are replaced. That promise holds only if every
  // round lands on the branch the pull request is already on.
  const checkout = (reviseJob?.steps ?? []).find(
    (s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout') && s.with?.ref
  );
  assert.ok(checkout, 'expected a checkout of the pull request branch');
  assert.match(
    checkout.with.ref,
    /steps\.pr\.outputs\.branch/,
    'the checkout must use the branch resolved from the pull request'
  );

  // `branch_prefix` is what makes the action cut a NEW branch. Present here it
  // would mean a second pull request, a second `pr-<n>` release, and a second
  // set of links for one bug.
  assert.equal(actionStep.with?.branch_prefix, undefined, 'a follow-up must not start a new branch');
  assert.doesNotMatch(code, /gh pr create/, 'a follow-up must not open a second pull request');

  const prompt = actionStep.with?.prompt ?? '';
  assert.match(prompt, /Do not\s+create\s+a\s+branch/i);
  assert.match(prompt, /Do not\s+open\s+a\s+pull\s+request/i);
  assert.match(prompt, /git push origin HEAD/, 'the prompt must name the push that triggers the rebuild');

  // The branch name is checked against the shape `contributor-fix.yml` creates
  // before it is used as a `ref:`. That prefix is what stops a `@claude`
  // comment on a hand-written pull request from getting an agent's commits
  // pushed onto its branch.
  const resolve = (reviseJob?.steps ?? []).find((s) => s.id === 'pr');
  assert.ok(resolve, 'expected a step that resolves the head branch');
  assert.match(
    resolve.run ?? '',
    /claude\/fix-\*/,
    'the resolved branch must be checked against the prefix this pipeline creates'
  );
});
