/**
 * Which open fix pull requests conflict with `testing`, and with each other?
 *
 * This is the part of conflict repair that needs no model. It is a fact, and
 * `git merge-tree` states it exactly. The agent that repairs the conflicts then
 * reads this map, so one run sees every conflicting pull request together and
 * does not repeat work that another PR's repair already did.
 *
 * GitHub's own `mergeable` flag is NOT used. It is computed later, and it
 * answers "UNKNOWN" for a while after every push. `git merge-tree` is the answer
 * GitHub itself would arrive at, with no waiting.
 *
 * Only branches that start with `claude/fix-` are read, the same prefix
 * `find-fix-pr.mjs` holds. A person's own branch is never touched.
 *
 * Usage (needs GH_TOKEN, GITHUB_REPOSITORY, and a checkout with history):
 *   node scripts/ci/conflict-map.mjs <out-dir> [pr-number,pr-number,...]
 *
 * Files written to <out-dir>: conflict-map.json, conflict-map.md.
 * Step outputs: count (how many PRs conflict with testing), numbers (comma
 * list), order (comma list, the suggested merge order), prs (JSON array of
 * {number, branch}).
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BRANCH_PREFIX } from './find-fix-pr.mjs';
import { gh, requireNumber, setOutputs } from './gh.mjs';

/**
 * Read `git merge-tree --write-tree --name-only` output.
 * A clean merge prints one tree id. A conflicted merge prints the tree id, then
 * the conflicted file names (one line per index stage, so a name can repeat),
 * then a blank line, then messages meant for a person.
 *
 * @param {string} output
 * @returns {{clean: boolean, files: string[]}}
 */
export function parseMergeTree(output) {
  const lines = String(output).split('\n');
  const files = [];
  for (const line of lines.slice(1)) {
    if (line === '') break;
    files.push(line);
  }
  const unique = [...new Set(files)].sort();
  return { clean: unique.length === 0, files: unique };
}

/**
 * A pull request that already carries `needs-maintainer` is left out. A person
 * has to look at it, so another run of the agent on every push to `testing`
 * would only spend quota to reach the same answer. Naming it in `include` is how
 * the owner asks for it again.
 *
 * @param {Array<{number:number, headRefName:string, isCrossRepository:boolean, baseRefName:string, labels?:Array<{name:string}>}>} prs
 * @param {{include?: number[]}} [options]
 */
export function selectFixPrs(prs, { include = [] } = {}) {
  return prs.filter(
    (p) =>
      p.isCrossRepository === false &&
      p.baseRefName === 'testing' &&
      typeof p.headRefName === 'string' &&
      p.headRefName.startsWith(BRANCH_PREFIX) &&
      (include.includes(p.number) || !(p.labels ?? []).some((l) => l.name === 'needs-maintainer'))
  );
}

const pairKey = (a, b) => (a < b ? `${a}+${b}` : `${b}+${a}`);

/**
 * @param {{
 *   prs: Array<{number:number, headRefName:string}>,
 *   againstTesting: Record<string, {clean:boolean, files:string[]}>,
 *   pairs: Record<string, {clean:boolean, files:string[]}>
 * }} input
 */
export function buildMap({ prs, againstTesting, pairs }) {
  const entries = prs
    .map((p) => {
      const t = againstTesting[p.number] ?? { clean: true, files: [] };
      const collidesWith = prs
        .filter((o) => o.number !== p.number)
        .map((o) => ({ number: o.number, ...(pairs[pairKey(p.number, o.number)] ?? { clean: true, files: [] }) }))
        .filter((c) => !c.clean)
        .map((c) => ({ number: c.number, files: c.files }))
        .sort((a, b) => a.number - b.number);
      return {
        number: p.number,
        branch: p.headRefName,
        conflictsWithTesting: !t.clean,
        files: t.files,
        collidesWith
      };
    })
    .sort((a, b) => a.number - b.number);
  return {
    prs: entries,
    conflicting: entries.filter((e) => e.conflictsWithTesting),
    clean: entries.filter((e) => !e.conflictsWithTesting),
    order: suggestOrder(entries)
  };
}

/**
 * A merge order for the maintainer: the PR that collides with the fewest others
 * first, so each merge breaks as little as it can. Ties go to the lower number.
 *
 * @param {Array<{number:number, collidesWith:Array<{number:number}>}>} entries
 * @returns {number[]}
 */
export function suggestOrder(entries) {
  return [...entries]
    .sort((a, b) => a.collidesWith.length - b.collidesWith.length || a.number - b.number)
    .map((e) => e.number);
}

/** @param {ReturnType<typeof buildMap>} map @returns {string} */
export function renderMap(map) {
  if (map.conflicting.length === 0) {
    const lines = ['No open fix PR conflicts with testing.'];
    const later = map.prs.filter((p) => p.collidesWith.length > 0);
    if (later.length > 0) lines.push('', ...collisionLines(later));
    return `${lines.join('\n')}\n`;
  }
  const lines = ['Fix PRs that conflict with testing:', ''];
  for (const p of map.conflicting) {
    lines.push(`- #${p.number} (${p.branch}): ${p.files.join(', ')}`);
  }
  const later = map.prs.filter((p) => p.collidesWith.length > 0);
  if (later.length > 0) lines.push('', ...collisionLines(later));
  if (map.order.length > 1) {
    lines.push('', `Suggested merge order: ${map.order.map((n) => `#${n}`).join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

function collisionLines(entries) {
  const out = ['Fix PRs that will collide with each other when one of them merges:', ''];
  for (const p of entries) {
    for (const c of p.collidesWith) {
      if (c.number > p.number) out.push(`- #${p.number} and #${c.number}: ${c.files.join(', ')}`);
    }
  }
  return out;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** `git merge-tree` exits 1 for a conflict. That is an answer, not a failure. */
function mergeTree(a, b) {
  try {
    return parseMergeTree(git(['merge-tree', '--write-tree', '--name-only', a, b]));
  } catch (error) {
    if (error.status === 1 && typeof error.stdout === 'string') return parseMergeTree(error.stdout);
    throw error;
  }
}

export function computeMap(repo, only) {
  const listed = JSON.parse(
    gh([
      'pr', 'list', '--repo', repo, '--base', 'testing', '--state', 'open', '--limit', '100',
      '--json', 'number,headRefName,isCrossRepository,baseRefName,labels'
    ])
  );
  let prs = selectFixPrs(listed, { include: only });
  if (only.length > 0) prs = prs.filter((p) => only.includes(p.number));
  if (prs.length === 0) return buildMap({ prs: [], againstTesting: {}, pairs: {} });

  git(['fetch', '--no-tags', 'origin', 'testing', ...prs.map((p) => `+refs/heads/${p.headRefName}:refs/remotes/origin/${p.headRefName}`)]);

  const againstTesting = {};
  for (const p of prs) againstTesting[p.number] = mergeTree('origin/testing', `origin/${p.headRefName}`);

  const pairs = {};
  for (let i = 0; i < prs.length; i += 1) {
    for (let j = i + 1; j < prs.length; j += 1) {
      pairs[pairKey(prs[i].number, prs[j].number)] = mergeTree(`origin/${prs[i].headRefName}`, `origin/${prs[j].headRefName}`);
    }
  }
  return buildMap({ prs, againstTesting, pairs });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const outDir = process.argv[2];
  if (!outDir) throw new Error('usage: conflict-map.mjs <out-dir> [pr-number,...]');
  const only = (process.argv[3] ?? '')
    .split(',')
    .filter(Boolean)
    .map((n) => Number(requireNumber(n, 'pr number')));
  const map = computeMap(process.env.GITHUB_REPOSITORY, only);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'conflict-map.json'), `${JSON.stringify(map, null, 2)}\n`);
  writeFileSync(join(outDir, 'conflict-map.md'), renderMap(map));
  console.log(renderMap(map));
  setOutputs({
    count: map.conflicting.length,
    numbers: map.conflicting.map((p) => p.number).join(','),
    order: map.order.join(','),
    prs: JSON.stringify(map.conflicting.map((p) => ({ number: p.number, branch: p.branch })))
  });
}
