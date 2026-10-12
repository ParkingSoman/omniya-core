/**
 * Write a MathML tree back as LaTeX, so an edited expression can be converted
 * again from one string. The result is then exactly what a fresh parse of that
 * expression gives, never a tree that was spliced together by hand.
 *
 * MathJax puts `data-latex` on most nodes it makes. A node that still has it
 * was not touched, so its text is reused as it is. A node without it was made
 * or changed by an edit, and is written from its children. Anything this file
 * cannot write returns `null`, and the caller keeps the spliced tree instead.
 * The caller also checks that the rebuilt equation holds exactly the symbols the
 * edit left (`symbolText`), so a mistake here can never put wrong maths in a note.
 */

const MO = new Map([
  ['+', '+'], ['-', '-'], ['−', '-'], ['=', '='], ['<', '<'], ['>', '>'],
  ['(', '('], [')', ')'], ['[', '['], [']', ']'], [',', ','], ['.', '.'],
  [';', ';'], [':', ':'], ['!', '!'], ['/', '/'], ['|', '|'],
  ['×', '\\times'], ['·', '\\cdot'], ['÷', '\\div'], ['±', '\\pm'],
  ['≤', '\\leq'], ['≥', '\\geq'], ['≠', '\\neq'], ['≈', '\\approx'],
  ['∞', '\\infty']
]);

// Accents, named by the command that makes them.
const ACCENTS = new Map([
  ['^', 'hat'], ['ˆ', 'hat'], ['~', 'tilde'], ['˜', 'tilde'], ['¯', 'bar'], ['‾', 'overline'],
  ['→', 'vec'], ['˙', 'dot'], ['¨', 'ddot'], ['ˇ', 'check'], ['˘', 'breve'],
  ['´', 'acute'], ['`', 'grave']
]);
const OPERATOR_NAMES = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan',
  'log', 'ln', 'lg', 'exp', 'lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'deg', 'gcd', 'hom', 'arg', 'Pr']);
const OVERBRACE = '⏞';
const UNDERBRACE = '⏟';

const FENCES = new Map([['(', 'pmatrix'], ['[', 'bmatrix'], ['|', 'vmatrix'], ['‖', 'Vmatrix'], ['{', 'Bmatrix']]);
// The fences each environment draws round its table: [left, right], null for none.
const ENVIRONMENT_FENCES = new Map([
  ['pmatrix', ['(', ')']], ['bmatrix', ['[', ']']], ['Bmatrix', ['{', '}']], ['vmatrix', ['|', '|']],
  ['Vmatrix', ['\u2016', '\u2016']], ['cases', ['{', null]], ['matrix', [null, null]]
]);
const CLOSING = new Map([['(', ')'], ['[', ']'], ['|', '|'], ['‖', '‖'], ['{', '}']]);
const isFenceText = (text) => text.length === 1 && '([{|‖)]}'.includes(text);

const elements = (node) => (node.children ?? []).filter((child) => child.text === undefined);
const textOf = (node) => (node.children ?? []).map((child) => child.text ?? '').join('');

// TeX's own special characters, for a leaf whose text is not a plain letter or digit.
const escapeTex = (text) => text.replace(/[\\{}#$%&_^~]/g, (c) => (c === '\\' ? '\\backslash ' : `\\${c}`));

function leafLatex(node) {
  const text = textOf(node);
  if (node.name === 'none') return '{}';
  if (node.name === 'mspace') return '\\,';
  if (node.name === 'mtext') return text === '' ? '{}' : `\\text{${escapeTex(text)}}`;
  if (text === '') return '{}';
  // Invisible function application and multiplication: TeX supplies them itself.
  if (node.name === 'mo' && /^[⁡⁢⁣]+$/.test(text)) return '';
  if (node.name === 'mo' && MO.has(text)) return MO.get(text);
  // A name such as sin or lim is one word, not three letters.
  if ((node.name === 'mi' || node.name === 'mo') && /^[A-Za-z]{2,}$/.test(text)) {
    return OPERATOR_NAMES.has(text) ? `\\${text}` : `\\operatorname{${text}}`;
  }
  // Any other letter, digit or sign goes in as itself. MathJax reads the character
  // as the same kind of thing it was made from.
  return escapeTex(text);
}

/**
 * The environment name in `\begin{pmatrix} ... \end{pmatrix}`, from what MathJax wrote
 * earlier. On the table itself MathJax writes just `{pmatrix}`, which is the
 * environment's name and not LaTeX that can be reused.
 */
const environmentOf = (node) => {
  const earlier = node.attrs?.['data-latex-was'] ?? node.attrs?.['data-latex'] ?? '';
  return /^\\begin\{([a-zA-Z*]+)\}/.exec(earlier)?.[1] ?? (node.name === 'mtable' ? /^\{([a-zA-Z*]+)\}$/.exec(earlier)?.[1] : null) ?? null;
};

/** A table is written with the environment it came in, or the one its fences say. */
function tableLatex(node, table, rows) {
  const kids = elements(node);
  const env = environmentOf(node)
    ?? (node.name === 'mrow' && kids.length >= 3 && kids[0] !== table ? FENCES.get(textOf(kids[0])) : null)
    ?? 'matrix';
  return `\\begin{${env}} ${rows.join(' \\\\ ')} \\end{${env}}`;
}

/** The LaTeX of one node, or null when it cannot be written. */
function write(node, trust) {
  const known = node.attrs?.['data-latex'];
  // A table is always written out: what MathJax keeps on it is only its environment's name.
  // Without `trust`, nothing MathJax wrote is reused, because now and then a group is
  // labelled with LaTeX that leaves out something inside it.
  if (trust && typeof known === 'string' && known !== '' && node.name !== 'mtable') return known;
  const kids = elements(node);
  if (!kids.length) return leafLatex(node);

  // The accent or brace on top of or under a base is named by the command, not written.
  const named = (node.name === 'mover' && kids[1]?.name === 'mo' && (ACCENTS.has(textOf(kids[1])) || textOf(kids[1]) === OVERBRACE))
    || (node.name === 'munder' && kids[1]?.name === 'mo' && textOf(kids[1]) === UNDERBRACE);
  const parts = kids.map((kid, i) => (named && i === 1 ? '' : write(kid, trust)));
  if (parts.includes(null)) return null;
  const group = (value) => `{${value}}`;
  switch (node.name) {
    case 'mrow': {
      // A table that came in an environment (cases, matrix, align...) keeps it, with
      // at most the fences it had.
      const tables = kids.filter((k) => k.name === 'mtable');
      const env = environmentOf(node);
      if (env && tables.length === 1 && kids.length <= 3
          && kids.every((k) => k === tables[0] || (k.name === 'mo' && isFenceText(textOf(k))))) {
        // Only while the fences are the ones that environment draws. If an edit changed
        // one, the table and its fences are written as what they now are.
        const at = kids.indexOf(tables[0]);
        const left = at > 0 ? textOf(kids[0]) : null;
        const right = at < kids.length - 1 ? textOf(kids[kids.length - 1]) : null;
        const expected = ENVIRONMENT_FENCES.get(env) ?? [null, null];
        if (left === expected[0] && right === expected[1]) {
          return tableLatex(node, tables[0], elements(tables[0]).map((row) => write(row, trust)));
        }
      }
      // Otherwise only while it is still exactly a matrix: two matching fences round the table.
      const table = kids.length === 3 && kids[1].name === 'mtable' ? kids[1] : null;
      const open = table ? textOf(kids[0]) : '';
      if (table && kids[0].name === 'mo' && kids[2].name === 'mo' && FENCES.has(open) && textOf(kids[2]) === CLOSING.get(open)) {
        return tableLatex(node, table, elements(table).map((row) => write(row, trust)));
      }
      return parts.join(' ');
    }
    case 'math':
    case 'mstyle':
    case 'mpadded':
    case 'semantics':
      return parts.join(' ');
    case 'msup':
      if (kids.length !== 2) return null;
      // A prime is written as one.
      if (kids[1].name === 'mo' && /^[′″']+$/.test(textOf(kids[1]))) {
        return `${group(parts[0])}${textOf(kids[1]).replaceAll('′', "'").replaceAll('″', "''")}`;
      }
      return `${group(parts[0])}^${group(parts[1])}`;
    case 'msub': return kids.length === 2 ? `${group(parts[0])}_${group(parts[1])}` : null;
    case 'msubsup': return kids.length === 3 ? `${group(parts[0])}_${group(parts[1])}^${group(parts[2])}` : null;
    case 'mfrac': return kids.length === 2 ? `\\frac${group(parts[0])}${group(parts[1])}` : null;
    case 'msqrt': return `\\sqrt${group(parts.join(' '))}`;
    case 'mroot': return kids.length === 2 ? `\\sqrt[${parts[1]}]${group(parts[0])}` : null;
    case 'mover': {
      if (kids.length !== 2) return null;
      const accent = kids[1].name === 'mo' ? ACCENTS.get(textOf(kids[1])) : null;
      if (accent) return `\\${accent}${group(parts[0])}`;
      if (kids[1].name === 'mo' && textOf(kids[1]) === OVERBRACE) return `\\overbrace${group(parts[0])}`;
      return `\\overset${group(parts[1])}${group(parts[0])}`;
    }
    case 'munder':
      if (kids.length !== 2) return null;
      if (kids[1].name === 'mo' && textOf(kids[1]) === UNDERBRACE) return `\\underbrace${group(parts[0])}`;
      return `\\underset${group(parts[1])}${group(parts[0])}`;
    case 'munderover':
      return kids.length === 3 ? `\\overset${group(parts[2])}{\\underset${group(parts[1])}${group(parts[0])}}` : null;
    case 'menclose':
      return node.attrs?.notation === 'box' || node.attrs?.['data-latex-was']?.startsWith('\\boxed')
        ? `\\boxed${group(parts.join(' '))}`
        : null;
    // A table keeps the environment it was written in (matrix, cases, align...).
    case 'mtable': return tableLatex(node, node, parts);
    case 'mtr': return parts.join(' & ');
    case 'mtd': return parts.join(' ');
    default: return null;
  }
}

/**
 * The same LaTeX without `\left`, `\right` and `\middle`. Editing one fence of a
 * pair leaves the other with nothing to match, and the converter then refuses the
 * whole expression. Without the pairing the expression still reads as it was.
 */
export function withoutStretchyFences(latex) {
  return latex.replace(/\\(?:left|right|middle)\s*\./g, '').replace(/\\(?:left|right|middle)\s*/g, '');
}

/**
 * `trust` reuses the LaTeX MathJax wrote for untouched nodes, so a rebuilt equation
 * keeps the exact form it was typed in. Without it, everything is written from the
 * structure alone.
 */
export function latexFromTree(tree, { trust = true } = {}) {
  if (!tree || tree.name !== 'math') return null;
  const latex = write(tree, trust);
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

/**
 * Every symbol of an equation, in order, as one string. It is how an edit is
 * checked: the rebuilt equation must hold exactly the symbols the edit left, no
 * more and no fewer, or it is not used. Invisible operators and spacing do not
 * count, and signs that touch (= then <) may be joined by the converter.
 */
export function symbolText(tree) {
  return leafNodes(tree)
    .map((leaf) => textOf(leaf))
    .join('')
    .replace(/[⁡⁢⁣\s]/g, '');
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
    if (holds) {
      // Kept under another name so a table can still say which environment it was.
      if (node.attrs['data-latex'] !== undefined) node.attrs['data-latex-was'] = node.attrs['data-latex'];
      delete node.attrs['data-latex'];
    }
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
