import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/contributor-fix.yml';
const source = readFileSync(PATH, 'utf8');
const workflow = loadYaml(source);

// `on: issues` parses as the boolean true in YAML 1.1, because `on` is one of
// its reserved truthy words. Reach the trigger by whichever key survived rather
// than asserting one and getting a confusing undefined.
const triggers = workflow.on ?? workflow[true];

test('one run per issue, bounded', () => {
  // These runs spend the maintainer's own Claude subscription quota. An
  // unbounded run costs them directly, and an issue that can start several runs
  // multiplies that. Each of the three assertions below is one way that bill
  // could run away.

  // One run per issue: the concurrency group is keyed on the issue number, so a
  // re-open or a second event queues behind the first instead of racing it.
  const group = workflow.concurrency?.group ?? '';
  assert.match(group, /github\.event\.issue\.number/, 'concurrency group must be keyed on the issue number');

  // The run ends. A job with no timeout can sit until GitHub's own limit.
  const fix = workflow.jobs?.fix;
  assert.ok(fix, 'expected a `fix` job');
  assert.equal(typeof fix['timeout-minutes'], 'number', 'the fix job needs timeout-minutes');
  assert.ok(fix['timeout-minutes'] <= 120, 'the fix job timeout is too generous to be a budget');

  // The agent stops. --max-turns is the ceiling on the agent's own loop, which
  // a job timeout does not bound -- the job can end while the quota is spent.
  const step = fix.steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('anthropics/claude-code-action'));
  assert.ok(step, 'expected the claude-code-action step');
  assert.match(step.with?.claude_args ?? '', /--max-turns\s+\d+/, 'claude_args must set --max-turns');
});

test('the trigger cannot fire on its own output', () => {
  // The pipeline opens pull requests and posts comments. If it also ran on
  // those, it would feed itself. Only a newly opened issue starts a run.
  assert.deepEqual(triggers?.issues?.types, ['opened']);
  assert.equal(triggers?.pull_request, undefined);
  assert.equal(triggers?.issue_comment, undefined);

  // `allowed_bots` defaults to empty, which is what makes the action refuse bot
  // actors. Setting it would undo that, so assert nobody has.
  const fixStep = workflow.jobs.fix.steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('anthropics/claude-code-action'));
  assert.equal(fixStep.with?.allowed_bots, undefined, 'allowed_bots must stay unset so bot actors keep being refused');
});

test('no untrusted issue text is interpolated into a run step or the prompt', () => {
  // Issue titles and bodies are written by whoever opened the issue. In a `run:`
  // they are shell injection; in the prompt they are instructions the agent may
  // follow. Only the issue NUMBER is safe, because GitHub guarantees it is an
  // integer. This test is the thing that notices when a later edit adds one.
  const unsafe = /\$\{\{\s*github\.event\.issue\.(title|body)\b/;
  assert.doesNotMatch(source, unsafe, 'issue title/body must never be interpolated; the agent reads the issue itself');

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

test('the pull request can only be based on testing', () => {
  const step = workflow.jobs.fix.steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('anthropics/claude-code-action'));
  assert.equal(step.with?.base_branch, 'testing');
  // The checkout the agent works from is `testing` too. A run that checked out
  // the default branch would be fixing app code that does not live there.
  const checkout = workflow.jobs.fix.steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout'));
  assert.equal(checkout.with?.ref, 'testing');
});

test('the agent is told to classify before it writes anything', () => {
  const step = workflow.jobs.fix.steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('anthropics/claude-code-action'));
  const prompt = step.with?.prompt ?? '';
  assert.match(prompt, /CLASSIFY FIRST/);
  assert.match(prompt, /needs-design/);
  // A refusal that says nothing is indistinguishable from the pipeline being
  // broken, which is worse than either.
  assert.match(prompt, /comment/i);
});
