/**
 * What to tell the contributor, and what label to set, when a fix round ends
 * WITHOUT opening a pull request.
 *
 * `pipeline-fix.yml` and `pipeline-followup.yml` (after an answered question)
 * both end this way, so the rule lives here once.
 *
 *   job crashed        -> `failed`   + needs-maintainer
 *   needs-design       -> `design`
 *   stopped            -> `stuck`    + needs-maintainer
 *   asked              -> `asking`   + needs-info   (a person is NOT needed:
 *                         the contributor is, and the agent waits for them)
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/fix-outcome.mjs <issue> <agent-job-result> <result-word>
 */

import { pathToFileURL } from 'node:url';

import { gh, requireNumber } from './gh.mjs';
import { writeStatus } from './status-comment.mjs';

/**
 * @param {string} jobResult `needs.<job>.result`
 * @param {string} word the one word the agent wrote
 * @returns {{state: string, label: string|null}}
 */
export function decide(jobResult, word) {
  if (jobResult !== 'success') return { state: 'failed', label: 'needs-maintainer' };
  if (word === 'needs-design') return { state: 'design', label: null };
  if (word === 'asked') return { state: 'asking', label: 'needs-info' };
  return { state: 'stuck', label: 'needs-maintainer' };
}

const LABELS = {
  'needs-maintainer': 'A person has to look at this',
  'needs-info': 'The agent asked the reporter a question and is waiting'
};

export function run({ issue, jobResult, word, repo }) {
  const number = requireNumber(issue, 'issue number');
  const { state, label } = decide(jobResult, word);
  writeStatus({ issue: number, state, repo });
  if (label) {
    try {
      gh(['label', 'create', label, '--force', '--description', LABELS[label], '--repo', repo]);
    } catch {
      // The label may already exist, and a failed create must not stop the edit.
    }
    gh(['issue', 'edit', number, '--add-label', label, '--repo', repo]);
  }
  return { state, label };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [issue, jobResult, word] = process.argv.slice(2);
  const out = run({ issue, jobResult, word, repo: process.env.GITHUB_REPOSITORY });
  console.log(`outcome: ${out.state}${out.label ? `, label ${out.label}` : ''}`);
}
