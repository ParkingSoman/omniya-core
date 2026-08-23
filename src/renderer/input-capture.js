/**
 * Observation of the Nemeth input path. SHIPPED, and silent.
 *
 * It ships because the people whose input path goes wrong are running packaged
 * builds on the other side of an email thread; a capture that only existed in a
 * developer's checkout would be observability aimed at the one machine where
 * the bug does not reproduce. Recording is in-memory, capped, never written to
 * disk, and surfaced only two ways: the dev panel under `dev/`, which is
 * excluded from the asar, and the diagnostics dump, which a person has to ask
 * for. Nothing here renders, announces, or persists on its own.
 *
 * It deliberately takes almost nothing from `app.js`, which is already the
 * largest file in the repo. Everything it needs is observable from the DOM:
 *
 *  - the buffer -> `#composer-source`.value
 *  - the reading in force -> a `readTable` getter, the one thing it is handed.
 *    It used to scrape this from the input-table picker's checked option; that
 *    picker is gone, because which table a device uses is now measured rather
 *    than asked.
 *  - whether a handler ate the keystroke -> `event.defaultPrevented`, read in a
 *    BUBBLE-phase listener. Same-target capture always runs before bubble, and
 *    same-phase listeners run in registration order, so a listener attached
 *    from here -- after app.js has finished wiring -- sees the app's decision
 *    rather than racing it. That one field is what makes a swallowed chord key
 *    visible; nothing else in the app reports it.
 */
import { createInputLog } from './input-log.js';

const FIELD = '#composer-source';

/**
 * The authoring mode in force, recorded on every entry.
 *
 * The capture used to record ONLY while this read "Equation · Nemeth", and
 * return early otherwise. That gate hid the single most useful thing a report
 * could carry: an author who believes they are in equation mode and is not
 * produced no log at all, so "the app would not take my equation" and "the app
 * was never in equation mode" looked identical from here -- and identical to
 * having typed nothing. Recording the mode instead of gating on it turns that
 * into one readable line.
 */
function authoringMode(document) {
  return document.querySelector('#mode-panel')?.textContent?.trim() || 'unknown';
}

export function attachInputCapture({ document, log = createInputLog(), onChange, readTable } = {}) {
  const activeTable = () => readTable?.() ?? 'unknown';
  const field = document.querySelector(FIELD);
  if (!field) return { log, detach() {} };

  const publish = (entry) => {
    log.record(entry);
    onChange?.(log);
  };

  const onKeydown = (event) => {
    publish({
      type: 'keydown',
      key: event.key,
      code: event.code,
      // Set by the time a bubble listener runs: the chord reader calls
      // preventDefault() in capture/earlier-registered order.
      swallowed: event.defaultPrevented,
      mode: authoringMode(document),
      table: activeTable(),
      value: field.value
    });
  };

  const onInput = () => {
    publish({
      type: 'input',
      mode: authoringMode(document),
      table: activeTable(),
      value: field.value,
      state: document.querySelector('#composer-status')?.textContent?.trim() || undefined
    });
  };

  field.addEventListener('keydown', onKeydown);
  field.addEventListener('input', onInput);
  return {
    log,
    detach() {
      field.removeEventListener('keydown', onKeydown);
      field.removeEventListener('input', onInput);
    }
  };
}
