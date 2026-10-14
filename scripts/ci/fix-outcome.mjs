/**
 * What to tell the contributor when a fix round ends WITHOUT opening a pull
 * request.
 *
 * `pipeline-fix.yml` and `pipeline-followup.yml` (after an answered question)
 * both end this way, so the rule lives here once.
 *
 *   job crashed        -> `failed`   the pipeline's own words
 *   needs-design       -> `design`   the agent's words, then "a person decides"
 *   blocked            -> `stuck`    the agent's words, then "the maintainer will answer"
 *   asked              -> `asked`    the agent's question, and how to answer it
 *
 * The comment is ONE new comment, posted by `reply.mjs`, with the agent's words
 * from the MESSAGE environment variable inside it. `reply.mjs` also puts the
 * label on: `needs-owner` for `failed` and `stuck`, `needs-design` for
 * `design`, and `needs-info` for `asked`, where a person is not needed because
 * the contributor is.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY, and MESSAGE if the agent wrote one):
 *   node scripts/ci/fix-outcome.mjs <issue> <agent-job-result> <result-word>
 */

import { pathToFileURL } from 'node:url';

import { requireNumber } from './gh.mjs';
import { postReply } from './reply.mjs';

/**
 * @param {string} jobResult `needs.<job>.result`
 * @param {string} word the one word the agent wrote
 * @returns {'failed'|'design'|'asked'|'stuck'} the state `reply.mjs` renders
 */
export function decide(jobResult, word) {
  if (jobResult !== 'success') return 'failed';
  if (word === 'needs-design') return 'design';
  if (word === 'asked') return 'asked';
  if (word === 'blocked') return 'stuck';
  // Any other word, or none. `pipeline-agent.yml` fails the job on those before
  // this runs, so this is a second lock. It is never a quiet hand-off.
  return 'failed';
}

export function run({ issue, jobResult, word, repo, message }, post = postReply) {
  const number = requireNumber(issue, 'issue number');
  const state = decide(jobResult, word);
  post({ issue: number, state, repo, message });
  return { state };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [issue, jobResult, word] = process.argv.slice(2);
  const out = run({ issue, jobResult, word, repo: process.env.GITHUB_REPOSITORY, message: process.env.MESSAGE });
  console.log(`outcome: ${out.state}`);
}
