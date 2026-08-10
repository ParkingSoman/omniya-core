import { convertLatexToMathML } from './mathml.js';
import { canonicalizeMathML, parseMathML, replaceMathTarget, serializeMathML, structuralEquivalent } from '../domain/math-tree.js';

function latexFromMathML(tree) {
  const value = tree?.attrs?.['data-latex'];
  if (value) return value;
  if (tree?.text !== undefined) return tree.text;
  return (tree?.children ?? []).map(latexFromMathML).join('');
}

export async function importLatex(source) {
  const mathml = canonicalizeMathML(await convertLatexToMathML(source));
  const tree = parseMathML(mathml);
  return { formatVersion: 1, mathml, latex: source.trim(), cursor: null, tree };
}

export async function replaceMathTargetInDocument({ document, target, replacementLatex }) {
  if (!document?.mathml) throw new TypeError('Math document is required');
  const replacement = parseMathML(canonicalizeMathML(await convertLatexToMathML(replacementLatex)));
  const current = parseMathML(document.mathml);
  const old = serializeMathML(current);
  const next = replaceMathTarget(current, target, replacement.children[0]);
  const mathml = serializeMathML(next);
  const inversePatch = { document: { ...document }, target, replacementMathML: old };
  return { document: { ...document, mathml, latex: latexFromMathML(next), cursor: target }, cursor: target, inversePatch, structuralChanged: !structuralEquivalent(current, next) };
}

export async function exportLatex(document) {
  if (!document?.mathml) throw new TypeError('Math document is required');
  return document.latex || latexFromMathML(parseMathML(document.mathml));
}
