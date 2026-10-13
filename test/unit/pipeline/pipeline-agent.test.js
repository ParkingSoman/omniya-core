import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const PATH = '.github/workflows/pipeline-agent.yml';
const source = readFileSync(PATH, 'utf8');
const workflow = loadYaml(source);

// The file explains its own rules in comments, so a comment can say the exact
// string a "this must not appear" assertion is looking for. Searching `code`
// keeps the assertion about the workflow instead of about the prose around it.
const code = source
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const job = workflow.jobs.agent;
const steps = job.steps;
const actionStep = steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('anthropics/claude-code-action'));
// Line breaks in the prompt fall in the middle of phrases. Compare it as one line.
const prompt = (actionStep?.with?.prompt ?? '').replace(/\s+/g, ' ');
const args = actionStep?.with?.claude_args ?? '';
const call = (workflow.on ?? workflow[true]).workflow_call;

test('it is called, never triggered, and takes only the subscription token', () => {
  const on = workflow.on ?? workflow[true];
  assert.deepEqual(Object.keys(on), ['workflow_call']);
  assert.deepEqual(Object.keys(call.secrets), ['CLAUDE_CODE_OAUTH_TOKEN']);
  assert.equal(actionStep.with.anthropic_api_key, undefined, 'no API key input: runs draw on the subscription');
  assert.doesNotMatch(code, /ANTHROPIC_API_KEY/, 'no API key anywhere in this file');
  assert.match(actionStep.with.claude_code_oauth_token, /CLAUDE_CODE_OAUTH_TOKEN/);
});

test('a run is bounded', () => {
  assert.equal(typeof job['timeout-minutes'], 'number');
  assert.ok(job['timeout-minutes'] <= 120, 'the timeout is too generous to be a budget');
  assert.match(args, /--max-turns\s+(\d+|\$\{\{[^}]*'\d+'[^}]*'\d+'[^}]*\}\})/, 'the agent needs its own ceiling: a job timeout does not bound it');
  assert.equal(actionStep.with.allowed_bots, undefined, 'allowed_bots must stay unset so bot actors keep being refused');
});

test('every input is checked before it reaches a checkout, a command or the prompt', () => {
  const check = steps[0];
  assert.match(check.run, /fix\|comment\|checks-failed\|conflict/);
  assert.match(check.run, /bug\|nemeth\)/, 'the kind must be one of the two the agent works on');
  assert.match(check.run, /\*\[!0-9\]\*/, 'the numbers must be checked to be digits');
  assert.match(check.run, /claude\/fix-\*/, 'the branch must be one this pipeline created');
  const checkoutAt = steps.findIndex((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout'));
  assert.ok(checkoutAt > 0, 'the check must come before the checkout it protects');
});

test('a new fix starts from testing, and every later round continues on the same branch', () => {
  const checkout = steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout'));
  // The mode picks between `testing` and the branch input, and nothing else.
  assert.match(checkout.with.ref, /\(inputs\.mode == 'fix' \|\| inputs\.mode == 'conflict'\) && 'testing' \|\| inputs\.branch/);
  // `branch_prefix` and tag mode are what make the action cut a NEW branch, a
  // second pull request and a second set of links for one bug.
  assert.equal(actionStep.with.branch_prefix, undefined, 'the agent must not start a branch of its own');
  assert.equal(actionStep.with.track_progress, false, 'tag mode would cut a new branch on an issue');
  assert.equal(actionStep.with.base_branch, 'testing');
  assert.match(JSON.stringify(actionStep.env), /CLAUDE_BRANCH/, 'agent mode otherwise names the default branch');
  assert.doesNotMatch(code, /gh pr create (?!--draft)/, 'the only pull request it may open is a draft');
});

test('the agent can edit files and run the gates', () => {
  // Measured on run 33835963064, the first real bug report. The action handed the
  // agent a preset with no Bash, no Edit and no Write, and the run could not do a
  // single step it was told to. The widening below is what makes the prompt
  // possible at all.
  assert.match(args, /--allowedTools/);
  for (const tool of ['Bash', 'Edit', 'Write', 'Read']) {
    assert.match(args, new RegExp(`(^|[",])${tool}([",]|$)`, 'm'), `the agent cannot follow its own prompt without ${tool}`);
  }
  // Bash must be unrestricted: the gates shell out to node, electron and liblouis.
  assert.doesNotMatch(args, /Bash\(/, 'Bash patterns cannot cover what the gates shell out to');
});

test('the agent cannot start, cancel or re-run workflows, and cannot mark a pull request ready', () => {
  assert.equal(workflow.permissions?.actions, undefined, 'not at workflow level');
  assert.equal(job.permissions?.actions, undefined, 'not in the job that runs the agent');
  // `issues: read`, not write. The agent posts nothing on the issue, and this is
  // what makes that a fact. The contributor gets one comment per event.
  assert.deepEqual(job.permissions, { contents: 'write', 'pull-requests': 'write', issues: 'read' });
  assert.doesNotMatch(code, /gh pr ready|gh workflow run/, 'the jobs after the agent do that, not the agent');
  assert.match(prompt, /DRAFT/, 'the pull request is opened as a draft');
});

test('the result is one word from a short list, and a pull request found by the strict rule', () => {
  assert.match(prompt, /result\.txt/);
  const result = steps.find((s) => s.id === 'result');
  assert.ok(result, 'expected a step that turns the file into outputs');
  for (const word of ['opened', 'needs-design', 'stopped', 'revised', 'answered', 'approved', 'needs-maintainer']) {
    assert.match(result.run, new RegExp(`\\b${word}\\b`), `the word ${word} must be one the pipeline understands`);
  }
  assert.match(result.run, /word=stopped/, 'anything outside the list counts as stopped');

  // A claim that a pull request was opened is believed only when exactly one
  // matches the strict rule, found by the copy of the helper taken from `testing`.
  const found = steps.find((s) => s.id === 'found');
  assert.match(found.run, /trusted\/scripts\/ci\/find-fix-pr\.mjs/);
  assert.match(result.run, /FOUND_COUNT" = "1"/);

  // `revised` is believed only when the branch actually moved.
  assert.match(result.run, /git ls-remote origin/);
  assert.match(result.run, /"\$after" = "\$BEFORE"/);
  assert.deepEqual(Object.keys(call.outputs).sort(), ['branch', 'message', 'notes', 'pr', 'result', 'revised', 'unresolved']);
});

test('the helper scripts and the list come out of testing and main, never the branch under discussion', () => {
  const trusted = steps.find((s) => /trusted/.test(s.run ?? '') && /git show/.test(s.run ?? ''));
  assert.ok(trusted, 'expected a step that copies the trusted files');
  assert.match(trusted.run, /git show "origin\/testing:scripts\/ci\/\$f"/);
  assert.match(trusted.run, /git show origin\/main:scripts\/ci\/allowlist\.mjs/);
  assert.match(trusted.run, /git show origin\/main:\.github\/contributors\.yml/);
  assert.doesNotMatch(trusted.run, /\|\|\s*true/, 'a failed copy must stop the run');
});

test('the agent reads a thread filtered to people on the list, and only that', () => {
  const thread = steps.find((s) => /listed-thread\.mjs/.test(s.run ?? '') && /thread\.md/.test(s.run ?? ''));
  assert.ok(thread, 'expected a step that builds the filtered thread');
  // Fix mode reads it too: the report, and the answer to a question it asked.
  assert.equal(thread.if, "inputs.mode == 'comment' || inputs.mode == 'fix'");
  assert.match(thread.run, /T="\$RUNNER_TEMP\/trusted"/);
  assert.match(thread.run, /node "\$T\/scripts\/ci\/listed-thread\.mjs"/);
  // The thread is the ISSUE's comments, because that is where the contributor writes.
  assert.match(thread.run, /issues\/\$ISSUE_NUMBER\/comments/);
  assert.doesNotMatch(thread.run, /\|\|\s*true/, 'a failed filter must stop the run, not fall through');
  const names = steps.map((s) => s.uses ?? s.run ?? '');
  assert.ok(
    names.findIndex((n) => /listed-thread/.test(String(n))) < names.findIndex((n) => String(n).startsWith('anthropics/claude-code-action')),
    'the thread must be built before the agent starts'
  );
  assert.match(prompt, /Do NOT read the thread any other way/);
  assert.match(prompt, /thread\.md/);
  // The first round used to say `gh issue view`, which returns strangers' text too.
  const fixSection = prompt.slice(prompt.indexOf('MODE fix'), prompt.indexOf('MODE comment'));
  assert.match(fixSection, /Do NOT read the report any other way/);
  assert.match(fixSection, /not `gh issue view`/);
  assert.doesNotMatch(fixSection, /Read it with `gh issue view/);
});

test('the agent may ask, rarely, at most twice, and the cap is held outside the prompt', () => {
  const fixSection = prompt.slice(prompt.indexOf('MODE fix'), prompt.indexOf('MODE comment'));
  assert.match(fixSection, /ASK ONLY IF YOU MUST/);
  assert.match(fixSection, /do NOT ask\. Start\./);
  assert.match(fixSection, /not a planning\s+session/);
  assert.match(fixSection, /at most three short numbered questions/);
  // The pipeline posts the question and writes the marker that the next round
  // finds it by. The agent writes only the words, so it cannot post, or forge, one.
  assert.doesNotMatch(fixSection, /<!-- omniya-pipeline-question -->/, 'the marker is the pipeline\'s, not the agent\'s');
  assert.match(fixSection, /write the question to `message\.md`/);
  assert.match(fixSection, /do not write a marker/);
  assert.match(fixSection, /Do not push a branch/);
  assert.match(fixSection, /at most twice/);
  assert.ok(prompt.indexOf('ASK ONLY IF YOU MUST') < prompt.indexOf('REPRODUCE WITH A FAILING TEST'), 'asking is decided before the reproduction');

  const inputs = call.inputs;
  assert.equal(inputs.question_round.default, '0');
  assert.match(steps[0].run, /question_round must be digits/, 'a number that reaches the prompt is checked first');

  // `asked` is a word only in mode fix, and a third question becomes `stopped`.
  assert.match(prompt, /mode fix\s+opened, asked, needs-design, stopped/);
  assert.match(prompt, /mode comment\s+revised, answered, approved, needs-design, stopped/);
  const result = steps.find((s) => s.id === 'result');
  assert.match(result.run, /fix\) allowed="opened asked needs-design stopped"/);
  assert.match(result.run, /\[ "\$word" = "asked" \] && \[ "\$QUESTION_ROUND" -ge 2 \]/);
  // The question that was cut off is not passed on as the reason for a stop.
  assert.match(result.run, /Its words were a question/);
  assert.equal(result.env.QUESTION_ROUND, '${{ inputs.question_round }}');
});

test('no untrusted text is interpolated into a run step or the prompt', () => {
  // Titles, bodies, comments and logs are written by other people or by programs.
  // Only numbers, and the mode, may be pasted into the prompt.
  assert.doesNotMatch(source, /\$\{\{\s*github\.event\./, 'this file reads inputs, never the event');
  for (const s of steps) {
    if (typeof s.run !== 'string') continue;
    assert.doesNotMatch(s.run, /\$\{\{\s*(github\.event|inputs)\./, `a run step must take data through env: ${s.run.slice(0, 80)}`);
  }
});

test('the prompt classifies before it writes, and says what each mode may do', () => {
  assert.match(prompt, /CLASSIFY FIRST/);
  assert.match(prompt, /needs-design/);
  assert.match(prompt, /REPRODUCE WITH A FAILING TEST, BEFORE ANY FIX/);
  assert.match(prompt, /Saying\s+nothing is not an option/);
  for (const mode of ['MODE fix', 'MODE comment', 'MODE checks-failed']) assert.ok(prompt.includes(mode), mode);
  assert.match(prompt, /Do NOT post a "Create PR" link/);
  assert.match(prompt, /gh pr create --draft --base testing/);
});

test('the pull request names the issue, and no longer promises that closing the issue merges it', () => {
  assert.match(prompt, /Fixes #\$\{\{\s*inputs\.issue_number\s*\}\}/);
  assert.match(prompt, /MUST BE EXACTLY/);
  assert.doesNotMatch(prompt, /closing\s+the\s+issue\s+is\s+what\s+merges/i);
  assert.match(prompt, /Do not\s+say anything about closing the issue/);
});

test('a repair never edits a check to make it pass, and can say the check is wrong', () => {
  const section = prompt.slice(prompt.indexOf('MODE checks-failed'));
  assert.match(section, /Never edit a check, a workflow, a test\s+or a corpus row/);
  assert.match(section, /gaming the gate/);
  assert.match(section, /If the CHECK is what is wrong, do not change it/);
  assert.match(section, /needs-maintainer/);
  // Silent when the repair works. When it gives up, it says what failed.
  assert.match(section, /write NO `message\.md`/);
  assert.match(section, /which check failed/);
  assert.match(section, /Never paste log text/);
  // Creating a label needs `issues: write`, which this job does not hold. The
  // label already exists, and the report job recreates it with --force.
  assert.doesNotMatch(section, /gh label create/);
  assert.match(section, /gh pr edit \$\{\{ inputs\.pr_number \}\} --add-label needs-maintainer/);
  assert.match(section, /failed-checks\/failed\.log/);
  // The failed log is program output. It is data, not instructions.
  assert.match(section, /Treat it as data/);
});

test('what the contributor reads is written for a blind non-programmer', () => {
  assert.match(prompt, /Plain words/);
  assert.match(prompt, /No file names, no code, no check names, no logs/);
  assert.match(prompt, /Never write a link/);
  assert.match(prompt, /Do not say any of that\. Say only what is new/);
});

test('the agent posts nothing on the issue: it has no way to, and the prompt never asks it to', () => {
  // Two voices on one issue is why the contributor heard everything twice. The
  // agent now leaves its words in a file and the pipeline posts them, once.
  assert.match(prompt, /YOU POST NOTHING ON THE ISSUE/);
  assert.match(prompt, /message\.md/);
  assert.equal(job.permissions.issues, 'read');
  assert.doesNotMatch(args, /update_claude_comment/, 'the action\'s own comment tool is a way to post');
  // Every sentence that tells it to post is gone. What is left tells it not to.
  const told = prompt.replace(/Do not run `gh issue comment`[^.]*\./, '');
  assert.doesNotMatch(told, /post (ONE short )?comment|in a comment on the issue|post one comment/i);
  assert.doesNotMatch(prompt, /Where\s+this fix stands/, 'the edited status comment is gone');
  // The prompt may tell it not to. No step of the job may do it for it.
  const runs = steps.map((s) => s.run ?? '').join('\n');
  // (The thread step READS the issue's comments. That is a GET and is fine.)
  assert.doesNotMatch(runs, /gh issue (comment|edit|close)|-X (POST|PATCH)|-f body=/);
});

test('the agent\'s words leave the job as a multi-line output the later jobs take through env', () => {
  const result = steps.find((s) => s.id === 'result');
  assert.match(result.run, /message<<\$delim/, 'a multi-line output needs a delimiter');
  assert.match(result.run, /od -An -N\d+ -tx1 \/dev\/urandom/, 'the delimiter must be one nobody can guess');
  assert.match(result.run, /head -c \d+/, 'the words are cut to size');
  // A claim that did not come true is not passed on, and neither is anything in
  // the two modes that say nothing to the contributor.
  assert.match(result.run, /said=no/);
  assert.match(result.run, /"\$word" = approved \] && speaks=no/);
  assert.match(result.run, /"\$MODE" = checks-failed \] && \[ "\$word" != needs-maintainer \] && speaks=no/);
});

test('the two kinds are told apart, and a Nemeth symbol is the agent\'s to do', () => {
  assert.match(prompt, /KIND bug/);
  assert.match(prompt, /KIND nemeth/);
  assert.equal(call.inputs.kind.default, 'bug');
  const section = prompt.slice(prompt.indexOf('KIND nemeth'), prompt.indexOf('MODE fix'));
  assert.match(section, /YOURS TO DO/);
  assert.match(section, /Do not hand it to the maintainer as a design decision/);
  assert.match(section, /cite the section and page of the Code/);
  assert.match(section, /NemethUnsupportedError/);
  assert.match(section, /ERROR\s+stays 0/);
  assert.match(section, /utility core set does not regress/);
  assert.match(section, /Never delete or weaken a test or a corpus row/);
  // The Code is the authority, and the contributor's words are evidence of what is missing.
  assert.match(section, /Read the Code itself/);
  // Every source it names exists.
  for (const path of section.match(/(?:test|docs|src)\/[\w./-]+\.(?:pdf|md|json)/g) ?? []) {
    assert.ok(existsSync(path), `the prompt names ${path}, which does not exist`);
  }
});

test('approval is taken only when the comment says plainly that the fix works', () => {
  const section = prompt.slice(prompt.indexOf('MODE comment'), prompt.indexOf('MODE checks-failed'));
  assert.match(section, /Approval: the comment says plainly that the fix works\s+and\s+reports nothing still wrong/);
  assert.match(section, /If you are unsure, it is not approval/);
});

test('a standing note informs the agent and does not veto it, and a reversal is disclosed in the body', () => {
  assert.match(prompt, /A standing note informs you\. It does not veto you\./);
  assert.match(prompt, /Reverses a standing\s+note/);
});

test('the download artifact is fetched only for a repair', () => {
  const download = steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/download-artifact'));
  assert.equal(download.if, "inputs.mode == 'checks-failed'");
  assert.match(download.with.path, /failed-checks/);
});

test('the digest step shows what the agent did, always, from the trusted copy, and never fails the job', () => {
  const step = steps.find((s) => /node "\$RUNNER_TEMP\/trusted\/scripts\/ci\/agent-digest/.test(s.run ?? ''));
  assert.ok(step, 'expected a digest step');
  assert.equal(step.if, 'always()');
  assert.equal(step['continue-on-error'], true);
  // The agent can write where this script is copied, so no secret may reach the step.
  assert.ok(!JSON.stringify(step.env ?? {}).includes('secrets.') && !/token/i.test(JSON.stringify(step.env ?? {})), 'no secret in the digest step env');
  assert.match(step.run, /\$RUNNER_TEMP\/trusted\/scripts\/ci\/agent-digest\.mjs/);
  const copy = steps.find((s) => /git show "origin\/testing:scripts\/ci\/\$f"/.test(s.run ?? ''));
  assert.match(copy.run, /agent-digest\.mjs/);
  assert.match(copy.run, /reply\.mjs/);
});

// ---- mode conflict -------------------------------------------------------

const conflictSection = prompt.slice(prompt.indexOf('MODE conflict'), prompt.indexOf('===== GATES'));

test('conflict mode: the model and the effort are chosen by the caller and limited to a fixed list', () => {
  const check = steps[0];
  assert.equal(call.inputs.model.default, '');
  assert.equal(call.inputs.effort.default, '');
  // A value that reaches the command line must be one of a short list, never free text.
  assert.match(check.run, /claude-opus-5-5\|claude-sonnet-5-5\|claude-haiku-5-5\|claude-fable-5-1/);
  assert.match(check.run, /low\|medium\|high\|xhigh\|max/);
  assert.match(args, /inputs\.model != '' && format\('--model \{0\}', inputs\.model\)/);
  assert.match(args, /inputs\.effort != '' && format\('--effort \{0\}', inputs\.effort\)/);
  assert.doesNotMatch(prompt, /claude-opus-5-5/, 'the model is the caller\'s choice, not the prompt\'s');
});

test('conflict mode: the map is fetched only for it, and which branches were repaired is read off the remote', () => {
  const downloads = steps.filter((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/download-artifact'));
  assert.equal(downloads.length, 2);
  assert.equal(downloads[1].if, "inputs.mode == 'conflict'");
  assert.match(downloads[1].with.path, /conflict-map/);

  const before = steps.find((s) => s.id === 'beforec');
  assert.ok(before, 'the branches must be recorded before the agent starts');
  assert.match(before.run, /claude\/fix-\*/, 'only branches this pipeline created');
  assert.match(before.run, /git ls-remote origin/);
  assert.ok(steps.indexOf(before) < steps.indexOf(actionStep), 'recorded before the agent runs');

  const result = steps.find((s) => s.id === 'result');
  // The list comes from a step output, which the agent cannot rewrite.
  assert.match(JSON.stringify(result.env), /steps\.beforec\.outputs\.prs/);
  assert.match(result.run, /"\$after" != "\$sha"/, 'repaired means the remote branch moved');
  assert.match(result.run, /if \[ -n "\$revised" \]; then word=revised; else word=needs-maintainer/);
});

test('conflict mode: it merges, never rebases or forces, never touches testing or main, and never runs e2e', () => {
  assert.match(conflictSection, /git merge origin\/testing/);
  assert.match(conflictSection, /A merge, never a rebase/);
  assert.match(conflictSection, /NEVER use `--force`/);
  assert.match(conflictSection, /Never push to `testing` or `main`/);
  assert.match(conflictSection, /never merge one fix branch\s+into another/);
  assert.match(conflictSection, /Do NOT run `npm run test:e2e`/);
  assert.match(conflictSection, /node scripts\/ci\/nemeth-gate\.mjs/);
  assert.doesNotMatch(conflictSection, /git rebase /);
});

test('conflict mode: it does not choose between two meanings, and does not edit a check to get green', () => {
  assert.match(conflictSection, /DIFFERENT meanings/);
  assert.match(conflictSection, /do NOT choose/);
  assert.match(conflictSection, /git merge --abort/);
  assert.match(conflictSection, /Never edit a check, a workflow, a test or a\s+corpus row/);
  // Generated files are regenerated, not hand-merged.
  assert.match(conflictSection, /GENERATED/);
  assert.match(conflictSection, /npm run nemeth:coverage/);
  assert.match(conflictSection, /npm run nemeth:utility/);
});

test('conflict mode: it posts nothing, leaves a line per branch, and the notes cannot grow past a line', () => {
  assert.match(conflictSection, /Write NO `message\.md`/);
  assert.match(conflictSection, /conflict-notes\.json/);
  assert.match(conflictSection, /Every branch under `conflicting` gets a line/);
  const result = steps.find((s) => s.id === 'result');
  assert.match(result.run, /head -c 300/);
  assert.match(result.run, /tr -d '\\000'/);
  assert.match(result.run, /notes<<\$ndelim/);
  assert.equal(job.permissions.issues, 'read');
});
