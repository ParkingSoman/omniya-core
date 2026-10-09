import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';

import { ABSENT_FILES, PIPELINE_FILES, findDrift } from '../../../scripts/ci/pipeline-drift.mjs';

// A fake pair of branches: a map of path -> contents. A path missing from the
// map is a file that does not exist there.
const branch = (files) => (path) => (path in files ? files[path] : null);
const same = Object.fromEntries(PIPELINE_FILES.map((path) => [path, `contents of ${path}`]));

test('identical pipelines are in sync', () => {
  assert.deepEqual(findDrift({ readLocal: branch(same), readMain: branch(same) }), []);
});

test('the issue #22 case: an allowlist change that never reached main', () => {
  const testing = { ...same, '.github/contributors.yml': 'contributors:\n  - HayleeRM\n' };
  const problems = findDrift({ readLocal: branch(testing), readMain: branch(same) });
  assert.deepEqual(problems, ['.github/contributors.yml: differs from main']);
});

test('a workflow that exists on only one side is named', () => {
  const withoutFollowup = { ...same };
  delete withoutFollowup['.github/workflows/contributor-followup.yml'];

  assert.deepEqual(findDrift({ readLocal: branch(same), readMain: branch(withoutFollowup) }), [
    '.github/workflows/contributor-followup.yml: on this branch but not on main'
  ]);
  assert.deepEqual(findDrift({ readLocal: branch(withoutFollowup), readMain: branch(same) }), [
    '.github/workflows/contributor-followup.yml: on main but not on this branch'
  ]);
});

test('a retired workflow still on main is reported', () => {
  const stale = { ...same, '.github/workflows/claude.yml': 'name: Claude Code' };
  assert.deepEqual(findDrift({ readLocal: branch(same), readMain: branch(stale) }), [
    '.github/workflows/claude.yml: still on main, and should be deleted there'
  ]);
  assert.deepEqual(findDrift({ readLocal: branch(stale), readMain: branch(same) }), [
    '.github/workflows/claude.yml: must not exist on this branch'
  ]);
});

test('every contributor workflow on disk is covered by the check', () => {
  // The check is only as good as its list. A new `contributor-*.yml` that is not
  // named in it could drift forever, which is the exact failure this exists for.
  for (const file of readdirSync('.github/workflows').filter((f) => /^contributor-.*\.yml$/.test(f))) {
    assert.ok(
      PIPELINE_FILES.includes(`.github/workflows/${file}`),
      `${file} is a contributor workflow but pipeline-drift.mjs does not compare it with main`
    );
  }
  for (const gone of ABSENT_FILES) {
    assert.ok(!readdirSync('.github/workflows').includes(gone.split('/').pop()), `${gone} must stay deleted`);
  }
});

test('the check runs on pull requests into testing', async () => {
  const { readFileSync } = await import('node:fs');
  const { load } = await import('js-yaml');
  const workflow = load(readFileSync('.github/workflows/pr-checks.yml', 'utf8'));
  const job = workflow.jobs?.['pipeline-on-main'];
  assert.ok(job, 'expected a `pipeline-on-main` job in pr-checks.yml');
  assert.equal(job.if, undefined, 'the drift check must not be conditional');
  assert.equal(job['continue-on-error'], undefined, 'and must not be advisory');
  const runs = job.steps.map((s) => s.run ?? '');
  assert.ok(runs.some((r) => r.includes('git fetch') && r.includes('origin main')), 'it must fetch main first');
  assert.ok(runs.some((r) => r.includes('scripts/ci/pipeline-drift.mjs')));
  assert.ok(!runs.some((r) => /\|\|\s*true/.test(r)), 'its exit code must not be swallowed');
});
