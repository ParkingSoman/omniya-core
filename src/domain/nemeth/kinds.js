/**
 * Canonical AST node-kind registry.
 *
 * Owned by the integrator, not by any single lane: `ast.js` reads it to validate
 * arity at construction time, and `backend.js` reads it to enforce exhaustive
 * dispatch. Keeping it in its own module is what lets those two depend on the
 * same list without depending on each other.
 *
 * Field order is significant — it is the positional argument order of the
 * matching constructor in `ast.js`.
 */

export const NODE_KINDS = Object.freeze({
  Number: Object.freeze(['value']),
  Identifier: Object.freeze(['name']),
  Operator: Object.freeze(['glyph']),
  Sequence: Object.freeze(['items']),
  Fraction: Object.freeze(['numerator', 'denominator']),
  Root: Object.freeze(['radicand', 'index']),
  Superscript: Object.freeze(['base', 'exponent']),
  Subscript: Object.freeze(['base', 'index']),
  SubSuperscript: Object.freeze(['base', 'index', 'exponent']),
  Fenced: Object.freeze(['open', 'body', 'close']),
  FunctionCall: Object.freeze(['name', 'argument']),
  BigOperator: Object.freeze(['glyph', 'lower', 'upper', 'body']),
  Text: Object.freeze(['value']),
  Hole: Object.freeze(['role'])
});

export const KIND_NAMES = Object.freeze(Object.keys(NODE_KINDS));
