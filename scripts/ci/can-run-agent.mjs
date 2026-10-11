/**
 * Say whether the person who started a run can have the agent run for them.
 *
 * `anthropics/claude-code-action` refuses any actor without write access to the
 * repository ("Actor does not have write permissions to the repository"). A
 * contributor can be on `.github/contributors.yml` and still be only a reader,
 * because the list and the repository invitation are two separate steps and the
 * invitation has to be accepted. Issue #33 was that case: the run passed the
 * list, then the action crashed, and the contributor read "something went wrong
 * on my side". This script finds the cause BEFORE the agent job, so the
 * contributor hears a true reason and the maintainer is told what to do.
 *
 * `access=unknown` means GitHub did not answer. The run goes on. The action
 * makes the same check itself, and the crash path still reports.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/can-run-agent.mjs <github-handle>
 * Writes `access` = true | false | unknown to GITHUB_OUTPUT. Always exits 0.
 */

import { pathToFileURL } from 'node:url';

import { gh, setOutputs } from './gh.mjs';

/** The levels the action accepts. `triage` and `read` are refused. */
export const WRITE_LEVELS = ['admin', 'maintain', 'write'];

/** @param {string} permission the `permission` field GitHub returns */
export function hasWriteAccess(permission) {
  return WRITE_LEVELS.includes(String(permission ?? '').trim());
}

/**
 * @param {string} handle
 * @param {string} repo owner/name
 * @param {(args: string[]) => string} [run] injected in tests
 * @returns {'true'|'false'|'unknown'}
 */
export function checkAccess(handle, repo, run = gh) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(handle ?? '')) return 'false';
  let permission;
  try {
    permission = run(['api', `repos/${repo}/collaborators/${handle}/permission`, '--jq', '.permission']).trim();
  } catch {
    return 'unknown';
  }
  return hasWriteAccess(permission) ? 'true' : 'false';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const access = checkAccess(process.argv[2], process.env.GITHUB_REPOSITORY);
  setOutputs({ access });
}
