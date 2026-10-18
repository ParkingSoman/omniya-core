/**
 * One reminder for a fix whose test build has waited a week with no word from the contributor.
 *
 * A contributor gets a build to try, and some never answer: a week goes by, the fix sits in a draft
 * pull request, and nothing on the issue says anyone noticed. This posts ONE short reply, with the
 * links, and never a second. Everything is decided from the issue and the pull request, with no agent.
 *
 * A fix is reminded only if ALL of these hold:
 *  1. The newest comment on the issue is the pipeline's own build notice (`ready` or `revised`, or the
 *     older "A test build is ready" notice from before the state line existed). A question, a hold or a
 *     failure means the contributor is not the one being waited on.
 *  2. The earliest such notice since the contributor last wrote is at least QUIET_DAYS old. A later
 *     `revised` notice does not restart the count: the contributor was already asked.
 *  3. The pipeline has never sent a reminder on this issue.
 *  4. Nobody is waiting on a person (`needs-owner`, `needs-maintainer`, `needs-info`, `needs-design`),
 *     and no approval stands on the pull request. A fix the contributor already approved for the commit
 *     that would merge is waiting on the pipeline, not on them.
 *     An approval for an OLDER commit is void: the fix changed after the word (a person moved a file, a
 *     repair rewrote a line) and the carry rules refused it. The contributor was asked to try the new
 *     build and has to answer again, so that fix is reminded after STALE_QUIET_DAYS, not QUIET_DAYS.
 *     Only once the head is at least HEAD_SETTLED_HOURS old, because the carry job runs first and may
 *     still be waiting for the checks of a head that just moved. Issues 73 and 71 sat silent for days
 *     because the old record made the reminder skip them as "approved".
 *
 * The reply state is `reminded`. It has no links of its own, because a link is offered only with a build
 * that was checked. It points back to the build notice instead, and `confirm.mjs` skips it when it looks
 * for that notice, so a plain "it works" written after it is judged exactly as it was before.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/remind.mjs [--dry]      (or DRY=true in the environment)
 */

import { pathToFileURL } from 'node:url';

import { CARRIED_RECORD, HAND_OFF_RECORD } from './carry-over.mjs';
import { replyState } from './confirm.mjs';
import { BRANCH_PREFIX } from './find-fix-pr.mjs';
import { gh as realGh, requireNumber } from './gh.mjs';
import { issueOf, WAITING_LABELS } from './keep-current.mjs';
import { AUTHOR, postReply } from './reply.mjs';

export const QUIET_DAYS = 7;
/** A void approval means the contributor must answer again, so the wait is shorter. */
export const STALE_QUIET_DAYS = 2;
/** The carry job has had its chance to carry an approval once the head is this old. */
export const HEAD_SETTLED_HOURS = 6;

/** Labels on the ISSUE that mean the contributor is not the one being waited on. */
const NOT_WAITING_ON_THEM = [...WAITING_LABELS, 'needs-info', 'needs-design'];

/** The notice from before the hidden state line existed. Exact start, from the bot only. */
const LEGACY_BUILD = /^<!-- omniya-pipeline-notice -->\s+A test build is ready\./;

const isBot = (c) => c.user?.login === AUTHOR;
const isBuildNotice = (c) =>
  isBot(c) && (['ready', 'revised'].includes(replyState(c.body)) || LEGACY_BUILD.test(String(c.body ?? '').trim()));

/**
 * Pure: should this fix get its reminder now?
 *
 * @param {{issueLabels: string[], prLabels: string[], issueComments: Array<{id:number, created_at:string, body:string, user:{login:string}}>,
 *   prComments: Array<{id?:number, body:string, user:{login:string}}>, now: number, headSha?: string, headCommittedAt?: string}} input
 *   `now` in milliseconds. `headSha` and `headCommittedAt` are the pull request's head commit and when it was made; without
 *   `headSha` any approval on record counts as standing (fails closed).
 * @returns {{remind: boolean, reason: string, noticeId?: number}} `noticeId` is the build notice the reminder points back to
 */
export function needsReminder({ issueLabels, prLabels, issueComments, prComments, now, headSha, headCommittedAt }) {
  if ([...(issueLabels ?? []), ...(prLabels ?? [])].some((name) => NOT_WAITING_ON_THEM.includes(name))) {
    return { remind: false, reason: 'a-person-or-an-answer-is-awaited' };
  }
  const records = [...(prComments ?? [])]
    .filter((c) => isBot(c) && (HAND_OFF_RECORD.test(String(c.body ?? '')) || CARRIED_RECORD.test(String(c.body ?? ''))))
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  let voidApproval = false;
  if (records.length > 0) {
    const tested = /Commit tested: ([0-9a-f]{40})\b/.exec(String(records.at(-1).body))?.[1];
    // Fails closed: with no head known, or no commit readable in the record, the approval stands.
    if (!headSha || !tested || tested === headSha) return { remind: false, reason: 'already-approved' };
    const settled = (now - Date.parse(headCommittedAt)) / 3_600_000 >= HEAD_SETTLED_HOURS;
    if (!settled) return { remind: false, reason: 'head-moved-recently' };
    voidApproval = true;
  }
  const all = [...(issueComments ?? [])].sort((a, b) => a.id - b.id);
  if (all.some((c) => isBot(c) && replyState(c.body) === 'reminded')) return { remind: false, reason: 'already-reminded' };
  const newest = all.at(-1);
  if (!newest || !isBuildNotice(newest)) return { remind: false, reason: 'newest-comment-is-not-a-build-notice' };

  const lastPerson = all.filter((c) => !isBot(c)).at(-1);
  const since = all.filter((c) => (!lastPerson || c.id > lastPerson.id) && isBuildNotice(c));
  const days = (now - Date.parse(since[0].created_at)) / 86_400_000;
  if (!(days >= (voidApproval ? STALE_QUIET_DAYS : QUIET_DAYS))) return { remind: false, reason: 'not-quiet-long-enough' };
  return { remind: true, reason: voidApproval ? 'old-approval-is-void' : 'quiet-for-a-week', noticeId: newest.id };
}

const jsonLines = (text) => text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const COMMENTS = '.[] | {id, created_at, body, user: {login: .user.login}}';

/**
 * Every open fix pull request. A failure on one is reported and does not stop the others.
 * @returns {Array<{pr:number, issue:string, outcome:'reminded'|'would-remind'|'skip', reason:string}>}
 */
export function remindAll({ repo, now = Date.now(), dry = false }, gh = realGh) {
  const prs = JSON.parse(gh([
    'pr', 'list', '--repo', repo, '--base', 'testing', '--state', 'open', '--limit', '100',
    '--json', 'number,body,headRefName,headRefOid,isCrossRepository,labels'
  ]));
  return prs.map((pr) => {
    const issue = issueOf(pr.body);
    const out = (outcome, reason) => ({ pr: pr.number, issue, outcome, reason });
    try {
      if (pr.isCrossRepository !== false || !String(pr.headRefName).startsWith(BRANCH_PREFIX) || !issue) return out('skip', 'not-a-fix-pr');
      const view = JSON.parse(gh(['api', `repos/${repo}/issues/${requireNumber(issue, 'issue')}`]));
      if (view.state !== 'open') return out('skip', 'issue-is-closed');
      const prComments = jsonLines(gh(['api', `repos/${repo}/issues/${pr.number}/comments`, '--paginate', '--jq', COMMENTS]));
      // Only a pull request with an approval on record needs the age of its head, so only that one pays the call.
      const hasRecord = prComments.some((c) => c.user?.login === AUTHOR && (HAND_OFF_RECORD.test(String(c.body ?? '')) || CARRIED_RECORD.test(String(c.body ?? ''))));
      const headCommittedAt = hasRecord && pr.headRefOid ? gh(['api', `repos/${repo}/commits/${pr.headRefOid}`, '--jq', '.commit.committer.date']).trim() : undefined;
      const verdict = needsReminder({
        issueLabels: (view.labels ?? []).map((l) => l.name),
        prLabels: (pr.labels ?? []).map((l) => l.name),
        issueComments: jsonLines(gh(['api', `repos/${repo}/issues/${issue}/comments`, '--paginate', '--jq', COMMENTS])),
        prComments,
        now,
        headSha: pr.headRefOid,
        headCommittedAt
      });
      if (!verdict.remind) return out('skip', verdict.reason);
      if (dry) return out('would-remind', verdict.reason);
      const notice = `https://github.com/${repo}/issues/${issue}#issuecomment-${verdict.noticeId}`;
      postReply({ issue, state: 'reminded', repo, pr: String(pr.number), notice }, gh);
      return out('reminded', verdict.reason);
    } catch (error) {
      return out('skip', `error: ${String(error.message ?? error).split('\n')[0].slice(0, 120)}`);
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dry = process.argv.includes('--dry') || process.env.DRY === 'true';
  const results = remindAll({ repo: process.env.GITHUB_REPOSITORY, dry });
  for (const r of results) console.log(`#${r.pr} (issue #${r.issue || '?'}) ${r.outcome}: ${r.reason}`);
}
