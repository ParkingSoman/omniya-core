/**
 * What "green" means for a commit: the required checks passed, as jobs of the workflow
 * file that defines each one.
 *
 * A name alone proves nothing, because a pull request can add a workflow with a job called
 * `unit` that always passes. So each required name must be a job of its own file, and the
 * newest run of that file on the exact commit must have succeeded. Those two files define
 * green, so a change to either needs the owner's word.
 *
 * `ship-pipeline-pr.mjs` keeps a copy of this for its own use, and a test fails if the two
 * differ. They will be one file when the shipper next changes.
 */

/** Which workflow file defines which required check. A check from any other file does not count. */
export const CHECKS_BY_WORKFLOW = {
  '.github/workflows/pr-checks.yml': ['unit', 'nemeth', 'e2e'],
  '.github/workflows/pr-build.yml': ['pack-mac', 'pack-win']
};

/**
 * @param {Array<{id:number, path:string, created_at:string, conclusion:string|null}>} runs workflow runs on the commit
 * @param {(id: number) => Array<{name:string, conclusion:string|null}>} jobsOf the jobs of one run
 * @returns {string[]} required check names that are not green
 */
export function notGreen(runs, jobsOf) {
  const missing = [];
  for (const [path, names] of Object.entries(CHECKS_BY_WORKFLOW)) {
    const newest = runs
      .filter((run) => run.path === path)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const jobs = newest && newest.conclusion === 'success' ? jobsOf(newest.id) : [];
    for (const name of names) {
      if (!jobs.some((job) => job.name === name && job.conclusion === 'success')) missing.push(name);
    }
  }
  return missing;
}
