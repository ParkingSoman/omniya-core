/**
 * AST -> LaTeX, as an exhaustive dispatch table.
 *
 * `defineBackend` checks the table against the kind registry at import time, so
 * a kind added to `kinds.js` without a rendering here fails at startup rather
 * than producing a wrong string at runtime. There is no default branch and no
 * opt-out.
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
    Sequence: (node, emit) => node.items.map((item) => emit(item)).join(''),
    Fraction: (node, emit) => `\\frac{${emit(node.numerator)}}{${emit(node.denominator)}}`,
    Root: (node, emit) =>
      node.index === null
        ? `\\sqrt{${emit(node.radicand)}}`
        : `\\sqrt[${emit(node.index)}]{${emit(node.radicand)}}`,
    Superscript: (node, emit) => `${emit(node.base)}^{${emit(node.exponent)}}`,
    Subscript: (node, emit) => `${emit(node.base)}_{${emit(node.index)}}`,
    SubSuperscript: (node, emit) =>
      `${emit(node.base)}_{${emit(node.index)}}^{${emit(node.exponent)}}`,
    Fenced: (node, emit) => `${node.open}${emit(node.body)}${node.close}`,
    FunctionCall: unrenderable('FunctionCall'),
    BigOperator: unrenderable('BigOperator'),
    Text: unrenderable('Text'),
    Hole: unrenderable('Hole')
  },
  { name: 'latex' }
);
