import assert from 'node:assert/strict';
import test from 'node:test';
import { exportLatex, importLatex } from '../../src/main/math-service.js';

test('explicit LaTeX import/export remains an interoperability projection, not the editor surface', async () => {
  const document = await importLatex('\\frac{x}{y^2}');
  assert.equal(document.formatVersion, 2);
  assert.match(await exportLatex(document), /\\frac/);
});
