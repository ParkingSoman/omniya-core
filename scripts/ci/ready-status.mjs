/**
 * Make the merge box say whether a pull request is ready, and be right.
 *
 * The rule `testing-tested` wants the status `contributor-tested` from the pipeline's App. The
 * hand-off posts it when a contributor says a fix works, and the shipper posts it when a session
 * ships. Every other pull request got none, so the owner could only merge it with the
 * "bypass rules" box, which hides every missing requirement, not just the ones meant to be
 * skipped. This posts the status for the rest, so the Merge button is green exactly when it is
 * safe:
 *
 *   opened   a pull request opens or its branch moves: say what it waits for. Never
 *            over a status that is already there.
 *   review   an approval was given, or the checks finished: if the OWNER approved THIS
 *            commit and the checks are green, post success.
 *
 * What makes the success trustworthy:
 *   - Only the repository owner's review counts, and only when it is on the exact commit that
 *     is about to merge. A push after the approval is a new commit, with no approval.
 *   - The checks are read from the workflow files that define them, never by name alone.
 *   - It is posted by the App, from `testing`, and the ruleset accepts only the App's status.
 *     The agent's token has no statuses permission, so the agent can never post it.
 *   - It never turns a success back into a wait.
 *   - A fix branch gets no "waiting for the owner" text before the contributor has spoken, and
 *     no success unless the owner approved. The hand-off owns that branch's own success.
 *
 * Usage (needs GH_TOKEN, MERGE_TOKEN, GITHUB_REPOSITORY, GITHUB_REPOSITORY_OWNER):
 *   node scripts/ci/ready-status.mjs <opened|review> <commit-sha>
 */

import { pathToFileURL } from 'node:url';

import { gh as realGh, requireNumber, setOutputs } from './gh.mjs';
import { notGreen } from './green.mjs';

export const CONTEXT = 'contributor-tested';
export const FIX_PREFIX = 'claude/fix-';

export const WAITING = {
  owner: "Waiting for the owner's approval",
  contributor: 'Waiting for the contributor to say it works',
  checks: 'Approved. Waiting for the checks to pass'
};
export const READY = 'The owner approved this commit and the checks are green';

/**
 * Has the owner approved this exact commit? The owner's latest decision counts, so a later
 * "changes requested" or a dismissed approval takes it back. A plain comment is not a decision.
 * @param {Array<{user?: {login: string}, state: string, commit_id?: string, submitted_at?: string}>} reviews
 * @param {string} owner
 * @param {string} sha
 */
export function ownerApproved(reviews, owner, sha) {
  const decisions = reviews
    .filter((r) => r.user?.login === owner && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(String(r.state).toUpperCase()))
    .sort((a, b) => String(a.submitted_at ?? '').localeCompare(String(b.submitted_at ?? '')));
  const last = decisions.at(-1);
  return Boolean(last) && String(last.state).toUpperCase() === 'APPROVED' && last.commit_id === sha;
}

/**
 * Pure: what to post. Never turns a success back into a wait.
 * @param {{mode: 'opened'|'review', isFix: boolean, approved: boolean, green: boolean, existing: {state: string, description?: string}|null}} input
 * @returns {{post: false, why: string} | {post: true, state: 'success'|'pending', description: string}}
 */
export function decideStatus({ mode, isFix, approved, green, existing }) {
  if (existing?.state === 'success') return { post: false, why: 'it is already ready' };
  if (approved && green) return { post: true, state: 'success', description: READY };
  if (mode === 'opened') {
    if (existing) return { post: false, why: 'a status is already there' };
    return { post: true, state: 'pending', description: isFix ? WAITING.contributor : WAITING.owner };
  }
  // A review or a finished check, and not ready yet. Say what is missing, once.
  if (isFix && !approved) return { post: false, why: 'the contributor has not spoken, and the hand-off owns that status' };
  const description = approved ? WAITING.checks : WAITING.owner;
  if (existing?.description === description) return { post: false, why: 'it already says that' };
  return { post: true, state: 'pending', description };
}

/**
 * @param {{repo: string, owner: string, sha: string, mode: 'opened'|'review', mergeToken: string}} args
 * @param {(args: string[], opts?: {token?: string}) => string} [gh]
 */
export function readyStatus({ repo, owner, sha, mode, mergeToken }, gh = realGh) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`sha must be 40 hex characters, got: ${sha}`);
  if (!['opened', 'review'].includes(mode)) throw new Error(`mode must be opened or review, got: ${mode}`);
  if (!mergeToken) throw new Error('MERGE_TOKEN is not set. Refusing to post a status without the App token.');

  // The open pull requests whose head IS this commit, into testing, from this repository.
  const found = JSON.parse(
    gh(['api', '--method', 'GET', `repos/${repo}/commits/${sha}/pulls`, '--jq', '[.[] | {number, state, base: .base.ref, head: .head.sha, ref: .head.ref, fork: (.head.repo.full_name != .base.repo.full_name)}]'])
  ).filter((pr) => pr.state === 'open' && pr.base === 'testing' && pr.head === sha && pr.fork === false);

  const results = [];
  for (const pr of found) {
    const number = requireNumber(pr.number, 'pull request number');
    const statuses = JSON.parse(
      gh(['api', '--method', 'GET', `repos/${repo}/commits/${sha}/statuses`, '-f', 'per_page=100', '--jq', `[.[] | select(.context == "${CONTEXT}") | {state, description}]`])
    );
    const existing = statuses[0] ?? null;

    let approved = false;
    let green = false;
    if (mode === 'review') {
      const reviews = gh(['api', `repos/${repo}/pulls/${number}/reviews`, '--paginate', '--jq', '.[] | {user: {login: .user.login}, state, commit_id, submitted_at}'])
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      approved = ownerApproved(reviews, owner, sha);
      if (approved) {
        const runs = JSON.parse(
          gh(['api', '--method', 'GET', `repos/${repo}/actions/runs`, '-f', `head_sha=${sha}`, '-f', 'per_page=100', '--jq', '[.workflow_runs[] | {id, path, created_at, conclusion}]'])
        );
        const jobsOf = (id) =>
          JSON.parse(gh(['api', '--method', 'GET', `repos/${repo}/actions/runs/${requireNumber(id, 'run id')}/jobs`, '-f', 'per_page=100', '--jq', '[.jobs[] | {name, conclusion}]']));
        green = notGreen(runs, jobsOf).length === 0;
      }
    }

    const decision = decideStatus({ mode, isFix: String(pr.ref).startsWith(FIX_PREFIX), approved, green, existing });
    if (decision.post) {
      gh(['api', `repos/${repo}/statuses/${sha}`, '-f', `state=${decision.state}`, '-f', `context=${CONTEXT}`, '-f', `description=${decision.description}`], { token: mergeToken });
    }
    results.push({ pr: number, ...decision });
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode, sha] = process.argv.slice(2);
  const results = readyStatus({
    repo: process.env.GITHUB_REPOSITORY,
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    sha: sha ?? '',
    mode,
    mergeToken: process.env.MERGE_TOKEN
  });
  setOutputs({ posted: results.filter((r) => r.post).length });
  for (const r of results) console.log(`#${r.pr}: ${r.post ? `posted ${r.state}: ${r.description}` : `left alone, ${r.why}`}`);
  if (results.length === 0) console.log('no open pull request has this commit as its head');
}
