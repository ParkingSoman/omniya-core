/**
 * Which open pull request is the fix for issue N?
 *
 * GitHub offers no way to ask an issue which pull requests claim it, so the join
 * is the `Fixes #<n>` line the fix agent must write as the last line of every
 * body. Four workflows used to carry their own copy of this filter. This is the
 * one copy.
 *
 * A match must be ALL of:
 *   - into `testing`, still open (the `gh` query below)
 *   - from this repository, not a fork. A fork can name its branch anything.
 *   - on a branch that starts with `claude/fix-`. That prefix is what keeps this
 *     pipeline from ever pushing to or reading from `testing`, `main` or a
 *     person's hand-written branch.
 *   - carrying `Fixes #<n>` as the LAST line, anchored, so `#12` never matches
 *     `#120` and a sentence that merely mentions the number does not count.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/find-fix-pr.mjs <issue-number>
 *
 * Step outputs: count, pr, branch, sha, draft. `pr`, `branch` and `sha` are
 * empty unless count is 1: with two candidates the pipeline will not guess.
 */

import { pathToFileURL } from 'node:url';

import { gh, requireNumber, setOutputs } from './gh.mjs';

export const BRANCH_PREFIX = 'claude/fix-';

/**
 * @param {Array<{number:number, body?:string|null, headRefName:string, headRefOid?:string, isCrossRepository:boolean, isDraft?:boolean}>} prs
 * @param {string|number} issueNumber
 */
export function matchFixPrs(prs, issueNumber) {
  const n = requireNumber(issueNumber, 'issue number');
  const claims = new RegExp(`(^|\\n)[Ff]ixes #${n}[ \\t\\r\\n]*$`);
  return prs.filter(
    (pr) =>
      pr.isCrossRepository === false &&
      typeof pr.headRefName === 'string' &&
      pr.headRefName.startsWith(BRANCH_PREFIX) &&
      claims.test(pr.body ?? '')
  );
}

export function findFixPr(issueNumber, repo) {
  const listed = JSON.parse(
    gh([
      'pr', 'list', '--repo', repo, '--base', 'testing', '--state', 'open', '--limit', '100',
      '--json', 'number,body,headRefName,headRefOid,isCrossRepository,isDraft'
    ])
  );
  const matches = matchFixPrs(listed, issueNumber);
  const only = matches.length === 1 ? matches[0] : null;
  return {
    count: matches.length,
    pr: only ? only.number : '',
    branch: only ? only.headRefName : '',
    sha: only ? only.headRefOid : '',
    draft: only ? Boolean(only.isDraft) : ''
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = findFixPr(process.argv[2], process.env.GITHUB_REPOSITORY);
  setOutputs(result);
}
