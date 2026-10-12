/**
 * The ONE comment the pipeline posts on an issue for each event.
 *
 * The contributor is blind and reads the issue aloud. A thread where three
 * comments say the same thing, one of them edited in place and one of them a
 * "notice" about the edit, is three times the listening and none of it new.
 *
 * It used to be that way because two writers shared the issue. The pipeline
 * wrote an edited status comment plus a notice, and the agent wrote its own
 * comment as well. Asking the agent to stay quiet did not hold. So the agent
 * no longer posts anything. It writes its words to a file, and this script
 * posts them, once, inside the one comment the event gets.
 *
 * Always a NEW comment, never an edit: GitHub sends no notification for an edit,
 * and a comment nobody hears is no reply. The download links live in the newest
 * `ready` or `revised` comment, and a revision says so.
 *
 * Every body starts with `MARKER`. Those comments tell the contributor to write
 * `@claude`, so the follow-up gate skips anything that carries `PIPELINE_PREFIX`,
 * whoever posts it. Two comments once posted by hand under the maintainer's name
 * each started an agent run.
 *
 * Words: short sentences, no file names, no check names, no logs. The links are
 * link text, not bare addresses, because a screen reader reads a long address
 * letter by letter.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY, and MESSAGE when the agent wrote one):
 *   node scripts/ci/reply.mjs <issue-number> <state> [<pull-request-number>]
 */

import { pathToFileURL } from 'node:url';

import { gh, requireNumber } from './gh.mjs';

export const PIPELINE_PREFIX = '<!-- omniya-pipeline-';
export const MARKER = `${PIPELINE_PREFIX}reply -->`;
export const AUTHOR = 'github-actions[bot]';

/** The agent's words are cut to this many characters. A reply is read aloud. */
export const MAX_MESSAGE = 2000;

const STUCK_TAIL = [
  'The maintainer has been told and will answer here.',
  'You do not need to do anything.'
];

const TRY_IT = [
  'Install it and try the thing that was wrong. Then write a comment here.',
  'If it is still wrong, start your comment with @claude and say what you found.',
  'If it works, write @claude it works.'
];

/**
 * Per state: what the comment holds.
 *   message  'none'      the agent's words are not used
 *            'optional'  used when the agent wrote some
 *            'required'  used, or the state falls back to `fallback`
 *   intro    fixed words that come before the links, after the agent's words
 *   lines    fixed words that always follow
 */
const STATES_DEF = {
  started: {
    message: 'none',
    lines: [
      'I started on this. It usually takes about an hour.',
      'You do not need to do anything.',
      'I will write here again when there is a test build, or when I need something from you.'
    ]
  },
  ready: {
    message: 'optional',
    links: true,
    intro: ['A test build is ready. All the automatic checks passed.'],
    lines: [
      ...TRY_IT,
      'When I change the fix, the links stay the same.',
      'Both builds are unsigned, so your computer will ask you to confirm. Neither replaces the alpha app you already have.'
    ]
  },
  revised: {
    message: 'optional',
    links: true,
    intro: ['A new test build is ready. The links are the same as before, so download again from them.'],
    lines: [
      'Try it, then write here. If it is still wrong, start your comment with @claude and say what you found.',
      'If it works, write @claude it works.'
    ]
  },
  answered: { message: 'required', fallback: 'stuck', lines: [] },
  design: {
    message: 'optional',
    defaultMessage: 'This looks like a request for something new, not a fault.',
    lines: [
      'That is a design decision, and a person makes it.',
      'The maintainer will answer here. You do not need to do anything.'
    ]
  },
  routed: {
    message: 'none',
    lines: [
      'Thank you. This kind of report is answered by a person, so I did not start a fix.',
      'The maintainer will answer here. You do not need to do anything.'
    ]
  },
  stuck: {
    message: 'optional',
    defaultMessage: 'I could not finish this one by myself.',
    lines: STUCK_TAIL
  },
  maintainer: {
    message: 'none',
    lines: [
      'The maintainer needs to look at a technical problem with this fix.',
      'You do not need to do anything.',
      'The maintainer will write here when there is news.'
    ]
  },
  failed: {
    message: 'none',
    lines: [
      'Something went wrong on my side while I was working on this.',
      'Nothing is wrong with your report.',
      'The maintainer has been told and will look. You do not need to do anything.'
    ]
  },
  sent: {
    message: 'none',
    lines: [
      'Thank you. I sent this fix to the maintainer to review and merge.',
      'This issue closes when the maintainer merges the fix.',
      'You do not need to do anything.'
    ]
  }
};

export const STATES = Object.keys(STATES_DEF);

/** The label the pipeline puts on the issue for a state. The agent labels nothing. */
export const LABELS = {
  design: { name: 'needs-design', description: 'Not a bug: a design decision for the maintainer to answer' },
  stuck: { name: 'needs-maintainer', description: 'A person has to look at this' },
  failed: { name: 'needs-maintainer', description: 'A person has to look at this' }
};

/**
 * The agent's words are text from a model that has read untrusted reports. Cut it
 * to size, and drop any line that carries the pipeline's marker prefix, so the
 * words cannot dress up as a comment the gate trusts.
 *
 * @param {string|undefined} text
 */
export function cleanMessage(text) {
  const kept = String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => !line.includes(PIPELINE_PREFIX))
    .join('\n')
    .trim();
  if (kept.length <= MAX_MESSAGE) return kept;
  return `${kept.slice(0, MAX_MESSAGE).replace(/\s+\S*$/, '')} ...`;
}

/**
 * @param {string} state one of STATES
 * @param {{repo?: string, pr?: string|number, message?: string}} [where] `repo` and `pr` are needed for the states with links
 * @returns {string}
 */
export function renderReply(state, { repo, pr, message } = {}) {
  let def = STATES_DEF[state];
  if (!def) throw new Error(`unknown state: ${state}`);
  const words = cleanMessage(message);
  if (def.message === 'required' && !words) def = STATES_DEF[def.fallback];

  const parts = [];
  if (def.message !== 'none') {
    const lead = words || def.defaultMessage;
    if (lead) parts.push(lead);
  }
  if (def.intro) parts.push(def.intro.join('\n'));
  if (def.links) {
    const n = requireNumber(pr, 'pull request number');
    if (!repo) throw new Error(`repo is required for the ${state} state`);
    const base = `https://github.com/${repo}/releases/download/pr-${n}`;
    parts.push([
      `- [Download for Mac, Apple Silicon](${base}/Omniya-Core-mac-arm64.zip)`,
      `- [Download for Windows](${base}/Omniya-Core-Setup-x64.exe)`
    ].join('\n'));
  }
  if (def.lines.length > 0) parts.push(def.lines.join('\n'));
  return `${MARKER}\n${parts.join('\n\n')}\n`;
}

/**
 * Post the reply, and label the issue if the state calls for it. Exactly one
 * comment per call. `run` is `gh` unless a test hands in a stand-in.
 *
 * @param {{issue: string|number, state: string, repo: string, pr?: string|number, message?: string}} args
 * @param {(args: string[]) => string} [run]
 */
export function postReply({ issue, state, repo, pr, message }, run = gh) {
  const number = requireNumber(issue, 'issue number');
  const body = renderReply(state, { repo, pr, message });
  run(['api', `repos/${repo}/issues/${number}/comments`, '-f', `body=${body}`]);
  const label = LABELS[state];
  if (label) {
    run(['label', 'create', label.name, '--repo', repo, '--force', '--description', label.description]);
    run(['issue', 'edit', number, '--repo', repo, '--add-label', label.name]);
  }
  return { posted: 1, labelled: label?.name };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [issue, state, pr] = process.argv.slice(2);
  const result = postReply({
    issue,
    state,
    pr,
    repo: process.env.GITHUB_REPOSITORY,
    message: process.env.MESSAGE
  });
  console.log(`reply ${state}: posted ${result.posted} comment${result.labelled ? `, labelled ${result.labelled}` : ''}`);
}
