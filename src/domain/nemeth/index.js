/**
 * Nemeth braille -> AST -> LaTeX.
 *
 * Pure and synchronous by design. MathML is deliberately NOT produced here: the
 * caller pipes `latex` through the existing convertLatexToMathML pipeline in
 * src/main, so Nemeth-authored and LaTeX-authored expressions yield byte-identical
 * MathML instead of drifting apart behind two separate generators. That also keeps
 * this module inside src/domain, which never imports from src/main.
 */

import { lex } from './lexer.js';
import { resolveLevels } from './levels.js';
import { parse } from './parser.js';
import { toLatex } from './latex.js';

export { NemethUnsupportedError, UNSUPPORTED_MESSAGE } from './errors.js';

export function parseNemeth(input, options = {}) {
  const diagnostics = [];
  const context = { ...options, diagnostics };
  const tokens = resolveLevels(lex(input, context), context);
  const ast = parse(tokens, context);
  return { ast, latex: toLatex(ast), diagnostics };
}
