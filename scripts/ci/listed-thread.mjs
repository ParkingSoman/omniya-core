/**
 * Build the text a follow-up agent reads, from people on the contributor list
 * only.
 *
 * `pipeline-followup.yml` checks who wrote the `@claude` comment. The agent
 * then used to read the WHOLE pull request thread, and anyone can comment on a
 * public pull request. The gate vetted one comment and the agent obeyed
 * hundreds of words from strangers. So the agent is now handed a file built
 * here, and the file holds nothing from anybody the allowlist would refuse.
 *
 * What is kept:
 *   - comments from people on the list
 *   - the original issue, if a person on the list wrote it
 *   - the pull request body, if a person on the list or this pipeline's own
 *     bot wrote it (the first round opens it, so the bot is its normal author)
 *
 * What is dropped is dropped without its text and without its author, and
 * counted, so the agent can say "something was left out" without being able to
 * read it.
 *
 * Usage:
 *   node scripts/ci/listed-thread.mjs <thread.json> <contributors.yml>
 *
 * thread.json: { pr: {number, author, body}, issue: {number, author, body}|null,
 *                comments: [{author, body, createdAt}] }
 */

import { readFileSync } from 'node:fs';

import { isAllowed, parseAllowlist } from './allowlist.mjs';

/** Authors of a pull request body that are this pipeline itself. */
export const PIPELINE_BOTS = ['github-actions[bot]', 'claude[bot]'];

const section = (heading, text) => `## ${heading}\n\n${(text ?? '').trim() || '(empty)'}\n`;

/**
 * @param {object} input see the file header
 * @param {string[]} handles parsed allowlist
 * @returns {string} markdown
 */
export function buildThread({ pr, issue, comments }, handles) {
  const listed = (author) => isAllowed(author, handles);
  const out = [`# Pull request #${pr.number}\n`];
  let omitted = 0;

  if (listed(pr.author) || PIPELINE_BOTS.includes(pr.author)) {
    out.push(section('Pull request description', pr.body));
  } else {
    omitted += 1;
  }

  if (issue) {
    if (listed(issue.author)) out.push(section(`Original report, issue #${issue.number}`, issue.body));
    else omitted += 1;
  }

  const kept = [];
  for (const comment of comments ?? []) {
    if (listed(comment.author)) kept.push(comment);
    else omitted += 1;
  }
  kept.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  out.push('## Comments, oldest first\n');
  if (kept.length === 0) out.push('(none)\n');
  for (const comment of kept) {
    out.push(`### ${comment.author}, ${comment.createdAt}\n\n${(comment.body ?? '').trim()}\n`);
  }

  if (omitted > 0) {
    out.push(
      `---\n${omitted} item(s) from people who are not on the contributor list were left out. ` +
        'You cannot read them. Do not try to fetch them.\n'
    );
  }
  return out.join('\n');
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  const [threadPath, listPath] = process.argv.slice(2);
  if (!threadPath || !listPath) {
    console.error('usage: node listed-thread.mjs <thread.json> <contributors.yml>');
    process.exit(2);
  }
  // A list that cannot be read must stop the run. Falling back to "keep
  // everything" would turn a parse error into the hole this file closes.
  const handles = parseAllowlist(readFileSync(listPath, 'utf8'));
  process.stdout.write(buildThread(JSON.parse(readFileSync(threadPath, 'utf8')), handles));
}
