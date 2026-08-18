/**
 * The single failure mode of the Nemeth parser.
 *
 * Every unsupported construct raises this with the SAME user-facing message.
 * `detail`, `offset` and `cells` exist for developers and tests; they must never
 * reach an end user, because a generic message is a deliberate product decision:
 * an author who hits an unsupported construct should be told to write LaTeX, not
 * handed a rule number they would have to look up.
 */

export const UNSUPPORTED_MESSAGE =
  "This Nemeth construct isn't supported yet. Write the expression in LaTeX instead.";

export class NemethUnsupportedError extends Error {
  constructor({ offset = 0, cells = '', detail = '' } = {}) {
    super(UNSUPPORTED_MESSAGE);
    this.name = 'NemethUnsupportedError';
    this.offset = offset;
    this.cells = cells;
    this.detail = detail;
  }
}
