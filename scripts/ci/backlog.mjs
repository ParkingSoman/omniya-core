/**
 * What is stuck? One plain line per open fix pull request, so a session can tell
 * the owner in the chat and nobody has to open GitHub to find out.
 *
 *   conflict   it conflicts with `testing`; `pipeline-keep-current.yml` will repair it
 *   waiting    a person has to look (needs-owner or needs-maintainer)
 *   stale      nothing has happened to it for more than STALE_DAYS days
 *   fine       none of the above
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/backlog.mjs
 */

import { pathToFileURL } from 'node:url';

import { BRANCH_PREFIX } from './find-fix-pr.mjs';
import { gh as realGh } from './gh.mjs';
import { issueOf, WAITING_LABELS } from './keep-current.mjs';

export const STALE_DAYS = 7;

/**
 * @param {{mergeable?: string, labels?: Array<{name:string}>, updatedAt: string}} pr
 * @param {number} now milliseconds
 * @returns {'waiting'|'conflict'|'stale'|'fine'}
 */
export function classify(pr, now) {
  if ((pr.labels ?? []).some((label) => WAITING_LABELS.includes(label.name))) return 'waiting';
  if (String(pr.mergeable ?? '').toUpperCase() === 'CONFLICTING') return 'conflict';
  const idle = (now - Date.parse(pr.updatedAt)) / 86_400_000;
  return idle > STALE_DAYS ? 'stale' : 'fine';
}

/**
 * @param {Array<object>} prs
 * @param {number} now
 * @returns {Array<{pr: number, issue: string, state: string, title: string}>}
 */
export function report(prs, now) {
  return prs
    .filter((pr) => pr.isCrossRepository === false && String(pr.headRefName).startsWith(BRANCH_PREFIX))
    .map((pr) => ({ pr: pr.number, issue: issueOf(pr.body), state: classify(pr, now), title: pr.title }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prs = JSON.parse(
    realGh([
      'pr', 'list', '--repo', process.env.GITHUB_REPOSITORY, '--base', 'testing', '--state', 'open', '--limit', '100',
      '--json', 'number,title,body,headRefName,isCrossRepository,mergeable,labels,updatedAt'
    ])
  );
  // The list view says UNKNOWN until GitHub has worked the answer out. Asking for one
  // pull request on its own makes it do so, so ask again for each that was not known.
  for (const pr of prs) {
    if (String(pr.mergeable).toUpperCase() !== 'UNKNOWN') continue;
    const one = JSON.parse(realGh(['pr', 'view', String(pr.number), '--repo', process.env.GITHUB_REPOSITORY, '--json', 'mergeable']));
    pr.mergeable = one.mergeable;
  }
  const lines = report(prs, Date.now());
  for (const line of lines) console.log(`#${line.pr} (issue #${line.issue || '?'}) ${line.state}: ${line.title}`);
  console.log(`${lines.filter((l) => l.state !== 'fine').length} of ${lines.length} fix pull requests need attention.`);
}
