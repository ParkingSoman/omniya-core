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
 *
 * ## Why this reports the whole session
 *
 * It used to print the last 20 entries. That was enough for a decode bug, which
 * is visible in a single keystroke, and useless for anything stateful: a second
 * alpha report described equations refused on Enter and accepted on an
 * immediate retry, and whatever explains that is in what happened BEFORE the
 * attempt that failed. Twenty lines could not reach it, and neither could the
 * log's own 50-entry cap. Both are gone; what remains is a ceiling far above
 * ordinary use, and `dropped` so that hitting it is stated rather than hidden.
 */
import { formatEntry } from './input-log.js';

function describeInfo(appInfo) {
  if (!appInfo?.version) return 'Build: running from source';
  return `Build: ${appInfo.version} (${appInfo.platform}-${appInfo.arch})`;
}

/**
 * Mode as a separator line, printed only when it changes.
 *
 * The mode belongs on every entry -- "was the app in equation mode when I typed
 * this" is the question a stateful bug turns on -- but repeating it on every
 * line would triple the length of a report a person has to read aloud before
 * sending. Changes are the informative part; the runs between them are not.
 */
function withModeChanges(entries) {
  const lines = [];
  let current;
  for (const entry of entries) {
    if (entry.mode && entry.mode !== current) {
      current = entry.mode;
      lines.push(`-- mode: ${current}`);
    }
    lines.push(formatEntry(entry));
  }
  return lines;
}

export function formatInputDiagnostics({
  appInfo,
  brailleInputTable,
  resolvedTable,
  entries = [],
  dropped = 0,
  limit
} = {}) {
  const recent = limit === undefined ? entries : entries.slice(-limit);
  const trimmed = dropped + (entries.length - recent.length);
  const table = brailleInputTable === 'auto' && resolvedTable
    ? `auto (read as ${resolvedTable})`
    : String(brailleInputTable ?? 'unknown');

  return [
    'Omniya Core — braille input diagnostics',
    describeInfo(appInfo),
    `Braille input table: ${table}`,
    '',
    // Said plainly, because it is true and the person sending it deserves to
    // know: these lines are what they typed. Now that the capture is no longer
    // gated to Nemeth mode, that means prose as well as mathematics, and the
    // sentence says so rather than leaving them to infer it.
    trimmed
      ? `Below are the last ${recent.length} lines of what the writing field received,`
      : `Below is everything the writing field received since the app started,`,
    'and what happened each time you pressed Enter. That means this report',
    'includes the mathematics you were typing, and any other text typed in the',
    'same field. Nothing here was saved to disk or sent anywhere; it was copied',
    'only because you asked for it.',
    ...(trimmed
      ? ['', `(${trimmed} earlier lines are not shown: the log holds a fixed maximum.)`]
      : []),
    '',
    ...(recent.length ? withModeChanges(recent) : ['(no input recorded yet)'])
  ].join('\n');
}
