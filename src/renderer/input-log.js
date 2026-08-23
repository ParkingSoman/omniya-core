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
export const DEFAULT_LIMIT = 50;

export function createInputLog({ limit = DEFAULT_LIMIT } = {}) {
  const entries = [];
  const listeners = new Set();
  return {
    record(entry) {
      entries.push(entry);
      if (entries.length > limit) entries.splice(0, entries.length - limit);
      for (const listener of listeners) listener(this);
      return entry;
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
    },
    get size() {
      return entries.length;
    }
  };
}

/** `'a'` -> `'a U+0061'`. Unprintables are the point, so never elide them. */
export function describeCharacter(character) {
  if (character === undefined || character === null || character === '') return '(none)';
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
  if (entry.swallowed) parts.push('CONSUMED-BY-APP');
  if (entry.table) parts.push(`table=${entry.table}`);
  if (entry.value !== undefined) parts.push(`field=${describeCharacter(entry.value)}`);
  if (entry.state) parts.push(`state=${entry.state}`);
  if (entry.latex) parts.push(`latex=${JSON.stringify(entry.latex)}`);
  return parts.join(' ');
}
