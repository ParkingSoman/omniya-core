/**
 * Which kind of report is this issue, from the labels its form put on it.
 *
 *   bug      the agent works on it. Something advertised is missing or broken.
 *   nemeth   the agent works on it. A symbol or rule from the Nemeth Code that
 *            the app does not have yet. That is completeness, not taste, and
 *            the contributors who file it know the Code.
 *   routed   nobody starts an agent. A design idea, or anything else. A person
 *            answers, and the run costs no subscription quota.
 *
 * Read from the labels on the issue itself, through the API, and not from the
 * `issues.opened` payload. The labels are what the form set.
 *
 * Fails toward the person. Both a `design` and a `nemeth` label means a person
 * decides. No type label at all means `bug`, which is what every report was
 * before there were types, and what a hand-started run on an old issue should be.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/issue-kind.mjs <issue-number>
 *
 * Step outputs: kind (bug|nemeth|routed).
 */

import { pathToFileURL } from 'node:url';

import { gh, requireNumber, setOutputs } from './gh.mjs';

export const KINDS = ['bug', 'nemeth', 'routed'];

/** @param {string[]} labels @returns {'bug'|'nemeth'|'routed'} */
export function kindFromLabels(labels) {
  const has = (name) => labels.some((l) => l.toLowerCase() === name);
  if (has('design') || has('other')) return 'routed';
  // An idea for the automation is not a report from a contributor. An issue from a listed account with no
  // type label used to count as a bug, so filing one started an agent run (issues 122, 123 and 126 did, and
  // issue 122 produced a duplicate pull request).
  if (has('pipeline-idea')) return 'routed';
  if (has('nemeth')) return 'nemeth';
  return 'bug';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const issue = requireNumber(process.argv[2], 'issue number');
  const out = gh(['api', `repos/${process.env.GITHUB_REPOSITORY}/issues/${issue}`, '--jq', '[.labels[].name] | join("\\n")']);
  setOutputs({ kind: kindFromLabels(out.split('\n').filter(Boolean)) });
}
