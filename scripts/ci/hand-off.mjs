/**
 * The contributor said it works. Send the fix to the maintainer, or say why not.
 *
 * "Send" means: take the pull request out of draft, label it, ask the
 * maintainer to review it, and record which commit was tested. It does NOT
 * merge. The maintainer merges, and that merge closes the issue.
 *
 * It refuses when `unit`, `nemeth` and `e2e` are not all green on the pull
 * request's head commit. Those are the checks `testing-guard` requires, and
 * "the contributor liked the build" is not a reason to hand the maintainer
 * something GitHub would refuse to merge.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/hand-off.mjs <issue-number> <pull-request-number>
 *
 * Step outputs: sent (true|false).
 */

import { pathToFileURL } from 'node:url';

import { gh, requireNumber, setOutputs } from './gh.mjs';
import { writeStatus } from './status-comment.mjs';

export const REQUIRED_CHECKS = ['unit', 'nemeth', 'e2e'];

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

export function ensureLabel(name, repo, description) {
  gh(['label', 'create', name, '--repo', repo, '--description', description, '--force']);
}

export function handOff({ issue, pr, repo, reviewer }) {
  const issueNumber = requireNumber(issue, 'issue number');
  const prNumber = requireNumber(pr, 'pull request number');

  const sha = gh(['pr', 'view', prNumber, '--repo', repo, '--json', 'headRefOid', '--jq', '.headRefOid']).trim();
  const checkRuns = gh([
    'api', `repos/${repo}/commits/${sha}/check-runs`, '--paginate',
    '--jq', '.check_runs[] | {name, conclusion, completed_at}'
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const missing = notGreen(checkRuns);
  if (missing.length > 0) {
    ensureLabel('needs-maintainer', repo, 'A person has to look at this');
    gh(['pr', 'edit', prNumber, '--repo', repo, '--add-label', 'needs-maintainer']);
    gh([
      'pr', 'comment', prNumber, '--repo', repo, '--body',
      `The contributor says the build works, but these required checks are not green on ${sha}: ${missing.join(', ')}. I did not take this out of draft.`
    ]);
    gh([
      'issue', 'comment', issueNumber, '--repo', repo, '--body',
      'Thank you for testing. I could not send this fix on yet, because the automatic checks are not all green on the newest change. The maintainer has been told. You do not need to do anything.'
    ]);
    return { sent: false, sha, missing };
  }

  ensureLabel('ready-for-maintainer', repo, 'Tested by the contributor. Waiting for the maintainer to merge');
  gh(['pr', 'ready', prNumber, '--repo', repo]);
  gh(['pr', 'edit', prNumber, '--repo', repo, '--add-label', 'ready-for-maintainer']);
  try {
    gh(['pr', 'edit', prNumber, '--repo', repo, '--add-reviewer', reviewer]);
  } catch {
    // A reviewer that cannot be added is not a reason to hold the hand-off. The label is the signal.
  }
  gh([
    'pr', 'comment', prNumber, '--repo', repo, '--body',
    `The contributor installed the build and says it works.\n\nCommit tested: ${sha}\n\n${REQUIRED_CHECKS.join(', ')} are green on that commit. Closing issue #${issueNumber} is left to your merge, which closes it.`
  ]);
  writeStatus({ issue: issueNumber, state: 'sent', repo });
  return { sent: true, sha, missing: [] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [issue, pr] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY;
  const result = handOff({ issue, pr, repo, reviewer: process.env.GITHUB_REPOSITORY_OWNER });
  setOutputs({ sent: result.sent });
}
