import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../test/e2e/inline-editing.test.js', import.meta.url), 'utf8');
const required = [
  'new equations use the same empty Nemeth replacement draft and commit once',
  'renderer applies immediate, structural-followup, and atomic Nemeth codes in one real draft',
  'renderer creates a nested script and radical through compositional Nemeth cells',
  'MathJax navigation edits a nested Nemeth subexpression without widening the target',
  'MathJax-focused Nemeth editing replaces only the selected subtree with an atomic code',
  'six-key input feeds the same Nemeth draft transition as Unicode cells'
];
const missing = required.filter((name) => !source.includes(`test('${name}'`));
if (missing.length) {
  console.error(JSON.stringify({ missing }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Electron Nemeth coverage links verified: ${required.length} named workflows present.`);
}
