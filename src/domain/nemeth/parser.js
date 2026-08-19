/**
 * Token[] -> AST. Recursive descent, single pass, no backtracking, no modes.
 *
 * Grammar:
 *   expression := terms ( BLANK comparison BLANK terms )*
 *   terms      := postfix ( OP? postfix )*
 *   postfix    := primary script*
 *   primary    := Number | Identifier | Fraction | Root
 *
 * The two productions are BANA's two spacing rules, not a precedence ladder.
 * Rule 21.13 (Nemeth_2022.txt lines 10775-10779) spaces a comparison sign on
 * both sides; Rule 20.1.2 (line 9964) leaves no space beside an operation sign
 * except in the five circumstances 20.1.1 lists (lines 9916-9963), none of
 * which this parser reads. So a blank is grammar, not whitespace: it is exactly
 * what tells `⠨⠅` the equals sign from `⠨⠅` the Greek letter kappa, and
 * dropping or collapsing one would turn `⠎⠊⠝⠀⠭` into `sinx` and
 * `⠼⠲⠲⠀⠒⠢⠆` into a single numeral.
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
 * Whether two scripts on one base are simultaneous is NOT read off the level
 * paths -- both readings put the scripts at the same two levels. The explicit
 * baseline indicator is the only thing that separates them, and `levels.js`
 * hands it over as `afterBaseline`; `parsePostfix` is where it is consumed.
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
  const promoted = Boolean(peek(state).implicit);
  // A digit carrying its own baseline indicator begins a new script event and is
  // not more of this numeral. Rule 14.11.2 makes `afterBaseline` the carrier of
  // that distinction, and a digit run is the one place it can be silently eaten:
  // without this break `⠭⠂⠐⠰⠆` reads as x sub 12 instead of (x sub 1) sub 2 --
  // two re-based scripts merged into one wrong number, with nothing refused.
  //
  // The second break is Rule 14.6 read backwards. Where its conditions hold the
  // subscript indicator "is not used" (Nemeth_2022.txt lines 6420-6439), so a
  // digit the writer DID indicate cannot be more of a run this pass promoted
  // with no indicator at all, nor the reverse: `⠠⠏⠂⠰⠆⠐⠠⠟` is P sub 1 followed
  // by a left-subscripted Q, not P sub 12.
  while (atLevel(state, level) && peek(state).kind === 'digit') {
    if (digits && peek(state).afterBaseline) break;
    if (digits && Boolean(peek(state).implicit) !== promoted) break;
    digits += advance(state).value;
  }
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
  // `token.marks` is what the lexer's prefix pass composed onto this sign --
  // typeform, alphabet, capitalization -- and travels with it unchanged.
  const marks = { ...token.marks, ...(token.afterBaseline ? { afterBaseline: true } : {}) };
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

/**
 * A term at `level` that carries its own explicit baseline indicator, i.e. the
 * `"q` of Example 24-7 `p~b"~c"x` (Nemeth_2022.txt line 11966; the rule that
 * puts the first indicator there is 24.1.d, at line 11962).
 */
function startsBaselineTerm(state, level) {
  const token = peek(state);
  return Boolean(token) && token.afterBaseline && token.level === level && TERM_STARTS.has(token.kind);
}

function attachScript(base, slot, script, src) {
  return slot === '^' ? Superscript(base, script, { src }) : Subscript(base, script, { src });
}

/**
 * Rule 14.11 decides whether two scripts on one base are simultaneous, and the
 * explicit baseline indicator is its sole carrier -- which is why `levels.js`
 * records `afterBaseline` and why this loop reads it off the script's own first
 * token rather than off the node it parses (the mark sits on the token; a
 * script that carries scripts of its own would bury it).
 *
 * 14.11.1 (Nemeth_2022.txt lines 7234-7240): with no baseline indicator between
 * them the two scripts are simultaneous and "the subscript must be indicated
 * first" -- Example 14-121 `x;a~n`, one `msubsup`.
 * 14.11.2 (lines 7263-7267): with one, "the relative horizontal positions of
 * the signs must be retained" -- Example 14-124 `a~n";m` is (a^n)_m, so the
 * second script re-bases onto the whole postfix parsed so far.
 */
function parsePostfix(state, level) {
  const start = state.index;
  let node = parsePrimary(state, level);
  // Slots filled on the current base since the last baseline indicator.
  let filled = '';
  for (let slot = scriptSlot(state, level); slot; slot = scriptSlot(state, level)) {
    const rebased = peek(state).afterBaseline;
    const script = parsePostfix(state, level + slot);
    if (rebased && startsBaselineTerm(state, level)) {
      // Rule 14.5.1 (lines 6311-6315): a LEFT script is written exactly like a
      // right one and told apart only by sitting before the sign it applies to,
      // with the baseline indicator of 14.5.2 between them. So a script fenced
      // by baseline indicators on both sides belongs to what FOLLOWS it, not to
      // the base behind it, and nothing here can render a left script.
      throw unsupported(state, `a "${slot}" script between two baseline indicators is a left script`);
    }
    const src = spanFrom(state, start);
    if (!rebased && filled !== '') {
      if (filled !== '_' || slot !== '^') {
        throw unsupported(
          state,
          `a "${slot}" script on a base already carrying "${filled}" needs a baseline indicator before it`
        );
      }
      node = SubSuperscript(node.base, node.index, script, { src });
      filled = '_^';
      continue;
    }
    node = attachScript(node, slot, script, src);
    filled = slot;
  }
  return node;
}

// -- expression --------------------------------------------------------------

function isOperatorAt(state, level) {
  const token = peek(state);
  return Boolean(token) && token.level === level && token.kind === 'op';
}

function isTermAt(state, level) {
  return atLevel(state, level) && TERM_STARTS.has(peek(state).kind);
}

function parseTerms(state, level) {
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

// -- relation ----------------------------------------------------------------

/**
 * A comparison sign together with the two blanks BANA Rule 21.13 puts around it.
 *
 * 21.13 (Nemeth_2022.txt lines 10775-10779): "A space must be left on either
 * side of a comparison symbol. However, a space is not left between the
 * comparison symbol and any punctuation symbol, grouping symbol, or indicator
 * which applies to it." Those two blanks are the whole of the grammar: nothing
 * else in the Code writes a blank the parser can account for, so nothing else
 * consumes one.
 *
 * The test is on `role`, not on `kind`. `kind` is the grammatical category this
 * file dispatches on; `role` is the spacing class Rules 20 and 21 assign, and
 * they are not the same question -- Example 21-25 (lines 10781-10784) is
 * `x $4 y`, a SHAPE used as a comparison sign and spaced by 21.13 exactly like
 * `.k`. Keying the seam to `role` is what lets such a row arrive as data.
 *
 * The indicators of 21.13's second sentence need no handling here: `levels.js`
 * has already consumed them and stamped the level they name onto the sign, so
 * `⠀⠰⠨⠅⠀` arrives as blank, comparison-at-level-`_`, blank, and the level test
 * below is what checks the indicator applied to the sign and not to something
 * else.
 */
function comparisonSeam(state, level) {
  const before = state.tokens[state.index];
  const sign = state.tokens[state.index + 1];
  const after = state.tokens[state.index + 2];
  if (!before || before.kind !== 'blank') return null;
  if (!sign || sign.role !== 'comparison' || sign.level !== level) return null;
  if (!after || after.kind !== 'blank') return null;
  return { sign, next: state.index + 3 };
}

/**
 * `expression := terms ( BLANK comparison BLANK terms )*`
 *
 * Flat, for the reason in this file's header: a comparison sign is an item in
 * the `Sequence` beside its operands, never a node that binds them, because
 * Presentation MathML spells `x = y` as `<mi>x</mi><mo>=</mo><mi>y</mi>` and
 * Nemeth asserts no more than that either.
 *
 * A comparison sign needs a term on each side, the same discipline `parseTerms`
 * applies to an operation sign. So the lone `≡` of `sre-aata:AataExpression_330`
 * refuses: 21.13's outer space is real but there is no relation to build.
 */
function parseExpression(state, level) {
  const start = state.index;
  const items = [];
  // `parseTerms` returns either one node or a flat `Sequence` of items at this
  // same level, so its items are spread rather than nested. Nesting them would
  // make `Sequence` -- the node whose contract is that it asserts nothing --
  // assert that `a+b` binds tighter than the `=` beside it, which is exactly
  // the binding claim Nemeth does not encode and MathML does not spell.
  const push = (node) => {
    if (node.kind === 'Sequence') items.push(...node.items);
    else items.push(node);
  };
  push(parseTerms(state, level));
  for (let seam = comparisonSeam(state, level); seam; seam = comparisonSeam(state, level)) {
    state.index = seam.next;
    items.push(Operator(seam.sign.value, { src: [seam.sign.offset, seam.sign.offset + seam.sign.len] }));
    push(parseTerms(state, level));
  }
  return items.length === 1 ? items[0] : Sequence(items, { src: spanFrom(state, start) });
}

/**
 * Why a leftover blank is refused, in the Code's own terms.
 *
 * Rule 20.1.2 (line 9964) "A space is not left on either side of a symbol of
 * operation in any other situation" -- "other" than the five circumstances
 * 20.1.1 lists (lines 9916-9963): beside a comparison symbol, after a function
 * name, beside an ellipsis or dash, beside an abbreviation, or where Rule 23
 * requires it. This parser reads none of those five constructs, so a blank
 * touching an operation sign is out of scope rather than wrong, and saying so
 * with the sign named beats a bare "unparsed blank".
 */
function leftoverDetail(state) {
  const token = peek(state);
  if (token.kind !== 'blank') return `unparsed ${token.kind} token at level "${token.level}"`;
  const operation = [state.tokens[state.index - 1], state.tokens[state.index + 1]].find(
    (neighbour) => neighbour && neighbour.role === 'binary'
  );
  if (operation) {
    return (
      `BANA Rule 20.1.2 leaves no space beside the operation sign "${operation.value}", ` +
      "and none of Rule 20.1.1's five spaced circumstances is a construct this parser reads"
    );
  }
  return (
    'a blank stands where BANA Rule 21.13 does not put one -- it spaces a comparison symbol and ' +
    'nothing else here, and Rule 20.1.1 spaces an operation symbol only next to a function name, ' +
    'an abbreviation, an ellipsis or a dash, none of which this parser reads'
  );
}

export function parse(tokens, context = {}) {
  const state = { tokens, index: 0, context };
  const node = parseExpression(state, '');
  if (state.index < tokens.length) throw unsupported(state, leftoverDetail(state));
  return node;
}
