/**
 * The single failure mode of the Nemeth parser.
 *
 * `detail`, `offset` and `cells` exist for developers and tests, and still must
 * never reach an end user: they are written in this pipeline's own vocabulary
 * (token kinds, level paths, "this parser has no node for it") and they cite
 * rule numbers, which is the thing an author would have to go and look up.
 *
 * `userMessage` is what an end user sees, and it is the SAME sentence for every
 * refusal -- `UNSUPPORTED_MESSAGE` -- unless a call site passed a `userDetail`.
 * That escape hatch exists because the original rule assumed every refusal was
 * a construct this pipeline cannot read, and the alpha log of 2026-08-24 showed
 * it is not: a missing baseline indicator was reported as a bug against the app,
 * because the app answered "this construct isn't supported yet, write LaTeX"
 * about an expression it parses correctly the moment that one cell is there.
 * Telling an author to abandon Nemeth for a typo is the failure this prevents.
 *
 * A `userDetail` is held to two things, both enforced by
 * `test/unit/nemeth/user-message.test.js`:
 *
 *   1. It names no rule number. If the reason cannot be given in plain words --
 *      "a superscript that never returns to the baseline" -- it does not belong
 *      here, and the call site simply omits it.
 *   2. It still refuses. Naming a missing cell is not accepting a guessed parse;
 *      nothing about `UNSUPPORTED_MESSAGE`'s "never a partial parse" contract
 *      changes, and `error.message` remains that sentence for everything
 *      downstream that reads it.
 *
 * There is deliberately no map from `detail` to `userMessage`. A refusal cause
 * is not an enumerable set -- 46 distinct cause families appear across the 613
 * corpus cases alone, most of them interpolating a token kind or a level path --
 * so a lookup table would be a standing invitation to drift. Opting in at the
 * call site means a new `unsupported()` anywhere in this pipeline keeps today's
 * behaviour with no maintenance at all.
 */

export const UNSUPPORTED_MESSAGE =
  "This Nemeth construct isn't supported yet. Write the expression in LaTeX instead.";

export class NemethUnsupportedError extends Error {
  constructor({ offset = 0, cells = '', detail = '', userDetail = '' } = {}) {
    super(UNSUPPORTED_MESSAGE);
    this.name = 'NemethUnsupportedError';
    this.offset = offset;
    this.cells = cells;
    this.detail = detail;
    this.userDetail = userDetail;
    this.userMessage = userDetail || UNSUPPORTED_MESSAGE;
  }
}
