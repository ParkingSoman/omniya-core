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

import { defineBackend } from './backend.js';
import { NemethUnsupportedError } from './errors.js';

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
    Number: (node) => node.value,
    Identifier: (node) => node.name,
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
