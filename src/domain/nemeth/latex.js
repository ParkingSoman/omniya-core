/**
 * AST -> LaTeX, as an exhaustive dispatch table.
 *
 * `defineBackend` checks the table against the kind registry at import time, so
 * a kind added to `kinds.js` without a rendering here fails at startup rather
 * than producing a wrong string at runtime. There is no default branch and no
 * opt-out.
 *
 * Adjacent pieces are joined through `concat`, which inserts a space only when
 * running them together would change what LaTeX reads. A control word (`\\`
 * plus letters) is terminated by the first non-letter, so `\\times` followed by
 * `b` would parse as the undefined control sequence `\\timesb`; `a` followed by
 * `+`, or anything followed by `{`, needs nothing. The space is therefore
 * conditional, and expressions with no macro-letter boundary come out byte for
 * byte as before.
 *
 * Kinds this stage cannot render throw `NemethUnsupportedError` from their own
 * entry. That is the honest way to stay exhaustive: `Hole` and `Text` are never
 * produced by this pipeline, and `FunctionCall` and `BigOperator` each require a
 * rendering decision (`\sin` vs `\operatorname{...}`; where a big operator's
 * limits go) that nothing in this slice provides evidence for. Inventing one
 * would put a guess behind a passing test.
 */

import alphabets from './alphabets.json' with { type: 'json' };
import { defineBackend } from './backend.js';
import { NemethUnsupportedError } from './errors.js';

/**
 * Typeform (BANA Rule 7.1, test/corpus/sources/Nemeth_2022.txt line 3591) named
 * as the LaTeX macro that reproduces it. 7.1 makes provision for exactly six --
 * "boldface, italic, regular, sans serif, script, and barred (double struck)"
 * (lines 3596-3598) -- and regular type carries no indicator and so no mark, so
 * the five below are the whole set. Rule 7's indicator list writes script `@`
 * = `⠈` (line 3563) and barred `,_` = `⠠⠸` (line 3564); the Rule 2 summary list
 * agrees (lines 717-718).
 *
 * Script is here as a macro but is refused on a LETTER by `withTypeform`, and
 * the split is deliberate -- see the note there.
 */
const TYPEFORM_MACRO = Object.freeze({
  bold: 'mathbf',
  italic: 'mathit',
  'sans-serif': 'mathsf',
  barred: 'mathbb',
  script: 'mathscr'
});

// A LaTeX control word: a backslash and the letters that follow it.
const TRAILING_CONTROL_WORD = /\\[a-zA-Z]+$/u;
const LEADING_LETTER = /^[a-zA-Z]/u;

const SCRIPT_KINDS = new Set(['Superscript', 'Subscript', 'SubSuperscript']);

/**
 * Brace a script's base when the base is itself a script.
 *
 * `x_{1}^{2}` is LaTeX for the SIMULTANEOUS msubsup, so it is the wrong string
 * for `Superscript(Subscript(x, 1), 2)` -- the non-simultaneous `(x_1)^2` of
 * BANA Rule 14.11.2. `{x_{1}}^{2}` is the right one, and it is what makes the
 * distinction the parser recovers survive into the output. The braces are also
 * what keeps `Superscript(Superscript(x, y), z)` from emitting the double
 * superscript `x^{y}^{z}`, which LaTeX rejects outright.
 */
function scriptBase(node, emit) {
  return SCRIPT_KINDS.has(node.kind) ? `{${emit(node)}}` : emit(node);
}

function concat(pieces) {
  return pieces.reduce((left, right) =>
    TRAILING_CONTROL_WORD.test(left) && LEADING_LETTER.test(right) ? `${left} ${right}` : left + right
  , '');
}

function unsupported(node, detail) {
  return new NemethUnsupportedError({ offset: node.src ? node.src[0] : 0, detail });
}

/**
 * The glyph an alphabetic indicator plus a capitalization indicator names.
 *
 * Greek is a lookup, not a wrapper: BANA 6.1.4 assigns each Greek letter the
 * cell of an English letter, so the braille alone says "alpha" only once the
 * table is consulted. German Fraktur is a wrapper because the Code's German
 * alphabet (6.1.1) is the Latin letters in a different face.
 */
function letterGlyph(node) {
  const { alphabet, capitalization } = node.marks;
  const capital = capitalization === 'single';
  if (alphabet === 'greek') {
    const pair = alphabets.greek.letters[node.name];
    if (!pair) throw unsupported(node, `BANA ${alphabets.greek.banaRef} gives no Greek letter for "${node.name}"`);
    return pair[capital ? 1 : 0];
  }
  const glyph = capital ? node.name.toUpperCase() : node.name;
  return alphabet === 'german' ? `\\mathfrak{${glyph}}` : glyph;
}

/**
 * Wrap a rendered sign in its typeform.
 *
 * A typeform on a non-English alphabet -- Example 7-3's boldface Greek alpha
 * `_.a` (Nemeth_2022.txt line 3630) -- has no rendering here. The pipeline
 * loads the TeX packages base, ams, newcommand and noundefined (src/main/
 * mathml.js line 17); none defines a bold-Greek or bold-Fraktur macro, and
 * `noundefined` turns an invented one into red literal text instead of an
 * error. Refusing is the only honest answer available.
 */
function withTypeform(body, node) {
  const { typeform, alphabet } = node.marks;
  if (!typeform) return body;
  if (alphabet && alphabet !== 'english') {
    throw unsupported(node, `latex has no rendering for ${typeform} ${alphabet} (BANA Rule 7.2.1)`);
  }
  // Script type on a letter is the one place the Code and the oracle contradict
  // each other, and the contradiction is not ours to settle. 7.2.1 (line 3605)
  // says a typeform indicator for a LETTER "must always be followed by an
  // alphabetic indicator", so `marks.alphabet` is precisely "this typeform
  // governs a letter" -- and Appendix C spells script English `@;` = `⠈⠰`
  // (line 16446). But all 20 corpus cases written `⠈⠰` target
  // mathvariant="double-struck" (e.g. `sre-aata:AataExpression_13`, `⠈⠰⠠⠵⠦`),
  // which Rule 7 writes `,_` = `⠠⠸` (line 3564, Example 7-2 at lines 3616-3619)
  // and which NO corpus case uses as a typeform indicator (`⠠⠸` occurs once, in
  // `mathcat-rules:punct_37_17_1`, and there it is a comma abutting a
  // punctuation indicator). Emitting script would contradict the oracle
  // and emitting double-struck would contradict the Code, so this refuses and
  // says which. On a NUMERAL there is no conflict: 7.2.2 (line 3656) sends the
  // indicator to the numeric indicator instead of an alphabetic one, and
  // `mathcat-rules:boldface_32_b_2` (`⠈⠼⠆`) targets mathvariant='script',
  // agreeing with the Code -- so that form renders.
  if (typeform === 'script' && alphabet) {
    throw unsupported(
      node,
      'BANA 7.1 and Appendix C read the script-type indicator on a letter as script type, but ' +
        'every corpus case written that way targets double-struck, which the Code writes with a ' +
        'different indicator; neither reading is established, so this refuses rather than picking one'
    );
  }
  const macro = TYPEFORM_MACRO[typeform];
  // A typeform slot added to symbols.json with no macro here would otherwise
  // emit `\undefined{...}`, which `noundefined` renders as red literal text
  // rather than rejecting -- a wrong answer that survives the gate.
  if (!macro) throw unsupported(node, `latex has no macro for the ${typeform} typeform of BANA Rule 7.1`);
  return `\\${macro}{${body}}`;
}

function unrenderable(kind) {
  return (node) => {
    throw new NemethUnsupportedError({
      offset: node.src ? node.src[0] : 0,
      detail: `latex has no rendering for ${kind}`
    });
  };
}

export const toLatex = defineBackend(
  {
    Number: (node) => withTypeform(node.value, node),
    Identifier: (node) => withTypeform(letterGlyph(node), node),
    Operator: (node) => node.glyph,
    Sequence: (node, emit) => concat(node.items.map((item) => emit(item))),
    Fraction: (node, emit) => `\\frac{${emit(node.numerator)}}{${emit(node.denominator)}}`,
    Root: (node, emit) =>
      node.index === null
        ? `\\sqrt{${emit(node.radicand)}}`
        : `\\sqrt[${emit(node.index)}]{${emit(node.radicand)}}`,
    Superscript: (node, emit) => `${scriptBase(node.base, emit)}^{${emit(node.exponent)}}`,
    Subscript: (node, emit) => `${scriptBase(node.base, emit)}_{${emit(node.index)}}`,
    SubSuperscript: (node, emit) =>
      `${scriptBase(node.base, emit)}_{${emit(node.index)}}^{${emit(node.exponent)}}`,
    Fenced: (node, emit) => concat([node.open, emit(node.body), node.close]),
    FunctionCall: unrenderable('FunctionCall'),
    BigOperator: unrenderable('BigOperator'),
    Text: unrenderable('Text'),
    Hole: unrenderable('Hole')
  },
  { name: 'latex' }
);
