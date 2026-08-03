import assert from 'node:assert/strict';
import test from 'node:test';

import { convertLatexToMathML } from '../../src/main/mathml.js';

test('converts identifiers and superscripts to serialized MathML', async () => {
  const mathml = await convertLatexToMathML('x^2 + y^2');

  assert.match(mathml, /^<math\b/);
  assert.match(mathml, /xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
  assert.match(mathml, /<msup/);
  assert.doesNotMatch(mathml, /<mjx-container|<svg/i);
});

test('supports fractions, unicode, and selected AMS environments', async () => {
  const fraction = await convertLatexToMathML('\\frac{α}{2}');
  const aligned = await convertLatexToMathML('\\begin{aligned}a&=b\\\\c&=d\\end{aligned}');

  assert.match(fraction, /<mfrac/);
  assert.match(fraction, /(?:α|&#x3B1;)/);
  assert.match(aligned, /<mtable/);
});

test('retains traceable LaTeX metadata', async () => {
  const mathml = await convertLatexToMathML('x+1');
  assert.match(mathml, /data-latex="x\+1"/);
});

test('rejects blank input with a user-safe message', async () => {
  await assert.rejects(() => convertLatexToMathML('   '), {
    message: 'LaTeX source is required.'
  });
});

test('rejects malformed LaTeX without exposing an internal stack', async () => {
  await assert.rejects(() => convertLatexToMathML('\\frac{1}{'), {
    message: 'The LaTeX could not be converted. Check its syntax.'
  });
});

test('escapes HTML-like text instead of emitting executable elements', async () => {
  const mathml = await convertLatexToMathML('\\text{<script>alert(1)</script>}');

  assert.doesNotMatch(mathml, /<script>/i);
  assert.match(mathml, /&lt;script&gt;/i);
});
