import { convertLatexToMathML } from './mathml.js';
import { canonicalizeMathML, parseMathML, replaceMathTarget, serializeMathML, structuralEquivalent } from '../domain/math-tree.js';
import { applyMathTransition } from '../domain/guided-nemeth/index.js';

function latexFromMathML(tree) {
  if (!tree) return '';
  if (tree.text !== undefined) return tree.text;
  const children = tree.children ?? [];
  const body = () => children.map(latexFromMathML).join('');
  switch (tree.name) {
    case 'math': case 'mrow': case 'mtd': case 'mtr': return body();
    case 'mi': case 'mn': case 'mtext': return body();
    case 'mo': return ({ '−': '-', '×': '\\times', '÷': '\\div', '∫': '\\int', '∑': '\\sum', '∏': '\\prod', '≤': '\\le', '≥': '\\ge', '∞': '\\infty' }[body()] ?? body());
    case 'mfrac': return `\\frac{${latexFromMathML(children[0])}}{${latexFromMathML(children[1])}}`;
    case 'msup': return `${latexFromMathML(children[0])}^{${latexFromMathML(children[1])}}`;
    case 'msub': return `${latexFromMathML(children[0])}_{${latexFromMathML(children[1])}}`;
    case 'msubsup': return `${latexFromMathML(children[0])}_{${latexFromMathML(children[1])}}^{${latexFromMathML(children[2])}}`;
    case 'msqrt': return `\\sqrt{${latexFromMathML(children[0])}}`;
    case 'mroot': return `\\sqrt[${latexFromMathML(children[1])}]{${latexFromMathML(children[0])}}`;
    case 'mover': return `\\overline{${latexFromMathML(children[0])}}`;
    case 'munder': return `\\underline{${latexFromMathML(children[0])}}`;
    case 'munderover': return `${latexFromMathML(children[0])}_{${latexFromMathML(children[1])}}^{${latexFromMathML(children[2])}}`;
    case 'mtable': return `\\begin{matrix}${children.map((row) => (row.children ?? []).map(latexFromMathML).join(' & ')).join(' \\\\ ')}\\end{matrix}`;
    case 'menclose': return tree.attrs?.notation === 'longdiv' ? `\\left|${body()}\\right|` : body();
    default: return body();
  }
}

export async function importLatex(source) {
  const mathml = canonicalizeMathML(await convertLatexToMathML(source));
  const tree = parseMathML(mathml);
  return { formatVersion: 2, mathml, latex: source.trim(), focus: null, tree };
}

export function applyMathTransitionInDocument(payload) {
  return applyMathTransition(payload);
}

export async function replaceMathTargetInDocument({ document, target, replacementLatex }) {
  if (!document?.mathml) throw new TypeError('Math document is required');
  const replacement = parseMathML(canonicalizeMathML(await convertLatexToMathML(replacementLatex)));
  const current = parseMathML(document.mathml);
  const old = serializeMathML(current);
  const replacementNode = replacement.children.find((child) => child.text === undefined);
  if (!replacementNode) throw new SyntaxError('Replacement LaTeX produced no MathML element');
  const next = replaceMathTarget(current, target, replacementNode);
  const mathml = serializeMathML(next);
  const inversePatch = { document: { ...document }, target, replacementMathML: old };
  return { document: { ...document, formatVersion: 2, mathml, focus: target }, cursor: target, inversePatch, structuralChanged: !structuralEquivalent(current, next) };
}

export async function exportLatex(document) {
  if (!document?.mathml) throw new TypeError('Math document is required');
  return document.latex || latexFromMathML(parseMathML(document.mathml));
}
