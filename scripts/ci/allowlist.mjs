/**
 * Decide whether a GitHub handle may drive the contributor fix pipeline.
 *
 * This runs as the FIRST job of `.github/workflows/contributor-fix.yml`, on a
 * bare checkout with no `npm ci` behind it. That is why it parses
 * `.github/contributors.yml` itself instead of pulling in a YAML library: the
 * gate that decides whether to spend the maintainer's subscription quota should
 * not depend on an install step that can fail, be slow, or be tampered with.
 *
 * The format it accepts is deliberately tiny:
 *
 *     contributors:
 *       - handle
 *       - other-handle
 *
 * Comments and blank lines are ignored. ANYTHING ELSE IS A PARSE ERROR, and a
 * parse error refuses. Failing closed is the point: a file this script cannot
 * read is not evidence that somebody is allowed, and a gate that opens when it
 * is confused is not a gate. Refusing a real contributor is a bad afternoon;
 * admitting a stranger spends someone else's quota on a public repository.
 *
 * Usage:
 *   node scripts/ci/allowlist.mjs <handle>          -> exit 0 allowed, 1 refused
 *   node scripts/ci/allowlist.mjs <handle> --github -> also writes GITHUB_OUTPUT
 */

import { appendFileSync, readFileSync } from 'node:fs';

export const ALLOWLIST_PATH = '.github/contributors.yml';

export class AllowlistError extends Error {}

/**
 * Parse the allowlist. Throws AllowlistError on anything unexpected.
 *
 * @param {string} text contents of `.github/contributors.yml`
 * @returns {string[]} handles, in file order
 */
export function parseAllowlist(text) {
  if (typeof text !== 'string') throw new AllowlistError('allowlist is not text');
  const lines = text.split('\n');
  let seenKey = false;
  const handles = [];

  for (const [index, raw] of lines.entries()) {
    const line = raw.replace(/\r$/, '');
    const withoutComment = line.replace(/(^|\s)#.*$/, '');
    if (!withoutComment.trim()) continue;
    const where = `line ${index + 1}`;

    if (!seenKey) {
      if (withoutComment.trim() !== 'contributors:') {
        throw new AllowlistError(`${where}: expected "contributors:", got ${JSON.stringify(line)}`);
      }
      seenKey = true;
      continue;
    }

    const entry = /^\s+-\s+([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\s*$/.exec(withoutComment);
    if (!entry) {
      throw new AllowlistError(`${where}: expected "  - handle", got ${JSON.stringify(line)}`);
    }
    handles.push(entry[1]);
  }

  if (!seenKey) throw new AllowlistError('allowlist has no "contributors:" key');
  return handles;
}

/**
 * @param {string} handle the issue or comment author
 * @param {string[]} handles the parsed allowlist
 * @returns {boolean}
 */
export function isAllowed(handle, handles) {
  if (typeof handle !== 'string' || !handle.trim()) return false;
  // Bots never drive the pipeline. `claude-code-action` refuses bot actors by
  // default too; this is the same rule said where it can be unit tested, and it
  // is what stops a run the pipeline itself opened from starting another one.
  if (handle.endsWith('[bot]')) return false;
  // GitHub handles are case-insensitive, so the comparison is too. A file that
  // says `ParkingSoman` must still admit an event that reports `parkingsoman`.
  const wanted = handle.toLowerCase();
  return handles.some((known) => known.toLowerCase() === wanted);
}

/**
 * @param {string} handle
 * @param {string} [path]
 * @returns {boolean}
 */
export function checkHandle(handle, path = ALLOWLIST_PATH) {
  return isAllowed(handle, parseAllowlist(readFileSync(path, 'utf8')));
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  const handle = process.argv[2] ?? '';
  let allowed = false;
  let reason = '';
  try {
    allowed = checkHandle(handle);
    reason = allowed ? 'on the allowlist' : 'not on the allowlist';
  } catch (error) {
    // Fail closed, and say why in the log. A run that refuses for a reason
    // nobody can read is indistinguishable from one that refuses for no reason.
    allowed = false;
    reason = `allowlist could not be read: ${error.message}`;
  }
  console.log(`${handle || '(no handle)'}: ${reason}`);
  if (process.argv.includes('--github') && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${allowed}\n`);
  }
  process.exit(allowed ? 0 : 1);
}
