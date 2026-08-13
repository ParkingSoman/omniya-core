/**
 * Small source-intent correction at the accessibility boundary.
 *
 * MathJax/SRE is the independent Nemeth projection for ordinary MathML. A
 * handful of BANA distinctions are intentionally retained by the guided
 * writer as `data-omniya-nemeth-intent`, because the same MathML presentation
 * is otherwise ambiguous. This module only restores cells for those explicit
 * source intents; it is not a serializer or an expression parser.
 */
export function applyNemethSourceIntentToBraille(braille, sourceMath) {
  if (typeof braille !== 'string' || !sourceMath?.querySelectorAll) return braille;
  const decimalNonnumeric = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="decimal-nonnumeric"]');
  const numericDecimal = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="numeric-decimal"]')]
    .filter((node) => String(node.textContent ?? '').trim().startsWith('.'));
  if (!decimalNonnumeric.length && !numericDecimal.length) return braille;
  if (numericDecimal.length && !decimalNonnumeric.length) {
    // BANA 3.2.3 uses dot 4 for a decimal point in a numeric item. SRE's
    // generic number projection chooses the ordinary punctuation cell.
    return braille.replace(/(⠼[^⠨⠐]*)(⠲)/, '$1⠨');
  }
  if (braille.includes('⠐')) return braille;
  // BANA 24.1.g places dot 5 after a decimal point before a nonnumeric
  // symbol. SRE emits the decimal point and the following symbol, but does
  // not see Omniya's source intent. The first local occurrence is the only
  // one this bounded writer can create for a focused draft.
  return braille.replace(/(⠼[^⠐]*⠨)(?!⠐)/, '$1⠐');
}
