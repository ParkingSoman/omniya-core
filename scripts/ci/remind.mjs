/**
 * One reminder for a fix that has been in the test alpha for a week with no word from the contributor.
 *
 * Merge first: the fix is in `testing`, the contributor was told once that the alpha holds it
 * (`in-alpha.mjs`), and the issue stays open until they say it works. Some never answer. This posts
 * ONE short reply with the alpha's links, and never a second for the same comment.
 *
 * An issue is reminded only if ALL of these hold:
 *  1. It is open and nobody is waiting on a person (`needs-owner`, `needs-maintainer`, `needs-info`,
 *     `needs-design`).
 *  2. The newest comment on it is the pipeline's `in-alpha` reply, at least QUIET_DAYS old. Anything
 *     newer, from anyone, means the conversation moved on.
 *
 * The reminder is then the newest comment, so a second run finds nothing to do.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/remind.mjs [--dry]      (or DRY=true in the environment)
 */

import { pathToFileURL } from 'node:url';

import { replyState } from './confirm.mjs';
import { gh as realGh, requireNumber } from './gh.mjs';
import { WAITING_LABELS } from './keep-current.mjs';
import { AUTHOR, postReply } from './reply.mjs';

export const QUIET_DAYS = 7;

/** Labels on the issue that mean the contributor is not the one being waited on. */
const NOT_WAITING_ON_THEM = [...WAITING_LABELS, 'needs-info', 'needs-design'];

/**
 * Pure: should this issue get its reminder now?
 * @param {{labels: string[], comments: Array<{id:number, created_at:string, body:string, user:{login:string}}>, now: number}} input
 * @returns {{remind: boolean, reason: string}}
 */
export function needsReminder({ labels, comments, now }) {
  if ((labels ?? []).some((name) => NOT_WAITING_ON_THEM.includes(name))) return { remind: false, reason: 'a-person-or-an-answer-is-awaited' };
  const newest = [...(comments ?? [])].sort((a, b) => a.id - b.id).at(-1);
  if (!newest || newest.user?.login !== AUTHOR || replyState(newest.body) !== 'in-alpha') return { remind: false, reason: 'newest-comment-is-not-in-alpha' };
  const days = (now - Date.parse(newest.created_at)) / 86_400_000;
  if (!(days >= QUIET_DAYS)) return { remind: false, reason: 'not-quiet-long-enough' };
  return { remind: true, reason: 'quiet-for-a-week' };
}

/**
 * Every open issue. A failure on one is reported and does not stop the others.
 * @returns {Array<{issue:number, outcome:'reminded'|'would-remind'|'skip', reason:string}>}
 */
export function remindAll({ repo, now = Date.now(), dry = false }, gh = realGh) {
  const issues = JSON.parse(gh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', 'number,labels']));
  return issues.map((issue) => {
    const out = (outcome, reason) => ({ issue: issue.number, outcome, reason });
    try {
      const n = requireNumber(String(issue.number), 'issue');
      const comments = gh(['api', `repos/${repo}/issues/${n}/comments`, '--paginate', '--jq', '.[] | {id, created_at, body, user: {login: .user.login}}'])
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const verdict = needsReminder({ labels: (issue.labels ?? []).map((l) => l.name), comments, now });
      if (!verdict.remind) return out('skip', verdict.reason);
      if (dry) return out('would-remind', verdict.reason);
      postReply({ issue: n, state: 'reminded', repo }, gh);
      return out('reminded', verdict.reason);
    } catch (error) {
      return out('skip', `error: ${String(error.message ?? error).split('\n')[0].slice(0, 120)}`);
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dry = process.argv.includes('--dry') || process.env.DRY === 'true';
  const results = remindAll({ repo: process.env.GITHUB_REPOSITORY, dry });
  for (const r of results) if (r.outcome !== 'skip' || r.reason.startsWith('error')) console.log(`issue #${r.issue} ${r.outcome}: ${r.reason}`);
}
