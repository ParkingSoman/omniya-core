/**
 * Token[] -> AST. Recursive descent, single pass, no backtracking, no modes.
 *
 * Grammar:
 *   expression := postfix ( OP? postfix )*
 *   postfix    := primary script*
 *   primary    := Number | Identifier | Fraction | Root
 *
 * `expression` is FLAT: one `Sequence` holding operands and operators in source
 * order, never a nested one. There are no precedence tiers, because grouping by
 * precedence is an assertion about operator binding, and Nemeth does not encode
 * it -- the code is structurally explicit (this fraction has this numerator) and
 * semantically silent (it never says that is division over the reals). The
 * target is Presentation MathML, which is flat for the same reason:
 * `<mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>`. Tier nesting would have made
 * `Sequence` -- the node whose contract is that it asserts nothing -- the one
 * place binding got asserted.
 *
 * An operator between two operands is therefore optional and carries no weight:
 * `a+b` and `ab` differ only in whether an `Operator` item sits between them.
 * What the loop does still enforce is that an operator has an operand on each
 * side, so `a+` and `+a` are refused rather than yielding a dangling item.
 *
 * Scripts are attached here, not in `levels.js`: a token at level `P + '^'`
 * belongs to the base parsed at level `P`, which is a prefix test on the
 * absolute level paths. A script operand is a `postfix`, not a full expression
 * -- a relation inside a script has to restate its own level indicator, which
 * is out of scope.
 *
 * Two productions of the designed grammar are absent because no symbol row can
 * reach them yet, and an unreachable branch is a place for a wrong guess to hide:
 * `unary := (+|-|±)? postfix`, which needs a row marking an operator as usable
 * as a prefix, and
 * `Fenced` in `primary`, which needs a grouping symbol. Both are additions to
 * this file when their rows arrive.
 */

import {
  Fraction,
  Identifier,
  Number,
  Operator,
  Root,
  Sequence,
  SubSuperscript,
  Subscript,
  Superscript
} from './ast.js';
import { NemethUnsupportedError } from './errors.js';

const TERM_STARTS = new Set(['numeric', 'digit', 'letter', 'fracOpen', 'radOpen']);

function peek(state) {
  return state.index < state.tokens.length ? state.tokens[state.index] : null;
}

function advance(state) {
  const token = state.tokens[state.index];
  state.index += 1;
  return token;
}

function unsupported(state, detail) {
  const token = peek(state) ?? state.tokens[state.tokens.length - 1] ?? null;
  return new NemethUnsupportedError({
    offset: token ? token.offset : 0,
    cells: token ? token.cells : '',
    detail
  });
}

function spanFrom(state, startIndex) {
  const first = state.tokens[startIndex];
  const last = state.tokens[state.index - 1];
  if (!first || !last) return null;
  return [first.offset, last.offset + last.len];
}

function expect(state, kind, detail) {
  const token = peek(state);
  if (!token || token.kind !== kind) throw unsupported(state, detail);
  return advance(state);
}

function atLevel(state, level) {
  const token = peek(state);
  return Boolean(token) && token.level === level;
}

// -- primary -----------------------------------------------------------------

function parseNumber(state, level, marks) {
  const start = state.index;
  const numeric = peek(state).kind === 'numeric' ? advance(state) : null;
  let digits = '';
  while (atLevel(state, level) && peek(state).kind === 'digit') digits += advance(state).value;
  if (!digits) throw unsupported(state, 'numeric indicator is not followed by a numeral');
  return Number(digits, {
    src: spanFrom(state, start),
    marks: { ...marks, numericIndicator: Boolean(numeric) }
  });
}

function parseFraction(state, level, marks) {
  const start = state.index;
  advance(state);
  const numerator = parseExpression(state, level);
  expect(state, 'fracLine', 'simple fraction has no fraction line');
  const denominator = parseExpression(state, level);
  expect(state, 'fracClose', 'simple fraction is not closed');
  return Fraction(numerator, denominator, {
    src: spanFrom(state, start),
    marks: { ...marks, fractionOrder: 'simple' }
  });
}

function parseRoot(state, level, marks) {
  const start = state.index;
  advance(state);
  const radicand = parseExpression(state, level);
  expect(state, 'radClose', 'radical has no termination indicator');
  return Root(radicand, null, { src: spanFrom(state, start), marks });
}

function parsePrimary(state, level) {
  const token = peek(state);
  if (!token || token.level !== level || !TERM_STARTS.has(token.kind)) {
    throw unsupported(state, `expected the start of a term at level "${level}"`);
  }
  const start = state.index;
  // An explicit baseline indicator before this token is the only carrier of the
  // `x_1^2` vs `(x_1)^2` distinction (Rule 14.11.2), so it is recorded as a mark.
  const marks = token.afterBaseline ? { afterBaseline: true } : {};
  switch (token.kind) {
    case 'fracOpen':
      return parseFraction(state, level, marks);
    case 'radOpen':
      return parseRoot(state, level, marks);
    case 'letter':
      advance(state);
      return Identifier(token.value, { src: spanFrom(state, start), marks });
    default:
      return parseNumber(state, level, marks);
  }
}

// -- postfix -----------------------------------------------------------------

function scriptSlot(state, level) {
  const token = peek(state);
  if (!token) return null;
  const extendsByOne = token.level.length === level.length + 1 && token.level.startsWith(level);
  if (!extendsByOne) return null;
  return token.level.slice(level.length);
}

function parsePostfix(state, level) {
  const start = state.index;
  const node = parsePrimary(state, level);
  const scripts = new Map();
  for (let slot = scriptSlot(state, level); slot; slot = scriptSlot(state, level)) {
    if (scripts.has(slot)) throw unsupported(state, `a second "${slot}" script on the same base`);
    scripts.set(slot, parsePostfix(state, level + slot));
  }
  if (scripts.size === 0) return node;
  const src = spanFrom(state, start);
  if (scripts.size === 2) return SubSuperscript(node, scripts.get('_'), scripts.get('^'), { src });
  return scripts.has('^')
    ? Superscript(node, scripts.get('^'), { src })
    : Subscript(node, scripts.get('_'), { src });
}

// -- expression --------------------------------------------------------------

function isOperatorAt(state, level) {
  const token = peek(state);
  return Boolean(token) && token.level === level && token.kind === 'op';
}

function isTermAt(state, level) {
  return atLevel(state, level) && TERM_STARTS.has(peek(state).kind);
}

function parseExpression(state, level) {
  const start = state.index;
  const items = [parsePostfix(state, level)];
  while (isOperatorAt(state, level) || isTermAt(state, level)) {
    if (isOperatorAt(state, level)) {
      const token = advance(state);
      items.push(Operator(token.value, { src: [token.offset, token.offset + token.len] }));
    }
    // An operator must be followed by an operand; parsePostfix refuses if not.
    items.push(parsePostfix(state, level));
  }
  return items.length === 1 ? items[0] : Sequence(items, { src: spanFrom(state, start) });
}

export function parse(tokens, context = {}) {
  const state = { tokens, index: 0, context };
  const node = parseExpression(state, '');
  if (state.index < tokens.length) {
    throw unsupported(state, `unparsed ${peek(state).kind} token at level "${peek(state).level}"`);
  }
  return node;
}
