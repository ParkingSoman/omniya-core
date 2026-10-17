// How a dollar amount is said aloud. Issue #52.
//
// BANA Rule 23.13 gives the dollar sign and its spacing (sign first, unspaced
// from what it applies to) but not its spoken form, so the reading is a choice:
// the one a person says, "2 dollars", "1 dollar", "x dollars", "100 dollars and
// 99 cents". MathJax's speech puts the sign first ("dollars 2", "dollar 100
// point 99"), which a blind contributor found wrong. We rewrite only that
// plain shape, and only when the sign is directly followed by one number or one
// letter, so no other speech is ever touched.
//
// A decimal is read as cents only when it has exactly two digits after the
// point, because $1.5 and $1.50 differ in what a speaker would mean by "5" and
// guessing would be a silent error. Other decimals keep the reader's "point".
const AMOUNT = /\b(?:dollars?|dollar sign)\s+(\d+(?:(?:\.| point )\d+)?|[A-Za-z])(?![\w.])/g;

function say(amount) {
  const [whole, fraction] = amount.split(/\.| point /);
  if (/^[A-Za-z]$/.test(amount)) return `${amount} dollars`;
  const dollars = `${whole} ${whole === '1' ? 'dollar' : 'dollars'}`;
  if (fraction === undefined) return dollars;
  if (fraction.length === 2) {
    const cents = Number(fraction);
    const centWord = cents === 1 ? 'cent' : 'cents';
    return whole === '0' ? `${cents} ${centWord}` : `${dollars} and ${cents} ${centWord}`;
  }
  return `${dollars} point ${fraction}`;
}

export function spokenCurrency(label) {
  return String(label ?? '').replace(AMOUNT, (_, amount) => say(amount));
}
