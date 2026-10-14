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
 *   - Every push to the branch was made by one of those two accounts. A
 *     contributor has write access and could push a commit onto a branch the
 *     session opened. Commits carry no GitHub login, so GitHub's push history is
 *     what names the pusher.
 *   - A check counts only when it is a job of the workflow file that defines it
 *     (`pr-checks.yml` for unit, nemeth and e2e, `pr-build.yml` for the two
 *     builds). A name alone is not enough: a new workflow can have a job called
 *     `unit` that always passes. Those two files are protected, so the pull
 *     request cannot have rewritten them.
 *   - An ALLOW list, not a list of bad files. A list of bad files is never
 *     complete: the next file somebody forgot is the next hole. Every file the
 *     pull request touches (and every name it moved from) must be plainly
 *     automation: `docs/`, `scripts/ci/`, `.github/prompts/`, `test/unit/pipeline/`,
 *     the pipeline-change skill, or a `.github/workflows/pipeline-*.yml`. Anything
 *     else, such as `src/`, `package.json`, `.npmrc`, other tests, or the
 *     workflows that define the checks, needs the owner's bypass tick. The
 *     protected files below are carved out of the allow list.
 *   - The file list must be complete. GitHub stops listing at 3,000 files, and a
 *     protected file past that point would not be seen.
 *   - A pull request that deletes a test, or moves one out of `test/`, is refused.
 *   - A pull request that changes this shipper, its tests, or the guard tests on
 *     the secrets is refused. Those still need the owner's bypass tick, or a
 *     shipped change could loosen the thing that ships it.
 *   - Contributor fixes never come here. They keep their own hand-off.
 *
 * Usage (needs GH_TOKEN, MERGE_TOKEN, GITHUB_REPOSITORY, ALLOWED_AUTHORS):
 *   node scripts/ci/ship-pipeline-pr.mjs <pull-request-number> <commit-sha>
 */

import { pathToFileURL } from 'node:url';

import { gh as realGh, requireNumber, setOutputs } from './gh.mjs';

export const BRANCH_PREFIX = 'pipeline/';

/** Which workflow file defines which required check. A check from any other file does not count. */
export const CHECKS_BY_WORKFLOW = {
  '.github/workflows/pr-checks.yml': ['unit', 'nemeth', 'e2e'],
  '.github/workflows/pr-build.yml': ['pack-mac', 'pack-win']
};

/**
 * Changing any of these changes who may merge what, or what counts as green, so
 * the shipper will not ship them. They still need the owner's bypass tick.
 *   - the shipper, the helper it imports, and its tests
 *   - the guards on the secrets and the contributor hand-off that may set the lock
 *   - the workflows that define the checks the shipper trusts, and the package
 *     files that decide what `npm test` runs
 *   - anything under `.github/actions/`, which a workflow could run in their place
 */
export const PROTECTED_FILES = [
  '.github/workflows/pipeline-ship.yml',
  '.github/workflows/pr-checks.yml',
  '.github/workflows/pr-build.yml',
  '.github/CODEOWNERS',
  'scripts/ci/ship-pipeline-pr.mjs',
  'scripts/ci/gh.mjs',
  'scripts/ci/hand-off.mjs',
  'scripts/ci/allowlist.mjs',
  'package.json',
  'package-lock.json',
  'test/unit/pipeline/ship-pipeline-pr.test.js',
  'test/unit/pipeline/pipeline-secrets.test.js',
  'test/unit/pipeline/hand-off.test.js'
];
export const PROTECTED_PREFIXES = ['.github/actions/'];

/** The only places a shipped pull request may touch. Everything else needs the owner's bypass tick. */
export const ALLOWED_PREFIXES = [
  'docs/',
  'scripts/ci/',
  '.github/prompts/',
  'test/unit/pipeline/',
  '.claude/skills/pipeline-change/'
];
export const ALLOWED_WORKFLOW = /^\.github\/workflows\/pipeline-[a-z0-9-]+\.yml$/;
export const MAX_FILES = 3000;

// A `..` segment would let `docs/../src/main.js` start with an allowed prefix. Git
// cannot store such a path, but this must not depend on that.
export const isAllowed = (file) =>
  !file.split('/').includes('..') &&
  (ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix)) || ALLOWED_WORKFLOW.test(file));

export const isProtected = (file) =>
  PROTECTED_FILES.includes(file) || PROTECTED_PREFIXES.some((prefix) => file.startsWith(prefix));

/** One page of push history. A branch with more pushes than this is refused. */
export const MAX_PUSHES = 100;

/**
 * @param {Array<{id:number, path:string, created_at:string, conclusion:string|null}>} runs workflow runs on the commit
 * @param {(id: number) => Array<{name:string, conclusion:string|null}>} jobsOf the jobs of one run
 * @returns {string[]} required check names that are not green
 */
export function notGreen(runs, jobsOf) {
  const missing = [];
  for (const [path, names] of Object.entries(CHECKS_BY_WORKFLOW)) {
    const newest = runs
      .filter((run) => run.path === path)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const jobs = newest && newest.conclusion === 'success' ? jobsOf(newest.id) : [];
    for (const name of names) {
      if (!jobs.some((job) => job.name === name && job.conclusion === 'success')) missing.push(name);
    }
  }
  return missing;
}

/**
 * @param {{pr: object, sha: string, allowedAuthors: string[], missing: string[], pushers?: string[], pushCount?: number, files?: Array<{filename: string, previous_filename?: string|null, status?: string}>}} input
 * @returns {{ship: true} | {ship: false, reason: string}}
 */
export function decide({ pr, sha, allowedAuthors, missing, pushers = [], pushCount = 0, files = [] }) {
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
  if (String(pr.mergeable).toUpperCase() !== 'MERGEABLE') return { ship: false, reason: 'GitHub does not say it can merge cleanly' };
  if (pr.headRefOid !== sha) return { ship: false, reason: 'the branch moved after "ship it"' };
  if (pushCount >= MAX_PUSHES) return { ship: false, reason: 'too many pushes to check who made them' };
  const stranger = pushers.find((login) => !allowedAuthors.includes(login));
  if (stranger !== undefined || pushers.length === 0) {
    return { ship: false, reason: 'someone other than the owner or the session account pushed to the branch' };
  }
  if (pr.changedFiles !== files.length || files.length >= MAX_FILES) {
    return { ship: false, reason: 'the list of changed files is not complete, so a protected file could be hidden' };
  }
  const touched = files.flatMap((f) => [f.filename, f.previous_filename]).filter((name) => name && isProtected(name));
  if (touched.length > 0) return { ship: false, reason: `it changes the shipper or its guards (${touched.join(', ')}), so it needs the owner's bypass tick` };
  const outside = files.flatMap((f) => [f.filename, f.previous_filename]).filter((name) => name && !isAllowed(name));
  if (outside.length > 0) {
    return { ship: false, reason: `it changes more than the automation (${outside.slice(0, 3).join(', ')}), so it needs the owner's bypass tick` };
  }
  const lostTest = files.find(
    (f) =>
      (f.status === 'removed' && f.filename.startsWith('test/')) ||
      (f.previous_filename?.startsWith('test/') && !f.filename.startsWith('test/'))
  );
  if (lostTest) return { ship: false, reason: `it deletes or moves a test (${lostTest.previous_filename ?? lostTest.filename}), so it needs the owner's bypass tick` };
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
      'state,baseRefName,isCrossRepository,headRefName,headRefOid,author,isDraft,mergeable,changedFiles'
    ])
  );
  // Runs are found by commit, and each is tied to the workflow FILE it came from.
  const runs = JSON.parse(
    gh([
      'api', '--method', 'GET', `repos/${repo}/actions/runs`, '-f', `head_sha=${sha}`, '-f', 'per_page=100',
      '--jq', '[.workflow_runs[] | {id, path, created_at, conclusion}]'
    ])
  );
  const jobsOf = (id) =>
    JSON.parse(
      gh([
        'api', '--method', 'GET', `repos/${repo}/actions/runs/${requireNumber(id, 'run id')}/jobs`, '-f', 'per_page=100',
        '--jq', '[.jobs[] | {name, conclusion}]'
      ])
    );

  const pushes = JSON.parse(
    // The branch name goes in as a parameter, never into the URL text. A branch
    // name may hold `&`, and `&actor=omniya-bot` would filter a stranger's pushes out.
    gh([
      'api', '--method', 'GET', `repos/${repo}/activity`,
      '-f', `ref=refs/heads/${view.headRefName}`, '-f', `per_page=${MAX_PUSHES}`,
      '--jq', '[.[] | {a: .actor.login}]'
    ])
  );
  const files = gh(['api', `repos/${repo}/pulls/${number}/files`, '--paginate', '--jq', '.[] | {filename, previous_filename, status}'])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const decision = decide({
    pr: view,
    sha,
    allowedAuthors,
    missing: notGreen(runs, jobsOf),
    pushers: pushes.map((push) => push.a),
    pushCount: pushes.length,
    files
  });
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
