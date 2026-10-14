import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/pipeline-fix.yml';
const source = readFileSync(PATH, 'utf8');
const workflow = loadYaml(source);

// `on: issues` parses as the boolean true in YAML 1.1, because `on` is one of
// its reserved truthy words. Reach the trigger by whichever key survived rather
// than asserting one and getting a confusing undefined.
const triggers = workflow.on ?? workflow[true];

const AGENT = './.github/workflows/pipeline-agent.yml';
const VERIFY = './.github/workflows/pipeline-verify.yml';

test('one run per issue, in the group the follow-up shares', () => {
  // These runs spend the maintainer's own Claude subscription quota. One run per
  // issue: a re-open or a second event queues behind the first instead of racing
  // it. And the SAME group as `pipeline-followup.yml`, so a comment that arrives
  // during a fix waits for it instead of pushing to the same branch.
  const group = workflow.concurrency?.group ?? '';
  assert.match(group, /github\.event\.issue\.number/, 'concurrency group must be keyed on the issue number');
  assert.match(group, /^contributor-issue-/);
  assert.equal(workflow.concurrency?.['cancel-in-progress'], false, 'a killed fix leaves a branch nobody asked for');
});

test('the agent job is a call to the shared agent workflow, in fix mode', () => {
  const fix = workflow.jobs.fix;
  assert.equal(fix.uses, AGENT);
  assert.equal(fix.with?.mode, 'fix');
  assert.equal(fix.with?.issue_number, '${{ needs.allowlist.outputs.number }}');
  assert.deepEqual(Object.keys(fix.secrets), ['CLAUDE_CODE_OAUTH_TOKEN', 'PIPELINE_APP_PRIVATE_KEY']);
  assert.equal(fix.steps, undefined, 'a job that calls a workflow holds no steps');
});

test('the trigger cannot fire on its own output', () => {
  // The pipeline opens pull requests and posts comments. If it also ran on
  // those, it would feed itself. Only a newly opened issue starts a run.
  assert.deepEqual(triggers?.issues?.types, ['opened']);
  assert.equal(triggers?.pull_request, undefined);
  assert.equal(triggers?.issue_comment, undefined);
});

test('no untrusted issue text is interpolated into a run step or the prompt', () => {
  // Issue titles and bodies are written by whoever opened the issue. Only the
  // issue NUMBER is safe, because GitHub guarantees it is an integer.
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

test('a refused author is told, at no cost to the quota', () => {
  // Issue #22 sat for 23 days. The gate refused its author, the fix job was
  // skipped, and nothing on the issue said so. A refusal nobody can see looks
  // exactly like a pipeline that is broken.
  const refused = workflow.jobs?.refused;
  assert.ok(refused, 'expected a `refused` job');
  assert.equal(refused.needs, 'allowlist');
  assert.match(refused.if, /allowed\s*!=\s*'true'/, 'it must run exactly when the gate said no');

  // It must not spend the quota it exists to protect.
  const uses = (refused.steps ?? []).map((s) => s.uses ?? '').join(' ');
  assert.doesNotMatch(uses, /claude-code-action/, 'the refusal comment must not start an agent');
  assert.ok(
    (refused.steps ?? []).some((s) => /gh issue comment/.test(s.run ?? '')),
    'it must post a comment'
  );

  // A bot-opened issue must not start a comment exchange.
  assert.match(refused.if, /\[bot\]/, 'bot authors must be skipped');
  assert.equal(typeof refused['timeout-minutes'], 'number');
});

test('the fix job still needs the gate to say yes, and only a bug or a Nemeth report starts it', () => {
  // The refusal job was added next to it, a kind job and a status job in front.
  // This pins that none of them loosened the old path.
  assert.deepEqual(workflow.jobs.fix.needs, ['allowlist', 'kind', 'status']);
  assert.match(workflow.jobs.fix.if, /needs\.allowlist\.outputs\.allowed\s*==\s*'true'/);
  // Only an explicit `routed` stays off the agent. If the `kind` job itself fails,
  // its output is empty, and silence is the one outcome this repository has been
  // burned by. So anything else runs as a bug, as an issue with no label does.
  assert.match(workflow.jobs.fix.if, /kind\.outputs\.kind\s*!=\s*'routed'/);
  assert.match(workflow.jobs.status.if, /kind\.outputs\.kind\s*!=\s*'routed'/);
  assert.match(workflow.jobs.fix.if, /!cancelled\(\)/);
  assert.match(workflow.jobs.status.if, /!cancelled\(\)/, 'or a failed kind job would skip it');
  assert.equal(workflow.jobs.fix.with.kind, "${{ needs.kind.outputs.kind == 'nemeth' && 'nemeth' || 'bug' }}", 'the agent only ever sees bug or nemeth');
  assert.deepEqual(workflow.jobs.status.needs, ['allowlist', 'kind']);
  assert.match(workflow.jobs.status.if, /needs\.allowlist\.outputs\.allowed\s*==\s*'true'/);
});

test('the kind comes from the labels on the issue, read through the API, by the default-branch copy', () => {
  const kind = workflow.jobs.kind;
  assert.equal(kind.needs, 'allowlist');
  assert.match(kind.if, /allowed\s*==\s*'true'/, 'a refused author costs nothing, not even this');
  assert.equal(kind.steps[0].with?.ref, undefined, 'the default checkout is `testing`');
  const step = kind.steps.find((s) => s.id === 'kind');
  assert.match(step.run, /scripts\/ci\/issue-kind\.mjs "\$ISSUE"/);
  assert.equal(kind.permissions?.issues, 'read');
  assert.equal(kind.outputs.kind, '${{ steps.kind.outputs.kind }}');
  // An unreadable label must not mean silence: nothing downstream matches an
  // empty kind, and a skipped `fix` is not a failure.
  assert.match(step.run, /\|\| echo "kind=bug" >> "\$GITHUB_OUTPUT"/);
});

test('a design idea, or anything else, gets one comment and no agent', () => {
  const routed = workflow.jobs.routed;
  assert.ok(routed, 'expected a `routed` job');
  assert.deepEqual(routed.needs, ['allowlist', 'kind']);
  assert.match(routed.if, /kind\.outputs\.kind\s*==\s*'routed'/);
  assert.match(routed.if, /allowed\s*==\s*'true'/);
  const post = routed.steps.find((s) => /reply\.mjs/.test(s.run ?? ''));
  assert.match(post.run, /reply\.mjs "\$ISSUE" routed/);
  assert.doesNotMatch(JSON.stringify(routed.steps), /claude-code-action|pipeline-agent/, 'it must not spend the quota');
  // And nothing downstream of the agent runs for it.
  assert.doesNotMatch(workflow.jobs.outcome.if, /routed/);
  assert.match(workflow.jobs.outcome.if.replace(/\s+/g, ' '), /needs\.fix\.result == 'failure'/, 'a skipped fix is not a failure');
});

test('the contributor is told, first thing, that work has started, and a failed comment does not stop the fix', () => {
  const status = workflow.jobs.status;
  const post = status.steps.find((s) => /reply\.mjs/.test(s.run ?? ''));
  assert.ok(post, 'expected a step that posts the short "started" comment');
  assert.match(post.run, /"\$ISSUE" started/);
  assert.equal(post['continue-on-error'], true);
  assert.equal(status.steps[0].with?.ref, undefined, 'the default checkout is `testing`');
  // And `fix` runs even if this job did not succeed.
  assert.match(workflow.jobs.fix.if, /!cancelled\(\)/);
});

test('a run can be started by hand, and the gate still checks the issue author', () => {
  const dispatch = triggers?.workflow_dispatch;
  assert.ok(dispatch, 'expected a workflow_dispatch trigger');
  assert.equal(dispatch.inputs?.issue_number?.required, true);
  assert.equal(dispatch.inputs.issue_number.type, 'string');
  assert.equal(triggers?.workflow_call, undefined, 'it holds its own triggers and is not called');
  // And the typed number has to reach the jobs that do the work.
  assert.match(workflow.concurrency.group, /inputs\.issue_number/);
  const issueStep = workflow.jobs.allowlist.steps.find((s) => s.id === 'issue');
  assert.equal(issueStep.env.INPUT_ISSUE_NUMBER, '${{ inputs.issue_number }}');

  // The gate must read the author of the ISSUE. If it read the actor who
  // pressed the button, anyone with write access could spend the quota on a
  // stranger's report, which is the thing the allowlist exists to stop.
  const check = workflow.jobs.allowlist.steps.find((s) => s.id === 'check');
  assert.equal(check.env?.ISSUE_AUTHOR, '${{ steps.issue.outputs.author }}');
  assert.doesNotMatch(JSON.stringify(check), /github\.actor|github\.triggering_actor/, 'the button-presser is never the subject of the gate');
  // The actor IS read in two places, and only to say why the agent cannot run:
  // `claude-code-action` refuses an actor who cannot write to the repository.
  // That is a fact about who the action will see, not a decision about who may
  // spend the quota. The gate has already said yes by then.
  const access = workflow.jobs.allowlist.steps.find((s) => s.id === 'access');
  assert.equal(access.if, "steps.check.outputs.allowed == 'true'", 'the actor is looked at only after the gate said yes');
  assert.equal(access.env.ACTOR, '${{ github.actor }}');
  const readers = (source.match(/github\.(triggering_)?actor/g) ?? []).length;
  assert.equal(readers, 2, 'the actor is read by the access step and by the job that reports it, nowhere else');

  // The number typed into the form must be checked to be digits before it is
  // used for anything.
  const resolve = workflow.jobs.allowlist.steps.find((s) => s.id === 'issue');
  assert.match(resolve.run, /\*\[!0-9\]\*/, 'the dispatch input must be validated as digits');
});

test('every use of the issue number comes from the gate job, not the event', () => {
  // On a hand-started run `github.event.issue` does not exist, so a prompt that
  // still read it would tell the agent to work on issue "#". The concurrency
  // group is the one place allowed to read the event, because it runs before any
  // job and falls back to the input.
  const body = source.split('\njobs:\n')[1] ?? '';
  const uses = body.match(/\$\{\{[^}]*github\.event\.issue\.number[^}]*\}\}/g) ?? [];
  assert.equal(uses.length, 1, 'only the allowlist job may read the event number, once, into env');
});

test('a fix that ended without a pull request says so on the issue', () => {
  // Otherwise the contributor reads "I am working on a fix" for ever. The silence
  // this repository was already burned by, made worse because the status comment
  // now asserts that work is going on.
  assert.equal(workflow.jobs.stopped, undefined, 'it is `outcome` now: a question is not a stop');
  const outcome = workflow.jobs.outcome;
  assert.ok(outcome, 'expected an `outcome` job');
  const condition = outcome.if.replace(/\s+/g, ' ');
  assert.match(condition, /!cancelled\(\)/, 'a status function, or a failed `fix` job would skip this one too');
  assert.match(condition, /needs\.allowlist\.outputs\.allowed == 'true'/, 'a refused author, whose `fix` job is skipped, is not a failure');
  assert.match(condition, /needs\.allowlist\.outputs\.access != 'false'/, 'a skipped `fix` for want of access is reported by `noaccess`, not as a crash');
  assert.match(condition, /needs\.fix\.result == 'failure'/, 'a crashed agent job has no result word, so it must be caught by its status. A SKIPPED fix is not a crash');
  for (const word of ['asked', 'needs-design', 'blocked']) {
    assert.match(condition, new RegExp(`needs\\.fix\\.outputs\\.result == '${word}'`), word);
  }

  // What to say and which label to set is decided once, in the script the
  // follow-up workflow uses too. It is tested in `fix-outcome.test.js`.
  const step = outcome.steps.find((s) => /fix-outcome\.mjs/.test(s.run ?? ''));
  assert.equal(step.env.FIX_JOB, '${{ needs.fix.result }}');
  assert.match(step.run, /fix-outcome\.mjs "\$ISSUE" "\$FIX_JOB" "\$RESULT"/);
  // The agent's own words ride in this one comment, through env and nowhere else.
  assert.equal(step.env.MESSAGE, '${{ needs.fix.outputs.message }}');
  assert.doesNotMatch(step.run, /\$\{\{/, 'agent text must never be written into a run line');
  assert.doesNotMatch(step.run, /gh issue|gh label/, 'the script labels the issue, once');
  assert.equal(outcome.steps[0].with?.ref, undefined, 'the default checkout is `testing`');
  assert.equal(outcome.permissions?.actions, undefined);
  assert.doesNotMatch(JSON.stringify(outcome.steps), /claude-code-action/, 'saying so costs no quota');
});

test('a listed contributor who cannot write is told the true reason, and the maintainer is told by a red job', () => {
  // Issue #33. The list said yes, the agent action refused the actor, and the
  // contributor read "something went wrong on my side".
  const noaccess = workflow.jobs.noaccess;
  assert.match(noaccess.if, /allowed == 'true' && needs\.allowlist\.outputs\.access == 'false'/);
  // Only where an agent would have run. A Design or Other report starts none, so
  // it gets its one `routed` comment and not this one as well.
  assert.deepEqual(noaccess.needs, ['allowlist', 'kind']);
  assert.match(noaccess.if, /kind\.outputs\.kind != 'routed'/);
  const step = noaccess.steps[0];
  assert.match(step.run, /gh issue comment/);
  assert.match(step.run, /needs-owner/);
  assert.match(step.run, /exit 1/, 'a set-up mistake of the maintainer is shown red: the failure email is how they learn');
  assert.equal(noaccess.permissions.issues, 'write');
  assert.doesNotMatch(JSON.stringify(noaccess.steps), /claude-code-action/);

  // Nothing that costs quota or writes a "started" comment starts for them.
  assert.match(workflow.jobs.status.if, /access != 'false'/);
  assert.match(workflow.jobs.fix.if, /access != 'false'/);
  // `routed` does not depend on access: it starts no agent.
  assert.doesNotMatch(workflow.jobs.routed.if, /access/);
  // `unknown` is not `false`: if GitHub did not answer, the action checks again.
  assert.doesNotMatch(source, /access\s*==\s*'true'/);
});

test('a pull request that was opened is checked and repaired, and nothing else is', () => {
  const verify = workflow.jobs.verify;
  assert.equal(verify.uses, VERIFY);
  assert.equal(verify.if, "needs.fix.outputs.result == 'opened'");
  assert.equal(verify.with.pr_number, '${{ needs.fix.outputs.pr }}');
  assert.equal(verify.with.branch, '${{ needs.fix.outputs.branch }}');
  assert.equal(verify.with.message, '${{ needs.fix.outputs.message }}');
  assert.deepEqual(Object.keys(verify.secrets), ['CLAUDE_CODE_OAUTH_TOKEN', 'PIPELINE_APP_PRIVATE_KEY']);
  // The old design started the checks from this file with a copy of the lookup.
  assert.equal(workflow.jobs['start-checks'], undefined);
  assert.doesNotMatch(source, /gh workflow run/, 'verify starts the checks, from the one place that waits for them');
});

test('the agent cannot start, cancel or re-run workflows', () => {
  // `actions: write` lets a prompt that talked its way past the rules start other
  // workflows or cancel the gates. Only the verify jobs hold it, and they run no
  // agent. Here the agent job is a call, so the ceiling is what it is given.
  assert.equal(workflow.permissions?.actions, undefined, 'not at workflow level');
  assert.equal(workflow.jobs.fix.permissions?.actions, undefined, 'not in the job that runs the agent');
  assert.deepEqual(workflow.jobs.fix.permissions, { contents: 'write', 'pull-requests': 'write', issues: 'read' });
});
