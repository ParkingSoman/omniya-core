/**
 * Write a MathML tree back as LaTeX, so an edited expression can be converted
 * again from one string. The result is then exactly what a fresh parse of that
 * expression gives, never a tree that was spliced together by hand.
 *
 * MathJax puts `data-latex` on every node it makes. A node that still has it
 * was not touched, so its text is reused as it is. A node without it was made
 * or changed by an edit, and is written from its children. Anything this file
 * cannot write returns `null`, and the caller keeps the spliced tree instead.
 */

const MO = new Map([
  ['+', '+'], ['-', '-'], ['−', '-'], ['=', '='], ['<', '<'], ['>', '>'],
  ['(', '('], [')', ')'], ['[', '['], [']', ']'], [',', ','], ['.', '.'],
  [';', ';'], [':', ':'], ['!', '!'], ['/', '/'], ['|', '|'],
  ['×', '\\times'], ['·', '\\cdot'], ['÷', '\\div'], ['±', '\\pm'],
  ['≤', '\\leq'], ['≥', '\\geq'], ['≠', '\\neq'], ['≈', '\\approx'],
  ['∞', '\\infty']
]);

const elements = (node) => (node.children ?? []).filter((child) => child.text === undefined);
const textOf = (node) => (node.children ?? []).map((child) => child.text ?? '').join('');

function leafLatex(node) {
  const text = textOf(node);
  if (node.name === 'mn' && /^[0-9.]+$/.test(text)) return text;
  if (node.name === 'mi' && /^[A-Za-z]$/.test(text)) return text;
  if (node.name === 'mo' && MO.has(text)) return MO.get(text);
  return null;
}

/** The LaTeX of one node, or null when it cannot be written. */
function write(node) {
  const known = node.attrs?.['data-latex'];
  if (typeof known === 'string' && known !== '') return known;
  const kids = elements(node);
  if (!kids.length) return leafLatex(node);

  const parts = kids.map(write);
  if (parts.includes(null)) return null;
  const group = (value) => `{${value}}`;
  switch (node.name) {
    case 'math':
    case 'mrow':
    case 'mstyle':
      return parts.join(' ');
    case 'msup': return kids.length === 2 ? `${group(parts[0])}^${group(parts[1])}` : null;
    case 'msub': return kids.length === 2 ? `${group(parts[0])}_${group(parts[1])}` : null;
    case 'msubsup': return kids.length === 3 ? `${group(parts[0])}_${group(parts[1])}^${group(parts[2])}` : null;
    case 'mfrac': return kids.length === 2 ? `\\frac${group(parts[0])}${group(parts[1])}` : null;
    case 'msqrt': return `\\sqrt${group(parts.join(' '))}`;
    case 'mroot': return kids.length === 2 ? `\\sqrt[${parts[1]}]${group(parts[0])}` : null;
    case 'mover': return kids.length === 2 ? `\\overset${group(parts[1])}${group(parts[0])}` : null;
    case 'munder': return kids.length === 2 ? `\\underset${group(parts[1])}${group(parts[0])}` : null;
    case 'munderover':
      return kids.length === 3 ? `\\overset${group(parts[2])}{\\underset${group(parts[1])}${group(parts[0])}}` : null;
    default: return null;
  }
}

export function latexFromTree(tree) {
  if (!tree || tree.name !== 'math') return null;
  const latex = write(tree);
  return latex && latex.trim() ? latex.trim() : null;
}

/** Leaves (elements with no element children) in reading order. */
export function leafNodes(tree) {
  const out = [];
  const visit = (node) => {
    if (node.text !== undefined) return;
    const kids = elements(node);
    if (!kids.length) out.push(node);
    else kids.forEach(visit);
  };
  visit(tree);
  return out;
}

/** Positions, in reading order, of the leaves at or under any node whose id is in `ids`. */
export function leafPositionsUnder(tree, ids) {
  const out = [];
  let position = 0;
  const visit = (node, inside) => {
    if (node.text !== undefined) return;
    const here = inside || ids.has(node.attrs?.['data-omniya-id']);
    const kids = elements(node);
    if (!kids.length) {
      if (here) out.push(position);
      position += 1;
    } else kids.forEach((child) => visit(child, here));
  };
  visit(tree, false);
  return out;
}

/** Remove `data-latex` from every node that has a descendant whose id is in `ids`. */
export function dropStaleLatex(tree, ids) {
  const visit = (node) => {
    if (node.text !== undefined) return false;
    let holds = false;
    for (const child of node.children ?? []) {
      if (child.text === undefined) {
        const inside = visit(child);
        if (inside || ids.has(child.attrs?.['data-omniya-id'])) holds = true;
      }
    }
    if (holds) delete node.attrs['data-latex'];
    return holds;
  };
  visit(tree);
  return tree;
}

/**
 * Where the reader should land after an edit that inserted the leaves `from` to
 * `to` (inclusive, in reading order). If one node holds exactly those leaves, it
 * is that node. A fresh parse does not always draw a box round what was typed
 * ("-y" in "x + - y" has none), and then it is the first leaf typed.
 */
export function nodeForInserted(tree, from, to) {
  let counter = 0;
  const span = new Map();
  const leaves = [];
  const visit = (node) => {
    if (node.text !== undefined) return;
    const kids = elements(node);
    const start = counter;
    if (!kids.length) { leaves.push(node); counter += 1; } else kids.forEach(visit);
    span.set(node, [start, counter - 1]);
  };
  visit(tree);
  let best = tree;
  const descend = (node) => {
    for (const child of elements(node)) {
      const [a, b] = span.get(child);
      if (a <= from && b >= to) { best = child; descend(child); return; }
    }
  };
  descend(tree);
  const [a, b] = span.get(best);
  return a === from && b === to ? best : leaves[from];
}
