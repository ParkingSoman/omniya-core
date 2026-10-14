import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanMathML, docToHtml, docToLatex, docToText, escapeHtml, escapeLatex,
  exportFileName, isDisplayEquation
} from '../../src/domain/export.js';

const MATH = (inner, extra = '') => `<math xmlns="http://www.w3.org/1998/Math/MathML"${extra}>${inner}</math>`;
const math = (source, mathml = MATH('<mi>x</mi>')) => ({ type: 'math', attrs: { mathml, source, sourceKind: 'latex' } });
const text = (t) => ({ type: 'text', text: t });
const para = (...content) => ({ type: 'paragraph', content });

const latexFor = (attrs) => `L(${attrs.source})`;

const doc = {
  type: 'doc',
  content: [
    para(text('Plain words.')),
    para(text('Solve '), math('x^2', MATH('<mi data-omniya-id="n1">x</mi>', ' data-omniya-root="r"')), text(' now.')),
    para(math('\\frac{a}{b}', MATH('<mfrac><mi>a</mi><mi>b</mi></mfrac>', ' data-omniya-root="r2"'))),
    { type: 'paragraph' },
    para(text('1 < 2 & 3 $ 4 % 5'))
  ]
};

test('exportFileName strips unsafe characters and adds the extension', () => {
  assert.equal(exportFileName('Plan: a/b?', 'html'), 'Plan ab.html');
  assert.equal(exportFileName('../../etc/passwd', 'txt'), 'etcpasswd.txt');
  assert.equal(exportFileName('a*b|c"d<e>f\\g', 'tex'), 'abcdefg.tex');
});

test('exportFileName keeps letters from other scripts and plain separators', () => {
  assert.equal(exportFileName('Математика 数学', 'txt'), 'Математика 数学.txt');
  assert.equal(exportFileName('my_note-2', 'tex'), 'my_note-2.tex');
});

test('exportFileName trims and collapses spaces', () => {
  assert.equal(exportFileName('   a    b \t c  ', 'txt'), 'a b c.txt');
});

test('exportFileName never gives an empty name', () => {
  for (const bad of ['', '   ', '???', '///', null, undefined]) {
    assert.equal(exportFileName(bad, 'html'), 'note.html');
  }
});

test('exportFileName caps the length', () => {
  assert.equal(exportFileName('x'.repeat(500), 'txt'), `${'x'.repeat(80)}.txt`);
});

test('escapeHtml escapes the four markup characters', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(escapeHtml('plain'), 'plain');
});

test('escapeLatex escapes every special character', () => {
  assert.equal(escapeLatex('\\'), '\\textbackslash{}');
  assert.equal(escapeLatex('{'), '\\{');
  assert.equal(escapeLatex('}'), '\\}');
  assert.equal(escapeLatex('$'), '\\$');
  assert.equal(escapeLatex('&'), '\\&');
  assert.equal(escapeLatex('#'), '\\#');
  assert.equal(escapeLatex('^'), '\\textasciicircum{}');
  assert.equal(escapeLatex('_'), '\\_');
  assert.equal(escapeLatex('%'), '\\%');
  assert.equal(escapeLatex('~'), '\\textasciitilde{}');
  assert.equal(escapeLatex('plain text 1+1'), 'plain text 1+1');
});

test('escapeLatex does not re-escape its own output', () => {
  assert.equal(escapeLatex('a\\b{c}'), 'a\\textbackslash{}b\\{c\\}');
});

test('cleanMathML removes data-omniya attributes only', () => {
  const cleaned = cleanMathML('<math display="block" data-omniya-root="r"><mi data-omniya-id="n1" mathvariant="italic">x</mi></math>');
  assert.equal(cleaned, '<math display="block"><mi mathvariant="italic">x</mi></math>');
  assert.equal(cleanMathML('<math data-other="1"><mi>x</mi></math>'), '<math data-other="1"><mi>x</mi></math>');
});

test('isDisplayEquation is true only for a paragraph holding one equation', () => {
  assert.equal(isDisplayEquation(para(math('x'))), true);
  assert.equal(isDisplayEquation(para(text('a'), math('x'))), false);
  assert.equal(isDisplayEquation(para(math('x'), math('y'))), false);
  assert.equal(isDisplayEquation(para(text('a'))), false);
  assert.equal(isDisplayEquation({ type: 'paragraph' }), false);
});

test('docToHtml makes a titled, escaped page with display and inline math', () => {
  const html = docToHtml('Notes <1> & "more"', doc);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Notes &lt;1&gt; &amp; &quot;more&quot;<\/title>/);
  assert.match(html, /<h1>Notes &lt;1&gt; &amp; &quot;more&quot;<\/h1>/);
  assert.ok(!html.includes('data-omniya'));
  const displayMath = html.match(/<p class="display">(<math[^>]*>)/);
  assert.ok(displayMath, 'display paragraph present');
  assert.match(displayMath[1], /display="block"/);
  const inline = html.match(/<p>Solve (<math[^>]*>)/);
  assert.ok(inline, 'inline equation sits in a sentence');
  assert.ok(!/display=/.test(inline[1]));
  assert.match(html, /1 &lt; 2 &amp; 3 \$ 4 % 5/);
  assert.ok(!html.includes('1 < 2'));
});

test('docToHtml skips empty paragraphs', () => {
  const html = docToHtml('T', doc);
  assert.equal((html.match(/<p[ >]/g) ?? []).length, 4);
  assert.ok(!html.includes('<p></p>'));
});

test('docToLatex makes a document with inline and display math and escaped text', () => {
  const tex = docToLatex('Cost & 50%', doc, latexFor);
  assert.match(tex, /\\documentclass\{article\}/);
  assert.match(tex, /\\begin\{document\}/);
  assert.match(tex, /\\end\{document\}/);
  assert.match(tex, /\\title\{Cost \\& 50\\%\}/);
  assert.ok(tex.includes('Solve \\(L(x^2)\\) now.'));
  assert.ok(tex.includes('\\[\nL(\\frac{a}{b})\n\\]'));
  assert.ok(tex.includes('1 < 2 \\& 3 \\$ 4 \\% 5'));
  assert.ok(tex.includes('Plain words.\n\nSolve'));
  assert.ok(!tex.includes('\n\n\n\n'));
});

test('docToText writes dollar-sign math, title first, blank line between paragraphs', () => {
  const out = docToText('My note', doc, latexFor);
  assert.ok(out.startsWith('My note\n\n'));
  assert.equal(out, [
    'My note',
    '',
    'Plain words.',
    '',
    'Solve $L(x^2)$ now.',
    '',
    '$$L(\\frac{a}{b})$$',
    '',
    '1 < 2 & 3 $ 4 % 5',
    ''
  ].join('\n'));
});

test('latexFor is given the equation attributes', () => {
  const seen = [];
  docToText('T', doc, (attrs) => { seen.push(attrs.source); return 'q'; });
  assert.deepEqual(seen, ['x^2', '\\frac{a}{b}']);
});
