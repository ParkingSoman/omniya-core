/**
 * The one comment on the issue that says where the fix stands, edited in place.
 *
 * The contributor is blind and works from the issue alone. A thread that grows a
 * new "build ready" comment per round is noise to hear read aloud, and by round
 * four the newest link sits twenty comments below the oldest. So this comment is
 * written once and edited every time.
 *
 * GitHub sends NO notification when a comment is edited. A contributor who works
 * from the issue and cannot glance at it would never learn that the build is
 * ready. So for the states where somebody needs to know (`ready`, `sent`,
 * `maintainer` and `failed`) a short NEW comment is posted as well. It carries no marker,
 * so it is never mistaken for the status comment, and the links stay in the one
 * place.
 *
 * It is found by a marker AND by its author. The marker alone is not enough:
 * anyone can paste the marker into a comment of their own. `--edit-last` is not
 * used because the agent's own explanations are written by the same bot, and
 * "my last comment" would then be whichever came last.
 *
 * Words: short sentences, no file names, no check names, no logs. The links are
 * written as link text, not as bare addresses, because a screen reader reads a
 * long address letter by letter.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY):
 *   node scripts/ci/status-comment.mjs <issue-number> <state> [<pull-request-number>]
 */

import { pathToFileURL } from 'node:url';

import { gh, requireNumber } from './gh.mjs';

export const MARKER = '<!-- omniya-pipeline-status -->';
export const AUTHOR = 'github-actions[bot]';

const WORDS = {
  working: [
    'I am working on a fix for this report.',
    'This usually takes about an hour.',
    'You do not need to do anything.',
    'I will edit this comment when a test build is ready.'
  ],
  revising: [
    'I am changing the fix, using your last comment.',
    'The download links below stay the same.',
    'I will edit this comment when the new build is ready.'
  ],
  design: [
    'This looks like a request for something new, not a fault.',
    'That is a design decision, and a person makes it.',
    'The maintainer will answer here. You do not need to do anything.'
  ],
  stuck: [
    'I could not finish this one by myself.',
    'I wrote what I tried in a comment on this issue.',
    'The maintainer has been told and will answer here.',
    'You do not need to do anything.'
  ],
  maintainer: [
    'The maintainer needs to look at a technical problem with this fix.',
    'You do not need to do anything.',
    'The maintainer will write here when there is news.'
  ],
  failed: [
    'Something went wrong on my side while I was working on this.',
    'Nothing is wrong with your report.',
    'The maintainer has been told and will look. You do not need to do anything.'
  ],
  sent: [
    'Thank you. I sent this fix to the maintainer to review and merge.',
    'This issue closes when the maintainer merges the fix.',
    'You do not need to do anything.'
  ]
};

export const STATES = ['ready', ...Object.keys(WORDS)];

/** States that also post a new comment, because an edit sends no notification. */
export const NOTIFY = ['ready', 'sent', 'maintainer', 'failed'];

/**
 * @param {string} state one of STATES
 * @param {{repo?: string, pr?: string|number}} [where] needed for `ready`
 */
export function renderStatus(state, { repo, pr } = {}) {
  let lines;
  if (state === 'ready') {
    const n = requireNumber(pr, 'pull request number');
    if (!repo) throw new Error('repo is required for the ready state');
    const base = `https://github.com/${repo}/releases/download/pr-${n}`;
    lines = [
      'A test build is ready. All the automatic checks passed.',
      '',
      `- [Download for Mac, Apple Silicon](${base}/Omniya-Core-mac-arm64.zip)`,
      `- [Download for Windows](${base}/Omniya-Core-Setup-x64.exe)`,
      '',
      'Install it and try the thing that was wrong. Then write a comment here.',
      'If it is still wrong, start your comment with @claude and say what you found.',
      'If it works, write @claude it works.',
      'When I change the fix, these links stay the same. Download again from the same links.',
      'Both builds are unsigned, so your computer will ask you to confirm. Neither replaces the alpha app you already have.'
    ];
  } else if (WORDS[state]) {
    lines = WORDS[state];
  } else {
    throw new Error(`unknown state: ${state}`);
  }
  return `${MARKER}\n### Where this fix stands\n\n${lines.join('\n')}\n`;
}

/**
 * The short new comment that makes the edit audible. No marker.
 *
 * @param {string} state one of NOTIFY
 * @param {{repo?: string, issue?: string|number, statusId?: number|string}} where
 */
export function renderNotice(state, { repo, issue, statusId } = {}) {
  if (!NOTIFY.includes(state)) throw new Error(`no notice for state: ${state}`);
  if (state !== 'ready') return `${WORDS[state].join('\n')}\n`;
  const n = requireNumber(issue, 'issue number');
  const id = requireNumber(statusId, 'comment id');
  if (!repo) throw new Error('repo is required for the ready notice');
  return [
    'A test build is ready. All the automatic checks passed.',
    '',
    `[Open the download links](https://github.com/${repo}/issues/${n}#issuecomment-${id})`,
    '',
    'Try it, then write here. If it is still wrong, start your comment with @claude and say what you found. If it works, write @claude it works.',
    ''
  ].join('\n');
}

/**
 * @param {Array<{id:number, login:string, body:string}>} comments
 * @returns {{id:number}|undefined} the newest comment that is ours
 */
export function findStatusComment(comments) {
  return [...comments].reverse().find((c) => c.login === AUTHOR && (c.body ?? '').startsWith(MARKER));
}

export function listComments(issue, repo) {
  const out = gh([
    'api', `repos/${repo}/issues/${issue}/comments`, '--paginate',
    '--jq', '.[] | {id, login: .user.login, body}'
  ]);
  return out.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export function writeStatus({ issue, state, pr, repo }) {
  const number = requireNumber(issue, 'issue number');
  const body = renderStatus(state, { repo, pr });
  const existing = findStatusComment(listComments(number, repo));
  let id;
  let action;
  if (existing) {
    gh(['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${existing.id}`, '-f', `body=${body}`]);
    id = existing.id;
    action = 'edited';
  } else {
    id = JSON.parse(gh(['api', `repos/${repo}/issues/${number}/comments`, '-f', `body=${body}`, '--jq', '{id}'])).id;
    action = 'created';
  }
  if (NOTIFY.includes(state)) {
    const notice = renderNotice(state, { repo, issue: number, statusId: id });
    gh(['api', `repos/${repo}/issues/${number}/comments`, '-f', `body=${notice}`]);
  }
  return { action, id, notified: NOTIFY.includes(state) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [issue, state, pr] = process.argv.slice(2);
  const result = writeStatus({ issue, state, pr, repo: process.env.GITHUB_REPOSITORY });
  console.log(`status ${state}: ${result.action}${result.notified ? ', and a new comment so the edit is heard' : ''}`);
}
