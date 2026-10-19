/**
 * The owner's inbox: only what needs the owner, in plain lines, at the start of a chat session.
 *
 * The owner does not open GitHub. GitHub shows everything, and most of it waits on a contributor or
 * on the pipeline, not on the owner. This reads the open issues and pull requests (two calls) and
 * keeps only:
 *
 *   - an issue or a fix that waits on a person (`needs-owner`) or a design decision (`needs-design`),
 *   - a report the pipeline handed to a person (`routed`: a design or "other" form) that the owner
 *     has not answered yet,
 *   - the owner's own issue whose fix is in the alpha, waiting for the owner's own "it works",
 *   - a session's pull request (`pipeline/`, `product/`, `deps/`) that waits for the owner's "ship it".
 *
 * Everything else becomes one count line: fixes being made, and fixes waiting for a contributor to
 * try the alpha. Ideas for the automation are a count too: a pipeline session picks them up.
 *
 * Usage (needs `gh` signed in):
 *   node scripts/ci/inbox.mjs [owner/repo]          plain lines
 *   node scripts/ci/inbox.mjs --hook [owner/repo]   the same, as a SessionStart hook answer (JSON)
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { replyState } from './confirm.mjs';

export const DEFAULT_REPO = 'ParkingSoman/omniya-core';
const TIME_LIMIT_MS = 10_000;

/** `gh issue list` names the Actions bot `github-actions`; the REST API says `github-actions[bot]`. */
const isBot = (login) => login === 'github-actions' || login === 'github-actions[bot]';

/** The pipeline's newest reply state on an issue, with when it was written. */
export function newestReply(comments) {
  const mine = (comments ?? []).filter((c) => isBot(c.author?.login) && replyState(c.body));
  const last = mine.at(-1);
  return last ? { state: replyState(last.body), at: last.createdAt } : { state: '', at: '' };
}

const TRY_ALPHA = ['in-alpha', 'reminded'];
const TRY_BUILD = ['ready', 'revised'];
const SESSION_BRANCH = /^(pipeline|product|deps)\//;
const days = (now, at) => Math.max(0, Math.floor((now - Date.parse(at)) / 86_400_000));

/**
 * Pure: the inbox from the open issues and pull requests.
 * @returns {{mine: string[], counts: string[]}} `mine` needs the owner; `counts` does not
 */
export function inbox({ issues, prs, owner, now = Date.now() }) {
  const mine = [];
  let making = 0;
  const waiting = [];
  const ideas = [];
  for (const issue of issues ?? []) {
    const labels = (issue.labels ?? []).map((l) => l.name);
    const reply = newestReply(issue.comments);
    const lastWord = (issue.comments ?? []).at(-1)?.author?.login;
    const own = issue.author?.login === owner;
    if (labels.includes('pipeline-idea')) { ideas.push(issue.number); continue; }
    if (labels.includes('rehearsal')) continue;
    if (labels.includes('needs-design')) { mine.push(`Issue #${issue.number} needs your design decision: ${issue.title}`); continue; }
    if (labels.includes('needs-owner')) { mine.push(`Issue #${issue.number} needs you to look: ${issue.title}`); continue; }
    if (['routed', 'design'].includes(reply.state) && lastWord !== owner) { mine.push(`Issue #${issue.number} asks for a person's answer: ${issue.title}`); continue; }
    if ([...TRY_ALPHA, ...TRY_BUILD].includes(reply.state)) {
      if (own) mine.push(`Your issue #${issue.number}: try the ${TRY_ALPHA.includes(reply.state) ? 'alpha' : 'test build'}, then write "it works" or what is wrong: ${issue.title}`);
      else waiting.push(days(now, reply.at));
      continue;
    }
    if (reply.state === 'started') making += 1;
  }
  for (const pr of prs ?? []) {
    const labels = (pr.labels ?? []).map((l) => l.name);
    if (SESSION_BRANCH.test(pr.headRefName ?? '')) mine.push(`PR #${pr.number} waits for your "ship it": ${pr.title}`);
    else if (labels.includes('needs-owner')) mine.push(`PR #${pr.number} is held for you to read before it merges: ${pr.title}`);
  }
  const counts = [];
  if (making > 0) counts.push(`${making} fix${making === 1 ? ' is' : 'es are'} being made.`);
  if (waiting.length > 0) {
    const oldest = Math.max(...waiting);
    counts.push(`${waiting.length} fix${waiting.length === 1 ? ' waits' : 'es wait'} for a contributor to try it (oldest ${oldest} day${oldest === 1 ? '' : 's'}).`);
  }
  if (ideas.length > 0) counts.push(`${ideas.length} automation idea${ideas.length === 1 ? ' waits' : 's wait'} for a pipeline session: ${ideas.map((n) => `#${n}`).join(', ')}.`);
  return { mine, counts };
}

/** Pure: the text the owner reads. */
export function render({ mine, counts }) {
  const head = mine.length === 0 ? 'Your inbox: nothing needs you.' : `Your inbox: ${mine.length} thing${mine.length === 1 ? '' : 's'} need${mine.length === 1 ? 's' : ''} you.`;
  return [head, ...mine.map((line) => `- ${line}`), ...(counts.length ? ['', ...counts] : [])].join('\n');
}

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', timeout: TIME_LIMIT_MS, maxBuffer: 32 * 1024 * 1024 }));
}

export function read(repo) {
  const issues = ghJson(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--json', 'number,title,labels,author,comments']);
  const prs = ghJson(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,labels']);
  return { issues, prs, owner: repo.split('/')[0] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const hook = process.argv.includes('--hook');
  const repo = process.argv.slice(2).find((a) => a.includes('/')) ?? process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO;
  let text;
  try {
    text = render(inbox(read(repo)));
  } catch (error) {
    // The session starts anyway. The owner is told the inbox could not be read, and why, in one line.
    text = `Your inbox could not be read from GitHub: ${String(error.message ?? error).split('\n')[0].slice(0, 160)}`;
  }
  if (hook) {
    console.log(JSON.stringify({
      systemMessage: text,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `The owner's inbox, shown to them at session start (scripts/ci/inbox.mjs). If they ask what needs them, start from this:\n${text}`
      }
    }));
  } else {
    console.log(text);
  }
}
