import assert from 'node:assert/strict';
import test from 'node:test';
import { exportLatex, importLatex, replaceMathTargetInDocument } from '../../src/main/math-service.js';
import { parseMathML } from '../../src/domain/math-tree.js';

test('explicit LaTeX import/export remains an interoperability projection, not the editor surface', async () => {
  const document = await importLatex('\\frac{x}{y^2}');
  assert.equal(document.formatVersion, 2);
  assert.match(await exportLatex(document), /\\frac/);
});

test('LaTeX export is regenerated from the current tree after a structural replacement', async () => {
  const document = await importLatex('x+1');
  const tree = parseMathML(document.mathml);
  const target = tree.children.find((node) => node.name === 'mo');
  const result = await replaceMathTargetInDocument({
    document,
    target: { kind: 'node', nodeId: target.attrs['data-omniya-id'] },
    replacementLatex: '-'
  });
  assert.equal(await exportLatex(result.document), 'x-1');
});

test('incomplete guided documents cannot be exported as completed mathematics', async () => {
  const document = await importLatex('x');
  document.mathml = document.mathml.replace('</math>', '<mfrac><mrow data-omniya-hole="true"><mspace width="1em"/></mrow><mrow data-omniya-hole="true"><mspace width="1em"/></mrow></mfrac></math>');
  await assert.rejects(() => exportLatex(document), /incomplete mathematics/);
});
