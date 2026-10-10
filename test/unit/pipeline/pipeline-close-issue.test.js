import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const source = readFileSync('.github/workflows/pipeline-close-issue.yml', 'utf8');
const workflow = loadYaml(source);
const triggers = workflow.on ?? workflow[true];
const job = workflow.jobs.close;

test('it runs when a pull request into testing is closed, and only for one this pipeline made and merged', () => {
  assert.deepEqual(triggers.pull_request.types, ['closed']);
  assert.deepEqual(triggers.pull_request.branches, ['testing']);
  assert.match(job.if, /github\.event\.pull_request\.merged == true/, 'a pull request closed without merging closes no issue');
  assert.match(job.if, /head\.repo\.full_name == github\.repository/, 'a fork never closes an issue');
  assert.match(job.if, /startsWith\(github\.event\.pull_request\.head\.ref, 'claude\/fix-'\)/);
  assert.equal(Object.keys(triggers).length, 1);
});

test('the body reaches the shell only through env, and only digits come out', () => {
  const step = job.steps[0];
  assert.equal(step.env.BODY, '${{ github.event.pull_request.body }}');
  assert.doesNotMatch(step.run, /\$\{\{/);
  assert.match(step.run, /tail -n1/, 'the LAST non-empty line decides, as in the helper that finds the pull request');
  assert.match(step.run, /\[0-9\]\[0-9\]\*/);
});

test('the extraction takes the last line and nothing else', () => {
  // The same pipeline the workflow runs, on bodies that must and must not match.
  const extract = (body) => {
    const lines = body.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    const m = /^[Ff]ixes #([0-9]+)\s*$/.exec(lines.at(-1) ?? '');
    return m ? m[1] : '';
  };
  assert.equal(extract('What changed.\n\nFixes #22\n'), '22');
  assert.equal(extract('Fixes #5\nmore\nFixes #22  '), '22');
  assert.equal(extract('Fixes #22\nand then more text'), '');
  assert.equal(extract('no line'), '');
});

test('it can only comment on and close an issue', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read', issues: 'write' });
  assert.match(job.steps[0].run, /gh issue close "\$ISSUE" --repo "\$GITHUB_REPOSITORY" --reason completed/);
  assert.doesNotMatch(source.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'), /claude-code-action|gh pr merge/);
});
