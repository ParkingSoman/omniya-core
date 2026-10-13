import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/pipeline-conflicts.yml';
const source = readFileSync(PATH, 'utf8');
const workflow = loadYaml(source);
const on = workflow.on ?? workflow[true];
const jobs = workflow.jobs;

test('it starts on a push to testing, or when the stub on main calls it, and nothing else', () => {
  // `workflow_dispatch` is the stub's: GitHub finds a workflow to start by name
  // only when its file is on the default branch.
  assert.deepEqual(Object.keys(on).sort(), ['push', 'workflow_call']);
  assert.deepEqual(on.push.branches, ['testing']);
  assert.equal(on.workflow_call.inputs.pr_numbers.default, '');
  assert.deepEqual(Object.keys(on.workflow_call.secrets), ['CLAUDE_CODE_OAUTH_TOKEN']);
  assert.doesNotMatch(source, /pull_request_target|issue_comment|\bissues:\s*\n\s*types/);
});

test('the stages run in order, and only the repair run can be an agent', () => {
  assert.deepEqual(Object.keys(jobs), ['map', 'resolve', 'plan', 'verify', 'handoff']);
  assert.deepEqual(jobs.resolve.needs, 'map');
  assert.deepEqual(jobs.plan.needs, ['map', 'resolve']);
  assert.deepEqual(jobs.verify.needs, 'plan');
  assert.deepEqual(jobs.handoff.needs, ['plan', 'verify']);
  // A job that can start workflows or post on an issue must not run an agent.
  for (const name of ['map', 'plan', 'verify', 'handoff']) {
    assert.doesNotMatch(JSON.stringify(jobs[name].steps ?? []), /claude-code-action/, name);
  }
});

test('nothing runs when nothing conflicts, and the plan still runs after a crashed or skipped repair', () => {
  assert.equal(jobs.resolve.if, "needs.map.outputs.count != '0'");
  assert.match(jobs.plan.if, /!cancelled\(\)/);
  assert.match(jobs.plan.if, /needs\.map\.result == 'success'/);
  assert.match(source, /name: conflict-map-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
});

test('the map reads all of history, because merge-tree needs every merge base', () => {
  const checkout = jobs.map.steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout'));
  assert.equal(checkout.with['fetch-depth'], 0);
});

test('every checkout names testing, because the stub that calls this file runs on main', () => {
  for (const [name, job] of Object.entries(jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.uses === 'string' && step.uses.startsWith('actions/checkout')) {
        assert.equal(step.with?.ref, 'testing', `${name} must check out testing, not the caller's branch`);
      }
    }
  }
  // A relative path would resolve against the caller's branch, which is main.
  assert.doesNotMatch(source, /uses:\s*\.\//);
});

test('the repair run uses the stronger model at medium effort, and holds no actions or issue write', () => {
  assert.equal(jobs.resolve.uses, 'ParkingSoman/omniya-core/.github/workflows/pipeline-agent.yml@testing');
  assert.equal(jobs.resolve.with.mode, 'conflict');
  assert.equal(jobs.resolve.with.model, 'claude-opus-5-5');
  assert.equal(jobs.resolve.with.effort, 'medium');
  assert.equal(jobs.resolve.with.map_artifact, 'conflict-map-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(jobs.resolve.permissions.actions, undefined);
  assert.equal(jobs.resolve.permissions.issues, 'read');
  assert.deepEqual(Object.keys(jobs.resolve.secrets), ['CLAUDE_CODE_OAUTH_TOKEN']);
});

test('only one run at a time, and a started run is never cancelled half way', () => {
  assert.equal(workflow.concurrency.group, 'pipeline-conflicts');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
});

test('what was repaired is read by the pipeline, and the agent\'s words arrive through env only', () => {
  const step = jobs.plan.steps.find((s) => s.id === 'p');
  assert.equal(step.env.REVISED, '${{ needs.resolve.outputs.revised }}');
  assert.equal(step.env.NOTES, '${{ needs.resolve.outputs.notes }}');
  assert.equal(step.env.RESOLVE_RESULT, '${{ needs.resolve.result }}');
  assert.match(step.run, /scripts\/ci\/conflict-outcome\.mjs/);
  for (const job of Object.values(jobs)) {
    for (const s of job.steps ?? []) {
      if (typeof s.run !== 'string') continue;
      assert.doesNotMatch(s.run, /\$\{\{/, `a run step must take data through env: ${s.run.slice(0, 80)}`);
    }
  }
});

test('each repaired branch is checked and built one at a time, quietly, under the contributor\'s own lock', () => {
  assert.equal(jobs.verify.strategy['max-parallel'], 1);
  assert.equal(jobs.verify.strategy['fail-fast'], false);
  assert.equal(jobs.verify.uses, 'ParkingSoman/omniya-core/.github/workflows/pipeline-verify.yml@testing');
  assert.equal(jobs.verify.with.reply_state, 'quiet');
  assert.equal(jobs.verify.concurrency.group, 'contributor-issue-${{ matrix.issue }}');
  assert.equal(jobs.verify.concurrency['cancel-in-progress'], false);
  assert.equal(jobs.verify.permissions.actions, 'write', 'it starts the checks and the build');
  // Numbers go in as text: a string input will not take a number.
  assert.match(jobs.verify.with.issue_number, /format\('\{0\}', matrix\.issue\)/);
  assert.match(jobs.verify.with.pr_number, /format\('\{0\}', matrix\.pr\)/);
});

test('the hand-off is silent unless the checks are green, and starts nothing', () => {
  const run = jobs.handoff.steps.map((s) => s.run ?? '').join('\n');
  assert.match(run, /scripts\/ci\/hand-off\.mjs "\$ISSUE" "\$PR" --if-green/);
  assert.equal(jobs.handoff.permissions.actions, undefined);
  assert.equal(jobs.handoff.strategy['max-parallel'], 1);
});

test('a branch is merged into, never pushed to testing or main, and the workflow never merges anything itself', () => {
  assert.doesNotMatch(source, /gh pr merge|--admin|--auto|git push|--force/);
});
