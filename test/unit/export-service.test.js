import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, equationLatex } from '../../src/main/export-service.js';
import { convertLatexToMathML } from '../../src/main/mathml.js';
import { canonicalizeMathML } from '../../src/domain/math-tree.js';

const text = (t) => ({ type: 'text', text: t });
const para = (...content) => ({ type: 'paragraph', content });
const mathAttrs = (mathml, source, sourceKind = 'latex') => ({ mathml, source, sourceKind });

let fraction;
test.before(async () => {
  fraction = canonicalizeMathML(await convertLatexToMathML('\\frac{a}{b}'));
});

test('equationLatex uses the typed LaTeX when it is LaTeX and not empty', () => {
  assert.equal(equationLatex(mathAttrs(fraction, '  \\dfrac{a}{b}  ')), '\\dfrac{a}{b}');
});

test('equationLatex works LaTeX out from the MathML when the source is empty', () => {
  assert.equal(equationLatex(mathAttrs(fraction, '')), '\\frac{a}{b}');
  assert.equal(equationLatex(mathAttrs(fraction, '   ')), '\\frac{a}{b}');
});

test('equationLatex ignores the source of a nemeth equation', () => {
  assert.equal(equationLatex(mathAttrs(fraction, '⠹⠁⠌⠃⠼', 'nemeth')), '\\frac{a}{b}');
});

function sampleDoc() {
  return {
    type: 'doc',
    content: [
      para(text('Half is ')),
      para({ type: 'math', attrs: mathAttrs(fraction, '') }),
      para(text('and '), { type: 'math', attrs: mathAttrs(fraction, 'a/b') })
    ]
  };
}

test('buildExport returns the right file name and content for each format', () => {
  const cases = { html: 'html', latex: 'tex', text: 'txt' };
  for (const [format, extension] of Object.entries(cases)) {
    const result = buildExport({ format, name: 'My note', doc: sampleDoc() });
    assert.equal(result.fileName, `My note.${extension}`);
    assert.ok(result.content.length > 0);
    assert.equal(result.spec.extension, extension);
  }
});

test('buildExport content carries the equations in each format', () => {
  const html = buildExport({ format: 'html', name: 'N', doc: sampleDoc() }).content;
  assert.match(html, /<mfrac>/);
  const tex = buildExport({ format: 'latex', name: 'N', doc: sampleDoc() }).content;
  assert.ok(tex.includes('\\[\n\\frac{a}{b}\n\\]'));
  assert.ok(tex.includes('\\(a/b\\)'));
  const txt = buildExport({ format: 'text', name: 'N', doc: sampleDoc() }).content;
  assert.ok(txt.includes('$$\\frac{a}{b}$$'));
  assert.ok(txt.includes('$a/b$'));
});

test('buildExport makes a safe file name', () => {
  assert.equal(buildExport({ format: 'text', name: 'Plan: a/b?', doc: sampleDoc() }).fileName, 'Plan ab.txt');
});

test('buildExport rejects an unknown format', () => {
  assert.throws(() => buildExport({ format: 'pdf', name: 'N', doc: sampleDoc() }), /Unknown export format/);
  assert.throws(() => buildExport({ name: 'N', doc: sampleDoc() }), /Unknown export format/);
});

test('buildExport rejects an empty or missing name', () => {
  for (const name of ['', '   ', undefined, 5]) {
    assert.throws(() => buildExport({ format: 'html', name, doc: sampleDoc() }), /name is required/);
  }
});

test('buildExport rejects an invalid document', () => {
  for (const doc of [null, { type: 'doc', content: [] }, { type: 'doc', content: [{ type: 'heading' }] }]) {
    assert.throws(
      () => buildExport({ format: 'html', name: 'N', doc }),
      (error) => error instanceof Error && error.message.startsWith('The note could not be exported')
    );
  }
});
