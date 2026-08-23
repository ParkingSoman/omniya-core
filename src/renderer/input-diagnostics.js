/**
 * The report a contributor can send back when braille input misbehaves.
 *
 * This exists because of a specific, expensive failure. A blind contributor
 * reported "braille not recognised", and it took three rounds over several days
 * to learn what was actually happening -- their device was configured
 * correctly, the app decoded their input correctly, then discarded the decode
 * and refused it at commit. Every fact needed to see that in one message is
 * mechanical: the build, the table in force, what the field held, what the app
 * read it as. None of it was reachable from either end.
 *
 * Deliberately plain text, not JSON. A blind contributor should be able to read
 * what they are about to send before they send it, with a screen reader, in the
 * clipboard. JSON is legible to a maintainer at the cost of the person actually
 * disclosing something about their own work.
 */
import { formatEntry } from './input-log.js';

export const MAX_REPORTED_ENTRIES = 20;

function describeInfo(appInfo) {
  if (!appInfo?.version) return 'Build: running from source';
  return `Build: ${appInfo.version} (${appInfo.platform}-${appInfo.arch})`;
}

export function formatInputDiagnostics({
  appInfo,
  brailleInputTable,
  resolvedTable,
  entries = [],
  limit = MAX_REPORTED_ENTRIES
} = {}) {
  const recent = entries.slice(-limit);
  const table = brailleInputTable === 'auto' && resolvedTable
    ? `auto (read as ${resolvedTable})`
    : String(brailleInputTable ?? 'unknown');

  return [
    'Omniya Core — braille input diagnostics',
    describeInfo(appInfo),
    `Braille input table: ${table}`,
    '',
    // Said plainly, because it is true and the person sending it deserves to
    // know: these lines are the equation they typed.
    `Below are the last ${recent.length} keystrokes in the equation field, which`,
    'means this includes the mathematics you were typing. Nothing here was saved',
    'to disk or sent anywhere; it was copied only because you asked for it.',
    '',
    ...(recent.length ? recent.map(formatEntry) : ['(no input recorded yet)'])
  ].join('\n');
}
