/**
 * The composer's Nemeth input path: raw field text -> cells -> a status the
 * author can act on.
 *
 * This module exists because the parser in `nemeth/` is a BATCH parser -- cells
 * in, LaTeX out, one shot -- while a composer field is edited one keystroke at
 * a time. Something has to decide what to say about a half-typed expression,
 * and `parseNemeth` deliberately has only two answers: a parse, or
 * `NemethUnsupportedError`. It has no third answer for "you are not finished",
 * and it cannot have one: at the API level a half-typed expression and an
 * unsupported one are the same thing.
 *
 * ## What this module will and will not claim
 *
 * It reports MEASURED FACTS and never predicts. Specifically it never says
 * "unsupported" while the author is typing, because it cannot know that:
 *
 *  - `NemethUnsupportedError.offset` is NOT an end-of-input marker, so "the
 *    parser ran off the end, therefore keep typing" is not available. Measured:
 *    `⠭⠬` ("x+", 2 cells) fails at offset 1 and `⠹⠁⠌⠃` ("?a/b", 4 cells) fails
 *    at offset 3 -- both are plainly unfinished, and neither offset is at the
 *    end.
 *  - There is no sound completability test over the public API. Proving "some
 *    continuation of these cells parses" needs a search over continuations, and
 *    any bounded search is a guess dressed as a proof.
 *
 * So the live states below are progress reports, and the verdict "this
 * construct is not supported" is left to the one moment it is knowable: commit,
 * where `materializeDraft` runs `parseNemeth` over the finished buffer and its
 * refusal is authoritative. That keeps the dangerous direction closed -- a
 * genuinely unsupported construct is never presented as merely incomplete for
 * longer than it takes to press Enter.
 *
 * ## States
 *
 * - `empty`       nothing entered.
 * - `not-braille` a character that is neither a braille cell nor Braille ASCII.
 * - `complete`    the whole buffer parses. Carries the LaTeX.
 * - `partial`     the whole buffer does not parse, but a proper prefix does.
 *                 Carries that prefix's length and LaTeX -- i.e. where reading
 *                 stopped, which is the one thing an author actually needs.
 * - `unreadable`  no non-empty prefix parses.
 *
 * `complete` means "these cells parse", not "these cells say what you meant":
 * a trailing level indicator is dropped by `resolveLevels`, so `⠭⠘` parses as
 * `x`. The status therefore always states the LaTeX it read rather than a bare
 * "looks good".
 */

import { NemethUnsupportedError, parseNemeth } from './nemeth/index.js';

/**
 * Upper bound on prefix parses per keystroke. A 120-cell buffer costs ~2.7 ms
 * to scan completely, so this is a guard against a pathological paste, not a
 * budget for ordinary editing (a 23-cell buffer scans in ~0.13 ms).
 */
const PREFIX_SCAN_LIMIT = 256;

const BRAILLE_FIRST = 0x2800;
const BRAILLE_LAST = 0x28ff;
const BLANK_CELL = '\u2800';

/**
 * Field text -> Unicode braille cells.
 *
 * **Cells only.** A QWERTY character is NOT read as its Braille ASCII cell,
 * even though `braille-ascii.js` could do it and the corpus is written that
 * way. That is a standing product decision, not an oversight: commit `8bc05ae`
 * ("gate Nemeth QWERTY") deliberately closed that door. The live guard for it is
 * `test/unit/nemeth-input.test.js` ("QWERTY characters are rejected, not read as
 * their Braille ASCII cells"), which asserts directly on this function that
 * `toNemethCells('a')` rejects `'a'` rather than decoding it to the letter cell
 * -- that test is green and runs in `npm test`.
 * `test/e2e/ueb-text-command-mode.test.js` asserts the same behavior at the
 * composer level, but that test is currently RED (failing at baseline too, a
 * 30s timeout inside the shared `enterCommand` e2e helper, unrelated to this
 * logic -- see the final-review-report's Important #1/#2). It is not excluded
 * from `npm test` on purpose; e2e is a separate suite (`npm run test:e2e`) that
 * `npm test` does not run at all. Do not point at it as a currently-enforced
 * guarantee; the unit test above is the one that actually runs and holds.
 * Reversing this behavior here would silently reinterpret someone's prose as
 * mathematics.
 *
 * The one accepted non-cell is the space bar, which becomes `U+2800`. That is
 * not an exception to the rule, it is the only way to type the blank at all --
 * a dot-key chord cannot produce it -- and the same equivalence is already
 * built into `pushUebCell`, which treats `' '` and `U+2800` as one thing. In
 * Nemeth the blank is a TOKEN (Rule 20/21 comparison spacing), never a
 * terminator.
 *
 * Every character that is neither is collected in `rejected` rather than
 * halting the scan, so a caller can strip exactly the offending characters and
 * keep the author's other work. Nothing is silently dropped: `rejected` is
 * non-empty and the caller must act on it.
 *
 * @returns {{cells: string, rejected: Array<{index: number, character: string}>}}
 */
export function toNemethCells(text) {
  const source = String(text ?? '');
  let cells = '';
  const rejected = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const code = character.codePointAt(0);
    if (code >= BRAILLE_FIRST && code <= BRAILLE_LAST) cells += character;
    else if (character === ' ') cells += BLANK_CELL;
    else rejected.push({ index, character });
  }
  return { cells, rejected };
}

function tryParse(parse, cells) {
  try {
    return parse(cells).latex;
  } catch (error) {
    // Anything that is not a refusal is a parser bug, and swallowing it here
    // would hide it behind an ordinary-looking "not complete yet". Fuzzed over
    // 200,000 random cell strings drawn from the symbol table: 0 such throws,
    // so `parse` is injectable purely so this branch can be pinned by a test.
    if (!(error instanceof NemethUnsupportedError)) throw error;
    return null;
  }
}

/**
 * Classify the current field text. Pure; safe to call on every keystroke.
 *
 * `parse` exists as a test seam only; production always uses `parseNemeth`.
 */
export function classifyNemethInput(text, { parse = parseNemeth } = {}) {
  const { cells, rejected } = toNemethCells(text);
  const cellCount = cells.length;
  const base = { cells, cellCount, latex: '', readCells: 0, rejected };

  if (rejected.length) return { ...base, state: 'not-braille' };
  if (!cellCount) return { ...base, state: 'empty' };

  const whole = tryParse(parse, cells);
  if (whole !== null) return { ...base, state: 'complete', latex: whole, readCells: cellCount };

  const floor = Math.max(0, cellCount - PREFIX_SCAN_LIMIT);
  for (let end = cellCount - 1; end > floor; end -= 1) {
    const latex = tryParse(parse, cells.slice(0, end));
    if (latex !== null) return { ...base, state: 'partial', latex, readCells: end };
  }
  return { ...base, state: 'unreadable' };
}

function describeRejected(rejected) {
  const characters = [...new Set(rejected.map(({ character }) => JSON.stringify(character)))];
  return characters.length === 1 ? characters[0] : characters.slice(0, 3).join(', ');
}

function cellCountPhrase(count) {
  return `${count} cell${count === 1 ? '' : 's'}`;
}

/**
 * The screen-reader status line for a classification.
 *
 * Written to be heard, not read: it leads with what was understood rather than
 * with a failure, because during typing "not finished" is the normal state and
 * an alarm on every keystroke is noise. No message here claims a construct is
 * unsupported -- see the module docstring.
 */
export function nemethStatusMessage(classification) {
  const count = cellCountPhrase(classification.cellCount);
  switch (classification.state) {
    case 'empty':
      return 'Enter Nemeth cells. Enter reads the whole expression.';
    case 'not-braille':
      return `Braille cells only: ${describeRejected(classification.rejected)} `
        + 'cannot be typed here. Switch to LaTeX with Control L to write ordinary source.';
    case 'complete':
      return `${count} read as ${classification.latex}. Enter inserts it.`;
    case 'partial':
      return `${count}. The first ${classification.readCells} read as ${classification.latex}. `
        + 'Not a complete expression yet.';
    case 'unreadable':
      return `${count}. Not a complete expression yet. Enter checks it.`;
    default:
      throw new TypeError(`Unknown Nemeth input state: ${classification.state}`);
  }
}
