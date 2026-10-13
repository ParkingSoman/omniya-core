/**
 * The contributor said it works. Send the fix to the maintainer, or say why not.
 *
 * "Send" means: take the pull request out of draft, label it, ask the
 * maintainer to review it, and record which commit was tested. It does NOT
 * merge. The maintainer merges, and that merge closes the issue.
 *
 * Before anything else it asks whether the branch still merges with `testing`.
 * Other fixes are merged while a contributor tests, so a fix that was clean when
 * it was built can conflict by the time they say it works. Handing a conflicting
 * branch to the maintainer would hand them a merge to fix. Instead the conflict
 * repair (`pipeline-conflicts.yml`) is started for this one branch, the
 * contributor is told in one comment that the fix is being brought up to date,
 * and the repair run calls this script again once the checks are green.
 *
 * The request to "send it on afterwards" is the label `handoff-pending` on the
 * pull request, not an input of the run. GitHub keeps one waiting run per
 * concurrency group and drops the older one, so a request carried only by a run
 * could be dropped and the contributor, who was told it was coming, would never
 * hear again. A label cannot be dropped that way.
 *
 * It refuses when `unit`, `nemeth` and `e2e` are not all green on the pull
 * request's head commit. Those are the checks `testing-guard` requires, and
 * "the contributor liked the build" is not a reason to hand the maintainer
 * something GitHub would refuse to merge.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/hand-off.mjs <issue-number> <pull-request-number> [--check-conflicts | --if-green]
 *
 *   --check-conflicts  the contributor just said it works. Start the conflict
 *                      repair instead if the branch no longer merges.
 *   --if-green         the conflict repair calls this after its own checks. If
 *                      they are not green, say nothing: the repair already told
 *                      the contributor what failed.
 *
 * Step outputs: sent (true|false), updating (true|false).
 */

import { pathToFileURL } from 'node:url';

import { gh, requireNumber, setOutputs } from './gh.mjs';
import { postReply } from './reply.mjs';

export const REQUIRED_CHECKS = ['unit', 'nemeth', 'e2e'];

/** On a pull request whose contributor said it works, but which had to be brought up to date first. */
export const PENDING_LABEL = 'handoff-pending';

/**
 * Left on the pull request when the repair is started. It is the only record of
 * which commit the contributor actually installed: after the repair, the branch
 * head is a newer commit that they never saw.
 */
export const TESTED_MARKER = /<!-- omniya-tested sha=([0-9a-f]{7,40}) -->/;

/**
 * The commit the contributor tested, or '' if none was recorded. The first one
 * wins: a branch repaired twice is still the build they installed first.
 */
export function testedSha(prNumber, repo, run = gh) {
  const bodies = JSON.parse(run(['pr', 'view', prNumber, '--repo', repo, '--json', 'comments', '--jq', '[.comments[].body]']) || '[]');
  for (const body of bodies) {
    const m = TESTED_MARKER.exec(body ?? '');
    if (m) return m[1];
  }
  return '';
}

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

export function ensureLabel(name, repo, description, run = gh) {
  run(['label', 'create', name, '--repo', repo, '--description', description, '--force']);
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Does the branch still merge with `testing`? GitHub works that out a little
 * after every push and answers UNKNOWN until it has, so ask again for a while.
 * An answer that never comes is treated as "no conflict": the hand-off carries
 * on as it did before, and the maintainer's own merge button is the last check.
 *
 * @returns {boolean} true only when GitHub says CONFLICTING
 */
export function isConflicting(prNumber, repo, run = gh, sleep = pause, tries = 12) {
  for (let i = 0; i < tries; i += 1) {
    const state = run(['pr', 'view', prNumber, '--repo', repo, '--json', 'mergeable', '--jq', '.mergeable']).trim();
    if (state === 'CONFLICTING') return true;
    if (state !== 'UNKNOWN') return false;
    sleep(5000);
  }
  return false;
}

/**
 * @param {{issue:string|number, pr:string|number, repo:string, reviewer?:string, mode?: 'normal'|'check-conflicts'|'if-green'}} args
 * @param {(args: string[]) => string} [run] `gh`, or a stand-in for a test
 * @param {(ms: number) => void} [sleep]
 */
export function handOff({ issue, pr, repo, reviewer, mode = 'normal' }, run = gh, sleep = pause) {
  const issueNumber = requireNumber(issue, 'issue number');
  const prNumber = requireNumber(pr, 'pull request number');

  if (mode === 'check-conflicts' && isConflicting(prNumber, repo, run, sleep)) {
    ensureLabel(PENDING_LABEL, repo, 'Said to work. Being brought up to date before it goes to the maintainer', run);
    run(['pr', 'edit', prNumber, '--repo', repo, '--add-label', PENDING_LABEL]);
    const head = run(['pr', 'view', prNumber, '--repo', repo, '--json', 'headRefOid', '--jq', '.headRefOid']).trim();
    run([
      'pr', 'comment', prNumber, '--repo', repo, '--body',
      `The contributor says the build works. It no longer merges with testing, so I am bringing it up to date before it goes to you.\n\nCommit the contributor tested: ${head}\n\n<!-- omniya-tested sha=${head} -->`
    ]);
    // The stub on `main`. GitHub finds a workflow to start by name only when its
    // file is on the default branch, and the default branch is where `gh` looks.
    run(['workflow', 'run', 'contributor-conflicts.yml', '--repo', repo, '-f', `pr_numbers=${prNumber}`]);
    postReply({ issue: issueNumber, state: 'updating', repo }, run);
    return { sent: false, updating: true, sha: '', missing: [] };
  }

  const sha = run(['pr', 'view', prNumber, '--repo', repo, '--json', 'headRefOid', '--jq', '.headRefOid']).trim();
  const checkRuns = run([
    'api', `repos/${repo}/commits/${sha}/check-runs`, '--paginate',
    '--jq', '.check_runs[] | {name, conclusion, completed_at}'
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const missing = notGreen(checkRuns);
  if (missing.length > 0 && mode === 'if-green') {
    return { sent: false, updating: false, sha, missing };
  }
  if (missing.length > 0) {
    ensureLabel('needs-maintainer', repo, 'A person has to look at this', run);
    run(['pr', 'edit', prNumber, '--repo', repo, '--add-label', 'needs-maintainer']);
    run([
      'pr', 'comment', prNumber, '--repo', repo, '--body',
      `The contributor says the build works, but these required checks are not green on ${sha}: ${missing.join(', ')}. I did not take this out of draft.`
    ]);
    run([
      'issue', 'comment', issueNumber, '--repo', repo, '--body',
      'Thank you for testing. I could not send this fix on yet, because the automatic checks are not all green on the newest change. The maintainer has been told. You do not need to do anything.'
    ]);
    return { sent: false, updating: false, sha, missing };
  }

  ensureLabel('ready-for-maintainer', repo, 'Tested by the contributor. Waiting for the maintainer to merge', run);
  run(['pr', 'ready', prNumber, '--repo', repo]);
  run(['pr', 'edit', prNumber, '--repo', repo, '--add-label', 'ready-for-maintainer']);
  try {
    run(['pr', 'edit', prNumber, '--repo', repo, '--remove-label', PENDING_LABEL]);
  } catch {
    // Not every pull request waited for a repair, so most do not carry it.
  }
  try {
    run(['pr', 'edit', prNumber, '--repo', repo, '--add-reviewer', reviewer]);
  } catch {
    // A reviewer that cannot be added is not a reason to hold the hand-off. The label is the signal.
  }
  // After a repair the branch head is not the commit the contributor installed.
  // Say both, so the comment never claims they tested what they did not.
  const tested = testedSha(prNumber, repo, run);
  const commits =
    tested && !sha.startsWith(tested) && !tested.startsWith(sha)
      ? `Commit the contributor tested: ${tested}\n\nCommit after I brought it up to date with testing: ${sha}. The contributor did not test this one. ${REQUIRED_CHECKS.join(', ')} are green on it.`
      : `Commit tested: ${sha}\n\n${REQUIRED_CHECKS.join(', ')} are green on that commit.`;
  run([
    'pr', 'comment', prNumber, '--repo', repo, '--body',
    `The contributor installed the build and says it works.\n\n${commits} Closing issue #${issueNumber} is left to your merge, which closes it.`
  ]);
  postReply({ issue: issueNumber, state: 'sent', repo }, run);
  return { sent: true, updating: false, sha, missing: [] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [issue, pr, flag] = process.argv.slice(2);
  const modes = { '--check-conflicts': 'check-conflicts', '--if-green': 'if-green' };
  if (flag !== undefined && !modes[flag]) throw new Error(`unknown flag: ${flag}`);
  const repo = process.env.GITHUB_REPOSITORY;
  const result = handOff({ issue, pr, repo, reviewer: process.env.GITHUB_REPOSITORY_OWNER, mode: modes[flag] });
  setOutputs({ sent: result.sent, updating: result.updating });
}
