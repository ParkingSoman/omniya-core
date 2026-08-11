import { convertLatexToMathML } from './mathml.js';
import { canonicalizeMathML, completionReport, parseMathML, replaceMathTarget, serializeMathML, structuralEquivalent } from '../domain/math-tree.js';
import { applyMathTransition } from '../domain/guided-nemeth/index.js';

export function latexFromMathML(tree) {
  if (!tree) return '';
  if (tree.text !== undefined) return tree.text;
  const children = tree.children ?? [];
  const body = () => children.map(latexFromMathML).join('');
  switch (tree.name) {
    case 'math': case 'mrow': case 'mtd': case 'mtr': return body();
    case 'mi': case 'mn': case 'mtext': return body();
    case 'mspace': return ' ';
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
    case 'mmultiscripts': {
      const base = latexFromMathML(children[0]);
      const prescript = children.indexOf(children.find((child) => child.name === 'mprescripts'));
      const post = prescript < 0 ? children.slice(1) : children.slice(1, prescript);
      const pre = prescript < 0 ? [] : children.slice(prescript + 1);
      const pairLatex = (pair) => {
        const sub = pair?.[0]?.name === 'none' ? '' : latexFromMathML(pair?.[0] ?? { text: '' });
        const sup = pair?.[1]?.name === 'none' ? '' : latexFromMathML(pair?.[1] ?? { text: '' });
        return `${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}`;
      };
      let output = base;
      for (let i = 0; i < post.length; i += 2) output += pairLatex(post.slice(i, i + 2));
      if (pre.length) output = `\\prescript{${latexFromMathML(pre[1] ?? { text: '' })}}{${latexFromMathML(pre[0] ?? { text: '' })}}${output}`;
      return output;
    }
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
  const normalizedLatex = latexFromMathML(next);
  if (!normalizedLatex.trim()) throw new SyntaxError('Replacement produced an empty mathematical document');
  const roundTrip = parseMathML(canonicalizeMathML(await convertLatexToMathML(normalizedLatex)));
  if (!structuralEquivalent(next, roundTrip)) {
    throw new Error('MathML replacement failed structural LaTeX round-trip validation');
  }
  const inversePatch = { document: { ...document }, target, replacementMathML: old };
  return { document: { ...document, formatVersion: 2, mathml, focus: target, latex: normalizedLatex }, cursor: target, inversePatch, structuralChanged: !structuralEquivalent(current, next) };
}

export async function exportLatex(document) {
  if (!document?.mathml) throw new TypeError('Math document is required');
  const tree = parseMathML(document.mathml);
  if (!completionReport(tree).complete) {
    const paths = completionReport(tree).holes.map(({ path }) => path.join('.')).join(', ');
    throw new Error(`Cannot export incomplete mathematics; empty slots: ${paths}`);
  }
  return latexFromMathML(tree);
}
