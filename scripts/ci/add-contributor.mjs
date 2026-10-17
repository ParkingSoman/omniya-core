/**
 * Let somebody drive the contributor fix pipeline: one command, both steps.
 *
 *   node scripts/ci/add-contributor.mjs <github-handle> [--dry-run] [--no-invite]
 *
 * It needs the GitHub CLI logged in as the maintainer (`gh auth status`). It
 * does two things, and each one is useless without the other:
 *
 *   1. Opens a pull request on `testing` that adds the handle to
 *      `.github/contributors.yml`. `testing` is the default branch and the
 *      pipeline reads the list from it. `testing` requires pull requests, so
 *      this branches (`contributors/add-<handle>`) and opens one; it does not
 *      push to `testing`. The list changes when you merge that pull request.
 *   2. Invites the handle to the repository as a collaborator with write access,
 *      so they can open the pull request page and close their own issue.
 *
 * The invitation is not access until the person ACCEPTS it, and it expires after
 * seven days. Until then the agent action refuses them ("Actor does not have
 * write permissions", issue #33). Check with
 * `gh api repos/<owner>/<repo>/invitations`. The pipeline now says so on the
 * issue and fails a job when a listed person cannot write.
 *
 * `--dry-run` prints what would change and changes nothing. `--no-invite` skips
 * step 2. Removing somebody is deleting their line from the same file on `testing`.
 */

import { execFileSync } from 'node:child_process';

import { isAllowed, parseAllowlist } from './allowlist.mjs';

const HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const ENTRY = /^\s+-\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*$/;

/**
 * Insert a handle into the allowlist text, in alphabetical order, keeping every
 * comment. Returns the text unchanged when the handle is already listed.
 *
 * @param {string} text contents of `.github/contributors.yml`
 * @param {string} handle
 * @returns {string}
 */
export function addHandle(text, handle) {
  if (!HANDLE.test(handle)) throw new Error(`"${handle}" is not a valid GitHub handle`);
  if (isAllowed(handle, parseAllowlist(text))) return text;

  const lines = text.split('\n');
  const key = lines.findIndex((line) => line.replace(/(^|\s)#.*$/, '').trim() === 'contributors:');
  if (key === -1) throw new Error('no "contributors:" line in the allowlist');

  let insertAt = key + 1;
  for (let i = key + 1; i < lines.length; i += 1) {
    const match = ENTRY.exec(lines[i].replace(/(^|\s)#.*$/, ''));
    if (!match) continue;
    if (match[1].toLowerCase() > handle.toLowerCase()) {
      insertAt = i;
      break;
    }
    insertAt = i + 1;
  }
  lines.splice(insertAt, 0, `  - ${handle}`);
  const result = lines.join('\n');

  // Never write a file the gate cannot read: an unreadable list refuses everyone.
  if (!isAllowed(handle, parseAllowlist(result))) throw new Error('the edited allowlist does not admit the handle');
  return result;
}

export const BASE = 'testing';

/** The branch the allowlist change goes on. The handle is already validated. */
export const branchFor = (handle) => `contributors/add-${handle}`;

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  const [handle] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');
  const invite = !process.argv.includes('--no-invite');
  if (!handle) {
    console.error('usage: node scripts/ci/add-contributor.mjs <github-handle> [--dry-run] [--no-invite]');
    process.exit(2);
  }
  if (!HANDLE.test(handle)) {
    console.error(`"${handle}" is not a valid GitHub handle`);
    process.exit(2);
  }

  const repo = gh('repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner').trim();
  gh('api', `users/${handle}`); // throws when the account does not exist

  const file = JSON.parse(gh('api', `repos/${repo}/contents/.github/contributors.yml?ref=${BASE}`));
  const before = Buffer.from(file.content, 'base64').toString('utf8');
  const after = addHandle(before, handle);
  const branch = branchFor(handle);

  if (after === before) {
    console.log(`${handle} is already on the allowlist on ${BASE}.`);
  } else if (dryRun) {
    console.log(`Would open a pull request into ${BASE} (branch ${branch}) that adds ${handle} to .github/contributors.yml:\n`);
    console.log(after.split('\n').filter((l) => /^contributors:|^\s+-\s/.test(l)).join('\n'));
  } else {
    const base = gh('api', `repos/${repo}/git/ref/heads/${BASE}`, '--jq', '.object.sha').trim();
    gh('api', '-X', 'POST', `repos/${repo}/git/refs`, '-f', `ref=refs/heads/${branch}`, '-f', `sha=${base}`);
    // The file's sha on `testing` is the one the branch starts from.
    gh(
      'api', '-X', 'PUT', `repos/${repo}/contents/.github/contributors.yml`,
      '-f', `message=Add ${handle} to the contributor allowlist`,
      '-f', `content=${Buffer.from(after).toString('base64')}`,
      '-f', `sha=${file.sha}`,
      '-f', `branch=${branch}`
    );
    const url = gh(
      'pr', 'create', '--repo', repo, '--base', BASE, '--head', branch,
      '--title', `Add ${handle} to the contributor allowlist`,
      '--body', `Lets ${handle} drive the contributor pipeline. Merge this to add them.`
    ).trim();
    console.log(`Opened ${url}. ${handle} is on the allowlist when you merge it.`);
  }

  if (invite && !dryRun) {
    gh('api', '-X', 'PUT', `repos/${repo}/collaborators/${handle}`, '-f', 'permission=push');
    console.log(`Invited ${handle} to ${repo} with write access. They must accept the invitation.`);
  } else if (invite) {
    console.log(`Would invite ${handle} to ${repo} with write access.`);
  }
}
