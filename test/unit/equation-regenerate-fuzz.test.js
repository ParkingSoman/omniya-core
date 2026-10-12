import assert from 'node:assert/strict';
import test from 'node:test';

import { convertLatexToMathML } from '../../src/main/mathml.js';
import { importLatex } from '../../src/main/math-service.js';
import { canonicalizeMathML, findMathNode, parseMathML, serializeMathML, structuralEquivalent } from '../../src/domain/math-tree.js';
import { leafNodes } from '../../src/domain/math-latex.js';
import { startReplacementSession, submitReplacement, setLatexSource } from '../../src/domain/replacement-session.js';

// One rule, tried on thousands of edits: after r, a or o on ANY part of ANY
// equation, with ANY fragment, the stored equation is exactly what a fresh parse
// of its own source gives. The explorer's boxes are worked out from that MathML,
// so this is also the rule that keeps its boxes right. There is no list of cases
// here on purpose: a new symbol or construct is covered by being in the pools.

const STARTS = [
  'x+y', 'x^2+y^2=z^2', '\\frac{a+b}{c}', '\\sqrt{x+1}', '(a+b)(c+d)', 'a_1+a_2+a_3',
  '\\sum_{i=1}^{n} i', '\\left(x+1\\right)^2', 'x=-b', '2y', '\\frac{1}{2}+\\frac{1}{3}',
  '|x|', 'f(x)=x^2', 'a<b<c', '\\int_0^1 x\\,dx', 'x^{y^z}', '-x', 'a\\cdot b-c',
  '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '\\sqrt[3]{x}', 'x\\text{ if }y', '\\overline{AB}+1',
  '\\binom{n}{k}', "f'(x)", 'a_{i,j}', '\\lim_{x\\to 0} \\frac{\\sin x}{x}', '\\mathbb{R}^n', '\\vec{v}\\cdot\\hat{u}',
  '\\begin{cases} x & x>0 \\\\ -x & x\\le 0 \\end{cases}', '\\boxed{x+1}', '\\underbrace{a+b}_{n}', '\\frac{d}{dx}x^2',
  '\\left[\\frac{a}{b}\\right]', '1+2+3+4+5', 'a=b=c', '\\pi r^2', '\\sqrt{\\frac{a}{b}}', 'x^{2}_{1}', '\\left|x\\right|'
];
const FRAGMENTS = [
  '-y', '+1', '=', '-', '--', '+-', '(', ')', '(1)', '^2', '_k', 'x^2', 'x_{i}', '\\frac{1}{2}',
  '\\sqrt{2}', '\\pm', 'y z', '1.5', '\\alpha', '\\cdot', '\\times 3', '<', '\\leq', '!', ',', '|',
  '\\text{if}', '2y', '-1', '=-', '\\infty', 'a b c d',
  '\\left(', '\\right)', '\\left(1\\right)', '&', '\\sqrt{}', '\\frac{}{}', 'x^', '_', '\\prime', "'", '\\begin{matrix}1\\end{matrix}', '\\mathbb{N}', '\\hat{a}', '\\binom{2}{1}', '\\\\', '\\,', '~'
];

// OMNIYA_FUZZ_SEED and OMNIYA_FUZZ_CHAINS let a longer hunt use other random choices. The defaults keep the test quick and repeatable.
let seed = Number(process.env.OMNIYA_FUZZ_SEED ?? 12345);
const CHAINS = Number(process.env.OMNIYA_FUZZ_CHAINS ?? 12);
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const sample = (list, count) => Array.from({ length: count }, () => list[Math.floor(random() * list.length)]);

const idsOf = (tree) => {
  const ids = [];
  const visit = (node) => {
    if (node.text !== undefined) return;
    ids.push(node.attrs['data-omniya-id']);
    node.children.forEach(visit);
  };
  visit(tree);
  return ids;
};

const leafTexts = (tree) => leafNodes(tree).map((leaf) => (leaf.children ?? []).map((c) => c.text ?? '').join('').replace('\u2212', '-').replace(/[\u2061\u2062\u2063]/g, ''));

/** The symbols the edit should leave, in order: the old ones with the typed ones put where they go. */
async function expectedLeaves(document, nodeId, placement, fragment) {
  const tree = parseMathML(document.mathml);
  const all = leafTexts(tree);
  const target = findMathNode(tree, nodeId);
  const inside = leafNodes(target);
  const first = leafNodes(tree).indexOf(inside[0]);
  const last = first + inside.length - 1;
  const typed = leafTexts(parseMathML(canonicalizeMathML(await convertLatexToMathML(fragment))));
  const want = placement === 'replace'
    ? (nodeId === tree.attrs['data-omniya-id'] ? typed : [...all.slice(0, first), ...typed, ...all.slice(last + 1)])
    : placement === 'append'
      ? [...all.slice(0, last + 1), ...typed, ...all.slice(last + 1)]
      : [...all.slice(0, first), ...typed, ...all.slice(first)];
  return { want, base: all, typed };
}

async function storedVersion(latex, withLatexAttributes) {
  if (!withLatexAttributes) return importLatex(latex);
  return { formatVersion: 2, mathml: canonicalizeMathML(await convertLatexToMathML(latex), { keepLatex: true }), focus: null };
}

test('every edit of every part gives what a fresh parse of the whole expression gives', { timeout: 300_000 }, async () => {
  let edits = 0;
  const problems = [];
  for (const start of STARTS) {
    for (const withLatexAttributes of [false, true]) {
      const document = await storedVersion(start, withLatexAttributes);
      const ids = idsOf(parseMathML(document.mathml, { keepLatex: true }));
      for (const nodeId of ids) {
        for (const placement of ['replace', 'append', 'prepend']) {
          for (const fragment of sample(FRAGMENTS, 3)) {
            const session = setLatexSource(startReplacementSession({
              document, target: { kind: 'node', nodeId }, method: 'latex', placement
            }), fragment);
            let committed;
            try {
              committed = await submitReplacement(session, { convertLatexToMathML });
            } catch {
              continue; // the converter refused the fragment, so nothing is committed
            }
            edits += 1;
            const label = `${start} (${withLatexAttributes ? 'with' : 'without'} data-latex) ${placement} ${JSON.stringify(fragment)}`;
            if (!committed.latex) { problems.push(`${label}: no source kept`); continue; }
            const stored = parseMathML(committed.document.mathml);
            const fresh = parseMathML(canonicalizeMathML(await convertLatexToMathML(committed.latex)));
            if (!structuralEquivalent(stored, fresh)) {
              problems.push(`${label}\n    source ${committed.latex}\n    stored ${serializeMathML(stored)}\n    fresh  ${serializeMathML(fresh)}`);
            }
            // Nothing typed is lost, and nothing is made up.
            const { want, base, typed } = await expectedLeaves(document, nodeId, placement, fragment);
            const got = leafTexts(stored);
            // MathJax joins relation signs that touch (= then < is one <=), as it does for a fresh parse, so compare the symbols in order, not where they split.
            // Beside a part with no outline of its own (the accent on a letter) the edit goes beside the part it belongs to, so for append and prepend the typed symbols may sit anywhere the part's edge allows.
            const anywhere = placement !== 'replace'
              && base.some((_, k) => `${base.slice(0, k).join('')}${typed.join('')}${base.slice(k).join('')}` === got.join(''));
            if (want.join('') !== got.join('') && !anywhere) {
              problems.push(`${label}: symbols are ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
            }
          }
        }
      }
    }
  }
  assert.ok(edits > 1500, `only ${edits} edits were tried`);
  assert.deepEqual(problems.slice(0, 5), [], `${problems.length} of ${edits} edits differ from a fresh parse`);
});

test('edits made one after another, each on the result of the last, stay what a fresh parse gives', { timeout: 300_000 }, async () => {
  const problems = [];
  let edits = 0;
  for (const start of STARTS) {
    for (let chain = 0; chain < CHAINS; chain += 1) {
      let document = await storedVersion(start, chain % 2 === 0);
      for (let step = 0; step < 4; step += 1) {
        const ids = idsOf(parseMathML(document.mathml, { keepLatex: true }));
        const nodeId = ids[Math.floor(random() * ids.length)];
        const placement = sample(['replace', 'append', 'prepend'], 1)[0];
        const fragment = sample(FRAGMENTS, 1)[0];
        const session = setLatexSource(startReplacementSession({
          document, target: { kind: 'node', nodeId }, method: 'latex', placement
        }), fragment);
        let committed;
        try { committed = await submitReplacement(session, { convertLatexToMathML }); } catch { continue; }
        edits += 1;
        const label = `${start} chain ${chain} step ${step + 1}: ${placement} ${JSON.stringify(fragment)}`;
        if (!committed.latex) { problems.push(`${label}: no source kept\n    equation ${parseMathML(document.mathml, { keepLatex: true }).attrs['data-latex']}\n    target ${findMathNode(parseMathML(document.mathml, { keepLatex: true }), nodeId).name}`); break; }
        const stored = parseMathML(committed.document.mathml);
        const fresh = parseMathML(canonicalizeMathML(await convertLatexToMathML(committed.latex)));
        if (!structuralEquivalent(stored, fresh)) problems.push(`${label}\n    source ${committed.latex}`);
        // The next edit starts from what was stored, with the LaTeX MathJax wrote for it.
        document = { ...committed.document, mathml: canonicalizeMathML(await convertLatexToMathML(committed.latex), { keepLatex: true }) };
      }
    }
  }
  assert.ok(edits > 600, `only ${edits} edits were tried`);
  assert.deepEqual(problems.slice(0, 5), [], `${problems.length} of ${edits} chained edits differ`);
});
