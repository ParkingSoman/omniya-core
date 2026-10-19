/**
 * Decide what happens to a fix, and do it. Two ways in:
 *
 *   - MERGE FIRST (`confirmed: false`, from `--green`, below): the checks are green. Nobody has
 *     tried the fix yet. It merges into `testing`, the issue stays open, and when the test alpha
 *     holds it the contributor is told (`in-alpha.mjs`). Their "it works" then closes the issue.
 *     A fix that is not ready says nothing: the next run looks again.
 *   - CONFIRMED (`confirmed: true`, from `pipeline-followup.yml`): the contributor tried a pull
 *     request's own build and said it works. The merge closes the issue.
 *
 * Both run the same rules:
 *
 * A fix that touches any file outside `src/`, `test/` and `docs/` (or the Nemeth
 * corpus), deletes a test, conflicts with `testing`, or says it reverses a
 * standing note is PROTECTED: it leaves draft, is labelled
 * `needs-owner`, and the maintainer is asked to review. Nothing is set, nothing
 * is merged.
 *
 * Any other fix whose `unit`, `nemeth` and `e2e` checks are green on the head
 * commit gets the commit status `contributor-tested`, leaves draft, and has
 * auto-merge turned on, pinned to that commit. That status is the lock: only this
 * script sets it, and the ruleset requires it from the pipeline's GitHub App. It
 * is posted with the App's token (`MERGE_TOKEN`), because a workflow on a
 * contributor's branch can post a status with the built-in token but cannot
 * post as the App. The same token turns on auto-merge, so the merge push starts
 * `testing-app.yml`; a push made with the built-in token starts no run.
 *
 * If a check is not green after a confirmation, it labels `needs-owner` and tells the contributor.
 *
 * Usage (needs GH_TOKEN, MERGE_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/hand-off.mjs <issue-number> <pull-request-number>     the contributor confirmed
 *   node scripts/ci/hand-off.mjs --green [<pull-request-number>]          merge first, every open fix (ONLY= also works)
 *
 * Step outputs: sent (true|false), merge (true|false).
 */

import { pathToFileURL } from 'node:url';

import { BRANCH_PREFIX } from './find-fix-pr.mjs';
import { gh as realGh, requireNumber, setOutputs } from './gh.mjs';
import { issueOf } from './keep-current.mjs';
import { postReply } from './reply.mjs';
import { justifiedByTheCode, loadCodeRules } from './standing-note.mjs';
import { zoneOf } from './zones.mjs';

export const REQUIRED_CHECKS = ['unit', 'nemeth', 'e2e'];

/** The closing line of a fix that merged first. It names the issue and does not close it. */
export const OPEN_LINE = 'Fix for';

/**
 * @param {Array<{name:string, conclusion:string|null, completed_at:string|null}>} checkRuns
 * @returns {string[]} names that are not green. Empty means all three passed.
 */
export function notGreen(checkRuns) {
  return REQUIRED_CHECKS.filter((name) => {
    const newest = checkRuns
      .filter((c) => c.name === name)
      .sort((a, b) => String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')))[0];
    return !newest || newest.conclusion !== 'success';
  });
}

/**
 * An allowlist, not a denylist. A fix may merge by itself only if every file it
 * touches is in the AUTOMATIC zone of the one map, `zones.json`: app source, tests, docs, and
 * the scripts that build the app. Nothing there is ever run by a job that holds power. Anything else -- workflows, scripts,
 * `.claude`, package files, CODEOWNERS, a path nobody thought of -- is for the
 * maintainer. GitHub gives paths in one exact form, so there is nothing to
 * normalise, and an odd path (empty, absolute, `..`, a backslash) fails closed.
 * The Nemeth corpus is the grading data, so it is not a place a fix may edit.
 */
export function protectedPath(path) {
  // The one map (`zones.json`) says what is automatic. An odd path, or one in no zone, is not.
  return zoneOf(path).zone !== 'automatic';
}

/**
 * Pure: what to do with the fix. No GitHub in here.
 *
 * @param {{files: Array<{filename:string, previous_filename?:string}>, filesComplete: boolean, mergeable: string, body: string, missing: string[]}} input
 *   `missing` is `notGreen(...)`.
 * @returns {{action: 'protected', reason: 'automation'|'not-a-fix-branch'|'test-removed'|'test-weakened'|'conflict'|'standing-note'}
 *   | {action: 'not-green', missing: string[]}
 *   | {action: 'merge'}}
 */
export function decide({ files, filesComplete, fixBranch, mergeable, body, missing, codeRules = null }) {
  // Only the pipeline's own branch, in this repository, into `testing`. A pull
  // request from a fork can be given a branch name that looks like ours.
  if (fixBranch !== true) return { action: 'protected', reason: 'not-a-fix-branch' };
  // The file list is what is checked. If it is not the whole change, part of the
  // change was never looked at. GitHub's list stops at 3,000 files, so a big pull
  // request could hide a workflow past the cutoff. Fail closed.
  if (filesComplete !== true) return { action: 'protected', reason: 'automation' };
  const touches = (files ?? []).some((f) => protectedPath(f.filename) || (f.previous_filename != null && protectedPath(f.previous_filename)));
  if (touches) return { action: 'protected', reason: 'automation' };
  // Deleting a test is how a gate gets gamed. A person looks at that.
  const isTest = (p) => String(p ?? '').startsWith('test/');
  // Deleted, or moved out of test/: either way the test is gone.
  const removesTest = (files ?? []).some(
    (f) => (f.status === 'removed' && isTest(f.filename)) || (isTest(f.previous_filename) && !isTest(f.filename))
  );
  if (removesTest) return { action: 'protected', reason: 'test-removed' };
  // The required checks run the tests that are in the fix branch, and the agent
  // can edit them. A test file that loses more lines than it gains is how a check
  // gets made to pass, so a person looks at it.
  const weakensTest = (files ?? []).some(
    (f) => String(f.filename ?? '').startsWith('test/') && Number(f.deletions ?? 0) > Number(f.additions ?? 0)
  );
  if (weakensTest) return { action: 'protected', reason: 'test-weakened' };
  if (String(mergeable ?? '').toUpperCase() === 'CONFLICTING') return { action: 'protected', reason: 'conflict' };
  // Any heading level, any spacing. The agent writes the body, so this is a
  // signal and not a lock: the locks on design decisions are elsewhere.
  // ...unless the section rests on a real rule of the Nemeth Code and the fix changes the Nemeth code
  // (see standing-note.mjs, the owner's decision of 2026-10-17): then the Code settles it.
  if (/^[ \t]{0,3}#{1,6}[ \t]*reverses a standing note/im.test(String(body ?? '')) && !justifiedByTheCode({ body, files, codeRules })) {
    return { action: 'protected', reason: 'standing-note' };
  }
  if (missing.length > 0) return { action: 'not-green', missing };
  return { action: 'merge' };
}

export function ensureLabel(name, repo, description, gh = realGh) {
  gh(['label', 'create', name, '--repo', repo, '--description', description, '--force']);
}

/**
 * `confirmed` is false for merge first: then a fix that cannot merge now changes nothing and says
 * nothing (nobody asked), except a fix a person must read, which is held and told once.
 */
export function handOff({ issue, pr, repo, reviewer, mergeToken, expectedSha, confirmed = true }, gh = realGh) {
  const issueNumber = requireNumber(issue, 'issue number');
  const prNumber = requireNumber(pr, 'pull request number');

  const view = JSON.parse(gh(['pr', 'view', prNumber, '--repo', repo, '--json', 'headRefOid,mergeable,body,changedFiles,labels']));
  const sha = view.headRefOid;
  const checkRuns = gh([
    'api', `repos/${repo}/commits/${sha}/check-runs`, '--paginate',
    '--jq', '.check_runs[] | {name, conclusion, completed_at}'
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const files = gh([
    'api', `repos/${repo}/pulls/${prNumber}/files`, '--paginate',
    '--jq', '.[] | {filename, previous_filename, status, additions, deletions}'
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  // The list came from one call and the count from another. They must agree, and
  // the list must be short of GitHub's 3,000-file cap, or the list is not the change.
  // Read the pull request again, last. The body and the head can change while the
  // files and checks are being read. If the head moved, what was checked is not what
  // would merge, so nothing is set and the maintainer looks. The status and the
  // merge are tied to this commit, so a later push cannot ride on them.
  const last = JSON.parse(gh(['pr', 'view', prNumber, '--repo', repo, '--json', 'headRefOid,mergeable,body,changedFiles,isCrossRepository,baseRefName,headRefName,state']));
  // `expectedSha` is set when no agent read the comment: the gate found this head
  // commit and checked the build the contributor tried was built from it. Any other
  // head is a commit nobody tested.
  const moved = last.headRefOid !== sha || (Boolean(expectedSha) && sha !== expectedSha);
  const filesComplete = !moved && Number.isInteger(last.changedFiles) && files.length === last.changedFiles && files.length < 3000;
  const fixBranch = last.isCrossRepository === false && last.baseRefName === 'testing' && last.state === 'OPEN' && /^claude\/fix-/.test(String(last.headRefName ?? ''));
  const decision = decide({ files, filesComplete, fixBranch, mergeable: last.mergeable, body: last.body, missing: notGreen(checkRuns), codeRules: loadCodeRules() });
  if (moved) decision.reason = 'moved';

  // Merge first: a fix that is not ready is not news. Red checks are the repair's job, a conflict is
  // `keep-current`'s, and a moved head is looked at again on the next run. A fix a person must read
  // is held once: the label says it was already told.
  if (!confirmed && decision.action !== 'merge') {
    const told = (view.labels ?? []).some((l) => l.name === 'needs-owner');
    if (decision.action !== 'protected' || ['conflict', 'moved'].includes(decision.reason) || told) {
      return { sent: false, merge: false, sha, missing: decision.missing ?? [], reason: decision.reason ?? 'pending' };
    }
  }

  if (decision.action === 'not-green') {
    const missing = decision.missing;
    ensureLabel('needs-owner', repo, 'A person has to look at this', gh);
    gh(['issue', 'edit', prNumber, '--repo', repo, '--add-label', 'needs-owner']);
    gh([
      'pr', 'comment', prNumber, '--repo', repo, '--body',
      `The contributor says the build works, but these required checks are not green on ${sha}: ${missing.join(', ')}. I did not take this out of draft.`
    ]);
    gh([
      'issue', 'comment', issueNumber, '--repo', repo, '--body',
      'Thank you for testing. I could not send this fix on yet, because the automatic checks are not all green on the newest change. The maintainer has been told. You do not need to do anything.'
    ]);
    return { sent: false, merge: false, sha, missing };
  }

  // The contributor said it works, but newer code changed the same lines. That is not
  // a job for a person: the pipeline brings the branch up to date (and the repair agent
  // resolves a real conflict), then posts a new build for the contributor to try. Their
  // "it works" was for the commit they tested, so it does not carry over. Start the
  // update is started by the next job in the workflow, which is told through the
  // `conflict` output. This job holds the App key and starts nothing.
  if (decision.action === 'protected' && decision.reason === 'conflict') {
    postReply({ issue: issueNumber, state: 'behind', repo }, gh);
    return { sent: false, merge: false, sha, missing: [], reason: 'conflict' };
  }

  // Taking a pull request out of draft is the one call the built-in token cannot
  // make on a pull request the App opened ("Resource not accessible by
  // integration"). Seen live on the first rehearsal. The App token can.
  if (!mergeToken) throw new Error('MERGE_TOKEN is not set. Refusing to take a pull request out of draft without it.');
  gh(['pr', 'ready', prNumber, '--repo', repo], { token: mergeToken });

  if (decision.action === 'protected') {
    ensureLabel('needs-owner', repo, 'A person has to look at this', gh);
    gh(['issue', 'edit', prNumber, '--repo', repo, '--add-label', 'needs-owner']);
    try {
      gh(['api', '-X', 'POST', `repos/${repo}/pulls/${prNumber}/requested_reviewers`, '-f', `reviewers[]=${reviewer}`]);
    } catch {
      // A reviewer that cannot be added is not a reason to hold the hand-off. The label is the signal.
    }
    const why = {
      automation: 'It changes files outside the app source, tests and docs (for example workflows, scripts, settings, package files or the Nemeth corpus).',
      'test-removed': 'It deletes a test file.',
      'test-weakened': 'It removes more lines from a test than it adds.',
      'not-a-fix-branch': 'This is not one of the pipeline\'s own fix branches into `testing`.',
      moved: 'The branch changed while I was checking it, so what I checked may not be what would merge.',
      conflict: 'It conflicts with `testing`.',
      'standing-note': 'It says it reverses a standing note.'
    }[decision.reason];
    const lead = confirmed ? `The contributor installed the build and says it works.\n\nCommit tested: ${sha}` : `The checks are green on ${sha}. Nobody has tried it yet.`;
    gh([
      'pr', 'comment', prNumber, '--repo', repo, '--body',
      `${lead}\n\n${why} I did not set \`contributor-tested\` and I did not turn on auto-merge. When you merge it, the contributor is told it is in the test alpha.`
    ]);
    const state = !confirmed ? 'held' : decision.reason === 'automation' ? 'sent-automation' : 'sent-owner';
    postReply({ issue: issueNumber, state, repo }, gh);
    return { sent: true, merge: false, sha, missing: [], reason: decision.reason };
  }

  if (!mergeToken) throw new Error('MERGE_TOKEN is not set. Refusing to set contributor-tested without a way to merge.');
  // The lock. Posted with the App token (a branch workflow cannot post as the App), before auto-merge is asked for.
  const description = confirmed ? 'The contributor tested this build' : 'Checks green; the contributor tries it in the alpha';
  gh([
    'api', `repos/${repo}/statuses/${sha}`,
    '-f', 'state=success', '-f', 'context=contributor-tested', '-f', `description=${description}`
  ], { token: mergeToken });
  // The squash commit gets its own body. The default is built from the agent's commit messages, which end
  // in Co-authored-by lines naming Claude (the owner's rule: no Claude attribution).
  // Confirmed, the body closes the issue. Merge first, nothing may close it: the contributor has not
  // tried the fix. So the merge says `Fix for #N`, and the pull request's own closing line becomes that
  // too, because GitHub can close an issue from a merged pull request's description as well.
  const closing = confirmed ? `Fixes #${issueNumber}` : `${OPEN_LINE} #${issueNumber}`;
  if (!confirmed) {
    const body = String(last.body ?? '').replace(new RegExp(`(^|\\n)[Ff]ixes #${issueNumber}([ \\t\\r\\n]*)$`), `$1${closing}$2`);
    gh(['api', '-X', 'PATCH', `repos/${repo}/pulls/${prNumber}`, '-f', `body=${body}`], { token: mergeToken });
  }
  gh(['pr', 'merge', prNumber, '--repo', repo, '--body', closing, '--auto', '--squash', '--match-head-commit', sha], { token: mergeToken });
  const green = `${REQUIRED_CHECKS.join(', ')} are green on that commit.`;
  if (!confirmed) {
    gh([
      'pr', 'comment', prNumber, '--repo', repo, '--body',
      `Merge first. ${green} Nobody has tried it yet.\n\nCommit: ${sha}\n\nAuto-merge is on for that commit only. Issue #${issueNumber} stays open: when the test alpha holds this fix, the contributor is asked to try it, and their "it works" closes it.`
    ]);
    return { sent: false, merge: true, sha, missing: [] };
  }
  gh([
    'pr', 'comment', prNumber, '--repo', repo, '--body',
    `The contributor installed the build and says it works.\n\nCommit tested: ${sha}\n\n${green} Auto-merge is on for that commit only. If the branch changes, it will not merge on this approval. Merging closes issue #${issueNumber}.`
  ]);
  postReply({ issue: issueNumber, state: 'sent', repo }, gh);
  return { sent: true, merge: true, sha, missing: [] };
}

/**
 * MERGE FIRST, for every open fix pull request (`pipeline-carry.yml`). It looks at EVERY open fix each
 * time, so it does not matter which event woke it or whether one was missed. The owner decided on
 * 2026-10-19: a fix with green checks merges at once, the issue stays open, and the contributor tries
 * the newest test alpha (`in-alpha.mjs` tells them when it holds the fix). `main` still needs the owner.
 * Left alone: an issue that is closed, or that waits on the owner's design decision.
 */

/** Labels on the ISSUE that stop a merge: the owner has a design question to answer first. */
export const HOLD_LABELS = ['needs-design'];

/**
 * Pure: is this pull request one of the pipeline's fixes, and for which issue?
 * @returns {string} the issue number, or '' when it is not a fix to look at
 */
export function fixIssue(pr) {
  if (pr.isCrossRepository !== false || pr.baseRefName !== 'testing') return '';
  if (!String(pr.headRefName ?? '').startsWith(BRANCH_PREFIX)) return '';
  return issueOf(pr.body);
}

/**
 * @returns {Array<{pr:number, issue:string, outcome:string}>}
 */
export function mergeGreen({ repo, mergeToken, reviewer, only = '' }, gh = realGh) {
  const prs = JSON.parse(gh([
    'pr', 'list', '--repo', repo, '--base', 'testing', '--state', 'open', '--limit', '100',
    '--json', 'number,body,headRefName,isCrossRepository,baseRefName'
  ]));
  const results = [];
  for (const pr of prs) {
    if (only && String(pr.number) !== String(only)) continue;
    const issue = fixIssue(pr);
    const out = (outcome) => results.push({ pr: pr.number, issue, outcome });
    if (!issue) continue;
    try {
      const view = JSON.parse(gh(['api', `repos/${repo}/issues/${requireNumber(issue, 'issue')}`]));
      if (view.state !== 'open') { out('skip: the issue is closed'); continue; }
      if ((view.labels ?? []).some((l) => HOLD_LABELS.includes(l.name))) { out('skip: waits on a design decision'); continue; }
      const r = handOff({ issue, pr: String(pr.number), repo, reviewer, mergeToken, confirmed: false }, gh);
      out(r.merge ? 'merging' : r.sent ? `held: ${r.reason}` : `not yet: ${r.reason ?? (r.missing.length ? `waiting for ${r.missing.join(', ')}` : 'pending')}`);
    } catch (error) {
      // One pull request that fails does not stop the others.
      out(`error: ${String(error.message ?? error).split('\n')[0].slice(0, 160)}`);
    }
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const repo = process.env.GITHUB_REPOSITORY;
  const reviewer = process.env.GITHUB_REPOSITORY_OWNER;
  const mergeToken = process.env.MERGE_TOKEN;
  if (process.argv[2] === '--green') {
    const only = process.argv[3] ?? process.env.ONLY ?? '';
    if (only) requireNumber(only, 'pull request number');
    for (const r of mergeGreen({ repo, mergeToken, reviewer, only })) console.log(`#${r.pr} (issue #${r.issue}): ${r.outcome}`);
  } else {
    const [issue, pr] = process.argv.slice(2);
    const result = handOff({ issue, pr, repo, reviewer, mergeToken, expectedSha: process.env.EXPECTED_SHA });
    setOutputs({ sent: result.sent, merge: result.merge, conflict: result.reason === 'conflict' });
  }
}
