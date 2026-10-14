/**
 * Merge a pipeline pull request after the owner said "ship it" in chat.
 *
 * Pull requests that change the automation fail the hand-off allowlist on
 * purpose, so they never merge by themselves. The `testing-tested` rule wants
 * the commit status `contributor-tested` from the App, and the only way past it
 * was the owner's bypass tick in the browser. The owner does not work in the
 * browser, so this is the other way in. The owner approved it in chat on
 * 2026-10-14, as the replacement for the bypass tick.
 *
 * What makes it safe to let a chat session start it:
 *   - It runs from `testing` only (the environment `pipeline` allows no other
 *     ref), so a pull request cannot edit the workflow that ships it.
 *   - The workflow refuses any actor but the repository owner and the owner's
 *     session account. A contributor has write access and could start it.
 *   - Here, fail closed. The pull request must be open, into `testing`, from this
 *     repository, on a `pipeline/` branch, written by the owner or the session
 *     account, not a draft, not conflicting. Its head must be the commit the
 *     caller named, so a push after "ship it" cannot ride on it. The unit tests,
 *     the Nemeth gate, the e2e tests and both builds must be green on that commit.
 *   - Contributor fixes never come here. They keep their own hand-off.
 *
 * Usage (needs GH_TOKEN, MERGE_TOKEN, GITHUB_REPOSITORY, ALLOWED_AUTHORS):
 *   node scripts/ci/ship-pipeline-pr.mjs <pull-request-number> <commit-sha>
 */

import { pathToFileURL } from 'node:url';

import { gh as realGh, requireNumber, setOutputs } from './gh.mjs';

export const BRANCH_PREFIX = 'pipeline/';
export const SHIP_CHECKS = ['unit', 'nemeth', 'e2e', 'pack-mac', 'pack-win'];

/**
 * @param {Array<{name:string, conclusion:string|null, completed_at:string|null}>} checkRuns
 * @returns {string[]} names that are not green
 */
export function notGreen(checkRuns) {
  return SHIP_CHECKS.filter((name) => {
    const newest = checkRuns
      .filter((c) => c.name === name)
      .sort((a, b) => String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')))[0];
    return !newest || newest.conclusion !== 'success';
  });
}

/**
 * @param {{pr: object, sha: string, allowedAuthors: string[], missing: string[]}} input
 * @returns {{ship: true} | {ship: false, reason: string}}
 */
export function decide({ pr, sha, allowedAuthors, missing }) {
  if (pr.state !== 'OPEN') return { ship: false, reason: 'the pull request is not open' };
  if (pr.baseRefName !== 'testing') return { ship: false, reason: 'it does not go into testing' };
  if (pr.isCrossRepository !== false) return { ship: false, reason: 'it comes from a fork' };
  if (!String(pr.headRefName).startsWith(BRANCH_PREFIX)) {
    return { ship: false, reason: `the branch does not start with ${BRANCH_PREFIX}` };
  }
  if (!allowedAuthors.includes(pr.author?.login)) {
    return { ship: false, reason: "its author is not the owner or the owner's session account" };
  }
  if (pr.isDraft) return { ship: false, reason: 'it is a draft' };
  if (String(pr.mergeable).toUpperCase() === 'CONFLICTING') return { ship: false, reason: 'it conflicts with testing' };
  if (pr.headRefOid !== sha) return { ship: false, reason: 'the branch moved after "ship it"' };
  if (missing.length > 0) return { ship: false, reason: `not green on that commit: ${missing.join(', ')}` };
  return { ship: true };
}

const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * @param {{pr: string|number, sha: string, repo: string, allowedAuthors: string[], mergeToken: string}} args
 * @param {(args: string[], opts?: {token?: string}) => string} [gh]
 * @param {(ms: number) => void} [sleep]
 */
export function ship({ pr, sha, repo, allowedAuthors, mergeToken }, gh = realGh, sleep = wait) {
  const number = requireNumber(pr, 'pull request number');
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`sha must be 40 hex characters, got: ${sha}`);
  if (!mergeToken) throw new Error('MERGE_TOKEN is not set. Refusing to ship without it.');

  const view = JSON.parse(
    gh([
      'pr', 'view', number, '--repo', repo, '--json',
      'state,baseRefName,isCrossRepository,headRefName,headRefOid,author,isDraft,mergeable'
    ])
  );
  const checkRuns = gh([
    'api', `repos/${repo}/commits/${sha}/check-runs`, '--paginate',
    '--jq', '.check_runs[] | {name, conclusion, completed_at}'
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const decision = decide({ pr: view, sha, allowedAuthors, missing: notGreen(checkRuns) });
  if (!decision.ship) return { shipped: false, reason: decision.reason };

  // The lock, posted as the App: a branch workflow cannot post as the App.
  gh([
    'api', `repos/${repo}/statuses/${sha}`,
    '-f', 'state=success', '-f', 'context=contributor-tested', '-f', 'description=The owner said ship it'
  ], { token: mergeToken });

  let last = '';
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      gh(['pr', 'merge', number, '--repo', repo, '--squash', '--match-head-commit', sha], { token: mergeToken });
      return { shipped: true, reason: 'merged' };
    } catch (error) {
      last = String(error.stderr ?? error.message ?? error);
      sleep(5000);
    }
  }
  throw new Error(`could not merge #${number}: ${last}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [pr, sha] = process.argv.slice(2);
  const result = ship({
    pr,
    sha: sha ?? '',
    repo: process.env.GITHUB_REPOSITORY,
    allowedAuthors: (process.env.ALLOWED_AUTHORS ?? '').split(',').filter(Boolean),
    mergeToken: process.env.MERGE_TOKEN
  });
  setOutputs({ shipped: result.shipped });
  console.log(result.shipped ? `shipped #${pr}` : `did not ship #${pr}: ${result.reason}`);
  if (!result.shipped) process.exitCode = 1;
}
