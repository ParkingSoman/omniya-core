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

const TOKEN = { CLAUDE_CODE_OAUTH_TOKEN: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}' };
const SECRETS = { 'contributor-fix.yml': TOKEN, 'contributor-followup.yml': TOKEN, 'contributor-signoff.yml': undefined };

const load = (file) => loadYaml(readFileSync(`${DIR}/${file}`, 'utf8'));

test('every stub is accounted for, and there are no others', () => {
  assert.deepEqual(readdirSync(DIR).sort(), Object.keys(STUBS).sort());
});

test('each stub only calls its workflow on testing, and passes only the secret it needs', () => {
  // This is the file that lives on `main`, where changing it needs the
  // maintainer. It has to be too small to need changing. All the logic is on
  // `testing`, reached through this one line.
  for (const [stub, target] of Object.entries(STUBS)) {
    const workflow = load(stub);
    const jobs = Object.entries(workflow.jobs ?? {});
    assert.equal(jobs.length, 1, `${stub} must have exactly one job`);
    const [, job] = jobs[0];

    assert.equal(job.uses, `${REPO}/.github/workflows/${target}@testing`, `${stub} must call ${target} on testing`);
    // Least privilege. `inherit` would hand the called workflow every secret in
    // the repository, now and any added later. Only the two workflows that start
    // an agent get the one token they need, and sign-off gets none: it merges
    // with the workflow's own token.
    assert.notEqual(job.secrets, 'inherit', `${stub} must not pass every secret through`);
    assert.deepEqual(
      job.secrets,
      SECRETS[stub],
      `${stub} must pass exactly the secrets its workflow declares`
    );
    assert.equal(job.steps, undefined, `${stub} must hold no steps: logic belongs on testing`);
    assert.equal(job['runs-on'], undefined, `${stub} must not run anything itself`);
  }
});

test('a stub grants no more than the workflow it calls needs', () => {
  const base = { contents: 'write', 'pull-requests': 'write', issues: 'write' };
  for (const stub of Object.keys(STUBS)) {
    const { permissions } = Object.values(load(stub).jobs)[0];
    // The two that run an agent also start the checks and the build, which needs
    // `actions: write`. Sign-off only merges, so it does not get it.
    const expected = stub === 'contributor-signoff.yml' ? base : { ...base, actions: 'write' };
    assert.deepEqual(permissions, expected, stub);
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

test('a called workflow declares the secret it is given, and sign-off declares none', () => {
  const secretsOf = (target) => {
    const w = loadYaml(readFileSync(`.github/workflows/${target}`, 'utf8'));
    return (w.on ?? w[true]).workflow_call?.secrets;
  };
  assert.deepEqual(Object.keys(secretsOf('pipeline-fix.yml')), ['CLAUDE_CODE_OAUTH_TOKEN']);
  assert.deepEqual(Object.keys(secretsOf('pipeline-followup.yml')), ['CLAUDE_CODE_OAUTH_TOKEN']);
  assert.equal(secretsOf('pipeline-signoff.yml'), undefined);

  // `secrets.GITHUB_TOKEN` is not something a caller passes. `github.token` is
  // always there, so the called workflows use it.
  for (const target of Object.values(STUBS)) {
    assert.doesNotMatch(readFileSync(`.github/workflows/${target}`, 'utf8'), /secrets\.GITHUB_TOKEN/, target);
  }
});


test('every job states its own permissions, and the small ones hold almost none', () => {
  // The stub grants a ceiling and the workflow's top-level block is its default.
  // A job that does not state its own inherits the default, which is write
  // access to contents, pull requests and issues. The gate that only reads a
  // list, and the job that only posts a comment, should not hold that.
  const expected = {
    'pipeline-fix.yml': {
      allowlist: { contents: 'read', issues: 'read' },
      refused: { issues: 'write' },
      fix: { contents: 'write', 'pull-requests': 'write', issues: 'write' },
      'start-checks': { actions: 'write', contents: 'read', 'pull-requests': 'read' }
    },
    'pipeline-followup.yml': {
      allowlist: { contents: 'read' },
      revise: { contents: 'write', 'pull-requests': 'write', issues: 'write' },
      'start-checks': { actions: 'write', contents: 'read', 'pull-requests': 'read' }
    },
    'pipeline-signoff.yml': {
      allowlist: { contents: 'read' }
    }
  };
  for (const [file, jobs] of Object.entries(expected)) {
    const workflow = loadYaml(readFileSync(`.github/workflows/${file}`, 'utf8'));
    for (const [name, permissions] of Object.entries(jobs)) {
      assert.deepEqual(workflow.jobs[name]?.permissions, permissions, `${file} job ${name}`);
    }
  }
});
