import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/pipeline-verify.yml';
const source = readFileSync(PATH, 'utf8');
const workflow = loadYaml(source);
const jobs = workflow.jobs;
const call = (workflow.on ?? workflow[true]).workflow_call;

const AGENT = 'ParkingSoman/omniya-core/.github/workflows/pipeline-agent.yml@testing';
const REPAIRS = 3;

test('the chain is verify, repair, verify ... and then a report, with three repairs', () => {
  const expected = [];
  for (let n = 1; n <= REPAIRS; n += 1) expected.push(`verify-${n}`, `repair-${n}`);
  expected.push(`verify-${REPAIRS + 1}`, 'report');
  assert.deepEqual(Object.keys(jobs), expected);
  assert.equal(jobs[`repair-${REPAIRS + 1}`], undefined, 'the last verify has no repair after it: that is the cap');
});

test('a repair runs only after a red verify, and the next verify only after a repair that changed the branch', () => {
  for (let n = 1; n <= REPAIRS; n += 1) {
    assert.deepEqual(jobs[`repair-${n}`].needs, [`verify-${n}`]);
    assert.equal(jobs[`repair-${n}`].if, `needs.verify-${n}.outputs.green == 'false'`);
    assert.deepEqual(jobs[`verify-${n + 1}`].needs, [`repair-${n}`]);
    assert.equal(jobs[`verify-${n + 1}`].if, `needs.repair-${n}.outputs.result == 'revised'`);
  }
  assert.equal(jobs['verify-1'].needs, undefined);
  assert.equal(jobs['verify-1'].if, undefined);
});

test('verify jobs start workflows and run no agent; repair jobs run an agent and start nothing', () => {
  for (let n = 1; n <= REPAIRS + 1; n += 1) {
    const verify = jobs[`verify-${n}`];
    assert.deepEqual(verify.permissions, { actions: 'write', contents: 'read', 'pull-requests': 'read', issues: 'write' }, `verify-${n}`);
    assert.doesNotMatch(JSON.stringify(verify.steps), /claude-code-action/, `verify-${n} must not run an agent`);
    // The helper scripts are on `testing`, not on the default branch.
    assert.equal(verify.steps[0].with.ref, 'testing');
  }
  for (let n = 1; n <= REPAIRS; n += 1) {
    const repair = jobs[`repair-${n}`];
    assert.equal(repair.permissions.actions, undefined, `repair-${n} must not hold actions`);
    assert.deepEqual(repair.permissions, { contents: 'write', 'pull-requests': 'write', issues: 'write' });
    assert.equal(repair.uses, AGENT);
    assert.equal(repair.with.mode, 'checks-failed');
    assert.equal(repair.with.log_artifact, `failed-checks-${n}`);
    assert.deepEqual(Object.keys(repair.secrets), ['CLAUDE_CODE_OAUTH_TOKEN']);
  }
  assert.equal(workflow.permissions?.actions, undefined);
});

test('a red verify keeps its log under the name the repair after it downloads', () => {
  for (let n = 1; n <= REPAIRS + 1; n += 1) {
    const upload = jobs[`verify-${n}`].steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'));
    assert.equal(upload.if, "steps.v.outputs.green == 'false'");
    assert.equal(upload.with.name, `failed-checks-${n}`);
    assert.match(upload.with.path, /verify\/failed\.log/);
  }
});

test('the first verify can set the status on the issue, and no other does', () => {
  const first = jobs['verify-1'].steps.find((s) => /status-comment\.mjs/.test(s.run ?? ''));
  assert.equal(first.if, "inputs.status_before != ''");
  assert.equal(call.inputs.status_before.default, '');
  for (let n = 2; n <= REPAIRS + 1; n += 1) {
    assert.ok(!jobs[`verify-${n}`].steps.some((s) => /status-comment\.mjs/.test(s.run ?? '')), `verify-${n}`);
  }
});

test('the report decides by the LAST verify that ran, and a missing answer is not green', () => {
  const report = jobs.report;
  assert.equal(report.if, '${{ !cancelled() }}', 'it must run even when a job before it failed');
  assert.deepEqual(report.needs, Object.keys(jobs).filter((name) => name !== 'report'));
  const final = report.steps.find((s) => s.id === 'final');
  for (let n = 1; n <= REPAIRS + 1; n += 1) assert.equal(final.env[`V${n}`], `\${{ needs.verify-${n}.outputs.green }}`);
  // Newest first, first non-empty wins.
  assert.match(final.run, /for v in "\$V4" "\$V3" "\$V2" "\$V1"/);
  assert.match(final.run, /\[ "\$final" = "true" \]/, 'only an explicit true is green');
  assert.equal(report.outputs.green, '${{ steps.final.outputs.green }}');
  assert.equal(call.outputs.green.value, '${{ jobs.report.outputs.green }}');
});

test('green says the build is ready on the issue; red says a technical thing is with the maintainer, and labels it', () => {
  const run = jobs.report.steps.find((s) => s.id === 'final').run;
  assert.match(run, /status-comment\.mjs "\$ISSUE" ready "\$PR"/);
  assert.match(run, /status-comment\.mjs "\$ISSUE" maintainer/);
  assert.match(run, /gh pr edit "\$PR" --add-label needs-maintainer/);
  assert.match(run, /gh pr comment "\$PR"/, 'the technical case goes on the pull request');
  assert.doesNotMatch(run, /gh issue comment/, 'the contributor reads the status comment, and nothing technical');
});

test('it carries no concurrency group of its own', () => {
  // A called workflow given the caller's group waits on itself for ever. The
  // caller holds the one group for the issue.
  assert.equal(workflow.concurrency, undefined);
  for (const job of Object.values(jobs)) assert.equal(job.concurrency, undefined);
});

test('the branch and numbers go through env, never inline into a shell', () => {
  for (const job of Object.values(jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== 'string') continue;
      assert.doesNotMatch(step.run, /\$\{\{\s*(github\.event|inputs)\./, `inline data in a run step: ${step.run.slice(0, 80)}`);
    }
  }
});

test('every verify job can outlast the slowest run it waits for', () => {
  // verify-branch.mjs waits up to 80 minutes for the runs to finish.
  for (let n = 1; n <= REPAIRS + 1; n += 1) assert.ok(jobs[`verify-${n}`]['timeout-minutes'] >= 90);
});
