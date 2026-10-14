import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/pipeline-signoff.yml';
const source = readFileSync(PATH, 'utf8');
const workflow = loadYaml(source);

// The file explains its own history in comments, so a comment can say the exact
// string a "this must not appear" assertion is looking for. Searching `code`
// keeps the assertion about the workflow instead of about the prose around it.
const code = source
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const triggers = workflow.on ?? workflow[true];

test('closing an issue merges nothing', () => {
  // Closing used to merge the fix into `testing`. That put the whole decision on
  // the person least able to judge whether a change is safe for everybody. The
  // maintainer merges now, and the sign-off is a comment on the issue.
  assert.doesNotMatch(code, /gh pr merge|--admin|--auto|--squash|--match-head-commit/);
  assert.doesNotMatch(code, /gh pr ready/, 'taking a pull request out of draft is the comment path, not this one');
  assert.deepEqual(Object.keys(workflow.jobs), ['explain']);
});

test('it starts when an issue is closed, and not when it is closed as not planned', () => {
  assert.deepEqual(triggers?.issues?.types, ['closed']);
  assert.equal(triggers?.workflow_call, undefined, 'it holds its own trigger and is not called');
  assert.match(workflow.jobs.explain.if, /state_reason\s*!=\s*'not_planned'/);
});

test('a contributor who closes an issue with a fix still open is told what to write instead', () => {
  const steps = workflow.jobs.explain.steps;
  const find = steps.find((s) => s.id === 'find');
  assert.match(find.run, /scripts\/ci\/find-fix-pr\.mjs "\$ISSUE_NUMBER"/);
  // The default checkout is `testing`, which has the helper.
  assert.equal(steps[0].with?.ref, undefined);

  const say = steps.find((s) => /gh issue comment/.test(s.run ?? ''));
  assert.equal(say.if, "steps.find.outputs.count != '0'", 'silent when there is no open fix: that is the merge closing the issue');
  assert.match(say.run, /@claude it works/);
  assert.match(say.run, /Closing does not send it to the maintainer/);
});

test('it costs nothing: no secret, no agent, no write beyond a comment', () => {
  assert.equal(triggers?.workflow_call, undefined);
  assert.doesNotMatch(code, /claude-code-action|CLAUDE_CODE_OAUTH_TOKEN/);
  assert.deepEqual(workflow.jobs.explain.permissions, { contents: 'read', 'pull-requests': 'read', issues: 'write' });
});

test('it takes no concurrency group, so it cannot replace a waiting follow-up', () => {
  // GitHub keeps one waiting run per group. A close sharing the issue's group
  // would cancel a contributor's waiting `@claude` comment.
  assert.equal(workflow.concurrency, undefined);
});
