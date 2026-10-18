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
 *     and no approval is on record on the pull request. A fix the contributor already approved is
 *     waiting on the pipeline, not on them.
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
 *   prComments: Array<{body:string, user:{login:string}}>, now: number}} input `now` in milliseconds
 * @returns {{remind: boolean, reason: string, noticeId?: number}} `noticeId` is the build notice the reminder points back to
 */
export function needsReminder({ issueLabels, prLabels, issueComments, prComments, now }) {
  if ([...(issueLabels ?? []), ...(prLabels ?? [])].some((name) => NOT_WAITING_ON_THEM.includes(name))) {
    return { remind: false, reason: 'a-person-or-an-answer-is-awaited' };
  }
  if ((prComments ?? []).some((c) => isBot(c) && (HAND_OFF_RECORD.test(String(c.body ?? '')) || CARRIED_RECORD.test(String(c.body ?? ''))))) {
    return { remind: false, reason: 'already-approved' };
  }
  const all = [...(issueComments ?? [])].sort((a, b) => a.id - b.id);
  if (all.some((c) => isBot(c) && replyState(c.body) === 'reminded')) return { remind: false, reason: 'already-reminded' };
  const newest = all.at(-1);
  if (!newest || !isBuildNotice(newest)) return { remind: false, reason: 'newest-comment-is-not-a-build-notice' };

  const lastPerson = all.filter((c) => !isBot(c)).at(-1);
  const since = all.filter((c) => (!lastPerson || c.id > lastPerson.id) && isBuildNotice(c));
  const days = (now - Date.parse(since[0].created_at)) / 86_400_000;
  if (!(days >= QUIET_DAYS)) return { remind: false, reason: 'not-quiet-long-enough' };
  return { remind: true, reason: 'quiet-for-a-week', noticeId: newest.id };
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
    '--json', 'number,body,headRefName,isCrossRepository,labels'
  ]));
  return prs.map((pr) => {
    const issue = issueOf(pr.body);
    const out = (outcome, reason) => ({ pr: pr.number, issue, outcome, reason });
    try {
      if (pr.isCrossRepository !== false || !String(pr.headRefName).startsWith(BRANCH_PREFIX) || !issue) return out('skip', 'not-a-fix-pr');
      const view = JSON.parse(gh(['api', `repos/${repo}/issues/${requireNumber(issue, 'issue')}`]));
      if (view.state !== 'open') return out('skip', 'issue-is-closed');
      const verdict = needsReminder({
        issueLabels: (view.labels ?? []).map((l) => l.name),
        prLabels: (pr.labels ?? []).map((l) => l.name),
        issueComments: jsonLines(gh(['api', `repos/${repo}/issues/${issue}/comments`, '--paginate', '--jq', COMMENTS])),
        prComments: jsonLines(gh(['api', `repos/${repo}/issues/${pr.number}/comments`, '--paginate', '--jq', COMMENTS])),
        now
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
