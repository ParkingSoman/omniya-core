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
 *
 * ## The prefix pass (Rules 5, 6 and 7)
 *
 * Capitalization, alphabet and typeform are written as indicator cells BEFORE
 * the sign they govern. They are not enumerated as symbol rows -- typeform x
 * alphabet x capitalization x 26 letters is several hundred rows, and a symbol
 * row cannot populate `marks.typeform` anyway. Instead a run of indicators is
 * read here and COMPOSED onto the one token it governs, as `marks`. The
 * indicator sets themselves are Rule 5's list (test/corpus/sources/
 * Nemeth_2022.txt lines 2891-2893), Rule 6's (lines 2965-2971) and Rule 7's
 * (lines 3559-3564).
 *
 * Appendix C, "Combinations of Typeform, Alphabetic and Capitalization
 * Indicators" (lines 16430-16463), is the authority for the ORDER: typeform,
 * then alphabet, then capitalization, then the letter. Boldface capitalized
 * English is `_;,` (line 16455) = bold + English-letter + capitalization. The
 * rule bodies agree with it rather than contradicting it -- 6.2.1 (lines
 * 3070-3071) "if the letter is capitalized, the alphabetic indicator precedes
 * the capitalization indicator", and 6.3.4 (lines 3209-3210) says the same of
 * the English-letter indicator -- so `SLOT_ORDER` has one source, not two
 * competing ones.
 *
 * ## Extent of effect: ONE sign, never a run
 *
 * This is the question a prefix pass gets silently wrong, so it is answered
 * from the book and enforced in `readPrefixed`:
 *   - 5.3.1 (lines 2932-2934) the single capitalization indicator "extends
 *     only to the letter which follows it".
 *   - 6.2.3 (lines 3109-3111) a non-English alphabetic indicator "extends only
 *     to the letter which follows it".
 *   - 7.2.1 (lines 3606-3607) a typeform indicator with letters has its
 *     "effectiveness extends only to the letter which follows it".
 *   - 7.2.2 (lines 3653-3657) a typeform indicator with numerals runs to the
 *     next space, numeric indicator, terminator or typeform indicator -- but it
 *     is "always followed by the numeric indicator", and one numeric indicator
 *     plus its digits is a single token here, so that too is one sign.
 * The run-scoped forms are therefore OUT OF SCOPE and refuse: the DOUBLE
 * capitalization indicator `⠠⠠` of 5.3.2 (lines 2942-2945, "extends to all of
 * the letters which immediately follow it"), which is a mode by construction
 * and whose domain is Roman numerals and abbreviations this parser has no
 * notion of, and the word/phrase typeform indicators of 7.3 (lines 3707-3708,
 * with their own indicator set at lines 3565-3577).
 *
 * ## What this pass deliberately does not read
 *
 *   - The Russian indicator `@@` (line 2971): the Code gives no Russian
 *     alphabet to go with it and no corpus case uses it, so it is not guessed
 *     at. Script type `@` (line 3563) IS read now -- it is a typeform row like
 *     the other four -- but `latex.js` refuses it on a letter; see the note on
 *     `withTypeform` for the Code-versus-oracle conflict that sits there and
 *     nowhere else.
 *   - Hebrew `,,` (line 2970): the same two cells as the double capitalization
 *     indicator of 5.3.2, and 6.1.2 gives the Code exactly one Hebrew letter.
 *     Both readings refuse together rather than one being preferred blind.
 *   - Alternative Greek forms `.@` (line 2968, Rule 6.2.2 at line 3096): 6.1.5
 *     lists five, of which LaTeX names four, and 6.2.2 says they are used "only
 *     when the author has assigned distinct meanings" -- a judgement the cells
 *     do not carry. No corpus case uses them.
 *   - The English-letter indicator `;` standing ALONE (Rule 6.3): that cell is
 *     also the subscript indicator, and 6.3.1's conditions (d) and (e) are about
 *     surrounding spaces and punctuation, which this pass has no grammar for.
 *     `;` is read as an alphabetic indicator only where 7.2.1 leaves no other
 *     reading -- directly after a typeform indicator.
 *
 * Rule 7.4 (line 3774) governs when a transcriber writes NO typeform indicator
 * at all -- regular type, typeform without mathematical significance, italics
 * used decoratively. It constrains the forward direction only: there is nothing
 * in the cells for this pass to act on, and an indicator that IS present is
 * still read the same way.
 *
 * ## Homographs the Code resolves by spacing
 *
 * `⠨` before a letter is the Greek-letter indicator, but `⠨⠅` is also the
 * equals sign (Rule 21's symbol list, line 10291). Measured on the corpus: 169
 * occurrences, of which 157 are blank-surrounded, and NOT ONE of the 142 cases
 * containing those cells targets a Greek kappa -- 141 of them target an
 * equals-family sign. Likewise `⠸⠇` is identity (line 10298, Rule 21.3 at line
 * 10631) as well as German ell, `⠠⠗` is the relation sign of 21.5 (lines
 * 10655-10664) as well as capital R, `⠰⠆` is the proportion sign (line 10314)
 * as well as a subscript 2, and `⠐⠅` is the less-than sign (line 10302) as well
 * as a baseline indicator followed by the letter k.
 *
 * The Code separates them by 21.13 (lines 10775-10779): "A space must be left
 * on either side of a comparison symbol." So each is a `comparison` row carrying
 * `unlessUnspaced`, and when the cells are not blank-surrounded the row falls
 * back to its first cell, which is the indicator. The ends of the input count
 * as blanks -- the space 21.13 requires sits outside a transcribed expression,
 * and the corpus shows the shape: `sre-aata:AataExpression_330` is the bare
 * cells `⠸⠇` for `≡`.
 *
 * 21.13's second sentence is half implemented, on purpose: see `isSpaced` for
 * the indicator half, and for why the punctuation and grouping half is left out
 * rather than guessed at.
 */

import { NemethUnsupportedError } from './errors.js';
import rows from './symbols.json' with { type: 'json' };
import { matchAt } from './symbols.js';

const LEVEL_KINDS = new Set(['level', 'baseline']);

const CELL_MIN = 0x2800;
const CELL_MAX = 0x28ff;
const SIX_DOT_MASK = 0x3f;
const BLANK = '⠀';

// Token kinds that can open a numeral, and so make a leading `⠼` a numeric
// indicator rather than a fraction close. `decimal` has no row yet; naming it
// here means adding that row later is a data change, not a logic change.
const NUMERAL_START = new Set(['digit', 'decimal']);

// Appendix C's column order, outermost indicator first.
const SLOT_ORDER = ['typeform', 'alphabet', 'capitalization'];

// The one-cell indicators Rule 2 writes BEFORE the sign they apply to, taken
// from the table rather than listed here, so a new level indicator row extends
// the Rule 21.13 spacing test as data.
const PRECEDING_INDICATOR_CELLS = new Set(
  rows.filter((row) => row.cells.length === 1 && LEVEL_KINDS.has(row.kind)).map((row) => row.cells)
);

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
 * Is this sign blank-surrounded in the sense BANA Rule 21.13 means?
 *
 * Sentence one (line 10776) is the `after` test and the outer half of `before`.
 * Sentence two (lines 10777-10779) -- "a space is not left between the
 * comparison symbol and any punctuation symbol, grouping symbol, or INDICATOR
 * which applies to it" -- is the backward walk: a level or baseline indicator is
 * written before the sign it applies to (Rule 2), so it sits INSIDE the space
 * 21.13 requires and must be stepped over to find that space. Example 14-94
 * (Nemeth_2022.txt lines 6939-6945) is exactly this shape: `!;u ;.k a`, where
 * "the subscript indicator before the equals sign keeps this symbol at the
 * subscript level". Without the walk those cells read as a Greek kappa.
 *
 * Only indicators are stepped over, not the punctuation and grouping symbols
 * sentence two also names: those follow the sign rather than precede it, and
 * this pipeline has no punctuation rows to identify them by. That half stays
 * unimplemented rather than guessed.
 */
function isSpaced(cells, index, len) {
  let start = index;
  while (start > 0 && PRECEDING_INDICATOR_CELLS.has(cells[start - 1])) start -= 1;
  const before = start === 0 ? BLANK : cells[start - 1];
  const after = index + len >= cells.length ? BLANK : cells[index + len];
  return before === BLANK && after === BLANK;
}

/**
 * Apply a row's declared alternative reading when the context shows the row's
 * primary reading is wrong. Both alternatives are data-declared, so a new
 * ambiguous cell is a table entry rather than a branch here.
 */
function disambiguate(match, cells, index) {
  if (match.unlessFollowedByNumeral) {
    const next = matchAt(cells, index + match.len);
    if (!next || !NUMERAL_START.has(next.kind)) return { ...match, ...match.unlessFollowedByNumeral };
  }
  if (match.unlessUnspaced && !isSpaced(cells, index, match.len)) {
    // Re-read at the same place against a truncated string, so only the
    // declared number of cells is visible to the trie.
    return matchAt(cells.slice(0, index + match.unlessUnspaced.maxLen), index);
  }
  return match;
}

function resolve(cells, index) {
  const match = matchAt(cells, index);
  if (!match) {
    throw new NemethUnsupportedError({
      offset: index,
      cells,
      detail: `no Nemeth symbol starts at cell ${index} (${describeCodepoint(cells.codePointAt(index))})`
    });
  }
  return disambiguate(match, cells, index);
}

function makeToken(match, cells, start, end, marks) {
  const token = {
    kind: match.kind,
    value: match.value,
    cells: cells.slice(start, end),
    offset: start,
    len: end - start
  };
  // The spacing class BANA Rules 20 and 21 put the sign in, where its row
  // declares one. `parser.js` reads it to decide what a blank next to this
  // token can mean; see the Rule 21.13 seam there.
  if (match.role) token.role = match.role;
  if (marks) token.marks = Object.freeze(marks);
  return Object.freeze(token);
}

function fills(match, slot) {
  return Boolean(match && match.slots && Object.hasOwn(match.slots, slot));
}

/**
 * Which Appendix C column this indicator occupies here.
 *
 * `⠸` and `⠨` each name a typeform AND an alphabet (boldface/German,
 * italic/Greek), so the column is not a property of the cell. 7.2.1 (line 3605)
 * settles it: "The typeform indicator for a letter must always be followed by
 * an alphabetic indicator", and 7.2.2 (line 3656) "The typeform indicator for a
 * numeral is always followed by the numeric indicator". So a two-column
 * indicator is a typeform exactly when the NEXT symbol can fill the alphabet
 * column or opens a numeral, and an alphabet indicator otherwise. That is what
 * keeps `⠨⠠⠛` (Example 5-2, cells at line 2912) reading as capital Greek gamma rather
 * than as an italic with no alphabet: `⠠` fills only the capitalization column.
 */
function chooseSlot(match, next, filledThrough) {
  const candidates = SLOT_ORDER.filter((slot, i) => i > filledThrough && fills(match, slot));
  if (candidates.length < 2) return candidates[0] ?? null;
  return fills(next, 'alphabet') || (next && next.kind === 'numeric') ? 'typeform' : 'alphabet';
}

/**
 * Read a run of indicator cells and the single sign they govern.
 *
 * Returns the governed match, the composed marks, and the end offset. Refusal
 * -- not a guess -- is the answer whenever the run is not a shape Rules 5-7
 * define.
 */
function readPrefixed(cells, index) {
  const marks = {};
  let filledThrough = -1;
  let at = index;
  let match = resolve(cells, at);
  while (fills(match, 'typeform') || fills(match, 'alphabet') || fills(match, 'capitalization')) {
    const next = at + match.len < cells.length ? resolve(cells, at + match.len) : null;
    const slot = chooseSlot(match, next, filledThrough);
    if (!slot) {
      throw new NemethUnsupportedError({
        offset: at,
        cells,
        detail: `indicator "${match.value}" cannot follow the indicators before it in Appendix C's order (typeform, alphabet, capitalization)`
      });
    }
    marks[slot] = match.slots[slot];
    filledThrough = SLOT_ORDER.indexOf(slot);
    at += match.len;
    if (!next) {
      throw new NemethUnsupportedError({ offset: at, cells, detail: 'indicator run governs nothing' });
    }
    match = next;
  }
  const governsLetter = Boolean(marks.alphabet || marks.capitalization);
  const expected = governsLetter ? 'letter' : 'numeric';
  if (match.kind !== expected) {
    throw new NemethUnsupportedError({
      offset: at,
      cells,
      detail: governsLetter
        ? `an alphabetic or capitalization indicator governs a ${match.kind}, not the letter BANA Rules 5.1.1 and 6.2.3 require`
        : `a typeform indicator governs a ${match.kind}; BANA Rule 7.2.1 requires an alphabetic indicator for a letter and 7.2.2 a numeric indicator for a numeral`
    });
  }
  return { match, marks, end: at + match.len };
}

export function lex(input, context = {}) {
  const cells = normalize(input);
  const tokens = [];
  let index = 0;
  while (index < cells.length) {
    const match = resolve(cells, index);
    if (match.kind === 'prefix') {
      const run = readPrefixed(cells, index);
      tokens.push(makeToken(run.match, cells, index, run.end, run.marks));
      index = run.end;
      continue;
    }
    tokens.push(makeToken(match, cells, index, index + match.len));
    index += match.len;
  }
  return tokens;
}
