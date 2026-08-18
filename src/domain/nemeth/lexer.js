/**
 * Cells -> Token[]. No modes, no state beyond the cursor.
 *
 * Every decision here is made from the symbol table plus a bounded, *pure*
 * lookahead through `matchAt`. The one genuinely ambiguous cell in Nemeth's
 * lower half is the numeric indicator, which is also the simple-fraction
 * closing indicator; it is resolved by looking at the next whole TOKEN, never
 * at the next cell. A cell-level peek is not sufficient: in the real corpus case
 * `⠹⠲⠌⠔⠼⠨⠌…` the cells after the closing indicator are `⠨⠌`, which longest-
 * matches as a division sign -- but `⠨` on its own is the decimal point, so a
 * peek at that single cell would read the closing indicator as a numeric one.
 *
 * A blank (U+2800) is a token like any other. Nemeth spacing is semantic --
 * comparisons are blank-surrounded and operations are not -- so blanks are
 * never trimmed, collapsed, or dropped.
 */

import { NemethUnsupportedError } from './errors.js';
import { matchAt } from './symbols.js';

const CELL_MIN = 0x2800;
const CELL_MAX = 0x28ff;
const SIX_DOT_MASK = 0x3f;

// Token kinds that can open a numeral, and so make a leading `⠼` a numeric
// indicator rather than a fraction close. `decimal` has no row yet; naming it
// here means adding that row later is a data change, not a logic change.
const NUMERAL_START = new Set(['digit', 'decimal']);

function describeCodepoint(code) {
  return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Accept U+2800-U+28FF only, reducing 8-dot cells to their 6-dot form. One
 * input code unit maps to exactly one output cell, so offsets stay comparable
 * with the caller's string.
 */
function normalize(input) {
  if (typeof input !== 'string') {
    throw new NemethUnsupportedError({ detail: `lex() expects a string, received ${typeof input}` });
  }
  let cells = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.codePointAt(i);
    if (code < CELL_MIN || code > CELL_MAX) {
      throw new NemethUnsupportedError({
        offset: i,
        cells: input,
        detail: `${describeCodepoint(code)} is not a braille cell (expected U+2800-U+28FF)`
      });
    }
    cells += String.fromCodePoint(CELL_MIN + (code & SIX_DOT_MASK));
  }
  return cells;
}

/**
 * Apply a row's declared alternative reading when the following token shows the
 * row's primary reading is wrong.
 */
function disambiguate(match, cells, index) {
  const alternative = match.unlessFollowedByNumeral;
  if (!alternative) return match;
  const next = matchAt(cells, index + match.len);
  if (next && NUMERAL_START.has(next.kind)) return match;
  return { ...match, ...alternative };
}

function makeToken(match, cells, offset) {
  return Object.freeze({
    kind: match.kind,
    value: match.value,
    cells: cells.slice(offset, offset + match.len),
    offset,
    len: match.len
  });
}

export function lex(input, context = {}) {
  const cells = normalize(input);
  const tokens = [];
  let index = 0;
  while (index < cells.length) {
    const match = matchAt(cells, index);
    if (!match) {
      throw new NemethUnsupportedError({
        offset: index,
        cells,
        detail: `no Nemeth symbol starts at cell ${index} (${describeCodepoint(cells.codePointAt(index))})`
      });
    }
    tokens.push(makeToken(disambiguate(match, cells, index), cells, index));
    index += match.len;
  }
  return tokens;
}
