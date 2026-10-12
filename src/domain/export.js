// Turn a note's document into a file someone else can open. Pure, no I/O.
//
// An equation is written three ways: as MathML in a web page (a screen reader
// reads it), as LaTeX in a .tex file, and as LaTeX between dollar signs in plain
// text. How the LaTeX of one equation is found is the caller's job (`latexFor`),
// because the best source is what the person typed, and the fallback needs
// code that does not belong in the domain.

export const EXPORT_FORMATS = {
  html: { extension: 'html', label: 'Web page' },
  latex: { extension: 'tex', label: 'LaTeX document' },
  text: { extension: 'txt', label: 'Plain text' }
};

/** A file name from a note name: letters, numbers, spaces, dashes. Never empty. */
export function exportFileName(name, extension) {
  const base = String(name ?? '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return `${base || 'note'}.${extension}`;
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const LATEX_SPECIAL = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}'
};

export function escapeLatex(text) {
  return String(text).replace(/[\\{}$&#^_%~]/g, (c) => LATEX_SPECIAL[c]);
}

/** The editor stamps ids on MathML nodes. They mean nothing outside the app. */
export function cleanMathML(mathml) {
  return String(mathml).replace(/\s+data-omniya-[\w-]+="[^"]*"/g, '');
}

/** A paragraph that holds nothing but one equation is a display equation. */
export function isDisplayEquation(paragraph) {
  return paragraph.content?.length === 1 && paragraph.content[0].type === 'math';
}

const paragraphs = (doc) => (doc?.content ?? []).filter((block) => block.type !== 'title');
const isEmpty = (paragraph) => !paragraph.content?.length;

export function docToHtml(name, doc) {
  const body = paragraphs(doc).filter((p) => !isEmpty(p)).map((paragraph) => {
    const display = isDisplayEquation(paragraph);
    const inner = paragraph.content.map((node) => {
      if (node.type === 'text') return escapeHtml(node.text);
      const mathml = cleanMathML(node.attrs.mathml);
      return display ? mathml.replace(/^<math\b/, '<math display="block"') : mathml;
    }).join('');
    return `    <p${display ? ' class="display"' : ''}>${inner}</p>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(name)}</title>
    <style>
      body { font: 1.1rem/1.65 system-ui, sans-serif; margin: 2rem auto; max-width: 46rem; padding: 0 1rem; }
      p.display { text-align: center; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(name)}</h1>
${body}
  </body>
</html>
`;
}

export function docToLatex(name, doc, latexFor) {
  const body = paragraphs(doc).filter((p) => !isEmpty(p)).map((paragraph) => {
    if (isDisplayEquation(paragraph)) return `\\[\n${latexFor(paragraph.content[0].attrs)}\n\\]`;
    return paragraph.content.map((node) => (
      node.type === 'text' ? escapeLatex(node.text) : `\\(${latexFor(node.attrs)}\\)`
    )).join('');
  }).join('\n\n');
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\title{${escapeLatex(name)}}
\\date{}
\\begin{document}
\\maketitle

${body}

\\end{document}
`;
}

export function docToText(name, doc, latexFor) {
  const body = paragraphs(doc).filter((p) => !isEmpty(p)).map((paragraph) => {
    const display = isDisplayEquation(paragraph);
    return paragraph.content.map((node) => {
      if (node.type === 'text') return node.text;
      const latex = latexFor(node.attrs);
      return display ? `$$${latex}$$` : `$${latex}$`;
    }).join('');
  }).join('\n\n');
  return `${name}\n\n${body}\n`;
}
