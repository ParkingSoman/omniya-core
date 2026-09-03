import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { AllowlistError, isAllowed, parseAllowlist } from '../../../scripts/ci/allowlist.mjs';

const shipped = readFileSync('.github/contributors.yml', 'utf8');

test('the shipped allowlist parses and names the maintainer', () => {
  const handles = parseAllowlist(shipped);
  assert.ok(handles.includes('ParkingSoman'), `expected ParkingSoman, got ${JSON.stringify(handles)}`);
});

test('the commented example handle is not a live entry', () => {
  // The file ships a `# - example-handle` line so that adding somebody is one
  // visible edit rather than a guess at the format. If the comment stripper
  // ever stopped working, that line would silently admit a real account named
  // `example-handle`.
  assert.equal(isAllowed('example-handle', parseAllowlist(shipped)), false);
});

test('a listed handle is admitted, whatever its case', () => {
  const handles = parseAllowlist('contributors:\n  - ParkingSoman\n');
  assert.equal(isAllowed('ParkingSoman', handles), true);
  // GitHub handles are case-insensitive. An event reporting a different case is
  // the same person, and refusing them would be a refusal nobody could explain.
  assert.equal(isAllowed('parkingsoman', handles), true);
});

test('an unlisted handle is refused', () => {
  const handles = parseAllowlist('contributors:\n  - ParkingSoman\n');
  assert.equal(isAllowed('somebody-else', handles), false);
  assert.equal(isAllowed('', handles), false);
  assert.equal(isAllowed(undefined, handles), false);
});

test('a bot cannot be put on the list at all', () => {
  // A bot handle carries brackets, which are not legal in a GitHub username, so
  // the parser rejects the whole file rather than the one line. That is the
  // right severity: somebody listing a bot has misunderstood what this file is
  // for, and the fix is to look at it, not to have one entry quietly dropped.
  assert.throws(
    () => parseAllowlist('contributors:\n  - github-actions[bot]\n  - ParkingSoman\n'),
    AllowlistError
  );
});

test('a bot actor is refused whatever the list says', () => {
  // Defence in depth, on the other side of the gate: the handle here comes from
  // the GitHub event, not from the file. This is what stops the pipeline
  // triggering itself -- a pull request the fix run opened must not be able to
  // start another fix run. `claude-code-action` refuses bot actors by default
  // as well; this is the same rule said where a unit test can reach it.
  const handles = parseAllowlist('contributors:\n  - ParkingSoman\n');
  assert.equal(isAllowed('github-actions[bot]', handles), false);
  assert.equal(isAllowed('claude[bot]', handles), false);
});

test('comments and blank lines are ignored', () => {
  const handles = parseAllowlist('# who may drive the pipeline\n\ncontributors:\n  - one   # a person\n\n  - two\n');
  assert.deepEqual(handles, ['one', 'two']);
});

test('a file it cannot read refuses rather than admitting anyone', () => {
  // Fail closed. A file this parser does not understand is not evidence that
  // somebody is allowed. Every one of these used to be a plausible way to end
  // up with an empty list and an open gate.
  for (const bad of [
    'contributors: [ParkingSoman]',
    'contributors:\n  - ParkingSoman\nmaintainers:\n  - somebody\n',
    'contributors:\n  - not a handle\n',
    'contributors:\n  - @ParkingSoman\n',
    'contributors:\n  - "ParkingSoman"\n',
    'people:\n  - ParkingSoman\n',
    ''
  ]) {
    assert.throws(() => parseAllowlist(bad), AllowlistError, `should have refused: ${JSON.stringify(bad)}`);
  }
});

test('an empty list admits nobody', () => {
  // Not an error -- removing the last contributor is a legitimate thing to do,
  // and it must stop the pipeline rather than open it.
  const handles = parseAllowlist('contributors:\n');
  assert.deepEqual(handles, []);
  assert.equal(isAllowed('ParkingSoman', handles), false);
});
