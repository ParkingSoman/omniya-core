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
  ['⠨⠁', 'α'], ['⠨⠃', 'β'], ['⠨⠛', 'γ'], ['⠨⠙', 'δ'], ['⠨⠑', 'ε'],
  ['⠨⠵', 'ζ'], ['⠨⠱', 'η'], ['⠨⠹', 'θ'], ['⠨⠊', 'ι'], ['⠨⠅', 'κ'],
  ['⠨⠇', 'λ'], ['⠨⠍', 'μ'], ['⠨⠝', 'ν'], ['⠨⠭', 'ξ'], ['⠨⠕', 'ο'],
  ['⠨⠏', 'π'], ['⠨⠗', 'ρ'], ['⠨⠎', 'σ'], ['⠨⠞', 'τ'], ['⠨⠥', 'υ'],
  ['⠨⠋', 'φ'], ['⠨⠯', 'χ'], ['⠨⠽', 'ψ'], ['⠨⠺', 'ω']
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
  ['⠨⠈⠑', 'ϵ'], // lunate/alternative epsilon
  ['⠨⠈⠹', 'ϑ'], // theta symbol
  ['⠨⠈⠋', 'ϕ'], // phi symbol
  ['⠨⠈⠏', 'ϖ'], // pi symbol
  ['⠨⠈⠅', 'ϰ']  // kappa symbol
];

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

function insertToken(tree, focus, name, value, { replace = false } = {}) {
  const current = currentNode(tree, focus);
  const node = name === 'mspace'
    ? element('mspace', [], { width: '0.3em' })
    : atom(name, value);
  const inserted = replace || current.name === 'math' || isHole(current)
    ? replaceCurrent(tree, focus, node)
    : insertAfter(tree, focus, node);
  return { tree, focus: focusNode(inserted) };
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

const token = (id, cells, banaRefs, value, name = 'mo', options = {}) => ({ id, cells, banaRefs, action: 'insert-token', args: { name, value, ...options } });
const open = (id, cells, banaRefs, elementName, slots, attrs = {}, initialSlot = slots[0], preferLonger = false) => ({ id, cells, banaRefs, action: 'open-structure', args: { element: elementName, slots, attrs, initialSlot, preferLonger } });
const fixedRoot = (id, cells, banaRefs, index, indexText) => ({ id, cells, banaRefs, action: 'open-fixed-root', args: { index, indexText } });
const move = (id, cells, banaRefs, elementName, role) => ({ id, cells, banaRefs, action: 'move-slot', args: { element: elementName, role } });
const close = (id, cells, banaRefs, elementName) => ({ id, cells, banaRefs, action: 'close-structure', args: { element: elementName } });
const mode = (id, cells, banaRefs, value, preferLonger = false) => ({ id, cells, banaRefs, action: 'set-mode', args: { mode: value, preferLonger } });

// Normative mapping ledger: BANA 2022 is the authority for every cell sequence
// and rule reference below. The October 2025 BANA errata is reviewed through
// `errataRefs` on operation rows when it changes a rule. MathCAT's Nemeth
// serializer and its public regression corpus are independent checks only;
// they never supply a missing BANA mapping or override the cited rule.
const MAPPINGS = [
  ...[...LETTERS].map(([cells, value]) => token(`letter.${value}`, [cells], ['6.3', '6.4'], value, 'mi')),
  token('operator.plus', ['⠬'], ['20.1'], '+', 'mo', { preferLonger: true }),
  token('space', [' '], ['2.4'], '', 'mspace'),
  token('punctuation.comma', ['⠂'], ['8.2'], ',', 'mo'),
  token('punctuation.period', ['⠸', '⠲'], ['8.4'], '.', 'mo'),
  token('punctuation.colon', ['⠸', '⠒'], ['8.5'], ':', 'mo'),
  token('punctuation.semicolon', ['⠸', '⠆'], ['8.6'], ';', 'mo'),
  token('punctuation.question', ['⠸', '⠦'], ['8.8'], '?', 'mo'),
  token('punctuation.quote', ['⠠', '⠶'], ['8.9'], '"', 'mo'),
  token('punctuation.exclamation', ['⠸', '⠖'], ['8.1'], '!', 'mo'),
  token('punctuation.long-dash', ['⠤', '⠤', '⠤', '⠤'], ['8.8'], '―', 'mo'),
  token('punctuation.ellipsis', ['⠄', '⠄', '⠄'], ['8.8'], '…', 'mo'),
  token('punctuation.left-single-quote', ['⠠', '⠦'], ['8.1'], '‘', 'mo'),
  token('punctuation.right-single-quote', ['⠴', '⠠'], ['8.1'], '’', 'mo'),
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
  token('operator.ring', ['⠨', '⠡'], ['20.3'], '∘'),
  token('operator.integral', ['⠮'], ['23.11'], '∫'),
  token('operator.sum', ['⠠', '⠎'], ['23.11'], '∑'),
  token('operator.product', ['⠠', '⠏'], ['23.11'], '∏'),
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
  open('script.superscript', ['⠘'], ['14.3', '14.4'], 'msup', ['base', 'superscript']),
  open('script.subscript', ['⠰'], ['14.8'], 'msub', ['base', 'subscript']),
  mode('script.baseline', ['⠐'], ['14.3', '14.8'], 'baseline'),
  mode('indicator.multipurpose', ['⠐'], ['24.1'], 'multipurpose', true),
  open('radical.square', ['⠜'], ['16.1', '16.2'], 'msqrt', ['radicand']),
  fixedRoot('radical.cube', ['⠣', '⠒', '⠜'], ['16.2'], '3', '3'),
  fixedRoot('radical.fourth', ['⠣', '⠲', '⠜'], ['16.2'], '4', '4'),
  close('radical.end', ['⠻'], ['16.1.1'], 'msqrt'),
  // MathML requires the radicand as child 1 and the index as child 2. Nemeth
  // presents the index first, so the transition opens a valid mroot in source
  // order while placing the draft focus in the index slot.
  open('radical.indexed', ['⠣'], ['16.2', '16.3'], 'mroot', ['radicand', 'index'], {}, 'index', true),
  move('radical.next.radicand', ['⠌'], ['16.2'], 'mroot', 'radicand'),
  close('radical.indexed.end', ['⠻'], ['16.2', '16.3'], 'mroot'),
  open('group.round', ['⠷'], ['19.1', '19.5'], 'mrow', ['content'], { 'data-omniya-group': 'round' }),
  close('group.round.end', ['⠾'], ['19.1'], 'mrow'),
  token('group.parenthesis-open', ['⠷'], ['19.1'], '(', 'mo'),
  token('group.parenthesis-close', ['⠾'], ['19.1'], ')', 'mo'),
  token('group.bracket-open', ['⠈', '⠷'], ['19.1'], '[', 'mo'),
  token('group.bracket-close', ['⠈', '⠾'], ['19.1'], ']', 'mo'),
  token('group.brace-open', ['⠨', '⠷'], ['19.1'], '{', 'mo'),
  token('group.brace-close', ['⠨', '⠾'], ['19.1'], '}', 'mo'),
  token('comparison.not-equal', ['⠌', '⠨', '⠅'], ['21.1', '21.8'], '≠'),
  token('comparison.approximately', ['⠈', '⠱', '⠈', '⠱'], ['21.6'], '≈'),
  token('comparison.similar', ['⠈', '⠱'], ['21.6'], '∼'),
  token('comparison.member', ['⠈', '⠑'], ['21.4'], '∈'),
  token('comparison.not-member', ['⠌', '⠈', '⠑'], ['21.4'], '∉'),
  token('comparison.subset', ['⠸', '⠐', '⠅'], ['21.5'], '⊂'),
  token('comparison.subset-equal', ['⠸', '⠐', '⠅', '⠱'], ['21.5'], '⊆'),
  token('operator.union', ['⠨', '⠬'], ['20.4'], '∪'),
  token('operator.intersection', ['⠨', '⠩'], ['20.4'], '∩'),
  token('operator.logical-and', ['⠈', '⠩'], ['20.5'], '∧'),
  token('operator.logical-or', ['⠈', '⠬'], ['20.5'], '∨'),
  token('operator.slash', ['⠸', '⠌'], ['20.8'], '/'),
  token('operator.dot', ['⠡'], ['20.7'], '·'),
  token('operator.asterisk', ['⠈', '⠼'], ['20.3'], '∗'),
  token('misc.infinity', ['⠠', '⠿'], ['23.11'], '∞'),
  token('misc.partial', ['⠈', '⠙'], ['23.14'], '∂'),
  token('misc.nabla', ['⠨', '⠫'], ['23.5'], '∇'),
  token('misc.degree', ['⠘', '⠨', '⠡'], ['23.1'], '°'),
  token('misc.prime', ['⠄'], ['23.16'], '′'),
  token('misc.factorial', ['⠯'], ['23.9'], '!'),
  token('misc.percent', ['⠈', '⠴'], ['23.15'], '%'),
  token('misc.empty-set', ['⠸', '⠴'], ['23.7'], '∅'),
  token('misc.angle', ['⠫', '⠪'], ['23'], '∠'),
  token('misc.therefore', ['⠠', '⠡'], ['23.18'], '∴'),
  token('misc.since', ['⠈', '⠌'], ['23.18'], '∵'),
  token('misc.end-proof', ['⠸', '⠳'], ['23.8'], '∎'),
  token('misc.double-prime', ['⠄', '⠄'], ['23.16'], '″'),
  token('misc.not', ['⠈', '⠹'], ['23.17'], '¬'),
  token('misc.divides', ['⠳'], ['23.11'], '∣'),
  token('misc.does-not-divide', ['⠌', '⠳'], ['23.11'], '∤'),
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
  token('arrow.up', ['⠫', '⠣', '⠒', '⠒', '⠕'], ['22.4', '22.5'], '↑'),
  token('arrow.down', ['⠫', '⠩', '⠒', '⠒', '⠕'], ['22.4', '22.5'], '↓'),
  token('reference.asterisk', ['⠈', '⠼'], ['9.1'], '*'),
  token('reference.dagger', ['⠸', '⠻'], ['9.1'], '†'),
  token('reference.double-dagger', ['⠸', '⠸', '⠻'], ['9.1'], '‡'),
  token('shape.circle', ['⠫', '⠉'], ['17.1'], '○'),
  token('shape.square', ['⠫', '⠲'], ['17.1'], '□'),
  token('shape.filled-circle', ['⠫', '⠸', '⠉'], ['17.3'], '●'),
  token('shape.filled-square', ['⠫', '⠸', '⠲'], ['17.3'], '■'),
  token('shape.triangle', ['⠫', '⠞'], ['17.1'], '△'),
  token('shape.rectangle', ['⠫', '⠗'], ['17.2'], '▭'),
  token('omission.general', ['⠿'], ['11.1.1'], '?'),
  open('cancellation.start', ['⠪'], ['12.1.1'], 'menclose', ['content'], { notation: 'updiagonalstrike' }),
  close('cancellation.end', ['⠻'], ['12.1.1'], 'menclose'),
  token('arrow.right', ['⠫', '⠕'], ['22.1', '22.4'], '→'),
  token('arrow.left', ['⠫', '⠪', '⠒', '⠒'], ['22.4'], '←'),
  token('arrow.both', ['⠫', '⠪', '⠒', '⠒', '⠕'], ['22.4'], '↔'),
  token('arrow.implies', ['⠫', '⠶', '⠶', '⠕'], ['21.2'], '⇒'),
  ...GREEK_SMALL.map(([cells, value]) => token(`greek.${value}`, [...cells], ['6.2'], value, 'mi')),
  ...GREEK_CAPITAL.map(([cells, value]) => token(`greek.capital-${value}`, [...cells], ['6.2'], value, 'mi')),
  ...GREEK_VARIANTS.map(([cells, value]) => token(`greek.variant-${value}`, [...cells], ['6.2'], value, 'mi')),
  mode('indicator.number', ['⠼'], ['3.1', '3.3'], 'numeric'),
  mode('indicator.capital', ['⠠'], ['5.1', '6.1'], 'capital', true)
];

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
    validContexts: mapping.validContexts ?? ['empty-root', 'row', 'structure-slot'],
    errataRefs: mapping.errataRefs ?? []
  }));
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
  if (mapping.id === 'cancellation.end') return Boolean(hasAncestor(context.tree, context.node, 'menclose'));
  if (mapping.id === 'script.baseline') return Boolean(hasAncestor(context.tree, context.node, 'msup') || hasAncestor(context.tree, context.node, 'msub') || hasAncestor(context.tree, context.node, 'msubsup') || hasAncestor(context.tree, context.node, 'mover') || hasAncestor(context.tree, context.node, 'munder') || hasAncestor(context.tree, context.node, 'munderover'));
  if (mapping.id === 'indicator.multipurpose') return !Boolean(hasAncestor(context.tree, context.node, 'msup') || hasAncestor(context.tree, context.node, 'msub') || hasAncestor(context.tree, context.node, 'msubsup') || hasAncestor(context.tree, context.node, 'mover') || hasAncestor(context.tree, context.node, 'munder') || hasAncestor(context.tree, context.node, 'munderover'));
  if (mapping.id === 'indicator.number' && fraction) return !contains(context.tree, fraction.children[1], context.node);
  return true;
}

function applyMapping(document, focus, inputState, mapping) {
  const { tree, node } = contextFor(document, focus);
  let result;
  const args = mapping.args ?? {};
  if (mapping.action === 'insert-token') {
    const replace = node.name === 'math' && tree.children.length === 0;
    result = insertToken(tree, focus, args.name, args.value, { replace });
  } else if (mapping.action === 'open-structure') {
    result = wrapCurrent(tree, focus, args.element, args.slots, args.attrs, args.initialSlot);
  } else if (mapping.action === 'open-fixed-root') {
    result = openFixedRoot(tree, focus, args.index, args.indexText);
  } else if (mapping.action === 'move-slot') {
    result = focusRole(tree, focus, args.element, args.role);
  } else if (mapping.action === 'close-structure') {
    result = closeStructure(tree, focus, args.element);
  } else if (mapping.action === 'set-mode') {
    if (args.mode === 'baseline') {
      const containers = ['msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover'];
      const container = ancestor(tree, node, containers);
      result = { tree, focus: focusNode(container ? findMathParent(tree, container.attrs['data-omniya-id']) ?? tree : node) };
    } else {
      return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: args.mode }, announcement: `Nemeth ${args.mode} indicator active.` };
    }
  } else {
    return { status: 'rejected', document, focus, inputState, announcement: `Unknown Nemeth action: ${mapping.action}` };
  }
  const nextMode = mapping.action === 'insert-token' && inputState.mode === 'numeric' && args.name === 'mn' ? 'numeric' : null;
  return {
    status: 'applied',
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

  if (state.mode === 'numeric' && !state.prefix && DIGITS.has(normalized)) return applyMapping(document, focus, state, digitMapping(normalized));
  if (state.mode === 'capital' && !state.prefix && LETTERS.has(normalized)) return applyMapping(document, focus, { ...state, mode: null }, letterMapping(normalized, state));

  if (!match && state.prefix) {
    const previous = PREFIXES.get(state.prefix);
    const previousMappings = previous?.mappings?.filter((mapping) => mappingApplies(mapping, context)) ?? [];
    if (previousMappings.length === 1) {
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

  if (!match) return { status: 'rejected', document, focus, inputState: { prefix: '', mode: state.mode }, announcement: 'That Nemeth cell is not valid at this draft focus.' };
  const mappings = match.mappings.filter((mapping) => mappingApplies(mapping, context));
  const hasLonger = [...PREFIXES.keys()].some((candidate) => candidate.startsWith(sequence) && candidate.length > sequence.length && [...(PREFIXES.get(candidate)?.mappings ?? [])].some((mapping) => mappingApplies(mapping, context)));
  if (!mappings.length) {
    if (hasLonger) return { status: 'pending', document, focus, inputState: { ...state, prefix: sequence }, announcement: 'Nemeth sequence pending.' };
    return { status: 'rejected', document, focus, inputState: { prefix: '', mode: state.mode }, announcement: 'That Nemeth cell is not valid at this draft focus.' };
  }
  if (mappings.length > 1 && !hasLonger) {
    return {
      status: 'choice',
      choices: mappings.map(({ id, banaRefs }) => ({ operationId: id, label: id, banaRefs })),
      document, focus, inputState: { ...state, prefix: sequence },
      announcement: 'Choose the meaning for this Nemeth sequence.'
    };
  }
  if (mappings.length === 1 && hasLonger && mappings[0].args?.preferLonger) return { status: 'pending', document, focus, inputState: { ...state, prefix: sequence }, announcement: 'Nemeth sequence may continue.' };
  if (mappings.length === 1) return applyMapping(document, focus, state, mappings[0]);
  return { status: 'pending', document, focus, inputState: { ...state, prefix: sequence }, announcement: 'Nemeth sequence pending.' };
}
