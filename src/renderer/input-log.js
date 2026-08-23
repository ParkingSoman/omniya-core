/**
 * A bounded, in-memory record of what the Nemeth field actually received.
 *
 * The bug this exists for was invisible for days across three rounds of
 * back-and-forth with a blind contributor, and every symptom they described was
 * accurate -- there was simply no way to see, from either end, that the field
 * held `#2+#2` while the status line said "read as 2+2", or that a `keydown`
 * for `k` had been swallowed by the chord reader before the field ever saw it.
 * Both facts are one line of this log.
 *
 * Kept free of DOM and Electron on purpose: it is the shared substrate for the
 * developer panel and for the diagnostics a contributor can send back, and both
 * of those want it testable without a browser.
 *
 * PRIVACY. A keystroke log of this field IS the author's equation. It lives in
 * memory, is capped, is never written to disk, and leaves the process only when
 * a person explicitly asks for the diagnostics dump.
 */
/**
 * A runaway backstop, NOT an editing budget.
 *
 * This was 50, which meant a diagnostics dump could only ever show the tail of
 * the last expression. That is too short to diagnose anything stateful: an
 * alpha tester reported equations being refused on Enter and accepted on a
 * retry, and the answer -- if it is in the input at all -- is in what happened
 * BEFORE the attempt that failed, which the log had already discarded. The log
 * now holds the whole session, and `dropped` below reports it when even this
 * ceiling is hit, so a trimmed report can never be mistaken for a complete one.
 *
 * The cost is bounded and small: entries are a few hundred bytes each, so the
 * ceiling is tens of megabytes in the worst case and nothing like it in
 * practice. It exists only so a stuck key cannot grow the heap without limit.
 */
export const DEFAULT_LIMIT = 50_000;

export function createInputLog({ limit = DEFAULT_LIMIT } = {}) {
  const entries = [];
  const listeners = new Set();
  let dropped = 0;
  return {
    record(entry) {
      entries.push(entry);
      if (entries.length > limit) {
        dropped += entries.length - limit;
        entries.splice(0, entries.length - limit);
      }
      for (const listener of listeners) listener(this);
      return entry;
    },
    /**
     * How many entries the cap discarded. A report that says "everything since
     * the app started" has to be able to tell the truth when it is not.
     */
    get dropped() {
      return dropped;
    },
    /**
     * Lets the dev panel render the log the app already keeps, instead of
     * attaching a second capture to the same field -- two captures would double
     * every entry and disagree about `defaultPrevented`, the field most worth
     * trusting here.
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    entries() {
      return entries.slice();
    },
    clear() {
      entries.length = 0;
      dropped = 0;
    },
    get size() {
      return entries.length;
    }
  };
}

/**
 * Cells print with their code points; printable ASCII does not need them.
 *
 * The code points exist to tell apart strings that READ alike: `'#2'` and the
 * cells it should have decoded to are the whole reason this is not just
 * JSON.stringify. That distinction is carried entirely by the presence of code
 * points on the cell side, so spelling them out on the ASCII side adds nothing
 * -- the quoted form is already unambiguous inside printable ASCII.
 *
 * It stopped being free once the capture covered text mode as well as Nemeth:
 * every entry holds the whole field, so a prose buffer printed its own length
 * again six times over in code points. A modest session came to 3.1 MB and
 * 9,330 lines, which is not something a blind contributor can read before
 * sending, and reading it before sending is the point.
 *
 * The rule is by content, not by length: one character outside printable ASCII
 * puts the code points back for the WHOLE string, so nothing that could be
 * mistaken for something else is ever printed bare. Unprintables are still the
 * point, and still always shown.
 */
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

export function describeCharacter(character) {
  if (character === undefined || character === null || character === '') return '(none)';
  if (PRINTABLE_ASCII.test(character)) return JSON.stringify(character);
  const points = [...character]
    .map((ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ');
  return `${JSON.stringify(character)} ${points}`;
}

/**
 * One keystroke, as a line a human can read out or paste into an issue.
 *
 * `swallowed` says a handler consumed the keystroke before the field saw it.
 * It was added because the six-key chord reader was doing exactly that to
 * `s d f j k l` and nothing anywhere reported it -- that feature is gone, but
 * the signal is kept: "the app ate your keypress" is invisible from every other
 * vantage point and is the first thing worth ruling out when a device's input
 * appears not to arrive.
 */
export function formatEntry(entry) {
  const parts = [entry.type];
  // Only keystrokes have a key and a code; printing empty ones on every field
  // change is noise in a report someone has to read aloud to make sense of.
  if (entry.key !== undefined) parts.push(`key=${JSON.stringify(entry.key)}`);
  if (entry.code !== undefined) parts.push(`code=${JSON.stringify(entry.code)}`);
  // `commit` entries only. Accepted or refused is the one fact every report of
  // "it would not take my equation" turns on, and it was the one fact no report
  // could carry: the DOM capture is gated on the mode panel still reading
  // Nemeth, so it fell silent on the very keystroke that decided the outcome.
  if (entry.verdict) parts.push(`verdict=${entry.verdict}`);
  if (entry.swallowed) parts.push('CONSUMED-BY-APP');
  if (entry.table) parts.push(`table=${entry.table}`);
  if (entry.value !== undefined) parts.push(`field=${describeCharacter(entry.value)}`);
  if (entry.state) parts.push(`state=${entry.state}`);
  if (entry.latex) parts.push(`latex=${JSON.stringify(entry.latex)}`);
  return parts.join(' ');
}
