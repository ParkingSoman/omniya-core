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
import { decodeEnUsComp8 } from './nemeth/computer-braille-en-us.js';

/**
 * Registry of opt-in computer-braille input decoders, keyed by the value
 * persisted in settings (`nemethBrailleInputTable`, see
 * `src/main/settings-storage.js`). `'none'` (the default -- absent from this
 * map on purpose) means no decoding: only real braille cells are accepted,
 * exactly as before this feature existed. Adding another locale's table
 * later is adding one more entry here, not touching the classifier logic.
 */
const BRAILLE_INPUT_DECODERS = {
  'en-us-comp8': decodeEnUsComp8
};

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
 * `'auto'`: work out the table from the buffer instead of asking the author.
 *
 * Braille cells (`U+2800`-`U+28FF`) and the ASCII a computer-braille keyboard
 * sends occupy DISJOINT code point ranges, so "this device sends cells" and
 * "this device sends translated text" can never be mistaken for one another --
 * which is what makes detecting them safe where guessing between two *text*
 * tables would not be. Cells are accepted in either mode; only the non-cell
 * characters decide, and a table is chosen only if it explains all of them.
 *
 * What this does NOT do is guess between two tables that both explain the
 * input. The registry is ordered and the first full explanation wins, so
 * adding a second overlapping table is a decision to make deliberately, not a
 * thing that silently changes behaviour for existing users.
 *
 * Unexplained input resolves to `'none'`, which rejects with the usual message
 * rather than half-decoding -- an honest refusal, not a plausible wrong answer.
 */
export function resolveBrailleInputTable(text, brailleInputTable) {
  if (brailleInputTable !== 'auto') return brailleInputTable;
  const source = String(text ?? '');
  const undecided = [];
  for (const character of source) {
    const code = character.codePointAt(0);
    if (code >= BRAILLE_FIRST && code <= BRAILLE_LAST) continue;
    if (character === ' ') continue;
    undecided.push(character);
  }
  if (!undecided.length) return 'none';
  for (const [name, decode] of Object.entries(BRAILLE_INPUT_DECODERS)) {
    if (undecided.every((character) => decode(character) !== null)) return name;
  }
  return 'none';
}

/**
 * Field text -> Unicode braille cells.
 *
 * **Cells only, by default.** A QWERTY character is NOT read as its Braille
 * ASCII cell, even though `braille-ascii.js` could do it and the corpus is
 * written that way. That is a standing product decision, not an oversight:
 * commit `8bc05ae` ("gate Nemeth QWERTY") deliberately closed that door. The
 * live guard for it is `test/unit/nemeth-input.test.js` ("QWERTY characters
 * are rejected, not read as their Braille ASCII cells"), which asserts
 * directly on this function that `toNemethCells('a')` rejects `'a'` rather
 * than decoding it to the letter cell -- that test is green and runs in
 * `npm test`.
 * `test/e2e/ueb-text-command-mode.test.js` asserts the same behavior at the
 * composer level, but that test is currently RED (failing at baseline too, a
 * 30s timeout inside the shared `enterCommand` e2e helper, unrelated to this
 * logic -- see the final-review-report's Important #1/#2). It is not excluded
 * from `npm test` on purpose; e2e is a separate suite (`npm run test:e2e`) that
 * `npm test` does not run at all. Do not point at it as a currently-enforced
 * guarantee; the unit test above is the one that actually runs and holds.
 * Reversing this behavior by default would silently reinterpret someone's
 * prose as mathematics.
 *
 * **The one narrow, explicit exception** is `brailleInputTable`: some
 * connected braille keyboards are configured to send text through their own
 * "computer braille" input table rather than raw Unicode braille cells (see
 * `computer-braille-en-us.js` for why this is a real, separate problem from
 * QWERTY typing, not a reversal of it). When the caller passes a known table
 * name here -- persisted per-user via `src/main/settings-storage.js`, opt-in
 * and off by default -- a character that would otherwise be rejected is first
 * run through that table's decoder. This is deliberately NOT the same thing
 * commit `8bc05ae` closed: it is a distinct, verified table for a distinct
 * input device class, chosen explicitly by the person typing, not a general
 * "decode any ASCII as Braille ASCII" fallback. With `brailleInputTable`
 * omitted or `'none'`, behavior is byte-for-byte identical to before this
 * option existed.
 *
 * The one accepted non-cell regardless of table is the space bar, which
 * becomes `U+2800`. That is not an exception to the rule, it is the only way
 * to type the blank at all -- a dot-key chord cannot produce it -- and the
 * same equivalence is already built into `pushUebCell`, which treats `' '`
 * and `U+2800` as one thing. In Nemeth the blank is a TOKEN (Rule 20/21
 * comparison spacing), never a terminator.
 *
 * Every character that is neither is collected in `rejected` rather than
 * halting the scan, so a caller can strip exactly the offending characters and
 * keep the author's other work. Nothing is silently dropped: `rejected` is
 * non-empty and the caller must act on it.
 *
 * @param {string} text
 * @param {string} [brailleInputTable] one of `BRAILLE_INPUT_DECODERS`' keys,
 *   or `'none'`/omitted for the default cells-only behavior.
 * @returns {{cells: string, rejected: Array<{index: number, character: string}>}}
 */
export function toNemethCells(text, brailleInputTable) {
  const source = String(text ?? '');
  const decode = BRAILLE_INPUT_DECODERS[brailleInputTable];
  let cells = '';
  const rejected = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const code = character.codePointAt(0);
    const decoded = decode?.(character);
    if (code >= BRAILLE_FIRST && code <= BRAILLE_LAST) cells += character;
    else if (character === ' ') cells += BLANK_CELL;
    else if (decoded) cells += decoded;
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
 * `brailleInputTable` is forwarded to `toNemethCells` -- see its docstring.
 */
export function classifyNemethInput(text, { parse = parseNemeth, brailleInputTable } = {}) {
  // Resolve first, then classify: under `'auto'` the mode is a property of the
  // buffer, and callers (the composer's chord guard, the status line, submit)
  // all need the SAME answer. Reporting it as `inputTable` is what lets the
  // status line name the interpretation out loud, which is the only feedback a
  // braille author gets that the app read their device the way they meant.
  const inputTable = resolveBrailleInputTable(text, brailleInputTable);
  const { cells, rejected } = toNemethCells(text, inputTable);
  const cellCount = cells.length;
  const base = { cells, cellCount, latex: '', readCells: 0, rejected, inputTable };

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
 * Names the input mode when it is not the plain cells-only one.
 *
 * The containment for auto-detection: a screen reader applying a *literary*
 * table also emits ASCII, which would decode through a computer-braille table
 * into valid-but-wrong cells. The parser catches most such input, but not all
 * -- so the reading is said out loud rather than assumed. An author who hears
 * "read as computer braille" when their device sends raw cells knows
 * immediately that something is set wrong, which is the difference between a
 * detectable mistake and a silent one.
 */
function readingMode(classification) {
  const table = classification.inputTable;
  if (!table || table === 'none') return '';
  return table === 'en-us-comp8' ? ' Read as computer braille.' : ` Read through ${table}.`;
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
        // Names ONE fix, because there is only one left. This message used to
        // offer Control D as well, from when a device sending computer-braille
        // text needed the author to pick an input table by hand. That picker is
        // gone -- `resolveBrailleInputTable` measures the table instead -- and
        // no Control D handler exists anywhere in the app, so the sentence was
        // sending a blind author to a keystroke that does nothing, in the one
        // message they hear when their input is being refused.
        //
        // What is left is true and actionable: both readings this app supports
        // (raw cells, and computer-braille text) are already tried on every
        // keystroke, so a character reaching here is neither, and Control L is
        // the way to write it as ordinary source.
        + 'cannot be typed here. Braille cells and computer-braille text are '
        + 'both read automatically, so these characters are neither. To write '
        + 'ordinary source instead, switch to LaTeX with Control L.';
    case 'complete':
      return `${count} read as ${classification.latex}.${readingMode(classification)} Enter inserts it.`;
    case 'partial':
      return `${count}. The first ${classification.readCells} read as ${classification.latex}. `
        + `Not a complete expression yet.${readingMode(classification)}`;
    case 'unreadable':
      // The mode matters MOST here. "Not a complete expression yet" with no
      // reading named is what an author hears when detection has guessed wrong,
      // and without the mode they have nothing to act on.
      return `${count}. Not a complete expression yet.${readingMode(classification)} Enter checks it.`;
    default:
      throw new TypeError(`Unknown Nemeth input state: ${classification.state}`);
  }
}
