/**
 * The contributor said it works. Decide what happens to the fix, and do it.
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
 * script sets it, and the ruleset requires it. It is posted with the built-in
 * token, so it comes from the GitHub Actions integration and from nobody else.
 * Auto-merge is turned on with a separate token (`MERGE_TOKEN`, the App's), so the
 * merge push starts `testing-app.yml`; a push made with the built-in token starts
 * no run.
 *
 * If a check is not green, it labels `needs-owner` and tells the contributor.
 *
 * Usage (needs GH_TOKEN, MERGE_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/hand-off.mjs <issue-number> <pull-request-number>
 *
 * Step outputs: sent (true|false), merge (true|false).
 */

import { pathToFileURL } from 'node:url';

import { gh as realGh, requireNumber, setOutputs } from './gh.mjs';
import { postReply } from './reply.mjs';

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

/**
 * An allowlist, not a denylist. A fix may merge by itself only if every file it
 * touches is app source, a test or a doc. Anything else -- workflows, scripts,
 * `.claude`, package files, CODEOWNERS, a path nobody thought of -- is for the
 * maintainer. GitHub gives paths in one exact form, so there is nothing to
 * normalise, and an odd path (empty, absolute, `..`, a backslash) fails closed.
 * The Nemeth corpus is the grading data, so it is not a place a fix may edit.
 */
const SAFE_PREFIXES = ['src/', 'test/', 'docs/'];
const GRADING_DATA = 'test/corpus/';

export function protectedPath(path) {
  const p = String(path ?? '');
  if (!p || p.startsWith('/') || p.includes('\\') || p.split('/').includes('..')) return true;
  if (p.startsWith(GRADING_DATA)) return true;
  return !SAFE_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/**
 * Pure: what to do with the fix. No GitHub in here.
 *
 * @param {{files: Array<{filename:string, previous_filename?:string}>, mergeable: string, body: string, missing: string[]}} input
 *   `missing` is `notGreen(...)`.
 * @returns {{action: 'protected', reason: 'automation'|'test-removed'|'conflict'|'standing-note'}
 *   | {action: 'not-green', missing: string[]}
 *   | {action: 'merge'}}
 */
export function decide({ files, mergeable, body, missing }) {
  const touches = (files ?? []).some((f) => protectedPath(f.filename) || (f.previous_filename != null && protectedPath(f.previous_filename)));
  if (touches) return { action: 'protected', reason: 'automation' };
  // Deleting a test is how a gate gets gamed. A person looks at that.
  const removesTest = (files ?? []).some((f) => f.status === 'removed' && String(f.filename ?? '').startsWith('test/'));
  if (removesTest) return { action: 'protected', reason: 'test-removed' };
  if (String(mergeable ?? '').toUpperCase() === 'CONFLICTING') return { action: 'protected', reason: 'conflict' };
  // Any heading level, any spacing. The agent writes the body, so this is a
  // signal and not a lock: the locks on design decisions are elsewhere.
  if (/^[ \t]{0,3}#{1,6}[ \t]*reverses a standing note/im.test(String(body ?? ''))) return { action: 'protected', reason: 'standing-note' };
  if (missing.length > 0) return { action: 'not-green', missing };
  return { action: 'merge' };
}

export function ensureLabel(name, repo, description, gh = realGh) {
  gh(['label', 'create', name, '--repo', repo, '--description', description, '--force']);
}

export function handOff({ issue, pr, repo, reviewer, mergeToken }, gh = realGh) {
  const issueNumber = requireNumber(issue, 'issue number');
  const prNumber = requireNumber(pr, 'pull request number');

  const view = JSON.parse(gh(['pr', 'view', prNumber, '--repo', repo, '--json', 'headRefOid,mergeable,body']));
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
    '--jq', '.[] | {filename, previous_filename, status}'
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const decision = decide({ files, mergeable: view.mergeable, body: view.body, missing: notGreen(checkRuns) });

  if (decision.action === 'not-green') {
    const missing = decision.missing;
    ensureLabel('needs-owner', repo, 'A person has to look at this', gh);
    gh(['pr', 'edit', prNumber, '--repo', repo, '--add-label', 'needs-owner']);
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

  gh(['pr', 'ready', prNumber, '--repo', repo]);

  if (decision.action === 'protected') {
    ensureLabel('needs-owner', repo, 'A person has to look at this', gh);
    gh(['pr', 'edit', prNumber, '--repo', repo, '--add-label', 'needs-owner']);
    try {
      gh(['pr', 'edit', prNumber, '--repo', repo, '--add-reviewer', reviewer]);
    } catch {
      // A reviewer that cannot be added is not a reason to hold the hand-off. The label is the signal.
    }
    const why = {
      automation: 'It changes files outside the app source, tests and docs (for example workflows, scripts, settings, package files or the Nemeth corpus).',
      'test-removed': 'It deletes a test file.',
      conflict: 'It conflicts with `testing`.',
      'standing-note': 'It says it reverses a standing note.'
    }[decision.reason];
    gh([
      'pr', 'comment', prNumber, '--repo', repo, '--body',
      `The contributor installed the build and says it works.\n\nCommit tested: ${sha}\n\n${why} I did not set \`contributor-tested\` and I did not turn on auto-merge. Closing issue #${issueNumber} is left to your merge, which closes it.`
    ]);
    postReply({ issue: issueNumber, state: decision.reason === 'automation' ? 'sent-automation' : 'sent-owner', repo }, gh);
    return { sent: true, merge: false, sha, missing: [], reason: decision.reason };
  }

  if (!mergeToken) throw new Error('MERGE_TOKEN is not set. Refusing to set contributor-tested without a way to merge.');
  // The lock. Posted with the built-in token, before auto-merge is asked for.
  gh([
    'api', `repos/${repo}/statuses/${sha}`,
    '-f', 'state=success', '-f', 'context=contributor-tested', '-f', 'description=The contributor tested this build'
  ]);
  gh(['pr', 'merge', prNumber, '--repo', repo, '--auto', '--squash', '--match-head-commit', sha], { token: mergeToken });
  gh([
    'pr', 'comment', prNumber, '--repo', repo, '--body',
    `The contributor installed the build and says it works.\n\nCommit tested: ${sha}\n\n${REQUIRED_CHECKS.join(', ')} are green on that commit. Auto-merge is on for that commit only. If the branch changes, it will not merge on this approval. Merging closes issue #${issueNumber}.`
  ]);
  postReply({ issue: issueNumber, state: 'sent', repo }, gh);
  return { sent: true, merge: true, sha, missing: [] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [issue, pr] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY;
  const result = handOff({
    issue, pr, repo,
    reviewer: process.env.GITHUB_REPOSITORY_OWNER,
    mergeToken: process.env.MERGE_TOKEN
  });
  setOutputs({ sent: result.sent, merge: result.merge });
}
