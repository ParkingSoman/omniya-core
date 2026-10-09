/**
 * Fail when the few files that must exist on BOTH branches do not match, or when
 * the allowlist on `main` cannot be read.
 *
 * GitHub starts `on: issues` and `on: issue_comment` workflows from the DEFAULT
 * branch's copy only. So `main` holds three stubs that call the real workflows
 * on `testing`, plus the allowlist. The stubs almost never change, which is the
 * point: a change to what the pipeline DOES is an ordinary pull request into
 * `testing`. This check exists for the rare day a stub is edited here and the
 * copy on `main` is forgotten, which is how issue #22 sat unanswered for 23 days.
 *
 * Usage (from a checkout where `origin/main` has been fetched):
 *   node scripts/ci/pipeline-drift.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { parseAllowlist } from './allowlist.mjs';

/** Files that must be byte-identical: [path on this branch, path on main]. */
export const PAIRED_FILES = [
  ['.github/pipeline-stubs/contributor-fix.yml', '.github/workflows/contributor-fix.yml'],
  ['.github/pipeline-stubs/contributor-followup.yml', '.github/workflows/contributor-followup.yml'],
  ['.github/pipeline-stubs/contributor-signoff.yml', '.github/workflows/contributor-signoff.yml'],
  ['.github/ISSUE_TEMPLATE/bug-report.yml', '.github/ISSUE_TEMPLATE/bug-report.yml'],
  ['.github/ISSUE_TEMPLATE/config.yml', '.github/ISSUE_TEMPLATE/config.yml'],
  ['scripts/ci/allowlist.mjs', 'scripts/ci/allowlist.mjs']
];

/**
 * Files this branch must not have. `.github/contributors.yml` lives on `main`
 * only: a second copy here would look editable, and editing it would do
 * nothing, which is the exact failure this check exists to prevent.
 * `claude.yml` answers the same `@claude` comments as the pipeline.
 */
export const ABSENT_HERE = ['.github/contributors.yml', '.github/workflows/claude.yml'];

/** Files `main` must not have. */
export const ABSENT_ON_MAIN = ['.github/workflows/claude.yml'];

export const ALLOWLIST_ON_MAIN = '.github/contributors.yml';

/**
 * @param {object} io
 * @param {(path: string) => string | null} io.readLocal contents on this branch, or null
 * @param {(path: string) => string | null} io.readMain contents on main, or null
 * @returns {string[]} one human-readable line per difference; empty when in sync
 */
export function findDrift({ readLocal, readMain }) {
  const problems = [];
  for (const [here, there] of PAIRED_FILES) {
    const a = readLocal(here);
    const b = readMain(there);
    if (a === null && b === null) continue;
    if (a === null) problems.push(`${there}: on main, but ${here} is not on this branch`);
    else if (b === null) problems.push(`${here}: not on main yet. Copy it to ${there} on main`);
    else if (a !== b) problems.push(`${here}: differs from ${there} on main`);
  }
  for (const path of ABSENT_HERE) {
    if (readLocal(path) !== null) problems.push(`${path}: must not exist on this branch (the allowlist lives on main only)`);
  }
  for (const path of ABSENT_ON_MAIN) {
    if (readMain(path) !== null) problems.push(`${path}: still on main, and should be deleted there`);
  }

  // A list the gate cannot read refuses everybody. Better to find out here than
  // from a contributor who got no answer.
  const list = readMain(ALLOWLIST_ON_MAIN);
  if (list === null) problems.push(`${ALLOWLIST_ON_MAIN}: missing on main, so every contributor is refused`);
  else {
    try {
      parseAllowlist(list);
    } catch (error) {
      problems.push(`${ALLOWLIST_ON_MAIN}: cannot be read on main (${error.message})`);
    }
  }
  return problems;
}

function readLocalFile(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function readMainFile(path) {
  try {
    return execFileSync('git', ['show', `origin/main:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    // `git show` exits non-zero when the path is not on that ref. That is an
    // answer, not an error. A missing `origin/main` ref is the one case this
    // would hide, so the caller checks for it first.
    return null;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { stdio: 'ignore' });
  } catch {
    console.error('origin/main is not fetched. Run: git fetch origin main');
    process.exit(2);
  }
  const problems = findDrift({ readLocal: readLocalFile, readMain: readMainFile });
  if (problems.length === 0) {
    console.log('The contributor stubs and the allowlist on main are in order.');
    process.exit(0);
  }
  console.error('The contributor pipeline does not match main:\n');
  for (const line of problems) console.error(`  ${line}`);
  console.error(
    '\nGitHub runs these workflows from main only. Open a pull request into main\n' +
      'that fixes the files named above, merge it, then re-run this check.'
  );
  process.exit(1);
}
