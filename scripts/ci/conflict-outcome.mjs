/**
 * What happens after the conflict agent has run.
 *
 * The agent repaired some branches and left others alone. This script says what
 * is true and tells the right people, once each:
 *
 *   repaired branch    The maintainer gets one comment on the pull request: what
 *                      conflicted and what was done. The branch goes on to the
 *                      checks and the build. The contributor hears NOTHING: the
 *                      links do not change, and there is nothing for them to do.
 *   branch left alone  The pull request gets the label `needs-maintainer` and a
 *                      comment. The contributor gets one comment on the issue
 *                      that says what failed, in the agent's own plain words, so
 *                      neither of them is left with "a person has to look".
 *   hand-off pending   The contributor had already said "it works", and the fix
 *                      was held back only because it conflicted. It carries the
 *                      label `handoff-pending`. Every such branch that is not
 *                      stuck is passed on to the hand-off. The label, not an
 *                      input of the run, is what remembers the request: a queued
 *                      run can be dropped for a newer one, a label cannot.
 *
 * "Repaired" is decided by the pipeline, which saw the remote branch move. It is
 * never decided by what the agent wrote. The agent's words are only ever the
 * note beside the fact, and they pass through `cleanMessage` before they are
 * posted anywhere, because the agent has read untrusted pull request text.
 *
 * Usage (needs GH_TOKEN and GITHUB_REPOSITORY). Everything arrives through env:
 *   NUMBERS         comma list, the pull requests the map said conflict
 *   REVISED         comma list, the ones the pipeline saw move
 *   RESOLVE_RESULT  `success` when the agent job succeeded
 *   NOTES           the agent's lines, `#N: words`
 *   ORDER           comma list, the merge order the map suggested
 *
 * Step outputs: matrix (JSON, branches to check again), handoff (JSON).
 */

import { pathToFileURL } from 'node:url';

import { BRANCH_PREFIX } from './find-fix-pr.mjs';
import { gh, requireNumber, setOutputs } from './gh.mjs';
import { PENDING_LABEL } from './hand-off.mjs';
import { cleanMessage, postReply } from './reply.mjs';

/** The `Fixes #N` line that `find-fix-pr.mjs` requires as the last line of the body. */
export function issueOfBody(body) {
  const m = /(^|\n)[Ff]ixes #(\d+)[ \t\r\n]*$/.exec(body ?? '');
  return m ? m[2] : '';
}

/** @param {string} text lines like `#53: words` @returns {Record<string, string>} */
export function parseNotes(text) {
  const notes = {};
  for (const line of String(text ?? '').split('\n')) {
    const m = /^#(\d+): (.*)$/.exec(line);
    if (m) notes[m[1]] = m[2].trim();
  }
  return notes;
}

export function parseNumbers(text) {
  return String(text ?? '')
    .split(',')
    .filter(Boolean)
    .map((n) => Number(requireNumber(n, 'pull request number')));
}

/**
 * @param {{numbers:number[], revised:number[], resolveResult:string, notes:Record<string,string>}} input
 * @returns {Array<{number:number, repaired:boolean, note:string}>}
 */
export function decide({ numbers, revised, resolveResult, notes }) {
  const crashed = resolveResult !== 'success';
  const moved = new Set(revised);
  return numbers.map((number) => {
    if (!crashed && moved.has(number)) return { number, repaired: true, note: notes[number] ?? '' };
    return {
      number,
      repaired: false,
      note: crashed
        ? 'The repair run stopped before it finished, so this branch was not changed.'
        : notes[number] || 'The agent left this branch as it was and gave no reason.'
    };
  });
}

function labelNeedsMaintainer(repo, number, run) {
  run(['label', 'create', 'needs-maintainer', '--repo', repo, '--force', '--description', 'A person has to look at this']);
  run(['pr', 'edit', String(number), '--repo', repo, '--add-label', 'needs-maintainer']);
}

function read(repo, number, run) {
  const info = JSON.parse(run(['pr', 'view', String(number), '--repo', repo, '--json', 'headRefName,body']));
  if (typeof info.headRefName !== 'string' || !info.headRefName.startsWith(BRANCH_PREFIX)) {
    throw new Error(`#${number} is on branch '${info.headRefName}', which is not a ${BRANCH_PREFIX} branch`);
  }
  return { branch: info.headRefName, issue: issueOfBody(info.body) };
}

/**
 * @param {{repo:string, numbers:number[], revised:number[], resolveResult:string,
 *          notes:Record<string,string>, order:number[]}} input
 * @param {(args: string[]) => string} [run] `gh`, or a stand-in for a test
 */
export function report(input, run = gh) {
  const { repo, order = [] } = input;
  const outcomes = decide(input);
  const matrix = [];
  const stuck = new Set();

  for (const { number, repaired, note } of outcomes) {
    const { branch, issue } = read(repo, number, run);
    const words = cleanMessage(note);

    if (repaired && issue) {
      const merge = order.length > 1 ? `\n\nSuggested merge order for the open fix pull requests: ${order.map((n) => `#${n}`).join(', ')}.` : '';
      run([
        'pr', 'comment', String(number), '--repo', repo, '--body',
        `Another fix was merged into testing first, and this branch no longer merged with it. I merged testing into this branch to clear that.\n\n${words}\n\nThe checks and the build are running again. The contributor was not told, because their links do not change.${merge}`
      ]);
      matrix.push({ pr: number, branch, issue: Number(issue) });
      continue;
    }

    stuck.add(number);
    labelNeedsMaintainer(repo, number, run);
    try {
      run(['pr', 'edit', String(number), '--repo', repo, '--remove-label', PENDING_LABEL]);
    } catch {
      // It only carries the label if a contributor was waiting. Most do not.
    }
    const why = repaired
      ? 'I merged testing into this branch, but it names no issue, so I did not check it again.'
      : words;
    run([
      'pr', 'comment', String(number), '--repo', repo, '--body',
      `This branch no longer merges with testing and I could not clear the conflict.\n\n${why}\n\nA person has to decide. I left the branch ${repaired ? 'merged but unchecked' : 'as it was'}. To try again, remove the needs-maintainer label and merge something into testing, or start pipeline-conflicts by hand for this pull request.`
    ]);
    // The contributor hears what failed, once, and only when there is an issue to tell.
    if (issue) postReply({ issue, state: 'maintainer', repo, message: why }, run);
  }

  return { matrix, handoff: pendingHandoffs(repo, stuck, run) };
}

/**
 * Pull requests whose contributor said "it works" and which were waiting only
 * for a repair. One that a person has to look at is not handed on.
 *
 * @returns {Array<{pr:number, issue:number}>}
 */
export function pendingHandoffs(repo, stuck, run = gh) {
  const listed = JSON.parse(
    run([
      'pr', 'list', '--repo', repo, '--base', 'testing', '--state', 'open', '--limit', '100',
      '--label', PENDING_LABEL, '--json', 'number,headRefName,body,isCrossRepository,labels'
    ])
  );
  return listed
    .filter(
      (p) =>
        p.isCrossRepository === false &&
        typeof p.headRefName === 'string' &&
        p.headRefName.startsWith(BRANCH_PREFIX) &&
        !stuck.has(p.number) &&
        !(p.labels ?? []).some((l) => l.name === 'needs-maintainer')
    )
    .map((p) => ({ pr: p.number, issue: Number(issueOfBody(p.body) || 0) }))
    .filter((p) => p.issue > 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = report({
    repo: process.env.GITHUB_REPOSITORY,
    numbers: parseNumbers(process.env.NUMBERS),
    revised: parseNumbers(process.env.REVISED),
    resolveResult: process.env.RESOLVE_RESULT ?? '',
    notes: parseNotes(process.env.NOTES),
    order: parseNumbers(process.env.ORDER)
  });
  setOutputs({ matrix: JSON.stringify(result.matrix), handoff: JSON.stringify(result.handoff) });
}
