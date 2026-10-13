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
 *   - this pipeline's own earlier QUESTION, and no other comment of its bot
 *
 * What is dropped is dropped without its text and without its author, and
 * counted, so the agent can say "something was left out" without being able to
 * read it.
 *
 * Usage:
 *   node scripts/ci/listed-thread.mjs <thread.json> <contributors.yml>
 *
 * thread.json: { pr: {number, author, body}|null, issue: {number, author, body}|null,
 *                comments: [{id, author, body, createdAt}], approvalId?: string,
 *                approvalToken?: string }
 *
 * `approvalId` is the id of the ONE comment in which the repository owner said to
 * go ahead with a design idea. The follow-up gate takes it from the event, so it
 * is the comment that started the run. That comment, and only that one, is headed
 * "THE MAINTAINER'S APPROVAL". A comment written after it, while the run waited in
 * the queue, is not covered, because the agent is told approval is that heading
 * and not "the newest comment".
 *
 * The heading carries `approvalToken`, a random value the workflow makes while it
 * builds this file, after every comment exists, and tells the agent in the
 * prompt. A phrase alone could be dodged with a zero-width or look-alike letter
 * and the model would still read it as the phrase. A token cannot be written in
 * advance by anyone. No token, no approval. An id that matches nothing, or a comment by a
 * person who is not on the list, marks nothing, and the design lock stays shut.
 */

import { readFileSync } from 'node:fs';

import { isAllowed, parseAllowlist } from './allowlist.mjs';

/**
 * Repeated from `status-comment.mjs` on purpose. The workflow copies this file
 * out of `origin/testing` with `gh.mjs` and little else, so it cannot import its
 * neighbours. A test keeps the two strings equal.
 */
export const QUESTION_MARKER = '<!-- omniya-pipeline-question -->';

/** Authors of a pull request body that are this pipeline itself. */
export const PIPELINE_BOTS = ['github-actions[bot]', 'claude[bot]'];

/**
 * The approval heading is plain text in a file the agent reads, so a body must
 * not be able to write it. Matches the phrase however it is cased, spaced or
 * punctuated (`maintainers approval`, curly apostrophe), and removes it.
 */
export const stripApprovalPhrase = (text) => String(text ?? '').replace(/MAINTAINER\W{0,3}S\W+APPROVAL/gi, '[removed]');

const section = (heading, text) => `## ${heading}\n\n${stripApprovalPhrase(text).trim() || '(empty)'}\n`;

/**
 * @param {object} input see the file header
 * @param {string[]} handles parsed allowlist
 * @returns {string} markdown
 */
export function buildThread({ pr, issue, comments, approvalId, approvalToken }, handles) {
  const listed = (author) => isAllowed(author, handles);
  // Before the first fix there is no pull request. The agent is reading the
  // report to decide whether to start, or reading the answer to its question.
  const out = [pr ? `# Pull request #${pr.number}\n` : `# Issue #${issue?.number}\n`];
  let omitted = 0;

  if (pr) {
    if (listed(pr.author) || PIPELINE_BOTS.includes(pr.author)) {
      out.push(section('Pull request description', pr.body));
    } else {
      omitted += 1;
    }
  }

  if (issue) {
    if (listed(issue.author)) out.push(section(`Original report, issue #${issue.number}`, issue.body));
    else omitted += 1;
  }

  const kept = [];
  for (const comment of comments ?? []) {
    if (listed(comment.author)) {
      kept.push(comment);
    } else if (PIPELINE_BOTS.includes(comment.author) && (comment.body ?? '').startsWith(QUESTION_MARKER)) {
      // The agent's own earlier question, so the answer can be read next to it.
      // Both halves are needed: anyone can paste the marker, only a workflow can
      // post as the bot. Status comments and notices stay out, as boilerplate.
      kept.push({ ...comment, author: 'You, earlier (your question)' });
    } else if (!PIPELINE_BOTS.includes(comment.author)) {
      omitted += 1;
    }
  }
  kept.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  out.push('## Comments, oldest first\n');
  if (kept.length === 0) out.push('(none)\n');
  for (const comment of kept) {
    const approval =
      approvalId && approvalToken && String(comment.id) === String(approvalId) && listed(comment.author)
        ? ` -- THE MAINTAINER'S APPROVAL [token ${approvalToken}] (the design decision)`
        : '';
    out.push(`### ${comment.author}, ${comment.createdAt}${approval}\n\n${stripApprovalPhrase(comment.body).trim()}\n`);
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
