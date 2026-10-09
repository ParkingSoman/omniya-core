/**
 * Fail when the contributor pipeline on this branch differs from `main`.
 *
 * GitHub starts `on: issues` and `on: issue_comment` workflows from the DEFAULT
 * branch's copy only. A pipeline change merged to `testing` alone does nothing:
 * issue #22 sat for 23 days because the allowlist entry for its author reached
 * `testing` in #21 and never reached `main`. The sync was a manual step, and
 * nothing noticed it was skipped. This turns the skipped step into a red check.
 *
 * Usage (from a checkout where `origin/main` has been fetched):
 *   node scripts/ci/pipeline-drift.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/** Files that must be byte-identical on this branch and on `main`. */
export const PIPELINE_FILES = [
  '.github/contributors.yml',
  '.github/ISSUE_TEMPLATE/bug-report.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/workflows/contributor-fix.yml',
  '.github/workflows/contributor-followup.yml',
  '.github/workflows/contributor-signoff.yml',
  'scripts/ci/allowlist.mjs',
  'scripts/ci/listed-thread.mjs'
];

/**
 * Files `testing` deliberately does not have. If `main` still has one, `main`
 * runs a workflow nobody on `testing` can see, and it fires on the same events
 * as the pipeline (`claude.yml` answers the same `@claude` comments).
 */
export const ABSENT_FILES = ['.github/workflows/claude.yml'];

/**
 * @param {object} io
 * @param {(path: string) => string | null} io.readLocal contents on this branch, or null
 * @param {(path: string) => string | null} io.readMain contents on main, or null
 * @returns {string[]} one human-readable line per difference; empty when in sync
 */
export function findDrift({ readLocal, readMain }) {
  const problems = [];
  for (const path of PIPELINE_FILES) {
    const here = readLocal(path);
    const there = readMain(path);
    if (here === null && there === null) continue;
    if (here === null) problems.push(`${path}: on main but not on this branch`);
    else if (there === null) problems.push(`${path}: on this branch but not on main`);
    else if (here !== there) problems.push(`${path}: differs from main`);
  }
  for (const path of ABSENT_FILES) {
    if (readLocal(path) !== null) problems.push(`${path}: must not exist on this branch`);
    if (readMain(path) !== null) problems.push(`${path}: still on main, and should be deleted there`);
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
    console.log('The contributor pipeline on this branch matches main.');
    process.exit(0);
  }
  console.error('The contributor pipeline on this branch does not match main:\n');
  for (const line of problems) console.error(`  ${line}`);
  console.error(
    '\nGitHub runs these workflows from main only. Open a pull request into main\n' +
      'that carries these files, merge it, then re-run this check.'
  );
  process.exit(1);
}
