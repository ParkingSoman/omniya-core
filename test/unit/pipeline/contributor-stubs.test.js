import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const DIR = '.github/pipeline-stubs';
const REPO = 'ParkingSoman/omniya-core';

// stub file -> the workflow on `testing` it must call
const STUBS = {
  'contributor-fix.yml': 'pipeline-fix.yml',
  'contributor-followup.yml': 'pipeline-followup.yml',
  'contributor-signoff.yml': 'pipeline-signoff.yml'
};

const load = (file) => loadYaml(readFileSync(`${DIR}/${file}`, 'utf8'));

test('every stub is accounted for, and there are no others', () => {
  assert.deepEqual(readdirSync(DIR).sort(), Object.keys(STUBS).sort());
});

test('each stub only calls its workflow on testing, and passes secrets through', () => {
  // This is the file that lives on `main`, where changing it needs the
  // maintainer. It has to be too small to need changing. All the logic is on
  // `testing`, reached through this one line.
  for (const [stub, target] of Object.entries(STUBS)) {
    const workflow = load(stub);
    const jobs = Object.entries(workflow.jobs ?? {});
    assert.equal(jobs.length, 1, `${stub} must have exactly one job`);
    const [, job] = jobs[0];

    assert.equal(job.uses, `${REPO}/.github/workflows/${target}@testing`, `${stub} must call ${target} on testing`);
    assert.equal(job.secrets, 'inherit', `${stub} must pass the subscription token through`);
    assert.equal(job.steps, undefined, `${stub} must hold no steps: logic belongs on testing`);
    assert.equal(job['runs-on'], undefined, `${stub} must not run anything itself`);
  }
});

test('a stub grants no more than the workflow it calls needs', () => {
  for (const stub of Object.keys(STUBS)) {
    const { permissions } = Object.values(load(stub).jobs)[0];
    assert.deepEqual(permissions, { contents: 'write', 'pull-requests': 'write', issues: 'write' }, stub);
  }
});

test('each stub starts on exactly the event it should, and no event that could loop', () => {
  const triggers = (stub) => {
    const w = load(stub);
    return w.on ?? w[true];
  };

  assert.deepEqual(triggers('contributor-fix.yml').issues.types, ['opened']);
  assert.deepEqual(triggers('contributor-followup.yml').issue_comment.types, ['created']);
  assert.deepEqual(triggers('contributor-signoff.yml').issues.types, ['closed']);

  // The pipeline opens pull requests, pushes branches and posts comments. A
  // stub that also ran on those would feed itself.
  for (const stub of Object.keys(STUBS)) {
    const on = triggers(stub);
    for (const forbidden of ['pull_request', 'pull_request_target', 'push', 'schedule', 'workflow_run']) {
      assert.equal(on[forbidden], undefined, `${stub} must not trigger on ${forbidden}`);
    }
  }
});

test('the called workflows exist on this branch and accept a call', () => {
  for (const target of Object.values(STUBS)) {
    const workflow = loadYaml(readFileSync(`.github/workflows/${target}`, 'utf8'));
    const on = workflow.on ?? workflow[true];
    assert.ok('workflow_call' in on, `${target} must be callable`);
    assert.equal(on.issues, undefined, `${target} must not also trigger itself`);
    assert.equal(on.issue_comment, undefined, `${target} must not also trigger itself`);
  }
});

test('the stub sources are not live workflows on this branch', () => {
  // `.github/pipeline-stubs/` is not a folder GitHub reads. These names must not
  // also exist under `.github/workflows/` here, where they would be a second,
  // diverging copy of what `main` runs.
  const live = readdirSync('.github/workflows');
  for (const stub of Object.keys(STUBS)) {
    assert.ok(!live.includes(stub), `${stub} must not be in .github/workflows on this branch`);
  }
});
