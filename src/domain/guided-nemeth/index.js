/**
 * Declarative, draft-only Nemeth transitions.
 *
 * This module never parses a completed passage. A cell sequence selects one
 * registered BANA mapping, and that mapping performs one local MathML action
 * on the replacement draft. The saved equation is not touched here.
 */
import {
  MATH_FORMAT_VERSION,
  createHole,
  findMathNode,
  findMathParent,
  parseMathML,
  serializeMathML
} from '../math-tree.js';

export const BANA_2022_URL = 'https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf';
export const BANA_2022_ERRATA_URL = 'https://www.brailleauthority.org/sites/default/files/2026-08/Errata%20Nemeth%20Code%202022%20Approved%2010-2025.pdf';

const BRAILLE_ASCII = '⠀⠮⠐⠼⠫⠩⠯⠄⠷⠾⠡⠬⠠⠤⠨⠌⠴⠂⠆⠒⠲⠢⠖⠶⠦⠔⠱⠰⠣⠿⠜⠹⠈⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵⠪⠳⠻⠘⠸';
const ASCII_TO_UNICODE = new Map([...BRAILLE_ASCII].map((cell, index) => [String.fromCharCode(index + 32), cell]));
const LETTERS = new Map([
  ['⠁', 'a'], ['⠃', 'b'], ['⠉', 'c'], ['⠙', 'd'], ['⠑', 'e'], ['⠋', 'f'],
  ['⠛', 'g'], ['⠓', 'h'], ['⠊', 'i'], ['⠚', 'j'], ['⠅', 'k'], ['⠇', 'l'],
  ['⠍', 'm'], ['⠝', 'n'], ['⠕', 'o'], ['⠏', 'p'], ['⠟', 'q'], ['⠗', 'r'],
  ['⠎', 's'], ['⠞', 't'], ['⠥', 'u'], ['⠧', 'v'], ['⠺', 'w'], ['⠭', 'x'],
  ['⠽', 'y'], ['⠵', 'z']
]);
const DIGITS = new Map([
  ['⠁', '1'], ['⠃', '2'], ['⠉', '3'], ['⠙', '4'], ['⠑', '5'], ['⠋', '6'],
  ['⠛', '7'], ['⠓', '8'], ['⠊', '9'], ['⠚', '0']
]);
const GREEK_SMALL = [
  ['⠨⠁', 'α'], ['⠨⠃', 'β'], ['⠨⠛', 'γ'], ['⠨⠙', 'δ'], ['⠨⠑', 'ϵ'],
  ['⠨⠵', 'ζ'], ['⠨⠱', 'η'], ['⠨⠹', 'θ'], ['⠨⠊', 'ι'], ['⠨⠅', 'κ'],
  ['⠨⠇', 'λ'], ['⠨⠍', 'μ'], ['⠨⠝', 'ν'], ['⠨⠭', 'ξ'], ['⠨⠕', 'ο'],
  ['⠨⠏', 'π'], ['⠨⠗', 'ρ'], ['⠨⠎', 'σ'], ['⠨⠞', 'τ'], ['⠨⠥', 'υ'],
  ['⠨⠋', 'ϕ'], ['⠨⠯', 'χ'], ['⠨⠽', 'ψ'], ['⠨⠺', 'ω']
];
const GREEK_CAPITAL = [
  ['⠨⠠⠁', 'Α'], ['⠨⠠⠃', 'Β'], ['⠨⠠⠛', 'Γ'], ['⠨⠠⠙', 'Δ'], ['⠨⠠⠑', 'Ε'],
  ['⠨⠠⠵', 'Ζ'], ['⠨⠠⠱', 'Η'], ['⠨⠠⠹', 'Θ'], ['⠨⠠⠊', 'Ι'], ['⠨⠠⠅', 'Κ'],
  ['⠨⠠⠇', 'Λ'], ['⠨⠠⠍', 'Μ'], ['⠨⠠⠝', 'Ν'], ['⠨⠠⠭', 'Ξ'], ['⠨⠠⠕', 'Ο'],
  ['⠨⠠⠏', 'Π'], ['⠨⠠⠗', 'Ρ'], ['⠨⠠⠎', 'Σ'], ['⠨⠠⠞', 'Τ'], ['⠨⠠⠥', 'Υ'],
  ['⠨⠠⠋', 'Φ'], ['⠨⠠⠯', 'Χ'], ['⠨⠠⠽', 'Ψ'], ['⠨⠠⠺', 'Ω']
];
// BANA 2022 Rule 6.2 distinguishes the variant Greek glyphs by the
// alternative-letter indicator. These entries are literal symbols, not a
// Greek parser: each complete code inserts one MathML identifier.
const GREEK_VARIANTS = [
  // BANA 6.1.5 lists these as the alternative lowercase Greek forms.
  ['⠨⠈⠃', 'ϐ'],
  ['⠨⠈⠹', 'ϑ'], // alternative theta
  ['⠨⠈⠎', 'ς'], // final/alternative sigma
  ['⠨⠈⠋', 'φ']  // alternative phi; standard phi is ϕ
];

// BANA Rule 18 lists these abbreviated function names as mathematical
// expressions in their own right.  They are deliberately represented as
// bounded local atoms, not as a word parser: the cells are ordinary Nemeth
// letter cells, the registry holds only one named construction, and the
// following expression is entered by later local operations.  The source
// table is BANA 2022 Rule 18.1; MathCAT's function-space fixtures are used as
// an independent projection check.
const BANA_FUNCTION_NAMES = [
  'amp', 'antilog', 'arc', 'arg', 'colog', 'cos', 'cosh', 'cot', 'coth',
  'covers', 'csc', 'csch', 'ctn', 'ctnh', 'det', 'erf', 'exp', 'exsec',
  'grad', 'hav', 'im', 'inf', 'lim', 'ln', 'log', 'max', 'min', 'mod',
  're', 'sec', 'sech', 'sin', 'sinh', 'sup', 'tan', 'tanh', 'vers'
];

// BANA 6.1.5/6.2.2 uses the alternative-letter indicator (⠈) after the
// Greek alphabet indicator. The MathCAT CSV contains a legacy final-sigma
// spelling (⠨⠒), but the normative BANA table is the explicit .`s form.

function normalizeCell(cell) {
  if (typeof cell !== 'string' || !cell) throw new TypeError('Nemeth input must contain one cell');
  if (cell.length === 1) {
    const code = cell.codePointAt(0);
    if (cell === ' ') return ' ';
    if (code >= 0x2800 && code <= 0x28ff) {
      const reduced = (code - 0x2800) & 0x3f;
      return reduced === 0 ? ' ' : String.fromCodePoint(0x2800 + reduced);
    }
    if (ASCII_TO_UNICODE.has(cell)) return ASCII_TO_UNICODE.get(cell);
    if (/\s/.test(cell)) return ' ';
  }
  throw new TypeError(`Unsupported Nemeth cell: ${cell}`);
}

export function normalizeCellInput(cell) { return normalizeCell(cell); }

function id() { return `omniya-${globalThis.crypto.randomUUID()}`; }
function element(name, children = [], attrs = {}) { return { name, attrs: { ...attrs, 'data-omniya-id': attrs['data-omniya-id'] ?? id() }, children }; }
function text(value) { return { text: value }; }
function atom(name, value, attrs = {}) { return element(name, [text(value)], attrs); }
function hole(owner, role) { return createHole({ ownerNodeId: owner.attrs['data-omniya-id'], role }); }
function isElement(node) { return Boolean(node && node.text === undefined); }
function isHole(node) { return isElement(node) && node.attrs?.['data-omniya-hole'] === 'true'; }
function focusNode(node) { return { kind: 'node', nodeId: node.attrs['data-omniya-id'] }; }
function currentNode(tree, focus) { return findMathNode(tree, focus?.nodeId) ?? tree; }

export function createEmptyDraftMathDocument() {
  const tree = element('math', [], { xmlns: 'http://www.w3.org/1998/Math/MathML' });
  return { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(tree), focus: focusNode(tree) };
}

function replaceCurrent(tree, focus, replacement) {
  const current = currentNode(tree, focus);
  if (current.name === 'math') {
    tree.children = [replacement];
    return replacement;
  }
  const parent = findMathParent(tree, current.attrs['data-omniya-id']);
  if (!parent) throw new RangeError('Draft focus has no parent');
  const index = parent.children.indexOf(current);
  if (index < 0) throw new RangeError('Draft focus is not a child');
  parent.children[index] = replacement;
  return replacement;
}

function insertAfter(tree, focus, replacement) {
  const current = currentNode(tree, focus);
  if (current.name === 'math') {
    tree.children.push(replacement);
    return replacement;
  }
  if (isHole(current)) return replaceCurrent(tree, focus, replacement);
  const parent = findMathParent(tree, current.attrs['data-omniya-id']);
  if (!parent || !['math', 'mrow'].includes(parent.name)) return replaceCurrent(tree, focus, replacement);
  const index = parent.children.indexOf(current);
  parent.children.splice(index + 1, 0, replacement);
  return replacement;
}

function insertToken(tree, focus, name, value, { replace = false, mathvariant = null } = {}) {
  const current = currentNode(tree, focus);
  const node = name === 'mspace'
    ? element('mspace', [], { width: '0.3em' })
    : atom(name, value, mathvariant ? { mathvariant } : {});
  const inserted = replace || current.name === 'math' || isHole(current)
    ? replaceCurrent(tree, focus, node)
    : insertAfter(tree, focus, node);
  return { tree, focus: focusNode(inserted) };
}

function extendIntegral(tree, focus, values) {
  const current = currentNode(tree, focus);
  if (current.name !== 'mo' || !values[current.children?.[0]?.text]) {
    throw new RangeError('Repeated-integral follow-up requires the focused integral sign.');
  }
  current.children = [text(values[current.children[0].text])];
  return { tree, focus: focusNode(current) };
}

function wrapCurrent(tree, focus, elementName, roles, attrs = {}, initialSlot = roles[0]) {
  const current = currentNode(tree, focus);
  const inheritedId = current.name !== 'math' ? current.attrs?.['data-omniya-id'] : null;
  const wrapper = element(elementName, [], { ...attrs, ...(inheritedId ? { 'data-omniya-id': inheritedId } : {}) });
  if (current.name !== 'math' && !isHole(current)) {
    const base = structuredClone(current);
    base.attrs['data-omniya-id'] = id();
    wrapper.children.push(base);
    for (const role of roles.slice(1)) wrapper.children.push(hole(wrapper, role));
  } else {
    for (const role of roles) wrapper.children.push(hole(wrapper, role));
  }
  replaceCurrent(tree, focus, wrapper);
  const first = wrapper.children.find((child) => child.attrs?.['data-omniya-role'] === initialSlot);
  return { tree, focus: focusNode(first ?? wrapper) };
}

function openFixedRoot(tree, focus, index, indexText) {
  const current = currentNode(tree, focus);
  const inheritedId = current.name !== 'math' ? current.attrs?.['data-omniya-id'] : null;
  const wrapper = element('mroot', [], inheritedId ? { 'data-omniya-id': inheritedId } : {});
  const radicand = current.name !== 'math' && !isHole(current)
    ? structuredClone(current)
    : hole(wrapper, 'radicand');
  if (radicand !== current && radicand.attrs) radicand.attrs['data-omniya-id'] = id();
  const rootIndex = atom('mn', indexText, { 'data-omniya-role': 'index' });
  wrapper.children.push(radicand, rootIndex);
  replaceCurrent(tree, focus, wrapper);
  return { tree, focus: focusNode(radicand) };
}

function ancestor(tree, node, names) {
  let current = node;
  while (current) {
    if (names.includes(current.name)) return current;
    current = isElement(current) ? findMathParent(tree, current.attrs?.['data-omniya-id']) : null;
  }
  return null;
}

function focusRole(tree, focus, elementName, role) {
  const container = ancestor(tree, currentNode(tree, focus), [elementName]);
  if (!container) throw new RangeError(`No open ${elementName} at the current draft focus.`);
  const child = container.children.find((candidate) => candidate.attrs?.['data-omniya-role'] === role);
  if (!child) throw new RangeError(`The ${elementName} has no ${role} slot.`);
  return { tree, focus: focusNode(child) };
}

function closeStructure(tree, focus, elementName) {
  const container = ancestor(tree, currentNode(tree, focus), [elementName]);
  if (!container) throw new RangeError(`No open ${elementName} at the current draft focus.`);
  const parent = findMathParent(tree, container.attrs['data-omniya-id']);
  return { tree, focus: focusNode(parent ?? tree) };
}

function openModifier(tree, focus, elementName, initialSlot) {
  return wrapCurrent(tree, focus, elementName, ['base', initialSlot], {}, initialSlot);
}

export const LOCAL_COMMIT_POLICIES = Object.freeze({
  IMMEDIATE: 'immediate',
  ATOMIC_SEQUENCE: 'atomic-sequence',
  STRUCTURAL_FOLLOWUP: 'structural-followup'
});

const withPolicy = (mapping, commitPolicy) => ({ ...mapping, commitPolicy });
const token = (id, cells, banaRefs, value, name = 'mo', options = {}) => {
  const { commitPolicy = LOCAL_COMMIT_POLICIES.IMMEDIATE, ...args } = options;
  return { id, cells, banaRefs, action: 'insert-token', commitPolicy, args: { name, value, ...args } };
};
const open = (id, cells, banaRefs, elementName, slots, attrs = {}, initialSlot = slots[0], preferLonger = false, commitPolicy = LOCAL_COMMIT_POLICIES.IMMEDIATE) => ({ id, cells, banaRefs, action: 'open-structure', commitPolicy, args: { element: elementName, slots, attrs, initialSlot, preferLonger } });
const fixedRoot = (id, cells, banaRefs, index, indexText) => ({ id, cells, banaRefs, action: 'open-fixed-root', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { index, indexText } });
const move = (id, cells, banaRefs, elementName, role) => ({ id, cells, banaRefs, action: 'move-slot', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: elementName, role } });
const close = (id, cells, banaRefs, elementName) => ({ id, cells, banaRefs, action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: elementName } });
const mode = (id, cells, banaRefs, value, preferLonger = false) => ({ id, cells, banaRefs, action: 'set-mode', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { mode: value, preferLonger } });
const modifier = (id, cells, banaRefs, elementName, slot, requiresMode = 'multipurpose') => ({
  id, cells, banaRefs, action: 'open-modifier', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: elementName, slot, requiresMode }
});

const cellForLetter = (letter) => [...LETTERS.entries()].find(([, value]) => value === letter)?.[0] ?? letter;
const BANA_FUNCTION_MAPPINGS = BANA_FUNCTION_NAMES.map((name) => token(
  `function.${name}`,
  [...name].map(cellForLetter),
  ['18.1', '18.4'],
  name,
  'mi',
  { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }
));
const BANA_LIMIT_MAPPINGS = [
  // BANA 18.3 gives upper/lower limit as dedicated local constructions. They
  // are not ordinary bar modifiers. The following expression is entered by
  // later structural operations in the same draft.
  token('function.limit.upper', ['⠣', '⠇', '⠊', '⠍'], ['18.3'], 'lim', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  token('function.limit.lower', ['⠩', '⠇', '⠊', '⠍'], ['18.3'], 'lim', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE })
];
const FUNCTION_INITIAL_CELLS = new Set(BANA_FUNCTION_MAPPINGS.map((mapping) => mapping.cells[0]));

// Rule 22's remaining named arrow examples are still atomic transitions. The
// table is intentionally data-only: each complete BANA construction inserts
// one MathML operator. It does not infer arrow parts or parse an expression.
// Cells are independently checked against BANA §§22.3–22.7 and MathCAT's
// `nemeth.csv` regression corpus.
const ADDITIONAL_ARROW_MAPPINGS = [
  ['arrow.left-stroked', '⠳⠈⠫⠪⠒⠒⠻', '↚'],
  ['arrow.right-stroked', '⠳⠈⠫⠒⠒⠕⠻', '↛'],
  ['arrow.left-wave', '⠫⠪⠔⠒⠢', '↜'],
  ['arrow.right-wave', '⠫⠔⠒⠢⠕', '↝'],
  ['arrow.left-two-headed', '⠫⠪⠪⠒⠒', '↞'],
  ['arrow.up-two-headed', '⠫⠣⠒⠒⠕⠕', '↟'],
  ['arrow.right-two-headed', '⠫⠒⠒⠕⠕', '↠'],
  ['arrow.down-two-headed', '⠫⠩⠒⠒⠕⠕', '↡'],
  ['arrow.left-tail', '⠫⠪⠒⠒⠠⠽', '↢'],
  ['arrow.right-tail', '⠫⠠⠯⠒⠒⠕', '↣'],
  ['arrow.left-bar', '⠫⠪⠒⠒⠳', '↤'],
  ['arrow.up-bar', '⠫⠣⠳⠒⠒⠕', '↥'],
  ['arrow.right-bar', '⠫⠳⠒⠒⠕', '↦'],
  ['arrow.down-bar', '⠫⠩⠳⠒⠒⠕', '↧'],
  ['arrow.vertical-bar', '⠫⠣⠪⠒⠒⠕⠳', '↨'],
  ['arrow.left-hook', '⠫⠪⠒⠒⠈⠽', '↩'],
  ['arrow.right-hook', '⠫⠈⠯⠒⠒⠕', '↪'],
  ['arrow.both-wave', '⠫⠪⠔⠒⠢⠕', '↭'],
  ['arrow.both-stroked', '⠳⠈⠫⠪⠒⠒⠕⠻', '↮'],
  ['arrow.down-zigzag', '⠫⠩⠔⠢⠔⠕', '↯'],
  ['arrow.right-corner', '⠫⠩⠠⠳⠒⠕', '↴'],
  ['arrow.down-corner', '⠫⠪⠒⠈⠳', '↵'],
  ['arrow.open-circle-left', '⠫⠢⠔⠕', '↺'],
  ['arrow.open-circle-right', '⠫⠪⠢⠔', '↻'],
  ['arrow.left-harpoon-up', '⠫⠈⠪⠒⠒', '↼'],
  ['arrow.left-harpoon-down', '⠫⠠⠪⠒⠒', '↽'],
  ['arrow.up-harpoon-right', '⠫⠣⠒⠒⠠⠕', '↾'],
  ['arrow.up-harpoon-left', '⠫⠣⠒⠒⠈⠕', '↿'],
  ['arrow.right-harpoon-up', '⠫⠒⠒⠈⠕', '⇀'],
  ['arrow.right-harpoon-down', '⠫⠒⠒⠠⠕', '⇁'],
  ['arrow.down-harpoon-right', '⠫⠩⠒⠒⠈⠕', '⇂'],
  ['arrow.down-harpoon-left', '⠫⠩⠒⠒⠠⠕', '⇃'],
  ['arrow.right-over-left', '⠫⠒⠒⠕⠫⠪⠒⠒', '⇄'],
  ['arrow.up-over-down', '⠫⠣⠒⠒⠕⠐⠫⠩⠒⠒⠕', '⇅'],
  ['arrow.left-over-right', '⠫⠪⠒⠒⠫⠒⠒⠕', '⇆'],
  ['arrow.left-paired', '⠫⠪⠒⠒⠫⠪⠒⠒', '⇇'],
  ['arrow.up-paired', '⠫⠣⠒⠒⠕⠐⠫⠣⠒⠒⠕', '⇈'],
  ['arrow.right-paired', '⠫⠒⠒⠕⠫⠒⠒⠕', '⇉'],
  ['arrow.down-paired', '⠫⠩⠒⠒⠕⠐⠫⠩⠒⠒⠕', '⇊'],
  ['arrow.left-harpoon-over-right', '⠫⠈⠪⠒⠒⠫⠒⠒⠠⠕', '⇋'],
  ['arrow.right-harpoon-over-left', '⠫⠒⠒⠈⠕⠫⠠⠪⠒⠒', '⇌'],
  ['arrow.left-double-stroked', '⠳⠈⠫⠪⠶⠶⠻', '⇍'],
  ['arrow.both-double-stroked', '⠳⠈⠫⠪⠶⠶⠕⠻', '⇎'],
  ['arrow.right-double-stroked', '⠳⠈⠫⠶⠶⠕⠻', '⇏'],
  ['arrow.vertical-double', '⠫⠣⠪⠶⠶⠕', '⇕'],
  ['arrow.northwest-double', '⠫⠘⠪⠶⠶', '⇖'],
  ['arrow.northeast-double', '⠫⠘⠶⠶⠕', '⇗'],
  ['arrow.southeast-double', '⠫⠰⠶⠶⠕', '⇘'],
  ['arrow.southwest-double', '⠫⠰⠪⠶⠶', '⇙'],
  ['arrow.left-triple', '⠫⠪⠸⠸', '⇚'],
  ['arrow.right-triple', '⠫⠸⠸⠕', '⇛'],
  ['arrow.left-squiggle', '⠫⠪⠢⠤⠔⠒⠢', '⇜'],
  ['arrow.right-squiggle', '⠫⠢⠤⠔⠒⠢⠕', '⇝']
].map(([id, cells, value]) => token(id, [...cells], ['22.3', '22.5', '22.7'], value, 'mo', { preferLonger: true }));

// Normative mapping ledger: BANA 2022 is the authority for every cell sequence
// and rule reference below. The October 2025 BANA errata is reviewed through
// `errataRefs` on operation rows when it changes a rule. MathCAT's Nemeth
// serializer and its public regression corpus are independent checks only;
// they never supply a missing BANA mapping or override the cited rule.
const MAPPINGS = [
  ...BANA_FUNCTION_MAPPINGS,
  ...BANA_LIMIT_MAPPINGS,
  ...[...LETTERS].map(([cells, value]) => token(`letter.${value}`, [cells], ['6.3', '6.4'], value, 'mi',
    FUNCTION_INITIAL_CELLS.has(cells) ? { preferLonger: true } : {})),
  token('operator.plus', ['⠬'], ['20.1'], '+', 'mo', { preferLonger: true }),
  token('space', [' '], ['2.4'], '', 'mspace'),
  // Rule 8's mathematical punctuation cells are literal local symbols. The
  // punctuation indicator is a separate contextual operation used after a
  // preceding indicator; it must not be baked into every punctuation token.
  // Within the mathematical editor this is the mathematical comma (Braille
  // ASCII comma, ⠠). Literary comma ⠂ is a passage-format concern and is not
  // silently accepted as an equation comma.
  token('punctuation.comma', ['⠠'], ['8.1', '8.2'], ',', 'mo', { preferLonger: true }),
  token('punctuation.period', ['⠲'], ['8.1', '8.2'], '.', 'mo'),
  token('punctuation.colon', ['⠒'], ['8.1', '8.5'], ':', 'mo'),
  token('punctuation.semicolon', ['⠆'], ['8.1', '8.6'], ';', 'mo'),
  token('punctuation.question', ['⠦'], ['8.1', '8.8'], '?', 'mo'),
  token('punctuation.exclamation', ['⠖'], ['8.1'], '!', 'mo'),
  token('punctuation.long-dash', ['⠤', '⠤', '⠤', '⠤'], ['8.8'], '―', 'mo'),
  token('punctuation.ellipsis', ['⠄', '⠄', '⠄'], ['8.8'], '…', 'mo'),
  token('punctuation.left-single-quote', ['⠠', '⠦'], ['8.1'], '‘', 'mo'),
  token('punctuation.right-single-quote', ['⠠', '⠴'], ['8.1'], '’', 'mo'),
  token('punctuation.left-double-quote', ['⠦'], ['8.1'], '“', 'mo'),
  token('punctuation.right-double-quote', ['⠴'], ['8.1'], '”', 'mo'),
  token('operator.minus', ['⠤'], ['20.6'], '−', 'mo', { preferLonger: true }),
  token('operator.equals', ['⠨', '⠅'], ['21.1'], '='),
  token('comparison.less', ['⠐', '⠅'], ['21.5'], '<', 'mo', { preferLonger: true }),
  token('comparison.greater', ['⠨', '⠂'], ['21.5'], '>', 'mo', { preferLonger: true }),
  token('operator.divide', ['⠨', '⠌'], ['20.8'], '÷'),
  token('operator.multiply', ['⠈', '⠡'], ['20.7'], '×'),
  token('operator.plus-minus', ['⠬', '⠤'], ['20.6'], '±'),
  token('operator.minus-plus', ['⠤', '⠬'], ['20.6'], '∓'),
  token('operator.ampersand', ['⠸', '⠯'], ['20.2'], '&'),
  token('operator.backslash', ['⠸', '⠡'], ['20.1', '20.8'], '\\', 'mo', { preferLonger: true }),
  token('operator.circle-dot', ['⠫', '⠉', '⠸', '⠫', '⠡', '⠻'], ['20.1'], '⊙'),
  token('operator.circle-plus', ['⠫', '⠉', '⠸', '⠫', '⠬', '⠻'], ['20.1'], '⊕'),
  token('operator.circle-minus', ['⠫', '⠉', '⠸', '⠫', '⠤', '⠻'], ['20.1'], '⊖'),
  token('operator.minus-bold', ['⠸', '⠤'], ['20.6'], '−', 'mo', { mathvariant: 'bold', preferLonger: true }),
  token('operator.minus-minus', ['⠤', '⠐', '⠤'], ['20.6'], '−−'),
  token('operator.minus-plus-bold', ['⠸', '⠤', '⠐', '⠸', '⠬'], ['20.6'], '−+'),
  token('operator.minus-plus-horizontal', ['⠤', '⠐', '⠬'], ['20.6'], '−+'),
  token('operator.minus-plus-regular-bold', ['⠤', '⠐', '⠸', '⠬'], ['20.6'], '−+'),
  token('operator.plus-bold', ['⠸', '⠬'], ['20.6'], '+', 'mo', { mathvariant: 'bold', preferLonger: true }),
  token('operator.plus-minus-bold', ['⠸', '⠬', '⠐', '⠸', '⠤'], ['20.6'], '+−'),
  token('operator.plus-minus-regular', ['⠬', '⠐', '⠤'], ['20.6'], '+−'),
  token('operator.plus-minus-regular-bold', ['⠬', '⠐', '⠸', '⠤'], ['20.6'], '+−'),
  token('operator.proper-difference', ['⠨', '⠤'], ['20.6'], '∸'),
  token('operator.number-sign', ['⠨', '⠼'], ['20.3'], '#'),
  token('operator.paragraph', ['⠈', '⠠', '⠏'], ['20.3'], '¶', 'mo', { preferLonger: true }),
  token('operator.section', ['⠈', '⠠', '⠎'], ['20.3'], '§', 'mo', { preferLonger: true }),
  // BANA Rule 20.3 names this the star symbol (☆); MathCAT's glyph choice
  // is an independent rendering convention and does not override BANA.
  token('operator.star', ['⠫', '⠎'], ['20.3'], '☆'),
  token('operator.ring', ['⠨', '⠡'], ['20.3'], '∘'),
  // An ordinary integral is a complete local code and is inserted at once.
  // Any bounds, multiplicity, or superposed decoration is added afterward by
  // the same structural-followup operations used for every other operator.
  token('operator.integral', ['⠮'], ['23.12'], '∫'),
  {
    id: 'integral.extend', cells: ['⠮'], banaRefs: ['23.12'], action: 'extend-integral',
    commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
    args: { values: { '∫': '∬', '∬': '∭' } }
  },
  // These two BANA compound symbols have a distinct leading construction and
  // are therefore valid bounded local codes; an ordinary ⠮ remains immediate.
  token('integral.lower', ['⠩', '⠮'], ['23.12'], '⨜', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  token('integral.upper', ['⠣', '⠮'], ['23.12'], '⨛', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  // BANA's superposed/contour integrals are intentionally not registered as
  // atomic Nemeth sequences here. Every one begins with the ordinary integral
  // cell, which is an immediate operation. They must be added later as
  // structural-followup operations (Rule 15 superposition), not as unreachable
  // buffered codes that pretend to be supported.
  // The n-ary summation sign is a Greek capital sigma with the Greek
  // alphabet indicator and capitalization indicator (BANA 6.1.4, 6.2,
  // Appendix C). It is not the plain English-letter sequence ⠠⠎.
  token('operator.sum', ['⠨', '⠠', '⠎'], ['6.1.4', '6.2', '18.1'], '∑'),
  open('fraction.start.simple', ['⠹'], ['13.1', '13.2'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'simple' }),
  move('fraction.next.denominator', ['⠌'], ['13.2'], 'mfrac', 'denominator'),
  close('fraction.end.simple', ['⠼'], ['13.2.1'], 'mfrac'),
  open('fraction.start.complex', ['⠠', '⠹'], ['13.5', '13.6'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'complex' }),
  move('fraction.next.denominator.complex', ['⠠', '⠌'], ['13.5', '13.6'], 'mfrac', 'denominator'),
  close('fraction.end.complex', ['⠠', '⠼'], ['13.6'], 'mfrac'),
  open('fraction.start.hypercomplex', ['⠠', '⠠', '⠹'], ['13.7', '13.8'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'hypercomplex' }),
  move('fraction.next.denominator.hypercomplex', ['⠠', '⠠', '⠌'], ['13.7', '13.8'], 'mfrac', 'denominator'),
  close('fraction.end.hypercomplex', ['⠠', '⠠', '⠼'], ['13.8'], 'mfrac'),
  open('fraction.start.mixed', ['⠸', '⠹'], ['13.4'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'mixed' }),
  move('fraction.next.denominator.mixed', ['⠸', '⠌'], ['13.4'], 'mfrac', 'denominator'),
  close('fraction.end.mixed', ['⠸', '⠼'], ['13.4'], 'mfrac'),
  open('script.superscript', ['⠘'], ['14.3', '14.4'], 'msup', ['base', 'superscript'], {}, 'superscript', true),
  open('script.subscript', ['⠰'], ['14.8'], 'msub', ['base', 'subscript'], {}, 'subscript', true),
  open('script.sup-sub', ['⠘', '⠰'], ['14.4.2'], 'msubsup', ['base', 'subscript', 'superscript'], {}, 'superscript', true),
  open('script.sub-sup', ['⠰', '⠘'], ['14.4.2'], 'msubsup', ['base', 'subscript', 'superscript'], {}, 'subscript', true),
  move('script.sup-sub.move-sub', ['⠰'], ['14.4.2'], 'msubsup', 'subscript'),
  move('script.sub-sup.move-sup', ['⠘'], ['14.4.2'], 'msubsup', 'superscript'),
  mode('script.baseline', ['⠐'], ['14.3', '14.8'], 'baseline', true),
  mode('indicator.multipurpose', ['⠐'], ['24.1'], 'multipurpose', true),
  // BANA Rule 7.2 typeform indicators. These are modes for the next local
  // letter/number operation; they do not create a text buffer or parse a
  // phrase. A shared cell may produce an explicit local choice where BANA
  // assigns multiple meanings.
  mode('typeform.bold', ['⠸', '⠰'], ['7.1', '7.2'], 'typeform:bold', true),
  mode('typeform.italic', ['⠨', '⠰'], ['7.1', '7.2'], 'typeform:italic', true),
  mode('typeform.sans-serif', ['⠠', '⠨', '⠰'], ['7.1', '7.2'], 'typeform:sans-serif', true),
  mode('typeform.script', ['⠈', '⠰'], ['7.1', '7.2'], 'typeform:script', true),
  mode('typeform.barred', ['⠠', '⠸', '⠰'], ['7.1', '7.2'], 'typeform:double-struck', true),
  mode('typeform.bold.number', ['⠸', '⠼'], ['7.1', '7.2'], 'numeric:bold', true),
  mode('typeform.italic.number', ['⠨', '⠼'], ['7.1', '7.2'], 'numeric:italic', true),
  mode('typeform.sans-serif.number', ['⠠', '⠨', '⠼'], ['7.1', '7.2'], 'numeric:sans-serif', true),
  mode('typeform.script.number', ['⠈', '⠼'], ['7.1', '7.2'], 'numeric:script', true),
  mode('typeform.barred.number', ['⠠', '⠸', '⠼'], ['7.1', '7.2'], 'numeric:double-struck', true),
  mode('typeform.terminate', ['⠠', '⠄'], ['7.1', '7.3'], 'typeform-end'),
  modifier('modifier.directly-over', ['⠣'], ['15.1', '15.2'], 'mover', 'overscript'),
  modifier('modifier.directly-under', ['⠩'], ['15.1', '15.2'], 'munder', 'underscript'),
  token('modifier.horizontal-bar', ['⠱'], ['15.1', '15.2'], '¯', 'mo'),
  close('modifier.terminate.over', ['⠻'], ['15.2'], 'mover'),
  close('modifier.terminate.under', ['⠻'], ['15.2'], 'munder'),
  open('radical.square', ['⠜'], ['16.1', '16.2'], 'msqrt', ['radicand']),
  fixedRoot('radical.cube', ['⠣', '⠒', '⠜'], ['16.2'], '3', '3'),
  fixedRoot('radical.fourth', ['⠣', '⠲', '⠜'], ['16.2'], '4', '4'),
  close('radical.end', ['⠻'], ['16.1.1'], 'msqrt'),
  // MathML requires the radicand as child 1 and the index as child 2. Nemeth
  // presents the index first, so the transition opens a valid mroot in source
  // order while placing the draft focus in the index slot.
  // ⠣ is also the standalone directly-over modifier. The longer indexed
  // radical code gets the same explicit lookahead treatment.
  open('radical.indexed', ['⠣'], ['16.2', '16.3'], 'mroot', ['radicand', 'index'], {}, 'index', true),
  move('radical.next.radicand', ['⠌'], ['16.2'], 'mroot', 'radicand'),
  close('radical.indexed.end', ['⠻'], ['16.2', '16.3'], 'mroot'),
  open('group.round', ['⠷'], ['19.1', '19.5'], 'mrow', ['content'], { 'data-omniya-group': 'round' }),
  close('group.round.end', ['⠾'], ['19.1'], 'mrow'),
  token('group.parenthesis-open', ['⠷'], ['19.1'], '(', 'mo'),
  token('group.parenthesis-close', ['⠾'], ['19.1'], ')', 'mo'),
  token('group.bracket-open', ['⠈', '⠷'], ['19.1'], '[', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.bracket-close', ['⠈', '⠾'], ['19.1'], ']', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.brace-open', ['⠨', '⠷'], ['19.1'], '{', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.brace-close', ['⠨', '⠾'], ['19.1'], '}', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  // Rule 19's additional grouping signs. Each multi-cell sign is a bounded
  // local construction, not a delimiter grammar: Enter commits the one sign.
  token('group.angle-open', ['⠨', '⠨', '⠷'], ['19.1'], '⟨', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.angle-close', ['⠨', '⠨', '⠾'], ['19.1'], '⟩', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.barred-bracket-open', ['⠈', '⠸', '⠷'], ['19.1'], '⟦', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.barred-bracket-close', ['⠈', '⠸', '⠾'], ['19.1'], '⟧', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.barred-brace-open', ['⠨', '⠸', '⠷'], ['19.1'], '⦃', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.barred-brace-close', ['⠨', '⠸', '⠾'], ['19.1'], '⦄', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.upper-half-open', ['⠈', '⠘', '⠠', '⠷'], ['19.1'], '⎡', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.upper-half-close', ['⠈', '⠘', '⠠', '⠾'], ['19.1'], '⎤', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.lower-half-open', ['⠈', '⠰', '⠷'], ['19.1'], '⎣', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('group.lower-half-close', ['⠈', '⠰', '⠾'], ['19.1'], '⎦', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  // Rule 19.5 reuses the vertical-bar cell used by operation and arrow
  // constructions. Hold it for local lookahead so a longer arrow code stays
  // reachable; Enter/choice selects the standalone grouping meaning.
  token('group.vertical-bar', ['⠳'], ['19.5'], '|', 'mo', { preferLonger: true }),
  token('comparison.not-equal', ['⠌', '⠨', '⠅'], ['21.1', '21.8'], '≠'),
  token('comparison.approximately', ['⠈', '⠱', '⠈', '⠱'], ['21.6'], '≈'),
  token('comparison.similar', ['⠈', '⠱'], ['21.6'], '∼', 'mo', { preferLonger: true }),
  token('comparison.member', ['⠈', '⠑'], ['21.4'], '∈'),
  token('comparison.not-member', ['⠌', '⠈', '⠑'], ['21.4'], '∉'),
  token('comparison.subset', ['⠸', '⠐', '⠅'], ['21.5'], '⊂', 'mo', { preferLonger: true }),
  token('comparison.subset-equal', ['⠸', '⠐', '⠅', '⠱'], ['21.5'], '⊆'),
  token('comparison.perpendicular', ['⠫', '⠏'], ['21.2'], '⊥'),
  token('comparison.proportion', ['⠰', '⠆'], ['21.5'], '∷'),
  token('comparison.ratio', ['⠐', '⠂'], ['21.5'], '∶'),
  token('comparison.relation', ['⠠', '⠗'], ['21.5'], 'R'),
  token('comparison.reverse-subset', ['⠸', '⠨', '⠂'], ['21.5'], '⊃'),
  token('comparison.variation', ['⠸', '⠿'], ['21.5'], '∝'),
  // Rule 21's comparison bar is Braille ASCII | (Unicode cell ⠡). The
  // operation/divides bar (Rule 20) is a different local meaning, ⠳.
  token('comparison.vertical-bar', ['⠡'], ['21.7'], '|', 'mo', { preferLonger: true }),
  token('comparison.equals-bold', ['⠸', '⠨', '⠅'], ['21.5'], '='),
  token('comparison.greater-curved', ['⠨', '⠨', '⠂'], ['21.5'], '≻'),
  token('comparison.less-curved', ['⠨', '⠐', '⠅'], ['21.5'], '≺'),
  token('comparison.simple-tilde', ['⠈', '⠱'], ['21.6'], '∼', 'mo', { preferLonger: true }),
  token('comparison.extended-tilde', ['⠈', '⠠', '⠱'], ['21.6'], '〰'),
  token('operator.union', ['⠨', '⠬'], ['20.4'], '∪'),
  token('operator.intersection', ['⠨', '⠩'], ['20.4'], '∩'),
  token('operator.logical-and', ['⠈', '⠩'], ['20.5'], '∧'),
  token('operator.logical-or', ['⠈', '⠬'], ['20.5'], '∨'),
  token('operator.slash', ['⠸', '⠌'], ['20.8'], '/'),
  // The same cell begins several Rule 22 arrow constructions. Hold the
  // standalone operation briefly when a longer registered local code can
  // continue; Enter still commits the standalone divides meaning.
  token('operator.divides', ['⠳'], ['20.1', '20.8'], '∣', 'mo', { preferLonger: true }),
  token('operator.dot', ['⠡'], ['20.7'], '·'),
  token('operator.asterisk', ['⠈', '⠼'], ['20.3'], '∗'),
  token('misc.infinity', ['⠠', '⠿'], ['23.11'], '∞'),
  token('misc.angstrom', ['⠈', '⠠', '⠁'], ['23.1'], 'Å'),
  token('misc.at', ['⠈', '⠁'], ['23.2'], '@'),
  // Added by the October 2025 BANA errata, Rule 23 symbol list and §23.4.
  // Errata 2025 restores crossed d as the ASCII sequence @$: at-sign
  // (⠈, multipurpose indicator) followed by shape ($, ⠫), not the ordinary
  // letter d cell.  The erratum's worked example uses the same sequence.
  Object.assign(token('misc.crossed-d', ['⠈', '⠫'], ['23.4'], 'đ', 'mi', { preferLonger: true }), {
    errataRefs: ['Rule 23 symbol list', 'Rule 23.4']
  }),
  token('misc.planck', ['⠈', '⠓'], ['23.4'], 'ℏ'),
  // BANA prints crossed Lambda as `` `.l``: backtick, dot 4, l.
  token('misc.crossed-lambda', ['⠈', '⠨', '⠇'], ['23.4'], 'ƛ'),
  token('misc.crossed-r', ['⠈', '⠠', '⠗'], ['23.4'], '℞'),
  token('misc.caret', ['⠸', '⠣'], ['23.3'], '^', 'mo', { preferLonger: true }),
  token('misc.cent', ['⠈', '⠉'], ['23.13'], '¢'),
  token('misc.dollar', ['⠈', '⠎'], ['23.13'], '$'),
  token('misc.franc', ['⠈', '⠋'], ['23.13'], '₣'),
  token('misc.naira', ['⠈', '⠝'], ['23.13'], '₦'),
  token('misc.pound', ['⠈', '⠇'], ['23.13'], '£'),
  token('misc.euro', ['⠈', '⠑'], ['23.13'], '€'),
  token('misc.won', ['⠈', '⠺'], ['23.13'], '₩'),
  token('misc.yen', ['⠈', '⠽'], ['23.13'], '¥'),
  token('misc.per-mille', ['⠈', '⠴', '⠴'], ['23.15'], '‰'),
  token('misc.partial', ['⠈', '⠙'], ['23.14'], '∂'),
  token('misc.nabla', ['⠨', '⠫'], ['23.5'], '∇'),
  token('misc.ditto', ['⠠', '⠄'], ['23.6'], '〃'),
  // BANA Rule 23.8: the end-of-proof icon is `@$qed`, preceded by an empty
  // cell. The UEB transcriber-defined shape indicator is ⠈⠫, followed by
  // q-e-d. The empty-cell/document spacing is represented by the surrounding
  // passage policy, not folded into this local mathematical token.
  token('misc.end-proof', ['⠈', '⠫', '⠟', '⠑', '⠙'], ['23.8'], '∎', 'mo', { preferLonger: true }),
  token('misc.hollow-dot', ['⠨', '⠡'], ['15.17', '23.10'], '∘'),
  token('misc.degree', ['⠘', '⠨', '⠡'], ['23.1'], '°'),
  token('misc.prime', ['⠄'], ['23.16'], '′', 'mo', { preferLonger: true }),
  token('misc.factorial', ['⠯'], ['23.9'], '!'),
  token('misc.percent', ['⠈', '⠴'], ['23.15'], '%', 'mo', { preferLonger: true }),
  token('misc.empty-set', ['⠸', '⠴'], ['23.7'], '∅'),
  // The shape + left-head prefix is also the start of every left/vertical
  // arrow. Keep the local meaning pending while a shaft or right head may
  // follow; end-of-code commits the standalone angle.
  token('misc.angle', ['⠫', '⠪'], ['17.1'], '∠', 'mo', { preferLonger: true }),
  token('misc.therefore', ['⠠', '⠡'], ['23.18'], '∴'),
  token('misc.since', ['⠈', '⠌'], ['23.18'], '∵'),
  token('misc.double-prime', ['⠄', '⠄'], ['23.16'], '″', 'mo', { preferLonger: true }),
  token('misc.triple-prime', ['⠄', '⠄', '⠄'], ['23.16'], '‴', 'mo', { preferLonger: true }),
  token('misc.tally', ['⠸'], ['23.19'], '|', 'mo', { preferLonger: true }),
  // Rule 23.20's vertical-bar symbol is the Braille ASCII | cell ⠡;
  // ⠳ remains reserved for the Rule 20 operation/divides meaning above.
  token('misc.vertical-bar', ['⠡'], ['23.20'], '|'),
  token('misc.does-not-divide', ['⠌', '⠳'], ['23.20'], '∤'),
  token('misc.parallel', ['⠫', '⠇'], ['17.2', '21.2'], '∥'),
  token('misc.not-parallel', ['⠌', '⠫', '⠇'], ['21.2'], '∦'),
  token('misc.right-angle', ['⠫', '⠪', '⠨', '⠗', '⠻'], ['17.1'], '∟'),
  token('misc.proportional', ['⠸', '⠿'], ['21.2'], '∝'),
  token('misc.identical', ['⠸', '⠇'], ['21.3'], '≡'),
  token('misc.not-identical', ['⠌', '⠸', '⠇'], ['21.3'], '≢'),
  token('quantifier.forall', ['⠈', '⠯'], ['23.17'], '∀'),
  token('quantifier.exists', ['⠈', '⠿'], ['23.17'], '∃'),
  token('quantifier.not-exists', ['⠌', '⠈', '⠿'], ['23.17'], '∄'),
  token('comparison.contains', ['⠈', '⠢'], ['21.4'], '∋'),
  token('comparison.not-contains', ['⠌', '⠈', '⠢'], ['21.4'], '∌'),
  token('comparison.less-equal', ['⠐', '⠅', '⠱'], ['21.5'], '≤'),
  token('comparison.greater-equal', ['⠨', '⠂', '⠱'], ['21.5'], '≥'),
  token('comparison.identical', ['⠸', '⠇'], ['21.3'], '≡'),
  token('comparison.not-less', ['⠌', '⠐', '⠅'], ['21.8'], '≮'),
  token('comparison.not-greater', ['⠌', '⠨', '⠂'], ['21.8'], '≯'),
  token('arrow.up', ['⠫', '⠣', '⠒', '⠒', '⠕'], ['22.4', '22.5'], '↑', 'mo', { preferLonger: true }),
  token('arrow.down', ['⠫', '⠩', '⠒', '⠒', '⠕'], ['22.4', '22.5'], '↓', 'mo', { preferLonger: true }),
  token('arrow.vertical-both', ['⠫', '⠣', '⠪', '⠒', '⠒', '⠕'], ['22.4'], '↕', 'mo', { preferLonger: true }),
  token('arrow.northwest', ['⠫', '⠘', '⠪', '⠒', '⠒'], ['22.4.3', '22.5'], '↖'),
  token('arrow.northeast', ['⠫', '⠘', '⠒', '⠒', '⠕'], ['22.4.3', '22.5'], '↗', 'mo', { preferLonger: true }),
  token('arrow.southeast', ['⠫', '⠰', '⠒', '⠒', '⠕'], ['22.4.3', '22.5'], '↘', 'mo', { preferLonger: true }),
  token('arrow.southwest', ['⠫', '⠰', '⠪', '⠒', '⠒'], ['22.4.3', '22.5'], '↙'),
  token('arrow.double-left', ['⠫', '⠪', '⠶', '⠶'], ['22.5.2'], '⇐', 'mo', { preferLonger: true }),
  token('arrow.double-right', ['⠫', '⠶', '⠶', '⠕'], ['22.5.2'], '⇒'),
  token('arrow.double-both', ['⠫', '⠪', '⠶', '⠶', '⠕'], ['22.5.2'], '⇔'),
  token('arrow.double-up', ['⠫', '⠣', '⠶', '⠶', '⠕'], ['22.4.2', '22.5.2'], '⇑'),
  token('arrow.double-down', ['⠫', '⠩', '⠶', '⠶', '⠕'], ['22.4.2', '22.5.2'], '⇓'),
  ...ADDITIONAL_ARROW_MAPPINGS,
  token('reference.asterisk', ['⠈', '⠼'], ['9.1'], '*'),
  token('reference.dagger', ['⠸', '⠻'], ['9.1'], '†'),
  token('reference.double-dagger', ['⠸', '⠸', '⠻'], ['9.1'], '‡'),
  // October 2025 errata, Rule 9.1: no fixed checkmark symbol exists; the
  // documented transcriber-defined shape code is `.=$cm` (⠨⠿⠫⠉⠍ in the
  // source's expanded notation). It remains a bounded local reference atom,
  // not an invented Unicode glyph.
  token('reference.checkmark', ['⠨', '⠿', '⠫', '⠉', '⠍'], ['9.1'], '✓', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  token('shape.circle', ['⠫', '⠉'], ['17.1'], '○', 'mo', { preferLonger: true }),
  token('shape.diamond', ['⠫', '⠙'], ['17.1'], '◊', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.ellipse', ['⠫', '⠑'], ['17.1'], '⬭', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.hexagon', ['⠫', '⠖'], ['17.1'], '⬡', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.parallel', ['⠫', '⠇'], ['17.1'], '∥', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.perpendicular', ['⠫', '⠏'], ['17.1'], '⟂', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.parallelogram', ['⠫', '⠛'], ['17.1'], '▱', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.pentagon', ['⠫', '⠢'], ['17.1'], '⬠', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.star', ['⠫', '⠎'], ['17.1'], '☆', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.trapezoid', ['⠫', '⠵'], ['17.1'], '⏢', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.inverted-triangle', ['⠨', '⠫'], ['17.1'], '▽', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true }),
  token('shape.square', ['⠫', '⠲'], ['17.1'], '□'),
  token('shape.filled-circle', ['⠫', '⠸', '⠉'], ['17.3'], '●'),
  token('shape.filled-square', ['⠫', '⠸', '⠲'], ['17.3'], '■'),
  token('shape.triangle', ['⠫', '⠞'], ['17.1'], '△'),
  token('shape.rectangle', ['⠫', '⠗'], ['17.2'], '▭'),
  // Rule 11.1.1: the general omission sign is the equals-shaped cell ⠿.
  // Its MathML placeholder is a question mark; it is not ordinary equals.
  token('omission.general', ['⠿'], ['11.1.1'], '?'),
  open('cancellation.start', ['⠪'], ['12.1.1'], 'menclose', ['content'], { notation: 'updiagonalstrike' }),
  close('cancellation.end', ['⠻'], ['12.1.1'], 'menclose'),
  token('arrow.right', ['⠫', '⠕'], ['22.1', '22.4'], '→'),
  token('arrow.left', ['⠫', '⠪', '⠒', '⠒'], ['22.4'], '←', 'mo', { preferLonger: true }),
  token('arrow.both', ['⠫', '⠪', '⠒', '⠒', '⠕'], ['22.4'], '↔', 'mo', { preferLonger: true }),
  token('arrow.right.short', ['⠫', '⠒', '⠕'], ['22.5.3'], '⇢', 'mo', { preferLonger: true }),
  token('arrow.left.short', ['⠫', '⠪', '⠒'], ['22.5.3'], '⇠', 'mo', { preferLonger: true }),
  token('arrow.right.long', ['⠫', '⠒', '⠒', '⠒', '⠕'], ['22.5.3'], '⟶', 'mo', { preferLonger: true }),
  token('arrow.left.long', ['⠫', '⠪', '⠒', '⠒', '⠒'], ['22.5.3'], '⟵', 'mo', { preferLonger: true }),
  ...GREEK_SMALL.map(([cells, value]) => token(`greek.${value}`, [...cells], ['6.1.4', '6.2.1'], value, 'mi')),
  ...GREEK_CAPITAL.map(([cells, value]) => token(`greek.capital-${value}`, [...cells], ['5.1.1', '6.1.4', '6.2.1'], value, 'mi')),
  ...GREEK_VARIANTS.map(([cells, value]) => token(`greek.variant-${value}`, [...cells], ['6.1.5', '6.2.2'], value, 'mi')),
  mode('indicator.number', ['⠼'], ['3.1', '3.3'], 'numeric'),
  mode('indicator.capital', ['⠠'], ['5.1', '6.1'], 'capital', true)
].map((mapping) => mapping.id.startsWith('arrow.')
  ? withPolicy(mapping, LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE)
  : mapping);

const PREFIXES = new Map();
for (const mapping of MAPPINGS) {
  const sequence = mapping.cells.join('');
  for (let length = 1; length <= sequence.length; length += 1) {
    const prefix = sequence.slice(0, length);
    const entry = PREFIXES.get(prefix) ?? { mappings: [], longer: false };
    if (length === sequence.length) entry.mappings.push(mapping);
    PREFIXES.set(prefix, entry);
  }
}
for (const prefix of PREFIXES.keys()) {
  PREFIXES.get(prefix).longer = [...PREFIXES.keys()].some((candidate) => candidate.startsWith(prefix) && candidate.length > prefix.length);
}

export function operationRegistry() {
  return MAPPINGS.map((mapping) => ({
    ...mapping,
    cells: [...mapping.cells],
    commandLabel: mapping.commandLabel ?? mapping.id,
    commitPolicy: mapping.commitPolicy ?? LOCAL_COMMIT_POLICIES.IMMEDIATE,
    validContexts: mapping.validContexts ?? ['empty-root', 'row', 'structure-slot'],
    errataRefs: mapping.errataRefs ?? []
  }));
}

/**
 * Registry-level design checks. These protect the three local input policies
 * from becoming contradictory as BANA rows are added. In particular, an
 * atomic construction may not begin with an already-committed immediate code.
 */
export function registryDiagnostics() {
  const entries = operationRegistry();
  const immediate = entries.filter((entry) => entry.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE);
  const hasLonger = (entry) => entries.some((candidate) => candidate.cells.length > entry.cells.length &&
    entry.cells.every((cell, index) => cell === candidate.cells[index]));
  const shadowedAtomic = entries
    .filter((entry) => entry.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE)
    .flatMap((entry) => immediate
      .filter((prefix) => entry.cells.length > prefix.cells.length &&
        prefix.cells.every((cell, index) => cell === entry.cells[index]))
      .map((prefix) => ({ atomicId: entry.id, immediateId: prefix.id })));
  const policyErrors = shadowedAtomic
    .filter(({ immediateId }) => !entries.find((entry) => entry.id === immediateId)?.args?.preferLonger);
  const shadowedImmediate = immediate
    .filter(hasLonger)
    .filter((entry) => !entry.args?.preferLonger)
    .map((entry) => ({ immediateId: entry.id, cells: entry.cells.join('') }));
  return { shadowedAtomic, policyErrors, shadowedImmediate };
}

function contextFor(document, focus) {
  const tree = parseMathML(document.mathml);
  return { tree, node: currentNode(tree, focus) };
}

function hasAncestor(tree, node, name) {
  let current = node;
  while (current) {
    if (current.name === name) return current;
    current = isElement(current) ? findMathParent(tree, current.attrs?.['data-omniya-id']) : null;
  }
  return null;
}

function contains(tree, ancestorNode, node) {
  let current = node;
  while (current) {
    if (current === ancestorNode) return true;
    current = isElement(current) ? findMathParent(tree, current.attrs?.['data-omniya-id']) : null;
  }
  return false;
}

function fractionAtFocus(tree, node) {
  let fraction = hasAncestor(tree, node, 'mfrac');
  // Closing a nested fraction returns focus to that fraction node. For the
  // next BANA fraction-line transition, that node is the numerator/denominator
  // child of its containing fraction, so resolve one level outward locally.
  if (fraction === node) {
    const parent = findMathParent(tree, fraction.attrs?.['data-omniya-id']);
    if (parent?.name === 'mfrac') fraction = parent;
  }
  return fraction;
}

function mappingApplies(mapping, context) {
  if (mapping.id === 'operator.integral') {
    return !(context.node.name === 'mo' && ['∫', '∬'].includes(context.node.children?.[0]?.text));
  }
  if (mapping.id === 'integral.extend') {
    return context.node.name === 'mo' && ['∫', '∬'].includes(context.node.children?.[0]?.text);
  }
  const fraction = fractionAtFocus(context.tree, context.node);
  const fractionKind = fraction?.attrs?.['data-omniya-fraction-kind'] ?? 'simple';
  const numeratorFocus = Boolean(fraction && (contains(context.tree, fraction.children[0], context.node) ||
    (context.node === fraction && isHole(fraction.children[1]))));
  const denominatorFocus = Boolean(fraction && (contains(context.tree, fraction.children[1], context.node) ||
    (context.node === fraction && !isHole(fraction.children[1]))));
  if (mapping.id.startsWith('fraction.next.denominator')) {
    const kind = mapping.id === 'fraction.next.denominator' ? 'simple' : mapping.id.split('.').at(-1);
    return Boolean(fraction && fractionKind === kind && numeratorFocus);
  }
  if (mapping.id.startsWith('fraction.end.')) {
    const kind = mapping.id.split('.').at(-1);
    return Boolean(fraction && fractionKind === kind && denominatorFocus);
  }
  if (mapping.id === 'radical.next.radicand') return Boolean(hasAncestor(context.tree, context.node, 'mroot'));
  if (mapping.id === 'radical.end') return Boolean(hasAncestor(context.tree, context.node, 'msqrt'));
  if (mapping.id === 'radical.indexed.end') return Boolean(hasAncestor(context.tree, context.node, 'mroot'));
  if (mapping.id === 'script.sup-sub.move-sub') return Boolean(hasAncestor(context.tree, context.node, 'msubsup'));
  if (mapping.id === 'script.sub-sup.move-sup') return Boolean(hasAncestor(context.tree, context.node, 'msubsup'));
  if (mapping.id === 'script.superscript') return !Boolean(hasAncestor(context.tree, context.node, 'msubsup'));
  if (mapping.id === 'script.subscript') return !Boolean(hasAncestor(context.tree, context.node, 'msubsup'));
  if (mapping.id === 'cancellation.end') return Boolean(hasAncestor(context.tree, context.node, 'menclose'));
  if (mapping.id === 'script.baseline') return Boolean(hasAncestor(context.tree, context.node, 'msup') || hasAncestor(context.tree, context.node, 'msub') || hasAncestor(context.tree, context.node, 'msubsup') || hasAncestor(context.tree, context.node, 'mover') || hasAncestor(context.tree, context.node, 'munder') || hasAncestor(context.tree, context.node, 'munderover'));
  if (mapping.id === 'modifier.terminate.over') return Boolean(hasAncestor(context.tree, context.node, 'mover'));
  if (mapping.id === 'modifier.terminate.under') return Boolean(hasAncestor(context.tree, context.node, 'munder'));
  if (mapping.id === 'indicator.multipurpose') return true;
  if (mapping.id === 'indicator.number' && fraction) return !contains(context.tree, fraction.children[1], context.node);
  return true;
}

function hasAtomicContinuation(prefix, nextCell, context) {
  const candidatePrefix = `${prefix}${nextCell}`;
  return MAPPINGS.some((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
    !mapping.id.startsWith('function.') &&
    mapping.cells.length > candidatePrefix.length &&
    mapping.cells.slice(0, candidatePrefix.length).join('') === candidatePrefix &&
    mappingApplies(mapping, context));
}

function applyMapping(document, focus, inputState, mapping) {
  const { tree, node } = contextFor(document, focus);
  let result;
  const args = mapping.args ?? {};
  if (mapping.action === 'insert-token') {
    const replace = node.name === 'math' && tree.children.length === 0;
    const typeform = inputState.mode?.startsWith?.('typeform:')
      ? inputState.mode.slice('typeform:'.length).split(':')[0]
      : inputState.mode?.startsWith?.('numeric:')
        ? inputState.mode.slice('numeric:'.length)
        : null;
    result = insertToken(tree, focus, args.name, args.value, {
      replace,
      mathvariant: ['mi', 'mn'].includes(args.name) ? typeform : args.mathvariant ?? null
    });
  } else if (mapping.action === 'open-structure') {
    result = wrapCurrent(tree, focus, args.element, args.slots, args.attrs, args.initialSlot);
  } else if (mapping.action === 'open-fixed-root') {
    result = openFixedRoot(tree, focus, args.index, args.indexText);
  } else if (mapping.action === 'open-modifier') {
    if (inputState.mode !== args.requiresMode) {
      return { status: 'rejected', document, focus, inputState, announcement: 'A multipurpose indicator is required before a modifier.' };
    }
    result = openModifier(tree, focus, args.element, args.slot);
  } else if (mapping.action === 'extend-integral') {
    result = extendIntegral(tree, focus, args.values);
  } else if (mapping.action === 'move-slot') {
    result = focusRole(tree, focus, args.element, args.role);
  } else if (mapping.action === 'close-structure') {
    result = closeStructure(tree, focus, args.element);
  } else if (mapping.action === 'set-mode') {
    if (args.mode === 'baseline') {
      const containers = ['msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover'];
      const container = ancestor(tree, node, containers);
      result = { tree, focus: focusNode(container ? findMathParent(tree, container.attrs['data-omniya-id']) ?? tree : node) };
    } else if (args.mode === 'letter-indicator') {
      if (!inputState.mode?.startsWith?.('typeform:')) {
        return { status: 'rejected', document, focus, inputState, announcement: 'The alphabetic indicator is not valid at this focus.' };
      }
      return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: `${inputState.mode}:alpha` }, announcement: 'Typeform alphabetic indicator active.' };
    } else if (args.mode === 'numeric') {
      const typeform = inputState.mode?.startsWith?.('typeform:')
        ? inputState.mode.slice('typeform:'.length).split(':')[0]
        : null;
      const nextMode = typeform ? `numeric:${typeform}` : 'numeric';
      return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: nextMode }, announcement: 'Nemeth numeric indicator active.' };
    } else if (args.mode === 'typeform-end') {
      return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: null }, announcement: 'Nemeth typeform terminated.' };
    } else {
      return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: args.mode }, announcement: `Nemeth ${args.mode} indicator active.` };
    }
  } else {
    return { status: 'rejected', document, focus, inputState, announcement: `Unknown Nemeth action: ${mapping.action}` };
  }
  const nextMode = mapping.action === 'insert-token' && inputState.mode?.startsWith?.('numeric') && args.name === 'mn'
    ? inputState.mode
    : null;
  return {
    status: 'applied',
    // The renderer uses this only to distinguish a short immediate code that
    // was held as a prefix from an atomic local construction.  It never turns
    // the input into a passage parser: one registry row is still the whole
    // committed unit.
    localCommitPolicy: mapping.commitPolicy ?? LOCAL_COMMIT_POLICIES.IMMEDIATE,
    document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(result.tree), focus: result.focus },
    focus: result.focus,
    inputState: { prefix: '', mode: nextMode },
    announcement: mapping.id
  };
}

export function applyNemethChoice({ document, focus, inputState = { prefix: '', mode: null }, operationId }) {
  const context = contextFor(document, focus);
  const mapping = MAPPINGS.find((candidate) => candidate.id === operationId);
  if (!mapping || mapping.cells.join('') !== inputState.prefix || !mappingApplies(mapping, context)) {
    return {
      status: 'rejected',
      document,
      focus,
      inputState,
      announcement: 'That Nemeth choice is no longer valid at this draft focus.'
    };
  }
  return applyMapping(document, focus, { ...inputState, prefix: '' }, mapping);
}

function digitMapping(cell) {
  return { id: `number.${DIGITS.get(cell)}`, cells: [cell], banaRefs: ['3.1', '3.2'], action: 'insert-token', args: { name: 'mn', value: DIGITS.get(cell) } };
}

function letterMapping(cell, inputState) {
  const value = LETTERS.get(cell);
  return { id: `letter.${value}`, cells: [cell], banaRefs: ['6.3', '6.4'], action: 'insert-token', args: { name: 'mi', value: inputState.mode === 'capital' ? value.toUpperCase() : value } };
}

export function applyNemethCell({ document, focus, inputState = { prefix: '', mode: null }, cell }) {
  const normalized = normalizeCell(cell);
  const state = { prefix: inputState.prefix ?? '', mode: inputState.mode ?? null };
  const sequence = `${state.prefix}${normalized}`;
  const match = PREFIXES.get(sequence);
  const context = contextFor(document, focus);

  if (state.mode?.startsWith?.('numeric') && !state.prefix && DIGITS.has(normalized)) return applyMapping(document, focus, state, digitMapping(normalized));
  if (state.mode === 'capital' && !state.prefix && LETTERS.has(normalized)) return applyMapping(document, focus, { ...state, mode: null }, letterMapping(normalized, state));

  if (!match && state.prefix) {
    const previous = PREFIXES.get(state.prefix);
    const previousMappings = previous?.mappings
      ?.filter((mapping) => mappingApplies(mapping, context))
      .filter((mapping) => state.mode === 'multipurpose'
        ? mapping.action === 'open-modifier'
        : mapping.action !== 'open-modifier') ?? [];
    if (previousMappings.length === 1 && previousMappings[0].commitPolicy !== LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
      !hasAtomicContinuation(state.prefix, normalized, context)) {
      const first = applyMapping(document, focus, { ...state, prefix: '' }, previousMappings[0]);
    if (first.status !== 'rejected') {
      const second = applyNemethCell({ document: first.document, focus: first.focus, inputState: first.inputState, cell: normalized });
      if (second.status !== 'rejected') {
        return { ...second, announcement: `${first.announcement}; ${second.announcement}` };
      }
      return first;
    }
    }
  }

  if (!match) return {
    status: 'rejected', document, focus,
    inputState: { ...state },
    announcement: state.prefix
      ? 'That cell does not complete the current local Nemeth code. The draft was not changed.'
      : 'That Nemeth cell is not valid at this draft focus.'
  };
  const mappings = match.mappings
    .filter((mapping) => mappingApplies(mapping, context))
    .filter((mapping) => mapping.id !== 'typeform.english-letter' || state.mode?.startsWith?.('typeform:'))
    .filter((mapping) => state.mode === 'multipurpose'
      ? mapping.action === 'open-modifier'
      : mapping.action !== 'open-modifier');
  const hasLonger = [...PREFIXES.keys()].some((candidate) => candidate.startsWith(sequence) && candidate.length > sequence.length && [...(PREFIXES.get(candidate)?.mappings ?? [])].some((mapping) => mappingApplies(mapping, context)));
  if (!mappings.length) {
    if (hasLonger) return { status: 'pending', document, focus, inputState: { ...state, prefix: sequence }, announcement: 'Nemeth sequence pending.' };
    return { status: 'rejected', document, focus, inputState: { ...state }, announcement: 'That Nemeth cell is not valid at this draft focus.' };
  }
  if (mappings.length > 1 && !hasLonger) {
    return {
      status: 'choice',
      choices: mappings.map(({ id, banaRefs }) => ({ operationId: id, label: id, banaRefs })),
      document, focus, inputState: { ...state, prefix: sequence },
      announcement: 'Choose the meaning for this Nemeth sequence.'
    };
  }
  if (mappings.length === 1 && mappings[0].commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE) {
    return { status: 'pending', document, focus, inputState: { ...state, prefix: sequence }, announcement: 'Local Nemeth code ready. Press Enter to commit it.' };
  }
  // An immediate code remains immediate whenever it is unambiguous. If BANA
  // also registers a longer atomic code with the same prefix, hold only this
  // local code so the author can finish it or press Enter to choose the short
  // meaning. This rule is registry-driven and applies to every construction,
  // not just integrals or arrows.
  if (mappings.length === 1 && hasLonger && mappings[0].args?.preferLonger) return { status: 'pending', document, focus, inputState: { ...state, prefix: sequence }, announcement: 'Nemeth sequence may continue.' };
  if (mappings.length === 1) return applyMapping(document, focus, state, mappings[0]);
  return { status: 'pending', document, focus, inputState: { ...state, prefix: sequence }, announcement: 'Nemeth sequence pending.' };
}

/**
 * Commit only the bounded local code currently held in the input state.
 * This is deliberately not a passage parser: it can select only one exact
 * registry row, and incomplete or invalid local input never mutates `document`.
 */
export function commitNemethLocalCode({ document, focus, inputState = { prefix: '', mode: null } }) {
  const prefix = inputState.prefix ?? '';
  if (!prefix) return {
    status: 'rejected', document, focus, inputState,
    announcement: 'There is no complete local Nemeth code to commit.'
  };
  const context = contextFor(document, focus);
  const mappings = (PREFIXES.get(prefix)?.mappings ?? [])
    .filter((mapping) => mappingApplies(mapping, context))
    .filter((mapping) => mapping.id !== 'typeform.english-letter' || inputState.mode?.startsWith?.('typeform:'))
    .filter((mapping) => inputState.mode === 'multipurpose'
      ? mapping.action === 'open-modifier'
      : mapping.action !== 'open-modifier');
  if (!mappings.length) return {
    status: 'rejected', document, focus, inputState,
    announcement: 'That local Nemeth code is incomplete or invalid. The draft was not changed.'
  };
  if (mappings.length > 1) return {
    status: 'choice', document, focus, inputState,
    choices: mappings.map(({ id, banaRefs }) => ({ operationId: id, label: id, banaRefs })),
    announcement: 'Choose the meaning for this local Nemeth code.'
  };
  const mapping = mappings[0];
  return applyMapping(document, focus, { ...inputState, prefix: '' }, mapping);
}
