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
/** Who opens a session's pull request: the owner, passed in, or the session account. */
const SESSION_AUTHORS = ['omniya-bot'];

/**
 * A title is written by whoever opened the issue, and anyone can open one. It is shown to the owner
 * only, in one line: no control characters, no line breaks, cut to length. It never reaches the model.
 */
export const cleanTitle = (title) => String(title ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
const days = (now, at) => Math.max(0, Math.floor((now - Date.parse(at)) / 86_400_000));

/**
 * Pure: the inbox from the open issues and pull requests.
 * @returns {{mine: Array<{ref: string, what: string, title: string}>, counts: string[]}} `mine` needs the owner; `counts` does not
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
    if (labels.includes('needs-design')) { mine.push({ ref: `issue #${issue.number}`, what: 'needs your design decision', title: issue.title }); continue; }
    if (labels.includes('needs-owner')) { mine.push({ ref: `issue #${issue.number}`, what: 'needs you to look', title: issue.title }); continue; }
    if (['routed', 'design'].includes(reply.state) && lastWord !== owner) { mine.push({ ref: `issue #${issue.number}`, what: "asks for a person's answer", title: issue.title }); continue; }
    if ([...TRY_ALPHA, ...TRY_BUILD].includes(reply.state)) {
      if (own) mine.push({ ref: `your issue #${issue.number}`, what: `waits for you: try the ${TRY_ALPHA.includes(reply.state) ? 'alpha' : 'test build'}, then write "it works" or what is wrong`, title: issue.title });
      else waiting.push(days(now, reply.at));
      continue;
    }
    if (reply.state === 'started') making += 1;
  }
  for (const pr of prs ?? []) {
    const labels = (pr.labels ?? []).map((l) => l.name);
    const session = pr.isCrossRepository === false && [owner, ...SESSION_AUTHORS].includes(pr.author?.login) && SESSION_BRANCH.test(pr.headRefName ?? '');
    if (session) mine.push({ ref: `PR #${pr.number}`, what: 'waits for your "ship it"', title: pr.title });
    else if (labels.includes('needs-owner')) mine.push({ ref: `PR #${pr.number}`, what: 'is held for you to read before it merges', title: pr.title });
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

const upper = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Pure: the text. `titles: true` is for the owner's eyes. `titles: false` is what the model reads:
 * numbers, kinds and counts only, because a title is text anyone can write.
 */
export function render({ mine, counts }, { titles = true } = {}) {
  const head = mine.length === 0 ? 'Your inbox: nothing needs you.' : `Your inbox: ${mine.length} thing${mine.length === 1 ? '' : 's'} need${mine.length === 1 ? 's' : ''} you.`;
  const line = (m) => `- ${upper(m.ref)} ${m.what}${titles ? `: ${cleanTitle(m.title)}` : '.'}`;
  return [head, ...mine.map(line), ...(counts.length ? ['', ...counts] : [])].join('\n');
}

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', timeout: TIME_LIMIT_MS, maxBuffer: 32 * 1024 * 1024 }));
}

export function read(repo) {
  const issues = ghJson(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--json', 'number,title,labels,author,comments']);
  const prs = ghJson(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,labels,author,isCrossRepository']);
  return { issues, prs, owner: repo.split('/')[0] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const hook = process.argv.includes('--hook');
  const repo = process.argv.slice(2).find((a) => a.includes('/')) ?? process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO;
  let text;
  let forModel;
  try {
    const box = inbox(read(repo));
    text = render(box);
    forModel = render(box, { titles: false });
  } catch {
    // The session starts anyway. The owner is told, in one line. No error text: it could quote anything.
    text = 'Your inbox could not be read from GitHub. Run: node scripts/ci/inbox.mjs';
    forModel = text;
  }
  if (hook) {
    console.log(JSON.stringify({
      systemMessage: text,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        // Numbers and kinds only: no title, which anyone who opens an issue can write.
        additionalContext: `The owner's inbox, shown to them at session start (scripts/ci/inbox.mjs). If they ask what needs them, start from this:\n${forModel}`
      }
    }));
  } else {
    console.log(text);
  }
}
