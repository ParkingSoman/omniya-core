/**
 * Assign a script level to every token and drop the level indicators themselves.
 *
 * A level is an ABSOLUTE PATH from the baseline, held as a string over the
 * alphabet `^` (superscript) and `_` (subscript): `''`, `'^'`, `'_'`, `'^^'`,
 * `'^_'`, ... This is not a stylistic choice. BANA Rule 2's indicator table
 * (test/corpus/sources/Nemeth_2022.txt lines 652-670) enumerates the level
 * indicators as a closed set of absolute paths -- "Superscript with Subscript"
 * is one indicator meaning the subscript slot of a superscript, not "up then
 * down". Under a signed-integer model `x_a^n` computes -1 + 1 = 0 and parses
 * silently as `x_a n`; under paths it is `'_'` then `'^'`, two depth-1 siblings
 * of `x`, and the wrong reading is not expressible.
 *
 * This pass only LABELS. Which base owns which script is the parser's job, and
 * with paths that question reduces to a prefix comparison.
 *
 * `afterBaseline` records that an explicit baseline indicator immediately
 * preceded the token. Nothing consumes it yet, but only this pass can see it:
 * Rule 14.11.2 makes it the sole carrier of the `x_1^2` vs `(x_1)^2`
 * distinction, so it is unrecoverable once the indicators are gone.
 *
 * Known limitation: `⠐` is both the baseline indicator (Rule 2) and the
 * multipurpose indicator (Rule 24); this pass reads it only as the former. No
 * case in this slice uses the latter, and telling them apart needs the symbol
 * rows Rule 24 governs, which do not exist yet.
 */

import { NemethUnsupportedError } from './errors.js';

// Rule 2 enumerates level indicators to three components and no further.
const MAX_LEVEL_DEPTH = 3;

/**
 * Consecutive level cells spell one indicator: `⠘⠘` is the single symbol
 * "superscript with superscript", i.e. the path '^^'.
 */
function readLevelPath(tokens, start) {
  let path = '';
  let index = start;
  while (index < tokens.length && tokens[index].kind === 'level') {
    path += tokens[index].value;
    index += 1;
  }
  return { path, index };
}

export function resolveLevels(tokens, context = {}) {
  const resolved = [];
  let level = '';
  let afterBaseline = false;
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.kind === 'baseline') {
      level = '';
      afterBaseline = true;
      index += 1;
      continue;
    }

    if (token.kind === 'level') {
      const read = readLevelPath(tokens, index);
      if (read.path.length > MAX_LEVEL_DEPTH) {
        throw new NemethUnsupportedError({
          offset: token.offset,
          cells: token.cells,
          detail: `level path "${read.path}" is deeper than the ${MAX_LEVEL_DEPTH} components BANA Rule 2 enumerates`
        });
      }
      level = read.path;
      afterBaseline = false;
      index = read.index;
      continue;
    }

    resolved.push(Object.freeze({ ...token, level, afterBaseline }));
    afterBaseline = false;
    index += 1;
  }

  return resolved;
}
