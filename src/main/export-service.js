import { validateDoc } from '../domain/document.js';
import {
  EXPORT_FORMATS,
  docToHtml,
  docToLatex,
  docToText,
  exportFileName
} from '../domain/export.js';
import { parseMathML } from '../domain/math-tree.js';
import { latexFromMathML } from './math-service.js';

/**
 * The LaTeX of one equation. What the person typed is best, when it was LaTeX and
 * the equation has not been edited by parts since (an edit by parts clears it).
 * Otherwise it is worked out from the MathML.
 */
export function equationLatex(attrs) {
  if (attrs.sourceKind === 'latex' && attrs.source.trim() !== '') return attrs.source.trim();
  return latexFromMathML(parseMathML(attrs.mathml)).trim();
}

/** Build the file for a note. Throws a plain Error for a bad request. */
export function buildExport({ format, name, doc }) {
  const spec = EXPORT_FORMATS[format];
  if (!spec) throw new Error('Unknown export format');
  if (typeof name !== 'string' || name.trim() === '') throw new Error('A note name is required');
  const issues = validateDoc(doc);
  if (issues.length > 0) throw new Error(`The note could not be exported: ${issues[0]}`);

  const content = format === 'html'
    ? docToHtml(name, doc)
    : format === 'latex'
      ? docToLatex(name, doc, equationLatex)
      : docToText(name, doc, equationLatex);
  return { fileName: exportFileName(name, spec.extension), content, spec };
}
