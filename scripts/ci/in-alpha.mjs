/**
 * Tell the contributor, once, that the test alpha now holds their fix.
 *
 * Merge first (`merge-green.mjs`): a fix with green checks goes into `testing` before anyone has
 * tried it, and the issue stays open. `testing-app.yml` then builds the alpha from `testing`. When an
 * alpha that holds the merge is published, the contributor gets ONE comment with the alpha's links
 * and is asked to try it. Their "it works" closes the issue (`confirm.mjs`).
 *
 * Worked out from the state, never from the event that woke it, so a missed or repeated run changes
 * nothing. A fix is told only if ALL of these hold:
 *   1. It is a pipeline fix pull request (`claude/fix-`, this repository) merged into `testing` in the
 *      last LOOK_BACK_DAYS days, whose last line names the issue (`Fix for #N`, or `Fixes #N`).
 *   2. The issue is open.
 *   3. The newest successful `testing-app` run was built from a commit that holds the merge.
 *   4. The pipeline has not said `in-alpha` or `closed` on the issue since the merge.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/in-alpha.mjs [--dry]      (or DRY=true in the environment)
 */

import { pathToFileURL } from 'node:url';

import { replyState } from './confirm.mjs';
import { BRANCH_PREFIX } from './find-fix-pr.mjs';
import { gh as realGh, requireNumber } from './gh.mjs';
import { OPEN_LINE } from './hand-off.mjs';
import { AUTHOR, postReply } from './reply.mjs';

export const LOOK_BACK_DAYS = 14;

/** Pure: the issue a merged fix names on its last line, or ''. */
export function namedIssue(body) {
  const m = new RegExp(`(?:^|\\n)(?:[Ff]ixes|${OPEN_LINE}) #([0-9]+)[ \\t\\r\\n]*$`).exec(String(body ?? ''));
  return m ? m[1] : '';
}

/**
 * Pure: has the pipeline already said the alpha holds it, or closed the issue, since the merge?
 * @param {Array<{created_at:string, body:string, user:{login:string}}>} comments
 */
export function alreadyTold(comments, mergedAt) {
  return (comments ?? []).some(
    (c) => c.user?.login === AUTHOR && ['in-alpha', 'closed'].includes(replyState(c.body)) && Date.parse(c.created_at) >= Date.parse(mergedAt)
  );
}

/** The commit the newest published alpha was built from, or '' if none. */
export function alphaCommit(repo, gh = realGh) {
  const runs = JSON.parse(gh([
    'run', 'list', '--repo', repo, '--workflow', 'testing-app.yml', '--branch', 'testing',
    '--status', 'success', '--limit', '1', '--json', 'headSha'
  ]));
  return runs[0]?.headSha ?? '';
}

/** Does the alpha commit hold the merge commit? GitHub compares: the alpha is the merge, or after it. */
export function holds(repo, mergeSha, alphaSha, gh = realGh) {
  const status = gh(['api', `repos/${repo}/compare/${mergeSha}...${alphaSha}`, '--jq', '.status']).trim();
  return status === 'identical' || status === 'ahead';
}

export function tellAll({ repo, now = Date.now(), dry = false }, gh = realGh) {
  const alpha = alphaCommit(repo, gh);
  if (!/^[0-9a-f]{40}$/.test(alpha)) return [{ pr: 0, issue: '', outcome: 'skip: no published alpha' }];
  const merged = JSON.parse(gh([
    'pr', 'list', '--repo', repo, '--base', 'testing', '--state', 'merged', '--limit', '50',
    '--json', 'number,title,body,headRefName,isCrossRepository,mergedAt,mergeCommit'
  ]));
  const told = new Set();
  const results = [];
  for (const pr of merged) {
    const issue = namedIssue(pr.body);
    const out = (outcome) => results.push({ pr: pr.number, issue, outcome });
    if (pr.isCrossRepository !== false || !String(pr.headRefName).startsWith(BRANCH_PREFIX) || !issue) continue;
    if ((now - Date.parse(pr.mergedAt)) / 86_400_000 > LOOK_BACK_DAYS) continue;
    try {
      if (told.has(issue)) { out('skip: told with another fix'); continue; }
      const view = JSON.parse(gh(['api', `repos/${repo}/issues/${requireNumber(issue, 'issue')}`, '--jq', '{state}']));
      if (view.state !== 'open') { out('skip: the issue is closed'); continue; }
      const comments = gh(['api', `repos/${repo}/issues/${issue}/comments`, '--paginate', '--jq', '.[] | {created_at, body, user: {login: .user.login}}'])
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
      if (alreadyTold(comments, pr.mergedAt)) { out('skip: already told'); continue; }
      if (!holds(repo, pr.mergeCommit?.oid, alpha, gh)) { out('skip: the alpha does not hold it yet'); continue; }
      told.add(issue);
      if (dry) { out('would tell'); continue; }
      postReply({ issue, state: 'in-alpha', repo, message: `The fix: ${pr.title}` }, gh);
      out('told');
    } catch (error) {
      out(`error: ${String(error.message ?? error).split('\n')[0].slice(0, 160)}`);
    }
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dry = process.argv.includes('--dry') || process.env.DRY === 'true';
  for (const r of tellAll({ repo: process.env.GITHUB_REPOSITORY, dry })) console.log(`#${r.pr} (issue #${r.issue || '?'}): ${r.outcome}`);
}
