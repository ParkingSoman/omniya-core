import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

import { ABSENT_HERE, ABSENT_ON_MAIN, PAIRED_FILES, findDrift } from '../../../scripts/ci/pipeline-drift.mjs';

// Two fake branches. A path missing from a map is a file that does not exist
// there. `main` holds the stubs under .github/workflows and the allowlist.
const branch = (files) => (path) => (path in files ? files[path] : null);
const LIST = 'contributors:\n  - ParkingSoman\n';
const here = Object.fromEntries(PAIRED_FILES.map(([local]) => [local, `contents of ${local}`]));
const main = {
  ...Object.fromEntries(PAIRED_FILES.map(([local, remote]) => [remote, `contents of ${local}`])),
  '.github/contributors.yml': LIST
};

test('matching stubs and a readable allowlist are in order', () => {
  assert.deepEqual(findDrift({ readLocal: branch(here), readMain: branch(main) }), []);
});

test('the issue #22 case, in the new shape: a stub edited here and not on main', () => {
  const edited = { ...here, '.github/pipeline-stubs/contributor-fix.yml': 'changed' };
  assert.deepEqual(findDrift({ readLocal: branch(edited), readMain: branch(main) }), [
    '.github/pipeline-stubs/contributor-fix.yml: differs from .github/workflows/contributor-fix.yml on main'
  ]);
});

test('a stub that was never copied to main is named, with where to put it', () => {
  const missing = { ...main };
  delete missing['.github/workflows/contributor-signoff.yml'];
  const [problem] = findDrift({ readLocal: branch(here), readMain: branch(missing) });
  assert.match(problem, /contributor-signoff\.yml: not on main yet/);
});

test('a decoy allowlist on this branch is reported', () => {
  // An allowlist here looks editable and does nothing. Editing the wrong copy is
  // the mistake that left issue #22 unanswered.
  const decoy = { ...here, '.github/contributors.yml': LIST };
  const problems = findDrift({ readLocal: branch(decoy), readMain: branch(main) });
  assert.deepEqual(problems, ['.github/contributors.yml: must not exist on this branch (the allowlist lives on main only)']);
});

test('a retired workflow still on main is reported', () => {
  const stale = { ...main, '.github/workflows/claude.yml': 'name: Claude Code' };
  assert.deepEqual(findDrift({ readLocal: branch(here), readMain: branch(stale) }), [
    '.github/workflows/claude.yml: still on main, and should be deleted there'
  ]);
});

test('an allowlist on main that the gate cannot read is reported', () => {
  for (const [broken, why] of [
    [null, /missing on main/],
    ['nonsense', /cannot be read on main/],
    ['contributors:\n  not a list item\n', /cannot be read on main/]
  ]) {
    const files = { ...main };
    if (broken === null) delete files['.github/contributors.yml'];
    else files['.github/contributors.yml'] = broken;
    const [problem] = findDrift({ readLocal: branch(here), readMain: branch(files) });
    assert.match(problem, why);
  }
});

test('the files the check calls absent are the ones this branch really lacks', () => {
  assert.ok(ABSENT_HERE.includes('.github/contributors.yml'));
  assert.ok(ABSENT_ON_MAIN.includes('.github/workflows/claude.yml'));
});

test('the check runs on pull requests into testing', () => {
  const workflow = loadYaml(readFileSync('.github/workflows/pr-checks.yml', 'utf8'));
  const job = workflow.jobs?.['pipeline-on-main'];
  assert.ok(job, 'expected a `pipeline-on-main` job in pr-checks.yml');
  assert.equal(job.if, undefined, 'the drift check must not be conditional');
  assert.equal(job['continue-on-error'], undefined, 'and must not be advisory');
  const runs = job.steps.map((s) => s.run ?? '');
  assert.ok(runs.some((r) => r.includes('git fetch') && r.includes('origin main')), 'it must fetch main first');
  assert.ok(runs.some((r) => r.includes('scripts/ci/pipeline-drift.mjs')));
  assert.ok(!runs.some((r) => /\|\|\s*true/.test(r)), 'its exit code must not be swallowed');
});
