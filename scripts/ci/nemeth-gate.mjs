/**
 * Turn the two Nemeth reports into an actual gate.
 *
 * `npm run nemeth:coverage` and `npm run nemeth:utility` PRINT their results
 * and then exit 0, always. Measured, not assumed: neither script contains a
 * `process.exit` or sets `process.exitCode`. They are reports, and reports are
 * the right shape for what they mostly do -- a human reads the markdown they
 * write and decides what to work on next.
 *
 * But CLAUDE.md treats two of their numbers as gates: `ERROR` in the
 * correctness run must stay 0, and the utility core set must stay 26/26. A CI
 * job that runs those scripts and trusts the exit code enforces neither. It is
 * a green tick that means nothing, which is worse than no tick at all, because
 * a reviewer reasonably reads it as coverage.
 *
 * So this parses what they print and fails on the two thresholds that matter.
 * It deliberately does NOT gate on PASS, REFUSE or DISAGREE counts:
 *
 *   - REFUSE is honest refusal. It is not a failure, and pinning it would
 *     punish a change that correctly starts refusing something new.
 *   - DISAGREE is silently-wrong output and should fall over time, but pinning
 *     it to an exact number invites the one move CLAUDE.md names as gaming the
 *     gate: deleting a corpus row to move a count.
 *   - ERROR is different. An ERROR is the pipeline crashing rather than
 *     answering, and there is no reading of the project where that is fine.
 *
 * Usage: node scripts/ci/nemeth-gate.mjs
 */

import { execFileSync } from 'node:child_process';

export class GateError extends Error {}

/**
 * @param {string} output stdout of `npm run nemeth:coverage`
 * @returns {number} the ERROR count
 */
export function parseErrorCount(output) {
  const match = /^\s*ERROR:\s*(\d+)\b/m.exec(output);
  if (!match) throw new GateError('coverage output has no ERROR line; the report format changed');
  return Number(match[1]);
}

/**
 * @param {string} output stdout of `npm run nemeth:utility`
 * @returns {{ passed: number, total: number }} the core set
 */
export function parseCore(output) {
  const match = /^\s*core:\s*(\d+)\s*\/\s*(\d+)\s*$/m.exec(output);
  if (!match) throw new GateError('utility output has no core line; the report format changed');
  return { passed: Number(match[1]), total: Number(match[2]) };
}

/**
 * @param {string} coverageOutput
 * @param {string} utilityOutput
 * @returns {string[]} one line per breach; empty means the gate passes
 */
export function breaches(coverageOutput, utilityOutput) {
  const found = [];
  const errors = parseErrorCount(coverageOutput);
  if (errors !== 0) {
    found.push(`nemeth:coverage reports ERROR ${errors}, and ERROR must be 0. The parser crashed rather than answering.`);
  }
  const core = parseCore(utilityOutput);
  if (core.passed !== core.total) {
    found.push(`nemeth:utility reports core ${core.passed}/${core.total}. The core set is what a student needs to do their homework; it must not regress.`);
  }
  return found;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  const run = (script) => execFileSync('npm', ['run', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const coverage = run('nemeth:coverage');
  const utility = run('nemeth:utility');
  process.stdout.write(coverage);
  process.stdout.write(utility);

  const found = breaches(coverage, utility);
  if (found.length === 0) {
    console.log('\nNemeth gate: ERROR is 0 and the utility core set is whole.');
    process.exit(0);
  }
  console.error('\nNemeth gate FAILED:');
  for (const line of found) console.error(`  - ${line}`);
  console.error('\nFix the cause. Do not weaken a check or delete a corpus row to move a number.');
  process.exit(1);
}
