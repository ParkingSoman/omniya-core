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
  // BANA 2022 Rule 3.1.2: Nemeth digits use the lower portion of the
  // corresponding a-j cells. These are deliberately distinct from UEB
  // digits. Braille ASCII's `1`..`0` normalize to this same table.
  ['⠂', '1'], ['⠆', '2'], ['⠒', '3'], ['⠲', '4'], ['⠢', '5'], ['⠖', '6'],
  ['⠶', '7'], ['⠦', '8'], ['⠔', '9'], ['⠴', '0']
]);
const GREEK_SMALL = [
  ['⠨⠁', 'α', '.a'], ['⠨⠃', 'β', '.b'], ['⠨⠛', 'γ', '.g'], ['⠨⠙', 'δ', '.d'], ['⠨⠑', 'ϵ', '.e'],
  ['⠨⠵', 'ζ', '.z'], ['⠨⠱', 'η', '.:'], ['⠨⠹', 'θ', '.?'], ['⠨⠊', 'ι', '.i'], ['⠨⠅', 'κ', '.k'],
  ['⠨⠇', 'λ', '.l'], ['⠨⠍', 'μ', '.m'], ['⠨⠝', 'ν', '.n'], ['⠨⠭', 'ξ', '.x'], ['⠨⠕', 'ο', '.o'],
  ['⠨⠏', 'π', '.p'], ['⠨⠗', 'ρ', '.r'], ['⠨⠎', 'σ', '.s'], ['⠨⠞', 'τ', '.t'], ['⠨⠥', 'υ', '.u'],
  ['⠨⠋', 'ϕ', '.f'], ['⠨⠯', 'χ', '.&'], ['⠨⠽', 'ψ', '.y'], ['⠨⠺', 'ω', '.w']
];
const GREEK_CAPITAL = [
  ['⠨⠠⠁', 'Α', '.,a'], ['⠨⠠⠃', 'Β', '.,b'], ['⠨⠠⠛', 'Γ', '.,g'], ['⠨⠠⠙', 'Δ', '.,d'], ['⠨⠠⠑', 'Ε', '.,e'],
  ['⠨⠠⠵', 'Ζ', '.,z'], ['⠨⠠⠱', 'Η', '.,:'], ['⠨⠠⠹', 'Θ', '.,?'], ['⠨⠠⠊', 'Ι', '.,i'], ['⠨⠠⠅', 'Κ', '.,k'],
  ['⠨⠠⠇', 'Λ', '.,l'], ['⠨⠠⠍', 'Μ', '.,m'], ['⠨⠠⠝', 'Ν', '.,n'], ['⠨⠠⠭', 'Ξ', '.,x'], ['⠨⠠⠕', 'Ο', '.,o'],
  ['⠨⠠⠏', 'Π', '.,p'], ['⠨⠠⠗', 'Ρ', '.,r'], ['⠨⠠⠎', 'Σ', '.,s'], ['⠨⠠⠞', 'Τ', '.,t'], ['⠨⠠⠥', 'Υ', '.,u'],
  ['⠨⠠⠋', 'Φ', '.,f'], ['⠨⠠⠯', 'Χ', '.,&'], ['⠨⠠⠽', 'Ψ', '.,y'], ['⠨⠠⠺', 'Ω', '.,w']
];
// BANA 2022 Rule 6.2 distinguishes the variant Greek glyphs by the
// alternative-letter indicator. These entries are literal symbols, not a
// Greek parser: each complete code inserts one MathML identifier.
const GREEK_VARIANTS = [
  // BANA 6.1.5 lists these as the alternative lowercase Greek forms.
  ['⠨⠈⠃', 'ϐ', '.`b'],
  ['⠨⠈⠹', 'ϑ', '.`?'], // alternative theta
  ['⠨⠈⠎', 'ς', '.`s'], // final/alternative sigma
  ['⠨⠈⠋', 'φ', '.`f']  // alternative phi; standard phi is ϕ
];

// BANA Rule 6.1.1–6.1.3 and Appendix C. These are complete local alphabet
// constructions: the alphabet indicator and (when present) capitalization
// indicator are part of the bounded code. They do not turn the editor into a
// word parser; each row inserts one identifier and the next cell starts a new
// local operation.
const GERMAN_FRAKTUR = [
  // These glyphs intentionally follow the BANA 2022 Rule 6.1.1 table. The
  // publication prints the lowercase forms as bold Fraktur and the listed
  // capital exceptions (C, H, I, R, and Z) as their Unicode Fraktur forms.
  // The source code's German-letter indicator is the normative distinction;
  // MathCAT's Unicode serializer may choose a different display glyph.
  ['a', '𝖆', '𝔄'], ['b', '𝖇', '𝔅'], ['c', '𝖈', '𝕮'], ['d', '𝖉', '𝔇'],
  ['e', '𝖊', '𝔈'], ['f', '𝖋', '𝔉'], ['g', '𝖌', '𝔊'], ['h', '𝖍', '𝕳'],
  ['i', '𝖎', '𝕴'], ['j', '𝖏', '𝔍'], ['k', '𝖐', '𝔎'], ['l', '𝖑', '𝔏'],
  ['m', '𝖒', '𝔐'], ['n', '𝖓', '𝔑'], ['o', '𝖔', '𝔒'], ['p', '𝖕', '𝔓'],
  ['q', '𝖖', '𝔔'], ['r', '𝖗', '𝕽'], ['s', '𝖘', '𝔖'], ['t', '𝖙', '𝔗'],
  ['u', '𝖚', '𝔘'], ['v', '𝖛', '𝔙'], ['w', '𝖜', '𝔚'], ['x', '𝖝', '𝔛'],
  ['y', '𝖞', '𝔜'], ['z', '𝖟', '𝖅']
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
const ROMAN_LETTERS = new Map([['⠊', 'i'], ['⠧', 'v'], ['⠭', 'x'], ['⠇', 'l'], ['⠉', 'c'], ['⠙', 'd'], ['⠍', 'm']]);

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

// Convert BANA's printed source mnemonic to the Unicode cells used by the
// transition engine. This is intentionally one-code translation only. It
// never scans a passage, infers operands, or maintains expression state.
function sourceCells(notation) {
  return [...notation].map((character) => {
    if (character === '`') return '⠈';
    // BANA's printed source notation uses a few typographic aliases that do
    // not have a direct Braille-ASCII code point.  Keep these as explicit
    // source-notation aliases, rather than teaching the transition engine a
    // second encoding or inferring them from surrounding cells.
    if (character === '~') return '⠘'; // arrow direction: elevate nearer head
    if (character === ';') return '⠰'; // arrow direction: depress nearer head
    if (character === '|') return '⠳'; // BANA vertical bar cell
    if (character === '}') return '⠻'; // local shape/modifier terminator
    if (character === 'K') character = 'k'; // BANA's printed capital K is the same dot-3 k cell
    const letterCell = [...LETTERS.entries()].find(([, value]) => value === character)?.[0];
    if (letterCell) return letterCell;
    const cell = ASCII_TO_UNICODE.get(character);
    if (cell) return cell;
    throw new TypeError(`Unsupported BANA source notation character: ${character}`);
  });
}

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
  if (!parent) return replaceCurrent(tree, focus, replacement);
  const index = parent.children.indexOf(current);
  if (['math', 'mrow'].includes(parent.name)) {
    parent.children.splice(index + 1, 0, replacement);
    return replacement;
  }
  // A populated MathML slot such as an msqrt radicand or an mfrac numerator
  // is a single child position.  When the guided writer appends the next
  // local token there, promote that slot to an mrow instead of replacing the
  // focused token.  This preserves the one-step editor model while keeping
  // the canonical tree valid for arbitrary-length expressions inside slots.
  const row = element('mrow', [current, replacement]);
  parent.children[index] = row;
  return replacement;
}

function insertToken(tree, focus, name, value, { replace = false, mathvariant = null, dataAttributes = {} } = {}) {
  const current = currentNode(tree, focus);
  const node = name === 'mspace'
    ? element('mspace', [], { width: '0.3em' })
    : atom(name, value, { ...(mathvariant ? { mathvariant } : {}), ...dataAttributes });
  const inserted = replace || (current.name === 'math' && current.children.length === 0) || isHole(current)
    ? replaceCurrent(tree, focus, node)
    : insertAfter(tree, focus, node);
  return { tree, focus: focusNode(inserted) };
}

// A bounded Nemeth construction may have one local code but more than one
// MathML child.  Keep that distinction declarative: the registry supplies the
// child atoms and this one primitive composes them into an mrow.  It is not a
// parser and it does not infer operands or precedence.  MathJax/SRE can then
// navigate the resulting children exactly as it navigates any authored row.
function insertComposite(tree, focus, parts, attrs = {}) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new RangeError('A composite local construction needs at least one part.');
  }
  const children = parts.map((part) => {
    if (!part || typeof part.name !== 'string' || typeof part.value !== 'string') {
      throw new RangeError('A composite local construction contains an invalid part.');
    }
    return atom(part.name, part.value, part.attrs ?? {});
  });
  const composite = element('mrow', children, attrs);
  const inserted = replaceCurrent(tree, focus, composite);
  return { tree, focus: focusNode(inserted) };
}

// BANA 14.7 uses the contracted comma (⠪) for a comma plus its optional
// following space inside a superscript or subscript.  MathML keeps those as
// two ordinary local siblings; the transition merely inserts those siblings
// after the focused script item.  It never scans or parses the rest of the
// script.
function insertContractedScriptComma(tree, focus) {
  const current = currentNode(tree, focus);
  const script = ancestor(tree, current, ['msup', 'msub', 'msubsup', 'mmultiscripts']);
  if (!script || current.name === 'math' || isHole(current)) {
    throw new RangeError('A contracted comma is only valid inside a script slot.');
  }
  const comma = atom('mo', ',', { 'data-omniya-script-comma': 'true' });
  // MathML/SRE supplies the presentation spacing for a comma in a script;
  // persisting an mspace here would double that spacing in the Braille
  // projection.  The source-linked attribute preserves that this was the
  // Nemeth contracted form without changing the mathematical tree.
  const parent = findMathParent(tree, current.attrs?.['data-omniya-id']);
  if (!parent) throw new RangeError('The contracted comma target is unavailable.');
  const index = parent.children.indexOf(current);
  if (index < 0) throw new RangeError('The contracted comma target is unavailable.');
  // A first script item is commonly represented directly as the child of
  // msub/msup.  Promote just that slot to an mrow before appending the comma;
  // this preserves MathML arity and keeps later cells in the same local slot.
  if (['msup', 'msub', 'msubsup'].includes(parent.name)) {
    const slot = parent.children.indexOf(current);
    if (slot === 1 || slot === 2) {
      const row = element('mrow', [current, comma]);
      parent.children[slot] = row;
      return { tree, focus: focusNode(comma) };
    }
  }
  if (['mrow', 'math'].includes(parent.name)) {
    parent.children.splice(index + 1, 0, comma);
    return { tree, focus: focusNode(comma) };
  }
  throw new RangeError('A contracted comma requires a local script expression row.');
}

// Rule 3.1.2 keeps a Nemeth numeric run distinct from ordinary identifiers.
// Appending to the focused <mn> is a local tree operation, not passage
// parsing: one cell extends only the current numeric atom.
function insertNumeric(tree, focus, value, { replace = false, mathvariant = null, dataAttributes = {} } = {}) {
  const current = currentNode(tree, focus);
  if (!replace && current.name === 'mn' && current.children?.length === 1) {
    current.children[0].text += value;
    if (mathvariant) current.attrs.mathvariant = mathvariant;
    Object.assign(current.attrs, dataAttributes);
    return { tree, focus: focusNode(current) };
  }
  return insertToken(tree, focus, 'mn', value, { replace, dataAttributes });
}

function extendIntegral(tree, focus, values) {
  const current = currentNode(tree, focus);
  if (current.name !== 'mo' || !values[current.children?.[0]?.text]) {
    throw new RangeError('Repeated-integral follow-up requires the focused integral sign.');
  }
  current.children = [text(values[current.children[0].text])];
  return { tree, focus: focusNode(current) };
}

// Rule 15.9 applies the same bounded superposition transition to integrals,
// bars, operation signs, shapes, and comparison signs.  The source code is
// collected as one local registry entry; this primitive only changes the
// already-focused sign and never searches for an operand or parses a passage.
function superposeToken(tree, focus, value, intent, allowedValues = null) {
  const current = currentNode(tree, focus);
  if (current.name !== 'mo' || (allowedValues && !allowedValues.includes(current.children?.[0]?.text))) {
    throw new RangeError('Superposition requires the focused mathematical sign.');
  }
  current.children = [text(value)];
  if (intent) current.attrs['data-omniya-nemeth-intent'] = intent;
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

// BANA 14.12 places a prime before a later right subscript/superscript.  In
// MathML the prime is part of the base expression, not the script itself.
// This is a one-step local repair of the adjacent siblings under the current
// row.  It deliberately does not inspect or infer any wider expression.
function wrapScriptAfterPrime(tree, focus, elementName, roles, attrs = {}, initialSlot = roles[0]) {
  const current = currentNode(tree, focus);
  const parent = current.name === 'mo' && current.children?.[0]?.text === '′'
    ? findMathParent(tree, current.attrs?.['data-omniya-id'])
    : null;
  if (!parent || !['math', 'mrow'].includes(parent.name)) return null;
  const primeIndex = parent.children.indexOf(current);
  if (primeIndex <= 0) return null;
  const prior = parent.children[primeIndex - 1];
  if (!prior || isHole(prior)) return null;
  const base = element('mrow', [prior, current]);
  const wrapper = element(elementName, [], {
    ...attrs,
    'data-omniya-id': prior.attrs?.['data-omniya-id'] ?? id()
  });
  base.attrs['data-omniya-id'] = id();
  prior.attrs['data-omniya-id'] = id();
  wrapper.children.push(base);
  for (const role of roles.slice(1)) wrapper.children.push(hole(wrapper, role));
  parent.children.splice(primeIndex - 1, 2, wrapper);
  const slot = wrapper.children.find((child) => child.attrs?.['data-omniya-role'] === initialSlot);
  return { tree, focus: focusNode(slot ?? wrapper) };
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
  const names = elementName === 'mover' || elementName === 'munder'
    ? [elementName, 'munderover']
    : [elementName];
  const container = ancestor(tree, currentNode(tree, focus), names);
  if (!container) throw new RangeError(`No open ${elementName} at the current draft focus.`);
  const parent = findMathParent(tree, container.attrs['data-omniya-id']);
  return { tree, focus: focusNode(parent ?? tree) };
}

// BANA 14.5 left-script entry is a local promotion of the structure already
// under focus. It does not inspect or parse siblings: an unfinished one-sided
// script is converted to MathML multiscripts, preserving its script and
// opening only the base slot for the next local symbol.
function promoteScriptToPrescript(tree, focus, direction) {
  const current = currentNode(tree, focus);
  const container = ancestor(tree, current, ['msup', 'msub']);
  if (!container) return null;
  const parent = findMathParent(tree, container.attrs?.['data-omniya-id']);
  const base = container.children?.[0];
  const script = container.children?.[1];
  if (!parent || !base || !script || !isHole(base) || isHole(script)) return null;
  const baseHole = structuredClone(base);
  const marker = element('mprescripts');
  const none = element('none');
  const leftSubscript = direction === 'sub' ? script : none;
  const leftSuperscript = direction === 'sup' ? script : none;
  const replacement = element('mmultiscripts', [baseHole, marker, leftSubscript, leftSuperscript], {
    'data-omniya-id': container.attrs['data-omniya-id']
  });
  const index = parent.children.indexOf(container);
  if (index < 0) return null;
  parent.children[index] = replacement;
  return { tree, focus: focusNode(baseHole) };
}

// BANA Rule 14 permits more than one script level in a bounded indicator
// sequence.  MathML's multiscripts element is the native representation for
// that composition: each encountered direction contributes one post-script
// pair, with <none/> occupying the opposite side.  This is deliberately a
// local operation.  It consumes only the registered indicator sequence and
// never tries to infer an operand or parse the surrounding passage.
function openScriptChain(tree, focus, directions) {
  if (!Array.isArray(directions) || directions.length < 2) {
    throw new RangeError('A script chain needs at least two registered levels.');
  }
  const current = currentNode(tree, focus);
  const inheritedId = current.name !== 'math' ? current.attrs?.['data-omniya-id'] : null;
  const base = current.name !== 'math' && !isHole(current)
    ? structuredClone(current)
    : null;
  if (base !== current && base.attrs && !isHole(base)) base.attrs['data-omniya-id'] = id();
  let nested = base ?? element('mrow', []);
  const slots = [];
  for (let index = directions.length - 1; index >= 0; index -= 1) {
    const direction = directions[index];
    if (direction !== 'sup' && direction !== 'sub') {
      throw new RangeError(`Unknown script direction: ${direction}`);
    }
    const elementName = direction === 'sub' ? 'msub' : 'msup';
    const role = direction === 'sub' ? 'subscript' : 'superscript';
    const wrapper = element(elementName, [], {});
    wrapper.children.push(nested, hole(wrapper, role));
    nested = wrapper;
    slots.unshift(wrapper.children[1]);
  }
  if (inheritedId) nested.attrs['data-omniya-id'] = inheritedId;
  replaceCurrent(tree, focus, nested);
  return { tree, focus: focusNode(slots[0] ?? nested) };
}

function openModifier(tree, focus, elementName, initialSlot) {
  return wrapCurrent(tree, focus, elementName, ['base', initialSlot], {}, initialSlot);
}

// BANA Rule 7.3.5 represents a mathematically meaningful multi-token
// expression with an opening and closing typeform indicator.  The guided
// editor models that boundary as an ordinary MathML mstyle subtree.  The
// opening operation creates one expression hole when writing from an empty
// focus, or wraps the exact focused subtree when editing populated math; the
// closing operation returns to the surrounding row.  No phrase buffer or
// lexical scope is kept outside the tree.
function openTypeformScope(tree, focus, mathvariant) {
  const current = currentNode(tree, focus);
  const wrapper = element('mstyle', [], {
    mathvariant,
    'data-omniya-nemeth-intent': 'typeform-scope'
  });
  if (current.name === 'math' || isHole(current)) {
    const slot = hole(wrapper, 'expression');
    wrapper.children.push(slot);
    replaceCurrent(tree, focus, wrapper);
    return { tree, focus: focusNode(slot) };
  }
  const content = structuredClone(current);
  content.attrs['data-omniya-id'] = id();
  wrapper.children.push(content);
  replaceCurrent(tree, focus, wrapper);
  return { tree, focus: focusNode(content) };
}

function closeTypeformScope(tree, focus) {
  const current = currentNode(tree, focus);
  const wrapper = ancestor(tree, current, ['mstyle']);
  if (!wrapper || wrapper.attrs?.['data-omniya-nemeth-intent'] !== 'typeform-scope') {
    throw new RangeError('A typeform terminator requires an open mathematical typeform scope.');
  }
  const content = wrapper.children?.[0];
  if (!content || isHole(content)) {
    throw new RangeError('A typeform scope must contain an expression before it can close.');
  }
  const parent = findMathParent(tree, wrapper.attrs['data-omniya-id']);
  return { tree, focus: focusNode(parent ?? wrapper) };
}

// BANA Rule 18.3 upper/lower-limit forms are bounded local constructions.
// The function name is their base and the following limit is a real MathML
// child, so later guided navigation can enter that slot without a hidden
// function-specific parser or metadata stack.
function openFunctionLimit(tree, focus, direction) {
  const current = currentNode(tree, focus);
  const elementName = direction === 'under' ? 'munder' : 'mover';
  const role = direction === 'under' ? 'underscript' : 'overscript';
  const wrapper = element(elementName, [], current.name === 'math' ? {} : { 'data-omniya-id': current.attrs?.['data-omniya-id'] });
  const base = atom('mi', 'lim');
  const limit = hole(wrapper, role);
  wrapper.children.push(base, limit);
  replaceCurrent(tree, focus, wrapper);
  return { tree, focus: focusNode(limit) };
}

// Rule 15.4's simultaneous modifier is a local structural follow-up.  It
// upgrades the already-created one-sided mover/munder without inspecting any
// surrounding passage.  The existing base and modifier retain their IDs;
// only the missing opposite slot is created.
function addSimultaneousModifier(tree, focus, direction) {
  const current = currentNode(tree, focus);
  const container = ancestor(tree, current, ['mover', 'munder']);
  if (!container) throw new RangeError('A simultaneous modifier needs an existing over or under structure.');
  const parent = findMathParent(tree, container.attrs['data-omniya-id']);
  const base = container.children[0];
  const existing = container.children[1];
  const under = container.name === 'munder' ? existing : hole(container, 'underscript');
  const over = container.name === 'mover' ? existing : hole(container, 'overscript');
  // The indicator is itself the next local operation.  If the current focus
  // is already in the occupied side, retain it as the container anchor.
  container.name = 'munderover';
  container.children = [base, under, over];
  // Keep the source node in place and put the editor in the newly-created
  // required slot.  This is one structural operation, not a second parser.
  if (parent) {
    const index = parent.children.indexOf(container);
    if (index < 0) throw new RangeError('The simultaneous modifier is not attached to its parent.');
  }
  const target = direction === 'under' ? under : over;
  return { tree, focus: focusNode(target) };
}

// BANA 15.3: a second-order modifier is a modifier of the already modified
// expression, not a second side of the original expression.  This operation
// wraps only the nearest existing mover/munder and opens its same-side slot.
// It never searches for operands or consumes anything outside that one local
// MathML structure.
function addHigherOrderModifier(tree, focus, direction) {
  let current = currentNode(tree, focus);
  // A terminator normally returns focus to the surrounding row. For a
  // higher-order code, the immediately preceding same-side modifier is the
  // exact local target and is therefore safe to recover without broadening.
  if (current.name === 'math' || current.name === 'mrow') {
    const candidate = [...(current.children ?? [])].reverse().find((child) =>
      child.name === (direction === 'under' ? 'munder' : 'mover'));
    if (candidate) current = candidate;
  }
  const inner = ancestor(tree, current, direction === 'under' ? ['munder', 'munderover'] : ['mover', 'munderover']);
  if (!inner || inner.name === 'munderover') {
    throw new RangeError('A higher-order modifier requires an existing same-side modifier.');
  }
  const parent = findMathParent(tree, inner.attrs?.['data-omniya-id']);
  if (!parent) throw new RangeError('The higher-order modifier has no local parent.');
  const index = parent.children.indexOf(inner);
  if (index < 0) throw new RangeError('The higher-order modifier target is unavailable.');
  const wrapperName = direction === 'under' ? 'munder' : 'mover';
  const wrapper = element(wrapperName, [], { 'data-omniya-id': inner.attrs?.['data-omniya-id'] ?? id() });
  inner.attrs['data-omniya-id'] = id();
  wrapper.children.push(inner, hole(wrapper, direction === 'under' ? 'underscript' : 'overscript'));
  parent.children[index] = wrapper;
  return { tree, focus: focusNode(wrapper.children[1]) };
}

// Rule 15.6's binomial is represented as an explicit two-row MathML table.
// The upper/lower cells are the only editable state; the surrounding fences
// are ordinary local children and no passage-level delimiter stack is kept.
function openBinomial(tree, focus) {
  const current = currentNode(tree, focus);
  const wrapper = element('mrow', [], { 'data-omniya-binomial': 'true', intent: 'binomial($upper,$lower)' });
  const table = element('mtable', [], { 'data-omniya-role': 'binomial-table' });
  const upperRow = element('mtr', [element('mtd', [hole(table, 'binomial-upper')])]);
  const lowerRow = element('mtr', [element('mtd', [hole(table, 'binomial-lower')])]);
  table.children.push(upperRow, lowerRow);
  wrapper.children.push(atom('mo', '('), table, atom('mo', ')'));
  replaceCurrent(tree, focus, wrapper);
  return { tree, focus: focusNode(upperRow.children[0].children[0]) };
}

function moveBinomialLower(tree, focus) {
  const current = currentNode(tree, focus);
  const table = ancestor(tree, current, ['mtable']);
  if (!table || table.attrs?.['data-omniya-role'] !== 'binomial-table') {
    throw new RangeError('The directly-under separator requires a binomial upper cell.');
  }
  const lower = table.children?.[1]?.children?.[0]?.children?.[0];
  if (!lower) throw new RangeError('The binomial lower cell is unavailable.');
  return { tree, focus: focusNode(lower) };
}

function closeBinomial(tree, focus) {
  const current = currentNode(tree, focus);
  const table = ancestor(tree, current, ['mtable']);
  if (!table || table.attrs?.['data-omniya-role'] !== 'binomial-table') {
    throw new RangeError('A binomial terminator requires the lower cell.');
  }
  const wrapper = ancestor(tree, table, ['mrow']);
  const parent = wrapper ? findMathParent(tree, wrapper.attrs?.['data-omniya-id']) : null;
  return { tree, focus: focusNode(parent ?? wrapper ?? tree) };
}

// A local base-n digit is still one numeric atom. The mode is entered by the
// numeric indicator and cleared only by a non-digit structural transition;
// it does not infer a base or parse an arbitrary numeral passage.
function insertBaseDigit(tree, focus, value) {
  const current = currentNode(tree, focus);
  if (current.name === 'mn' && current.children?.length === 1) {
    current.children[0].text += value;
    return { tree, focus: focusNode(current) };
  }
  return insertToken(tree, focus, 'mn', value);
}

function insertRomanLetter(tree, focus, value) {
  const current = currentNode(tree, focus);
  if (current.name === 'mi' && current.attrs?.['data-omniya-nemeth-intent'] === 'roman' && current.children?.length === 1) {
    current.children[0].text += value;
    return { tree, focus: focusNode(current) };
  }
  return insertToken(tree, focus, 'mi', value, {
    dataAttributes: { 'data-omniya-nemeth-intent': 'roman' }
  });
}

// BANA Rules 8.4 and 14.13: apostrophe-s may follow any numeral, letter, or
// mathematical expression. The input is one bounded local code; the
// operation appends two baseline siblings after the exact focused node and
// does not inspect a surrounding word or passage.
function appendPossessive(tree, focus) {
  const current = currentNode(tree, focus);
  if (current.name === 'math' || isHole(current)) throw new RangeError('Apostrophe-s requires a populated mathematical expression.');
  const target = ancestor(tree, current, ['msup', 'msub', 'msubsup', 'mmultiscripts']) ?? current;
  const parent = findMathParent(tree, target.attrs?.['data-omniya-id']);
  if (!parent || !['math', 'mrow'].includes(parent.name)) throw new RangeError('Apostrophe-s requires a local expression row.');
  const index = parent.children.indexOf(target);
  if (index < 0) throw new RangeError('The possessive target is unavailable.');
  const apostrophe = atom('mo', '′', { 'data-omniya-nemeth-intent': 'possessive-apostrophe' });
  const suffix = atom('mi', 's', { 'data-omniya-nemeth-intent': 'possessive-s' });
  parent.children.splice(index + 1, 0, apostrophe, suffix);
  return { tree, focus: focusNode(suffix) };
}

function appendPlural(tree, focus) {
  const current = currentNode(tree, focus);
  if (current.name === 'math' || isHole(current)) throw new RangeError('A plural ending requires a populated mathematical expression.');
  const target = ancestor(tree, current, ['msup', 'msub', 'msubsup', 'mmultiscripts']) ?? current;
  const parent = findMathParent(tree, target.attrs?.['data-omniya-id']);
  if (!parent || !['math', 'mrow'].includes(parent.name)) throw new RangeError('A plural ending requires a local expression row.');
  const suffix = atom('mi', 's', { 'data-omniya-nemeth-intent': 'plural-suffix' });
  const index = parent.children.indexOf(target);
  if (index < 0) throw new RangeError('The plural target is unavailable.');
  parent.children.splice(index + 1, 0, suffix);
  return { tree, focus: focusNode(suffix) };
}

// BANA Rule 3.7: an ordinal ending in a mathematical expression is a local
// suffix on the focused numeric atom. It is deliberately not a word/ordinal
// parser: only one registered ending is appended to one existing <mn>.
function appendOrdinal(tree, focus, ending) {
  const current = currentNode(tree, focus);
  if (current.name !== 'mn' || isHole(current)) throw new RangeError('An ordinal ending requires a focused mathematical numeral.');
  const parent = findMathParent(tree, current.attrs?.['data-omniya-id']);
  if (!parent || !['math', 'mrow'].includes(parent.name)) throw new RangeError('The ordinal target is unavailable.');
  const suffix = atom('mi', ending, { 'data-omniya-nemeth-intent': 'ordinal-ending' });
  const index = parent.children.indexOf(current);
  if (index < 0) throw new RangeError('The ordinal target is unavailable.');
  parent.children.splice(index + 1, 0, suffix);
  return { tree, focus: focusNode(suffix) };
}


function modifierElementForMode(modeValue) {
  return modeValue === 'modifier-under' ? 'munder' : 'mover';
}

function directChildForScope(tree, focus, parentNodeId) {
  let current = currentNode(tree, focus);
  while (current) {
    const parent = isElement(current)
      ? findMathParent(tree, current.attrs?.['data-omniya-id'])
      : null;
    if (parent?.attrs?.['data-omniya-id'] === parentNodeId) return current;
    current = parent;
  }
  return null;
}

function extendModifierScope(tree, focus, priorScope = null) {
  const inserted = currentNode(tree, focus);
  const immediateParent = findMathParent(tree, inserted.attrs?.['data-omniya-id']);
  if (!immediateParent) return priorScope;
  const parentNodeId = priorScope?.parentNodeId ?? immediateParent.attrs?.['data-omniya-id'];
  const direct = directChildForScope(tree, focus, parentNodeId);
  if (!direct) return priorScope;
  return {
    parentNodeId,
    firstNodeId: priorScope?.firstNodeId ?? direct.attrs['data-omniya-id'],
    lastNodeId: direct.attrs['data-omniya-id']
  };
}

function scopeForCurrent(tree, focus) {
  const current = currentNode(tree, focus);
  const parent = findMathParent(tree, current.attrs?.['data-omniya-id']);
  if (!parent) return null;
  const direct = directChildForScope(tree, focus, parent.attrs?.['data-omniya-id']);
  if (!direct) return null;
  const last = parent.children.indexOf(direct);
  if (last < 0) return null;
  return {
    parentNodeId: parent.attrs['data-omniya-id'],
    // A newly opened modifier applies to the focused direct child only. A
    // multi-token range is recorded explicitly by extendModifierScope while
    // the local construction is being entered; falling back to the first
    // sibling would silently broaden a modifier over pre-existing content.
    firstNodeId: direct.attrs['data-omniya-id'],
    lastNodeId: direct.attrs['data-omniya-id']
  };
}

function wrapModifierScope(tree, scope, elementName, value, dataAttributes = {}) {
  const parent = findMathNode(tree, scope?.parentNodeId);
  if (!parent || !Array.isArray(parent.children)) {
    throw new RangeError('The modifier expression scope is no longer available.');
  }
  const first = parent.children.findIndex((child) => child.attrs?.['data-omniya-id'] === scope.firstNodeId);
  const last = parent.children.findIndex((child) => child.attrs?.['data-omniya-id'] === scope.lastNodeId);
  if (first < 0 || last < first) throw new RangeError('The modifier expression scope is not contiguous.');
  const selected = parent.children.slice(first, last + 1);
  const inheritedId = selected[0].attrs?.['data-omniya-id'];
  const wrapper = element(elementName, [], inheritedId ? { 'data-omniya-id': inheritedId } : {});
  const base = selected.length === 1
    ? selected[0]
    : element('mrow', selected);
  if (selected.length === 1) base.attrs['data-omniya-id'] = id();
  wrapper.children.push(base);
  const modifier = atom('mo', value, { 'data-omniya-role': elementName === 'munder' ? 'underscript' : 'overscript', ...dataAttributes });
  wrapper.children.push(modifier);
  parent.children.splice(first, selected.length, wrapper);
  return { tree, focus: focusNode(modifier), wrapper };
}

function insertModifier(tree, focus, value, modeValue = null, scope = null, dataAttributes = {}) {
  // BANA 15.5: parallel horizontal bars are one modifier, not higher-order
  // modifiers.  Append only to the currently occupied local modifier slot.
  if (modeValue === 'modifier-complete' && value === '¯') {
    const current = currentNode(tree, focus);
    const parent = current.name !== 'math' ? findMathParent(tree, current.attrs?.['data-omniya-id']) : null;
    const role = current.attrs?.['data-omniya-role'];
    if (parent && ['mover', 'munder'].includes(parent.name) &&
      ['overscript', 'underscript'].includes(role) && current.name === 'mo' && current.children?.[0]?.text === '¯') {
      const row = element('mrow', [current, atom('mo', '¯', { 'data-omniya-role': role, ...dataAttributes })]);
      const index = parent.children.indexOf(current);
      parent.children[index] = row;
      return { tree, focus: focusNode(row.children[1]), wrapper: parent };
    }
    if (parent && ['mover', 'munder'].includes(parent.name) &&
      ['overscript', 'underscript'].includes(role) && current.name === 'mrow') {
      current.children.push(atom('mo', '¯', { 'data-omniya-role': role, ...dataAttributes }));
      return { tree, focus: focusNode(current.children.at(-1)), wrapper: parent };
    }
  }
  // When the expression starts in an empty replacement root, the
  // multipurpose/directly-over (or under) cells stage a local expectation.
  // Do not wrap the first token eagerly: ordinary guided input must remain
  // ordinary input until the modifier cell itself is entered.  This avoids
  // turning a multi-token local expression into a sequence of nested
  // modifiers.  The author can group a larger expression explicitly before
  // applying the modifier, just as they can elsewhere in the tree.
  if (modeValue?.startsWith?.('modifier-')) {
    const current = currentNode(tree, focus);
    const slotParent = current.name !== 'math' && isHole(current)
      ? findMathParent(tree, current.attrs?.['data-omniya-id'])
      : null;
    if (slotParent?.name === 'munderover') {
      const role = current.attrs?.['data-omniya-role'];
      const replacement = atom('mo', value, { 'data-omniya-role': role, ...dataAttributes });
      const index = slotParent.children.indexOf(current);
      slotParent.children[index] = replacement;
      return { tree, focus: focusNode(replacement), wrapper: slotParent };
    }
    if (current.name === 'math' || isHole(current)) {
      if (value === '¯' && tree.children.length === 0) {
        throw new RangeError('A modifier needs an expression before its modifier cell.');
      }
      const fallback = tree.children.at(-1);
      if (fallback && fallback.name !== 'math' && !isHole(fallback)) {
        return wrapModifierScope(tree, {
          parentNodeId: tree.attrs['data-omniya-id'],
          firstNodeId: tree.children[0].attrs['data-omniya-id'],
          lastNodeId: fallback.attrs['data-omniya-id']
        }, modifierElementForMode(modeValue), value, dataAttributes);
      }
      throw new RangeError('A modifier needs an expression before its modifier cell.');
    }
    if (current.name !== 'math' && !isHole(current) && !scope) {
      scope = scopeForCurrent(tree, focus);
    }
    if (scope) {
      const wrapped = wrapModifierScope(tree, scope, modifierElementForMode(modeValue), value, dataAttributes);
      return { tree, focus: wrapped.focus, wrapper: wrapped.wrapper };
    }
    const elementName = modifierElementForMode(modeValue);
    const initialSlot = elementName === 'munder' ? 'underscript' : 'overscript';
    const wrapped = wrapCurrent(tree, focus, elementName, ['base', initialSlot], {}, initialSlot);
    const slot = currentNode(tree, wrapped.focus);
    const replacement = atom('mo', value, dataAttributes);
    replacement.attrs['data-omniya-role'] = initialSlot;
    const parent = findMathParent(tree, slot.attrs?.['data-omniya-id']);
    const index = parent?.children.indexOf(slot) ?? -1;
    if (!parent || index < 0) throw new RangeError('The modifier slot is unavailable.');
    parent.children[index] = replacement;
    return { tree, focus: focusNode(replacement), wrapper: parent };
  }
  if (modeValue === 'multipurpose') {
    const current = currentNode(tree, focus);
    if (current.name === 'math' || isHole(current)) {
      const fallback = tree.children.at(-1);
      if (fallback && fallback.name !== 'math' && !isHole(fallback)) {
        return wrapModifierScope(tree, {
          parentNodeId: tree.attrs['data-omniya-id'],
          firstNodeId: tree.children[0].attrs['data-omniya-id'],
          lastNodeId: fallback.attrs['data-omniya-id']
        }, 'mover', value, dataAttributes);
      }
      throw new RangeError('A modifier needs an expression before its modifier cell.');
    }
    const scopeTarget = scope ?? scopeForCurrent(tree, focus);
    if (scopeTarget) return wrapModifierScope(tree, scopeTarget, 'mover', value, dataAttributes);
  }
  // BANA 15.2.2/15.2.3 contracted form: a single focused letter or digit
  // followed by the horizontal bar is itself a complete local modification.
  // This is deliberately limited to the focused atom; a multi-token range
  // uses the five-step scope above.
  if (!modeValue) {
    const current = currentNode(tree, focus);
    if (current.name === 'mi' || current.name === 'mn') {
      const parent = findMathParent(tree, current.attrs?.['data-omniya-id']);
      if (!parent) throw new RangeError('A contracted modifier has no parent expression.');
      const index = parent.children.indexOf(current);
      if (index < 0) throw new RangeError('A contracted modifier target is unavailable.');
      const wrapper = element('mover', [], { 'data-omniya-id': current.attrs['data-omniya-id'] });
      const base = structuredClone(current);
      base.attrs['data-omniya-id'] = id();
      wrapper.children.push(base, atom('mo', value, { 'data-omniya-role': 'overscript', ...dataAttributes }));
      parent.children[index] = wrapper;
      return { tree, focus: focusNode(wrapper.children[1]), wrapper };
    }
  }
  const current = currentNode(tree, focus);
  const parent = findMathParent(tree, current.attrs?.['data-omniya-id']);
  if (!parent || !['mover', 'munder', 'munderover'].includes(parent.name)) {
    throw new RangeError('A modifier requires an open over or under structure.');
  }
  const role = parent.name === 'munder' ? 'underscript' : 'overscript';
  const slot = parent.children.find((child) => child.attrs?.['data-omniya-role'] === role);
  if (!slot || !isHole(slot)) throw new RangeError('The modifier slot is already occupied.');
  const replacement = atom('mo', value, dataAttributes);
  replacement.attrs['data-omniya-role'] = role;
  const index = parent.children.indexOf(slot);
  parent.children[index] = replacement;
  return { tree, focus: focusNode(replacement) };
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
const composite = (id, cells, banaRefs, parts, options = {}) => ({
  id,
  cells,
  banaRefs,
  action: 'insert-composite',
  commitPolicy: options.commitPolicy ?? LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
  args: {
    parts,
    ...(options.sourceNotation ? { sourceNotation: options.sourceNotation } : {}),
    ...(options.dataAttributes ? { dataAttributes: options.dataAttributes } : {})
  },
  ...(options.errataRefs ? { errataRefs: options.errataRefs } : {})
});
const sourceToken = (id, sourceNotation, banaRefs, value, name = 'mo', options = {}) => token(
  id, sourceCells(sourceNotation), banaRefs, value, name, { ...options, sourceNotation }
);
// Rule 21's modified-comparison table is a finite catalogue, not a grammar.
// Each row below is one published BANA construction.  The intent attribute
// preserves the particular vertical/superposed form when several forms share
// the same Unicode presentation glyph; no inference is performed from the
// surrounding expression.
const comparisonCompound = (id, sourceNotation, value, options = {}) => sourceToken(
  id,
  sourceNotation,
  ['21.9'],
  value,
  'mo',
  {
    ...options,
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    dataAttributes: { 'data-omniya-nemeth-intent': id, ...(options.dataAttributes ?? {}) },
  }
);
const comparisonSuperposition = (id, sourceNotation, value, options = {}) => sourceToken(
  id,
  sourceNotation,
  ['15.9', '21.12'],
  value,
  'mo',
  {
    ...options,
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    dataAttributes: { 'data-omniya-nemeth-intent': id, ...(options.dataAttributes ?? {}) }
  }
);
// A shape may be represented by a Unicode glyph, a MathML grouping, or a
// transcriber-defined local construction.  Keep the BANA meaning on the
// source node instead of inventing a notation grammar.  The attributes are
// application-owned and survive canonicalization; MathJax/SRE can still use
// the ordinary MathML children when it has a standard projection.
const shapeToken = (id, cells, banaRefs, value, shapeKind, options = {}) => token(
  id, cells, banaRefs, value, 'mo', { ...options, dataAttributes: {
    'data-omniya-shape-kind': shapeKind,
    ...(options.dataAttributes ?? {})
  }}
);
const shapeModificationToken = (id, cells, banaRefs, value, shapeKind, modification, options = {}) => token(
  id, cells, banaRefs, value, 'mo', { ...options, dataAttributes: {
    'data-omniya-shape-kind': shapeKind,
    'data-omniya-shape-modification': modification,
    ...(options.dataAttributes ?? {})
  }}
);
const open = (id, cells, banaRefs, elementName, slots, attrs = {}, initialSlot = slots[0], preferLonger = false, commitPolicy = LOCAL_COMMIT_POLICIES.IMMEDIATE, options = {}) => ({ id, cells, banaRefs, action: 'open-structure', commitPolicy, args: { element: elementName, slots, attrs, initialSlot, preferLonger, ...options } });
const fixedRoot = (id, cells, banaRefs, index, indexText, sourceNotation = null) => ({ id, cells, banaRefs, action: 'open-fixed-root', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { index, indexText, ...(sourceNotation ? { sourceNotation } : {}) } });
const move = (id, cells, banaRefs, elementName, role, options = {}) => ({ id, cells, banaRefs, action: 'move-slot', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: elementName, role, ...options } });
const close = (id, cells, banaRefs, elementName, options = {}) => ({ id, cells, banaRefs, action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: elementName, ...options } });
const mode = (id, cells, banaRefs, value, preferLonger = false, sourceNotation = null) => ({ id, cells, banaRefs, action: 'set-mode', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { mode: value, preferLonger, ...(sourceNotation ? { sourceNotation } : {}) } });
const modifier = (id, cells, banaRefs, elementName, slot, requiresMode = 'multipurpose', options = {}) => ({
  id, cells, banaRefs, action: 'open-modifier', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: elementName, slot, requiresMode, ...options }
});
const modifierToken = (id, cells, banaRefs, value, options = {}) => ({
  id, cells, banaRefs, action: 'insert-modifier', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
  args: { name: 'mo', value, ...options }
});
const typeformScope = (id, sourceNotation, banaRefs, mathvariant, options = {}) => ({
  id,
  cells: sourceCells(sourceNotation),
  banaRefs,
  action: options.close ? 'close-typeform-scope' : 'open-typeform-scope',
  commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
  args: { mathvariant, sourceNotation },
  ...(options.errataRefs ? { errataRefs: options.errataRefs } : {}),
  ...(options.sourceKind ? { sourceKind: options.sourceKind } : {})
});
// A modifier can itself be a complete BANA construction made from several
// cells.  Keep that construction in the same bounded local-code registry as
// ordinary arrows and shape interiors.  The modifier's MathML slot is not
// changed until Enter commits the exact registered sequence.
const atomicModifierToken = (id, cells, banaRefs, value, options = {}) => ({
  id, cells, banaRefs, action: 'insert-modifier', commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
  args: { name: 'mo', value, ...options }
});
const simultaneous = (id, cells, banaRefs, direction, sourceNotation = null) => ({
  id, cells, banaRefs, action: 'simultaneous-modifier',
  commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
  args: { direction, ...(sourceNotation ? { sourceNotation } : {}) }
});
const higherModifier = (id, cells, banaRefs, direction, sourceNotation = null) => ({
  id, cells, banaRefs, action: 'higher-order-modifier',
  commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { direction, ...(sourceNotation ? { sourceNotation } : {}) }
});
const contractedComma = (id, cells, banaRefs, sourceNotation = null) => ({
  id, cells, banaRefs, action: 'insert-contracted-script-comma',
  commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: sourceNotation ? { sourceNotation } : {}
});

const sourceMove = (id, cells, banaRefs, elementName, role, sourceNotation, options = {}) => move(
  id, cells, banaRefs, elementName, role, { sourceNotation, ...options }
);
const sourceClose = (id, cells, banaRefs, elementName, sourceNotation) => close(
  id, cells, banaRefs, elementName, { sourceNotation }
);
const sourceOpen = (id, cells, banaRefs, elementName, slots, attrs, initialSlot, preferLonger, commitPolicy, sourceNotation) => open(
  id, cells, banaRefs, elementName, slots, attrs, initialSlot, preferLonger, commitPolicy, { sourceNotation }
);
const scriptChain = (id, sourceNotation, directions, banaRefs = ['14.4.2', '14.4.3']) => ({
  id,
  cells: sourceCells(sourceNotation),
  banaRefs,
  action: 'open-script-chain',
  commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
  args: { directions, sourceNotation }
});

const cellForLetter = (letter) => [...LETTERS.entries()].find(([, value]) => value === letter)?.[0] ?? letter;
const NON_ENGLISH_MAPPINGS = [
  ...GERMAN_FRAKTUR.flatMap(([letter, lower, upper]) => {
    const base = cellForLetter(letter);
    return [
      token(`german.${letter}`, ['⠸', base], ['6.1.1', '6.2.1'], lower, 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: `_${letter}` }),
      token(`german.capital-${letter}`, ['⠸', '⠠', base], ['5.1.1', '6.1.1', '6.2.1'], upper, 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: `_,${letter}` })
    ];
  }),
  token('hebrew.aleph', ['⠠', '⠠', '⠁'], ['6.1.2', '6.2.1'], 'א', 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',,a' }),
  token('russian.ell', ['⠈', '⠈', '⠇'], ['6.1.3', '6.2.1'], 'л', 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@@l' }),
  token('russian.capital-ell', ['⠈', '⠈', '⠠', '⠇'], ['5.1.1', '6.1.3', '6.2.1'], 'Л', 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@`,l' }),
  token('russian.sha', ['⠈', '⠈', '⠱'], ['6.1.3', '6.2.1'], 'ш', 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@@:' }),
  token('russian.capital-sha', ['⠈', '⠈', '⠠', '⠱'], ['5.1.1', '6.1.3', '6.2.1'], 'Ш', 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@`,:' })
];
const BANA_FUNCTION_MAPPINGS = BANA_FUNCTION_NAMES.map((name) => token(
  `function.${name}`,
  [...name].map(cellForLetter),
  ['18.1', '18.4'],
  name,
  'mi',
  { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: name }
));
const BANA_LIMIT_MAPPINGS = [
  // BANA 18.3 gives upper/lower limit as dedicated local constructions. They
  // are not ordinary bar modifiers. The following expression is entered by
  // later structural operations in the same draft.
  {
    id: 'function.limit.upper', cells: ['⠣', '⠇', '⠊', '⠍'], banaRefs: ['18.3'],
    action: 'open-function-limit', commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    args: { direction: 'over', sourceNotation: '<lim' }
  },
  {
    id: 'function.limit.lower', cells: ['⠩', '⠇', '⠊', '⠍'], banaRefs: ['18.3'],
    action: 'open-function-limit', commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    args: { direction: 'under', sourceNotation: '%lim' }
  }
];
const FUNCTION_INITIAL_CELLS = new Set(BANA_FUNCTION_MAPPINGS.map((mapping) => mapping.cells[0]));

// Normative mapping ledger: BANA 2022 is the authority for every cell sequence
// and rule reference below. The October 2025 BANA errata is reviewed through
// `errataRefs` on operation rows when it changes a rule. MathCAT's Nemeth
// serializer and its public regression corpus are independent checks only;
// they never supply a missing BANA mapping or override the cited rule.
const MAPPINGS = [
  ...NON_ENGLISH_MAPPINGS,
  ...BANA_FUNCTION_MAPPINGS,
  ...BANA_LIMIT_MAPPINGS,
  ...[...LETTERS].map(([cells, value]) => token(`letter.${value}`, [cells], ['6.3', '6.4'], value, 'mi',
    { ...(FUNCTION_INITIAL_CELLS.has(cells) ? { preferLonger: true } : {}), sourceNotation: value })),
  token('operator.plus', ['⠬'], ['20.1'], '+', 'mo', { preferLonger: true, sourceNotation: '+' }),
  token('space', [' '], ['2.4'], '', 'mspace', { sourceNotation: ' ', sourceKind: 'context-policy' }),
  // Rule 8's mathematical punctuation cells are literal local symbols. The
  // punctuation indicator is a separate contextual operation used after a
  // preceding indicator; it must not be baked into every punctuation token.
  // Within the mathematical editor this is the mathematical comma (Braille
  // ASCII comma, ⠠). Literary comma ⠂ is a passage-format concern and is not
  // silently accepted as an equation comma.
  token('punctuation.comma', ['⠠'], ['8.1', '8.2'], ',', 'mo', { preferLonger: true, sourceNotation: ',', sourceKind: 'context-policy' }),
  // Rule 8.2 requires the punctuation indicator before mathematical
  // punctuation that would otherwise be read as a Nemeth numeral.  The
  // indicator and mark are one bounded local code; accepting the mark alone
  // would silently turn 4/3/2/8/6 into punctuation.
  token('punctuation.period', ['⠸', '⠲'], ['8.1', '8.2'], '.', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '_4' }),
  token('punctuation.colon', ['⠸', '⠒'], ['8.1', '8.2', '8.5'], ':', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '_3' }),
  token('punctuation.semicolon', ['⠸', '⠆'], ['8.1', '8.2', '8.6'], ';', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '_2' }),
  token('punctuation.question', ['⠸', '⠦'], ['8.1', '8.2'], '?', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '_8' }),
  token('punctuation.exclamation', ['⠸', '⠖'], ['8.1', '8.2'], '!', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '_6' }),
  token('punctuation.long-dash', ['⠤', '⠤', '⠤', '⠤'], ['8.8'], '―', 'mo', { sourceNotation: '----' }),
  // Rule 8.7: the short dash is two dots-36 cells. It is an atomic local
  // code because the first cell is also the minus sign; the registry's
  // longer-code lookahead keeps the punctuation construction reachable.
  sourceToken('punctuation.short-dash', '--', ['8.7'], '–', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  // Rule 11.1.2 uses the same four-cell long-dash construction when the dash
  // stands for omitted material. Keep that meaning explicit rather than
  // silently collapsing an omission into ordinary punctuation.
  sourceToken('omission.long-dash', '----', ['11.1.2'], '―', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    dataAttributes: { 'data-omniya-nemeth-intent': 'omission-long-dash' }
  }),
  token('punctuation.ellipsis', ['⠄', '⠄', '⠄'], ['8.8'], '…', 'mo', { sourceNotation: "'''" }),
  token('punctuation.left-single-quote', ['⠠', '⠦'], ['8.1'], '‘', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',8' }),
  // Rule 8's closing single quotation mark is punctuation indicator + dot 0
  // (⠴), not punctuation indicator + dot 6 (the apostrophe). The distinction
  // is explicit in the BANA punctuation table and matters after a MathML
  // expression at baseline.
  token('punctuation.right-single-quote', ['⠠', '⠴'], ['8.1'], '’', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',0' }),
  token('punctuation.left-double-quote', ['⠦'], ['8.1'], '“', 'mo', { sourceNotation: '8' }),
  token('punctuation.right-double-quote', ['⠴'], ['8.1'], '”', 'mo', { sourceNotation: '0' }),
  token('operator.minus', ['⠤'], ['20.6'], '−', 'mo', { preferLonger: true, sourceNotation: '-' }),
  token('operator.equals', ['⠨', '⠅'], ['21.1'], '=', 'mo', { sourceNotation: '.k' }),
  token('comparison.less', ['⠐', '⠅'], ['21.5'], '<', 'mo', { preferLonger: true, sourceNotation: '"k' }),
  token('comparison.greater', ['⠨', '⠂'], ['21.5'], '>', 'mo', { preferLonger: true, sourceNotation: '.1' }),
  // BANA 20.8 uses the dot-4 punctuation indicator before the division sign
  // (source `./`). It is distinct from the diagonal fraction-line slash.
  token('operator.divide', ['⠨', '⠌'], ['20.8'], '÷', 'mo', { sourceNotation: './' }),
  token('operator.multiply', ['⠈', '⠡'], ['20.7'], '×', 'mo', { sourceNotation: '`*' }),
  sourceToken('operator.plus-minus', '+-', ['20.6'], '±'),
  sourceToken('operator.minus-plus', '-+', ['20.6'], '∓'),
  token('operator.ampersand', ['⠸', '⠯'], ['20.2'], '&', 'mo', { sourceNotation: '_&' }),
  // BANA 20.1 lists backslash/divides as `_*` (punctuation indicator plus
  // cross cell), not as the bold/typeform prefix. Keep it a single local
  // operation; context determines factor/divides meaning.
  token('operator.backslash', ['⠸', '⠡'], ['20.1', '20.8'], '\\', 'mo', { preferLonger: true, sourceNotation: '_*' }),
  token('operator.circle-dot', ['⠫', '⠉', '⠸', '⠫', '⠡', '⠻'], ['20.1'], '⊙', 'mo', { sourceNotation: '$c_$*]' }),
  token('operator.circle-plus', ['⠫', '⠉', '⠸', '⠫', '⠬', '⠻'], ['20.1'], '⊕', 'mo', { sourceNotation: '$c_$+]' }),
  token('operator.circle-minus', ['⠫', '⠉', '⠸', '⠫', '⠤', '⠻'], ['20.1', '20.6'], '⊖', 'mo', { sourceNotation: '$c_$-]' }),
  sourceToken('operator.minus-bold', '_-', ['20.6'], '−', 'mo', { mathvariant: 'bold', preferLonger: true }),
  sourceToken('operator.minus-minus', '-"-', ['20.6'], '−−'),
  sourceToken('operator.minus-plus-bold', '_-"_+', ['20.6'], '−+'),
  sourceToken('operator.minus-plus-horizontal', '-"+', ['20.6'], '−+'),
  sourceToken('operator.minus-plus-regular-bold', '-"_+', ['20.6'], '−+'),
  sourceToken('operator.plus-bold', '_+', ['20.6'], '+', 'mo', { mathvariant: 'bold', preferLonger: true }),
  sourceToken('operator.plus-minus-bold', '_+"_-', ['20.6'], '+−'),
  sourceToken('operator.plus-minus-regular', '+"-', ['20.6'], '+−'),
  sourceToken('operator.plus-minus-regular-bold', '+"_-', ['20.6'], '+−'),
  sourceToken('operator.proper-difference', '.-', ['20.6'], '∸'),
  token('operator.number-sign', ['⠨', '⠼'], ['20.3'], '#', 'mo', { sourceNotation: '.#' }),
  token('operator.paragraph', ['⠈', '⠠', '⠏'], ['20.3'], '¶', 'mo', { preferLonger: true, sourceNotation: '`,p' }),
  token('operator.section', ['⠈', '⠠', '⠎'], ['20.3'], '§', 'mo', { preferLonger: true, sourceNotation: '`,s' }),
  // BANA Rule 20.3 names this the star symbol (☆); MathCAT's glyph choice
  // is an independent rendering convention and does not override BANA.
  token('operator.star', ['⠫', '⠎'], ['20.3'], '☆', 'mo', { sourceNotation: '$s' }),
  token('operator.ring', ['⠨', '⠡'], ['20.3'], '∘', 'mo', { preferLonger: true, sourceNotation: '.*' }),
  // An ordinary integral is a complete local code and is inserted at once.
  // Any bounds, multiplicity, or superposed decoration is added afterward by
  // the same structural-followup operations used for every other operator.
  token('operator.integral', ['⠮'], ['23.12'], '∫', 'mo', { sourceNotation: '!' }),
  {
    id: 'integral.extend', cells: ['⠮'], banaRefs: ['23.12'], action: 'extend-integral',
    commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
    args: { values: { '∫': '∬', '∬': '∭' }, sourceNotation: '!!' }
  },
  // These two BANA compound symbols have a distinct leading construction and
  // are therefore valid bounded local codes; an ordinary ⠮ remains immediate.
  token('integral.lower', ['⠩', '⠮'], ['23.12'], '⨜', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '%!' }),
  token('integral.upper', ['⠣', '⠮'], ['23.12'], '⨛', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '<!' }),
  // BANA Rule 23.12 lists superposed integral signs as modifications of an
  // already-present integral. The leading integral cell is therefore the
  // immediate operation above; these rows are bounded structural follow-ups.
  {
    id: 'integral.superpose.circle', cells: ['⠈', '⠫', '⠉', '⠻'],
    banaRefs: ['15.9', '23.12'], action: 'superpose-token',
    commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
    args: { value: '∮', allowedValues: ['∫', '∬', '∭'], sourceNotation: '!`$c]' }
  },
  {
    id: 'integral.superpose.infinity', cells: ['⠈', '⠠', '⠿', '⠻'],
    banaRefs: ['15.9', '23.11', '23.12'], action: 'superpose-token',
    commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
    args: { value: '∰', allowedValues: ['∫', '∬', '∭'], sourceNotation: '!`,=]' }
  },
  {
    id: 'integral.superpose.rectangle', cells: ['⠈', '⠫', '⠗', '⠻'],
    banaRefs: ['15.9', '23.12'], action: 'superpose-token',
    commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
    args: { value: '∯', allowedValues: ['∫', '∬', '∭'], sourceNotation: '!`$r]' }
  },
  {
    id: 'integral.superpose.square', cells: ['⠈', '⠫', '⠲', '⠻'],
    banaRefs: ['15.9', '23.12'], action: 'superpose-token',
    commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
    args: { value: '⨖', allowedValues: ['∫', '∬', '∭'], sourceNotation: '!`$4]' }
  },
  // Rule 15.9's hierarchy is not integral-specific. These representative
  // source constructions use the same generic bounded superposition action;
  // the source intent is retained because Unicode glyphs are only a display
  // projection for some compounded signs.
  {
    id: 'superposition.bar-shape', cells: sourceCells(':`$4]'),
    banaRefs: ['15.9'], action: 'superpose-token',
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    args: { value: '⊟', intent: 'bar-superposed-square', sourceNotation: ':`$4]' }
  },
  {
    id: 'superposition.operation-equals', cells: sourceCells('*`.k]'),
    banaRefs: ['15.9'], action: 'superpose-token',
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    args: { value: '⊕=', intent: 'operation-superposed-equals', sourceNotation: '*`.k]' }
  },
  {
    id: 'superposition.comparison', cells: sourceCells('.K`_"K]'),
    banaRefs: ['15.9', '21.12'], action: 'superpose-token',
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    args: { value: '≟', intent: 'comparison-superposition', sourceNotation: '.K`_"K]' }
  },
  // The n-ary summation sign is a Greek capital sigma with the Greek
  // alphabet indicator and capitalization indicator (BANA 6.1.4, 6.2,
  // Appendix C). It is not the plain English-letter sequence ⠠⠎.
  sourceToken('operator.sum', '.,s', ['6.1.4', '6.2', '18.1'], '∑'),
  sourceOpen('fraction.start.simple', ['⠹'], ['13.1', '13.2'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'simple' }, 'numerator', false, LOCAL_COMMIT_POLICIES.IMMEDIATE, '?'),
  sourceMove('fraction.next.denominator', ['⠌'], ['13.2'], 'mfrac', 'denominator', '/', { bevelled: false, fractionKind: 'simple' }),
  sourceMove('fraction.next.denominator.diagonal', ['⠸', '⠌'], ['13.2'], 'mfrac', 'denominator', '_/', { bevelled: true, fractionKind: 'simple' }),
  sourceClose('fraction.end.simple', ['⠼'], ['13.2.1'], 'mfrac', '#'),
  sourceOpen('fraction.start.complex', ['⠠', '⠹'], ['13.5', '13.6'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'complex' }, 'numerator', false, LOCAL_COMMIT_POLICIES.IMMEDIATE, ',?'),
  sourceMove('fraction.next.denominator.complex', ['⠠', '⠌'], ['13.5', '13.6'], 'mfrac', 'denominator', ',/', { bevelled: false, fractionKind: 'complex' }),
  sourceMove('fraction.next.denominator.complex.diagonal', ['⠠', '⠸', '⠌'], ['13.5', '13.6'], 'mfrac', 'denominator', ',_/', { bevelled: true, fractionKind: 'complex' }),
  sourceClose('fraction.end.complex', ['⠠', '⠼'], ['13.6'], 'mfrac', ',#'),
  sourceOpen('fraction.start.hypercomplex', ['⠠', '⠠', '⠹'], ['13.7', '13.8'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'hypercomplex' }, 'numerator', false, LOCAL_COMMIT_POLICIES.IMMEDIATE, ',,?'),
  sourceMove('fraction.next.denominator.hypercomplex', ['⠠', '⠠', '⠌'], ['13.7', '13.8'], 'mfrac', 'denominator', ',,/', { bevelled: false, fractionKind: 'hypercomplex' }),
  sourceMove('fraction.next.denominator.hypercomplex.diagonal', ['⠠', '⠠', '⠸', '⠌'], ['13.7', '13.8'], 'mfrac', 'denominator', ',,_/', { bevelled: true, fractionKind: 'hypercomplex' }),
  sourceClose('fraction.end.hypercomplex', ['⠠', '⠠', '⠼'], ['13.8'], 'mfrac', ',,#'),
  // Rule 13.8.2: one additional dot-6 selects the next hypercomplex order.
  // This is a finite local extension of the published hypercomplex family,
  // not an arbitrary fraction parser.
  sourceOpen('fraction.start.hypercomplex.order3', ['⠠', '⠠', '⠠', '⠹'], ['13.8.2'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'hypercomplex', 'data-omniya-fraction-order': '3' }, 'numerator', false, LOCAL_COMMIT_POLICIES.IMMEDIATE, ',,,?'),
  sourceMove('fraction.next.denominator.hypercomplex.order3', ['⠠', '⠠', '⠠', '⠌'], ['13.8.2'], 'mfrac', 'denominator', ',,,/', { bevelled: false, fractionKind: 'hypercomplex' }),
  sourceMove('fraction.next.denominator.hypercomplex.order3.diagonal', ['⠠', '⠠', '⠠', '⠸', '⠌'], ['13.8.2'], 'mfrac', 'denominator', ',,,_/', { bevelled: true, fractionKind: 'hypercomplex' }),
  sourceClose('fraction.end.hypercomplex.order3', ['⠠', '⠠', '⠠', '⠼'], ['13.8.2'], 'mfrac', ',,,#'),
  sourceOpen('fraction.start.mixed', ['⠸', '⠹'], ['13.4'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'mixed' }, 'numerator', false, LOCAL_COMMIT_POLICIES.IMMEDIATE, '_?'),
  sourceMove('fraction.next.denominator.mixed', ['⠌'], ['13.4'], 'mfrac', 'denominator', '/', { bevelled: false, fractionKind: 'mixed' }),
  sourceMove('fraction.next.denominator.mixed.diagonal', ['⠸', '⠌'], ['13.4'], 'mfrac', 'denominator', '_/', { bevelled: true, fractionKind: 'mixed' }),
  sourceClose('fraction.end.mixed', ['⠸', '⠼'], ['13.4'], 'mfrac', '_#'),
  sourceOpen('script.superscript', ['⠘'], ['14.3', '14.4'], 'msup', ['base', 'superscript'], {}, 'superscript', true, LOCAL_COMMIT_POLICIES.IMMEDIATE, '~'),
  sourceOpen('script.subscript', ['⠰'], ['14.8'], 'msub', ['base', 'subscript'], {}, 'subscript', true, LOCAL_COMMIT_POLICIES.IMMEDIATE, ';'),
  sourceOpen('script.sup-sub', ['⠘', '⠰'], ['14.4.2'], 'msubsup', ['base', 'subscript', 'superscript'], {}, 'superscript', true, LOCAL_COMMIT_POLICIES.IMMEDIATE, '~;'),
  sourceOpen('script.sub-sup', ['⠰', '⠘'], ['14.4.2'], 'msubsup', ['base', 'subscript', 'superscript'], {}, 'subscript', true, LOCAL_COMMIT_POLICIES.IMMEDIATE, ';~'),
  // Rules 14.4.2–14.4.3 are represented as bounded local chains. Each row
  // describes only the ordered level indicators; the operation composes the
  // corresponding nested MathML scripts and opens the first required slot.
  scriptChain('script.sup-sup', '~~', ['sup', 'sup']),
  scriptChain('script.sup-sub-sup', '~;~', ['sup', 'sub', 'sup']),
  scriptChain('script.sup-sup-sup', '~~~', ['sup', 'sup', 'sup']),
  scriptChain('script.sup-sup-sub', '~~;', ['sup', 'sup', 'sub']),
  scriptChain('script.sup-sub-sub', '~;;', ['sup', 'sub', 'sub']),
  scriptChain('script.sub-sub', ';;', ['sub', 'sub']),
  scriptChain('script.sub-sup-sup', ';~~', ['sub', 'sup', 'sup']),
  scriptChain('script.sub-sup-sub', ';~;', ['sub', 'sup', 'sub']),
  scriptChain('script.sub-sub-sup', ';;~', ['sub', 'sub', 'sup']),
  scriptChain('script.sub-sub-sub', ';;;', ['sub', 'sub', 'sub']),
  // Rule 14.4.4 permits level indicators with more than three components.
  // Four-component chains are registered explicitly as bounded local codes;
  // the reusable operation composes the same MathML script slots without
  // introducing an unrestricted level parser.
  ...['sup', 'sub'].flatMap((first) => ['sup', 'sub'].flatMap((second) =>
    ['sup', 'sub'].flatMap((third) => ['sup', 'sub'].map((fourth) => {
      const directions = [first, second, third, fourth];
      const sourceNotation = directions.map((direction) => direction === 'sup' ? '~' : ';').join('');
      return scriptChain(`script.${directions.map((direction) => direction === 'sup' ? 'sup' : 'sub').join('-')}`, sourceNotation, directions, ['14.4.4']);
    }))
  )),
  sourceMove('script.sup-sub.move-sub', ['⠰'], ['14.4.2'], 'msubsup', 'subscript', ';'),
  sourceMove('script.sub-sup.move-sup', ['⠘'], ['14.4.2'], 'msubsup', 'superscript', '~'),
  mode('script.baseline', ['⠐'], ['14.3', '14.8'], 'baseline', true, '"'),
  mode('indicator.multipurpose', ['⠐'], ['24.1'], 'multipurpose', true, '"'),
  // BANA Rule 7.2 typeform indicators. These are modes for the next local
  // letter/number operation; they do not create a text buffer or parse a
  // phrase. A shared cell may produce an explicit local choice where BANA
  // assigns multiple meanings.
  mode('typeform.bold', ['⠸', '⠰'], ['7.1', '7.2'], 'typeform:bold', true, '_;'),
  mode('typeform.italic', ['⠨', '⠰'], ['7.1', '7.2'], 'typeform:italic', true, '.;'),
  mode('typeform.sans-serif', ['⠠', '⠨', '⠰'], ['7.1', '7.2'], 'typeform:sans-serif', true, ',.;'),
  mode('typeform.script', ['⠈', '⠰'], ['7.1', '7.2'], 'typeform:script', true, '`;'),
  mode('typeform.barred', ['⠠', '⠸', '⠰'], ['7.1', '7.2'], 'typeform:double-struck', true, ',_;'),
  mode('typeform.bold.number', ['⠸', '⠼'], ['7.1', '7.2'], 'numeric:bold', true, '_#'),
  mode('typeform.italic.number', ['⠨', '⠼'], ['7.1', '7.2'], 'numeric:italic', true, '.#'),
  mode('typeform.sans-serif.number', ['⠠', '⠨', '⠼'], ['7.1', '7.2'], 'numeric:sans-serif', true, ',.#'),
  mode('typeform.script.number', ['⠈', '⠼'], ['7.1', '7.2'], 'numeric:script', true, '`#'),
  mode('typeform.barred.number', ['⠠', '⠸', '⠼'], ['7.1', '7.2'], 'numeric:double-struck', true, ',_#'),
  mode('typeform.terminate', ['⠠', '⠄'], ['7.1', '7.3'], 'typeform-end', false, ",'"),
  // BANA 7.3.4–7.3.5: multi-word or mathematical-expression typeforms use
  // explicit opening/closing indicators. These are bounded scope operations,
  // not phrase parsing. The October 2025 erratum corrects the bold Example
  // 7-19 braille, so only the bold rows carry that errata reference.
  typeformScope('typeform.scope.bold.open', ",'_", ['7.3.4', '7.3.5'], 'bold', { errataRefs: ['7.3.5 Example 7-19'] }),
  typeformScope('typeform.scope.bold.close', "_,'", ['7.3.4', '7.3.5'], 'bold', { close: true, errataRefs: ['7.3.5 Example 7-19'] }),
  typeformScope('typeform.scope.italic.open', ",'.", ['7.3.4', '7.3.5'], 'italic'),
  typeformScope('typeform.scope.italic.close', ".,'", ['7.3.4', '7.3.5'], 'italic', { close: true }),
  modifier('modifier.directly-over', ['⠣'], ['15.1', '15.2'], 'mover', 'overscript', 'multipurpose', { preferLonger: true, sourceNotation: '<' }),
  modifier('modifier.directly-under', ['⠩'], ['15.1', '15.2'], 'munder', 'underscript', 'multipurpose', { sourceNotation: '%' }),
  // The doubled indicator is one bounded higher-order code. A single
  // same-side indicator is held until the second cell arrives, so it cannot
  // be mistaken for a simultaneous opposite-side follow-up.
  higherModifier('modifier.directly-over.higher', ['⠣', '⠣'], ['15.3'], 'over', '<<'),
  higherModifier('modifier.directly-under.higher', ['⠩', '⠩'], ['15.3'], 'under', '%%'),
  // Rule 15.4: once one side exists, a second-side indicator makes a
  // munderover and opens only the missing required slot.
  simultaneous('modifier.simultaneous.over', ['⠣'], ['15.4'], 'over', '<'),
  simultaneous('modifier.simultaneous.under', ['⠩'], ['15.4'], 'under', '%'),
  modifierToken('modifier.arc.down', ['⠫', '⠁'], ['15.11'], '⁀', { sourceNotation: '$a' }),
  modifierToken('modifier.arc.up', ['⠫', '⠄'], ['15.11'], '‿', { sourceNotation: "$'" }),
  // Rule 15.12 lists arrow modifiers separately from the general Rule 22
  // arrow constructions.  Each complete code is one bounded local sequence
  // after the over/under slot has been opened.  The Unicode glyph is only a
  // display projection; the source notation and intent attribute preserve
  // the BANA distinction where Unicode has no exact barbed/dotted glyph.
  atomicModifierToken('modifier.arrow.barbed-both', ['⠫', '⠪', '⠒', '⠒', '⠕'], ['15.12'], '↔', { sourceNotation: '$[33o', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-barbed-both' } }),
  atomicModifierToken('modifier.arrow.barbed-left', ['⠫', '⠪', '⠒', '⠒'], ['15.12'], '←', { sourceNotation: '$[33', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-barbed-left' } }),
  atomicModifierToken('modifier.arrow.barbed-left-dotted-right', ['⠫', '⠪', '⠒', '⠒', '⠡'], ['15.12'], '⇇', { sourceNotation: '$[33*', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-left-barbed-right-dotted' } }),
  atomicModifierToken('modifier.arrow.barbed-right', ['⠫', '⠕'], ['15.12'], '→', { sourceNotation: '$o', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-barbed-right' } }),
  atomicModifierToken('modifier.arrow.barbed-right-uncontracted', ['⠫', '⠒', '⠒', '⠕'], ['15.12'], '→', { sourceNotation: '$33o', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-barbed-right-uncontracted' } }),
  atomicModifierToken('modifier.arrow.dotted-both', ['⠫', '⠡', '⠒', '⠒', '⠡'], ['15.12'], '⇤⇥', { sourceNotation: '$*33*', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-dotted-both' } }),
  atomicModifierToken('modifier.arrow.dotted-left', ['⠫', '⠡', '⠒', '⠒'], ['15.12'], '⇤', { sourceNotation: '$*33', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-dotted-left' } }),
  atomicModifierToken('modifier.arrow.dotted-left-barbed-right', ['⠫', '⠡', '⠒', '⠒', '⠕'], ['15.12'], '⇥', { sourceNotation: '$*33o', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-left-dotted-right-barbed' } }),
  atomicModifierToken('modifier.arrow.dotted-right', ['⠫', '⠒', '⠒', '⠡'], ['15.12'], '⇥', { sourceNotation: '$33*', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-dotted-right' } }),
  atomicModifierToken('modifier.arrow.hollow-both', ['⠫', '⠨', '⠡', '⠒', '⠒', '⠨', '⠡'], ['15.12'], '⇔', { sourceNotation: '$.*33.*', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-hollow-both' } }),
  atomicModifierToken('modifier.arrow.hollow-left', ['⠫', '⠨', '⠡', '⠒', '⠒'], ['15.12'], '⇐', { sourceNotation: '$.*33', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-hollow-left' } }),
  atomicModifierToken('modifier.arrow.hollow-left-barbed-right', ['⠫', '⠨', '⠡', '⠒', '⠒', '⠕'], ['15.12'], '⇨', { sourceNotation: '$.*33o', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-left-hollow-right-barbed' } }),
  atomicModifierToken('modifier.arrow.hollow-right-barbed-left', ['⠫', '⠪', '⠒', '⠒', '⠨', '⠡'], ['15.12'], '⇦', { sourceNotation: '$[33.*', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-left-barbed-right-hollow' } }),
  atomicModifierToken('modifier.arrow.hollow-right', ['⠫', '⠒', '⠒', '⠨', '⠡'], ['15.12'], '⇥', { sourceNotation: '$33.*', dataAttributes: { 'data-omniya-nemeth-intent': 'modifier-arrow-hollow-right' } }),
  modifierToken('modifier.caret.over', ['⠸', '⠣'], ['15.15'], '^', { sourceNotation: '_<' }),
  modifierToken('modifier.caret.inverted', ['⠸', '⠩'], ['15.15'], '∨', { sourceNotation: '_%' }),
  modifierToken('modifier.caret.left', ['⠰', '⠣'], ['15.15'], '‹', { sourceNotation: ';<' }),
  modifierToken('modifier.caret.right', ['⠰', '⠩'], ['15.15'], '›', { sourceNotation: ';%' }),
  modifierToken('modifier.dot', ['⠡'], ['15.16'], '•', { sourceNotation: '*' }),
  modifierToken('modifier.hollow-dot', ['⠨', '⠡'], ['15.17'], '∘', { preferLonger: true, sourceNotation: '.*' }),
  modifierToken('modifier.question', ['⠸', '⠦'], ['15.18'], '?', { sourceNotation: '_8' }),
  modifierToken('modifier.tilde.extended', ['⠠', '⠱'], ['15.19'], '〰', { sourceNotation: '`,:' }),
  modifierToken('modifier.tilde.simple', ['⠈', '⠱'], ['15.19'], '~', { sourceNotation: '`:' }),
  modifierToken('modifier.triangle', ['⠫', '⠞'], ['15.10'], '△', { sourceNotation: '$t' }),
  modifierToken('modifier.bar-over', ['⠱'], ['15.1', '15.2', '15.13'], '¯', { sourceNotation: ':' }),
  // Rule 19.2 sends a transcribed horizontal grouping sign through the
  // ordinary Rule 15.2.1 over/under modifier workflow. These rows are only
  // available while that modifier slot is active, so their baseline grouping
  // counterparts remain separate atomic local signs.
  modifierToken('modifier.horizontal-brace-over', ['⠨', '⠷'], ['19.2', '15.2.1'], '⏞', { sourceNotation: '.(' }),
  modifierToken('modifier.horizontal-brace-under', ['⠨', '⠾'], ['19.2', '15.2.1'], '⏟', { sourceNotation: '.)' }),
  modifierToken('modifier.horizontal-bracket-over', ['⠈', '⠷'], ['19.2', '15.2.1'], '⏜', { sourceNotation: '@(' }),
  modifierToken('modifier.horizontal-bracket-under', ['⠈', '⠾'], ['19.2', '15.2.1'], '⏝', { sourceNotation: '@)' }),
  sourceClose('modifier.terminate.over', ['⠻'], ['15.2'], 'mover', ']'),
  sourceClose('modifier.terminate.under', ['⠻'], ['15.2'], 'munder', ']'),
  sourceClose('modifier.terminate.simultaneous', ['⠻'], ['15.4'], 'munderover', ']'),
  sourceOpen('radical.square', ['⠜'], ['16.1', '16.2'], 'msqrt', ['radicand'], {}, 'radicand', false, LOCAL_COMMIT_POLICIES.IMMEDIATE, '>'),
  fixedRoot('radical.cube', ['⠣', '⠒', '⠜'], ['16.2'], '3', '3', '<3>'),
  fixedRoot('radical.fourth', ['⠣', '⠲', '⠜'], ['16.2'], '4', '4', '<4>'),
  sourceClose('radical.end', ['⠻'], ['16.1.1'], 'msqrt', ']'),
  // MathML requires the radicand as child 1 and the index as child 2. Nemeth
  // presents the index first, so the transition opens a valid mroot in source
  // order while placing the draft focus in the index slot.
  // ⠣ is also the standalone directly-over modifier. The longer indexed
  // radical code gets the same explicit lookahead treatment.
  sourceOpen('radical.indexed', ['⠣'], ['16.2', '16.3'], 'mroot', ['radicand', 'index'], {}, 'index', true, LOCAL_COMMIT_POLICIES.IMMEDIATE, '<'),
  sourceMove('radical.next.radicand', ['⠌'], ['16.2'], 'mroot', 'radicand', '/'),
  sourceClose('radical.indexed.end', ['⠻'], ['16.2', '16.3'], 'mroot', ']'),
  // Rule 16.3 order indicators are contextual modes: they are valid only
  // while editing a radical and affect the next local radical/terminator.
  // They carry one bounded integer, not an unrestricted nesting stack.
  mode('radical.order.one', ['⠨'], ['16.3'], 'radical-order:1', true, '.'),
  mode('radical.order.two', ['⠨', '⠨'], ['16.3'], 'radical-order:2', true, '..'),
  mode('radical.order.three', ['⠨', '⠨', '⠨'], ['16.3'], 'radical-order:3', true, '...'),
  { id: 'radical.end.order.one', cells: ['⠨', '⠻'], banaRefs: ['16.3'], action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: 'msqrt', radicalOrder: 1, sourceNotation: '.]' } },
  { id: 'radical.end.order.two', cells: ['⠨', '⠨', '⠻'], banaRefs: ['16.3'], action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: 'msqrt', radicalOrder: 2, sourceNotation: '..]' } },
  { id: 'radical.end.order.three', cells: ['⠨', '⠨', '⠨', '⠻'], banaRefs: ['16.3'], action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: 'msqrt', radicalOrder: 3, sourceNotation: '...]' } },
  sourceOpen('group.round', ['⠷'], ['19.1', '19.5'], 'mrow', ['content'], { 'data-omniya-group': 'round' }, 'content', false, LOCAL_COMMIT_POLICIES.IMMEDIATE, '('),
  sourceClose('group.round.end', ['⠾'], ['19.1'], 'mrow', ')'),
  // Rule 15.6: a binomial is one bounded local structure.  Its opening
  // creates two editable table cells; ⠩ moves to the lower cell and ⠾ closes
  // the local structure.  It is not a delimiter parser for the surrounding
  // expression.
  { id: 'binomial.open', cells: ['⠷'], banaRefs: ['15.6'], action: 'open-binomial', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { sourceNotation: '(' } },
  { id: 'binomial.lower', cells: ['⠩'], banaRefs: ['15.6'], action: 'move-binomial-lower', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { sourceNotation: '%' } },
  { id: 'binomial.close', cells: ['⠾'], banaRefs: ['15.6'], action: 'close-binomial', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { sourceNotation: ')' } },
  token('group.parenthesis-open', ['⠷'], ['19.1'], '(', 'mo', { sourceNotation: '(' }),
  token('group.parenthesis-close', ['⠾'], ['19.1'], ')', 'mo', { sourceNotation: ')' }),
  token('group.bracket-open', ['⠈', '⠷'], ['19.1'], '[', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '@(' }),
  token('group.bracket-close', ['⠈', '⠾'], ['19.1'], ']', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '@)' }),
  token('group.brace-open', ['⠨', '⠷'], ['19.1'], '{', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '.(' }),
  token('group.brace-close', ['⠨', '⠾'], ['19.1'], '}', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '.)' }),
  // Rule 19's additional grouping signs. Each multi-cell sign is a bounded
  // local construction, not a delimiter grammar: Enter commits the one sign.
  token('group.angle-open', ['⠨', '⠨', '⠷'], ['19.1'], '⟨', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '..(' }),
  token('group.angle-close', ['⠨', '⠨', '⠾'], ['19.1'], '⟩', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '..)' }),
  // BANA Rule 19 distinguishes bold brackets (_@( ... _@)) from barred
  // brackets (@_( ... @_)).  The indicator order is normative: swapping the
  // two produces a different sign even though the Unicode glyphs look alike.
  token('group.bold-bracket-open', ['⠸', '⠈', '⠷'], ['19.3'], '[', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '_@(' }),
  token('group.bold-bracket-close', ['⠸', '⠈', '⠾'], ['19.3'], ']', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '_@)' }),
  token('group.barred-bracket-open', ['⠈', '⠸', '⠷'], ['19.1'], '⟦', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '@_(' }),
  token('group.barred-bracket-close', ['⠈', '⠸', '⠾'], ['19.1'], '⟧', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '@_)' }),
  token('group.barred-brace-open', ['⠨', '⠸', '⠷'], ['19.1'], '⦃', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '._(' }),
  token('group.barred-brace-close', ['⠨', '⠸', '⠾'], ['19.1'], '⦄', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '._)' }),
  token('group.upper-half-open', ['⠈', '⠘', '⠷'], ['19.4'], '⎡', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '@^(' }),
  token('group.upper-half-close', ['⠈', '⠘', '⠾'], ['19.4'], '⎤', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '@^)' }),
  token('group.lower-half-open', ['⠈', '⠰', '⠷'], ['19.4'], '⎣', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '@;(' }),
  token('group.lower-half-close', ['⠈', '⠰', '⠾'], ['19.4'], '⎦', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '@;)' }),
  // Rule 19.5 reuses the vertical-bar cell used by operation and arrow
  // constructions. Hold it for local lookahead so a longer arrow code stays
  // reachable; Enter/choice selects the standalone grouping meaning.
  token('group.vertical-bar', ['⠳'], ['19.5'], '|', 'mo', { preferLonger: true, sourceNotation: '|' }),
  // Rule 19.1/19.6 enlarged grouping signs. Dot 6 is part of each local
  // construction; it is never inferred from the height of surrounding
  // MathML. The source notation is retained for source-to-cell review.
  token('group.round-enlarged-open', ['⠠', '⠷'], ['19.1', '19.6'], '(', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',(' }),
  token('group.round-enlarged-close', ['⠠', '⠾'], ['19.1', '19.6'], ')', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',)' }),
  token('group.bracket-enlarged-open', ['⠈', '⠠', '⠷'], ['19.1', '19.6'], '[', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@,(' }),
  token('group.bracket-enlarged-close', ['⠈', '⠠', '⠾'], ['19.1', '19.6'], ']', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@,)' }),
  token('group.brace-enlarged-open', ['⠨', '⠠', '⠷'], ['19.1', '19.6'], '{', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '.,(' }),
  token('group.brace-enlarged-close', ['⠨', '⠠', '⠾'], ['19.1', '19.6'], '}', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '.,)' }),
  token('group.angle-enlarged-open', ['⠨', '⠨', '⠠', '⠷'], ['19.1', '19.6'], '⟨', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '..,(' }),
  token('group.angle-enlarged-close', ['⠨', '⠨', '⠠', '⠾'], ['19.1', '19.6'], '⟩', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '..,)' }),
  // A vertical sign has no distinct opening and closing cell in Rule 19.5.
  // Keep one local row and let the surrounding MathML context decide whether
  // it is the left or right member of a delimiter pair. Duplicate rows for
  // “open” and “close” would manufacture an ambiguity with identical output.
  token('group.vertical-double-open', ['⠳', '⠳'], ['19.5'], '||', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '\\\\' }),
  token('group.vertical-enlarged-open', ['⠠', '⠳'], ['19.5', '19.6'], '|', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',\\' }),
  token('group.vertical-double-enlarged-open', ['⠠', '⠳', '⠠', '⠳'], ['19.5', '19.6'], '||', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',\\,\\' }),
  token('group.bold-vertical-open', ['⠸', '⠳'], ['19.5'], '|', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '_\\' }),
  token('group.bold-vertical-double-open', ['⠸', '⠳', '⠸', '⠳'], ['19.5'], '||', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '_\\_\\' }),
  token('group.barred-bracket-enlarged-open', ['⠈', '⠸', '⠠', '⠷'], ['19.1', '19.6'], '⟦', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@_,(' }),
  token('group.barred-bracket-enlarged-close', ['⠈', '⠸', '⠠', '⠾'], ['19.1', '19.6'], '⟧', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@_,)' }),
  token('group.barred-brace-enlarged-open', ['⠨', '⠸', '⠠', '⠷'], ['19.1', '19.6'], '⦃', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '._,(' }),
  token('group.barred-brace-enlarged-close', ['⠨', '⠸', '⠠', '⠾'], ['19.1', '19.6'], '⦄', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '._,)' }),
  token('group.upper-half-enlarged-open', ['⠈', '⠘', '⠠', '⠷'], ['19.4', '19.6'], '⎡', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@^,(' }),
  token('group.upper-half-enlarged-close', ['⠈', '⠘', '⠠', '⠾'], ['19.4', '19.6'], '⎤', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@^,)' }),
  token('group.lower-half-enlarged-open', ['⠈', '⠰', '⠠', '⠷'], ['19.4', '19.6'], '⎣', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@;,(' }),
  token('group.lower-half-enlarged-close', ['⠈', '⠰', '⠠', '⠾'], ['19.4', '19.6'], '⎦', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@;,)' }),
  sourceToken('comparison.not-equal', '/.k', ['21.1', '21.8'], '≠'),
  token('comparison.approximately', ['⠈', '⠱', '⠈', '⠱'], ['21.6'], '≈', 'mo', { sourceNotation: '@:@:' }),
  token('comparison.similar', ['⠈', '⠱'], ['21.6'], '∼', 'mo', { preferLonger: true, sourceNotation: '`:' }),
  token('comparison.member', ['⠈', '⠑'], ['21.4'], '∈', 'mo', { sourceNotation: '`e' }),
  token('comparison.not-member', ['⠌', '⠈', '⠑'], ['21.4'], '∉', 'mo', { sourceNotation: '/`e' }),
  token('comparison.subset', ['⠸', '⠐', '⠅'], ['21.5'], '⊂', 'mo', { preferLonger: true, sourceNotation: '_"k' }),
  token('comparison.subset-equal', ['⠸', '⠐', '⠅', '⠱'], ['21.5'], '⊆', 'mo', { sourceNotation: '_"k:' }),
  token('comparison.perpendicular', ['⠫', '⠏'], ['21.2'], '⊥', 'mo', { preferLonger: true, sourceNotation: '$p' }),
  token('comparison.proportion', ['⠰', '⠆'], ['21.5'], '∷', 'mo', { sourceNotation: ';2' }),
  token('comparison.ratio', ['⠐', '⠂'], ['21.5'], '∶', 'mo', { sourceNotation: '"1' }),
  token('comparison.relation', ['⠠', '⠗'], ['21.5'], 'R', 'mi', { sourceNotation: ',r' }),
  token('comparison.reverse-subset', ['⠸', '⠨', '⠂'], ['21.5'], '⊃', 'mo', { sourceNotation: '_.1' }),
  token('comparison.reverse-membership', ['⠈', '⠢'], ['21.4'], '∋', 'mo', { sourceNotation: '`5' }),
  token('comparison.variation', ['⠸', '⠿'], ['21.5'], '∝', 'mo', { sourceNotation: '_=' }),
  sourceToken('comparison.equivalence', '`<,<', ['21.9', '21.11'], '≎', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  // Rule 21.7's such-that bar uses the same Nemeth bar cell as the operation
  // bar. Context chooses the meaning; the local registry never invents a
  // second bar glyph.
  token('comparison.vertical-bar', ['⠳'], ['21.7'], '|', 'mo', { preferLonger: true, sourceNotation: '|' }),
  token('comparison.equals-bold', ['⠸', '⠨', '⠅'], ['21.5'], '=', 'mo', { sourceNotation: '_.k' }),
  token('comparison.greater-curved', ['⠨', '⠨', '⠂'], ['21.5'], '≻', 'mo', { sourceNotation: '..1' }),
  token('comparison.less-curved', ['⠨', '⠐', '⠅'], ['21.5'], '≺', 'mo', { sourceNotation: '."k' }),
  token('comparison.simple-tilde', ['⠈', '⠱'], ['21.6'], '∼', 'mo', { preferLonger: true, sourceNotation: '`:' }),
  token('comparison.extended-tilde', ['⠈', '⠠', '⠱'], ['21.6'], '〰', 'mo', { sourceNotation: '`,:' }),
  // Rule 21.9 modified comparisons are each one bounded local construction.
  sourceToken('comparison.equals.caret-over', '".k<_<]', ['21.9'], '≙', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.equals.caret-under', '".k%_<]', '=', { dataAttributes: { 'data-omniya-comparison-form': 'caret-under' } }),
  sourceToken('comparison.equals.dot-over', '".k<*]', ['21.9'], '≐', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.equals.degree-over', '".k<.*]', '≗'),
  comparisonCompound('comparison.equals.dot-both', '".k%*<*]', '≑'),
  comparisonCompound('comparison.equals.triangle-over', '".k<$t]', '≜'),
  comparisonCompound('comparison.equals.inverted-caret-over', '".k<_%]', '≚'),
  comparisonCompound('comparison.equals.question-over', '".k<_8]', '≟'),
  comparisonCompound('comparison.equals.left-caret-over', '".k<;<]', '=', { dataAttributes: { 'data-omniya-comparison-form': 'left-caret-over' } }),
  comparisonCompound('comparison.equals.right-caret-over', '".k<;%]', '=', { dataAttributes: { 'data-omniya-comparison-form': 'right-caret-over' } }),
  comparisonCompound('comparison.equals.two-dots-both', '".k%**<**]', '⩷'),
  comparisonCompound('comparison.equals.vertical-bar-over', '".k<|]', '=', {
    dataAttributes: { 'data-omniya-comparison-form': 'vertical-bar-over' }
  }),
  comparisonCompound('comparison.horizontal-bar.caret-over', '":<_<]', '^'),
  sourceToken('comparison.horizontal-bar.dot-under', '":%*]', ['21.9'], '⨪', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.horizontal-bar.caret-under', '":%_<]', '^'),
  comparisonCompound('comparison.horizontal-bar.tilde-dot-under', '`:%*]', '⨪'),
  sourceToken('comparison.greater.bar-over', ':.1', ['21.9'], '⋝', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.greater.equals-over', '.k.1', '⪚'),
  comparisonCompound('comparison.greater.equals-under', '.1.k', '≧'),
  comparisonCompound('comparison.inclusion.bar-over', ':_"k', '⊂'),
  comparisonCompound('comparison.inclusion.bar-under', '_"k:', '⊆'),
  comparisonCompound('comparison.inclusion.equals-over', '.k_"k', '⊂'),
  comparisonCompound('comparison.inclusion.equals-under', '_"k.k', '⊆'),
  comparisonCompound('comparison.less.bar-over', ':"k', '⋜'),
  comparisonCompound('comparison.less.bar-under', '"k:', '≤'),
  comparisonCompound('comparison.less.equals-over', '.k"k', '⪙'),
  sourceToken('comparison.less.equals-under', '"k.k', ['21.9'], '≤', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.intersection.bar-under', '.%:', '∩'),
  comparisonCompound('comparison.intersection.equals-under', '.%.k', '∩'),
  sourceToken('comparison.logical-product.bar-over', ':`%', ['21.9'], '∧', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.logical-product.bar-over-under', ':`%:', '∧'),
  comparisonCompound('comparison.logical-product.equals-under', '`%.k', '∧'),
  comparisonCompound('comparison.logical-product.bar-under', '`%:', '∧'),
  comparisonCompound('comparison.logical-product.equals-over', '.k`%', '∧'),
  comparisonCompound('comparison.logical-product.equals-over-under', '.k`%:', '∧'),
  comparisonCompound('comparison.logical-product.equals-both', '.k`%.k', '∧'),
  sourceToken('comparison.logical-sum.equals-under', '`+.k', ['21.9'], '∨', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.logical-sum.bar-over', ':`+', '∨'),
  comparisonCompound('comparison.logical-sum.bar-under', '`+:', '∨'),
  comparisonCompound('comparison.logical-sum.equals-over', '.k`+', '∨'),
  comparisonCompound('comparison.logical-sum.equals-over-under', '.k`+:', '∨'),
  comparisonCompound('comparison.logical-sum.equals-both', '.k`+.k', '∨'),
  sourceToken('comparison.reverse-inclusion.equals-over', '.k_.1', ['21.9'], '⊃', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.reverse-inclusion.bar-over', ':_.1', '⊃'),
  comparisonCompound('comparison.reverse-inclusion.bar-under', '_.1:', '⊃'),
  comparisonCompound('comparison.reverse-inclusion.equals-under', '_.1.k', '⊃'),
  sourceToken('comparison.tilde.bar-over-double', ':`:`:', ['21.9'], '≈', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.tilde.bar-over-single', ':`:', '≂'),
  comparisonCompound('comparison.tilde.bar-under-double', '`:`::', '≊'),
  comparisonCompound('comparison.tilde.bar-under-single', '`::', '≃'),
  comparisonCompound('comparison.tilde.double', '`:`:', '≈'),
  comparisonCompound('comparison.tilde.equals-over-double', '.k`:`:', '≈'),
  comparisonCompound('comparison.tilde.equals-over-single', '.k`:', '⩳'),
  comparisonCompound('comparison.tilde.equals-under-double', '`:`:.k', '⩰'),
  comparisonCompound('comparison.tilde.equals-under-single', '`:.k', '∼'),
  sourceToken('comparison.union.equals-under', '.+.k', ['21.9'], '∪', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE }),
  comparisonCompound('comparison.union.bar-under', '.+:', '∪'),
  // Rule 21.9/21.11 examples: the complete local construction is held until
  // the compounded comparison is submitted. The multipurpose cells are part
  // of the BANA code, not an inferred precedence rule.
  token('comparison.vertical-arrow-pair', ['⠫', '⠒', '⠒', '⠕', '⠫', '⠪', '⠒', '⠒'], ['21.9'], '⇄', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$33o$[33' }),
  comparisonSuperposition('comparison.superposed.dot-equals', '*`.k]', '≐'),
  comparisonSuperposition('comparison.superposed.dot-subset', '*`_"k]', '⪽'),
  comparisonSuperposition('comparison.superposed.dot-superset', '*`_.1]', '⪾'),
  comparisonSuperposition('comparison.superposed.equals-subset', '.k`_"k]', '⊆'),
  comparisonSuperposition('comparison.superposed.equals-superset', '.k`_.1]', '⊇'),
  comparisonSuperposition('comparison.superposed.greater-nest', '.1`.1]', '≫'),
  comparisonSuperposition('comparison.superposed.greater-curved-nest', '..1`..1]', '⪼'),
  comparisonSuperposition('comparison.superposed.less-nest', '"k`"k]', '≪'),
  comparisonSuperposition('comparison.superposed.less-curved-nest', '."k`."k]', '⪻'),
  comparisonSuperposition('comparison.superposed.bar-subset', ':`_"k]', '⊂'),
  comparisonSuperposition('comparison.superposed.bar-superset', ':`_.1]', '⊃'),
  comparisonSuperposition('comparison.superposed.arrow-right', '|`$33o]', '⇸'),
  comparisonSuperposition('comparison.superposed.arrow-left', '|`$[33]', '⇷'),
  token('comparison.greater-less', ['⠨', '⠂', '⠐', '⠐', '⠅'], ['21.11'], '><', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '.1""k' }),
  token('comparison.less-greater', ['⠐', '⠅', '⠐', '⠨', '⠂'], ['21.11'], '<>', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '"k".1' }),
  token('comparison.greater-equals-less', ['⠨', '⠂', '⠐', '⠨', '⠅', '⠐', '⠐', '⠅'], ['21.11'], '>=<', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '.1".k""k' }),
  token('comparison.less-equals-greater', ['⠐', '⠅', '⠐', '⠨', '⠅', '⠐', '⠨', '⠂'], ['21.11'], '<=>', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '"k".k".1' }),
  token('operator.union', ['⠨', '⠬'], ['20.4'], '∪', 'mo', { sourceNotation: '.+' }),
  token('operator.intersection', ['⠨', '⠩'], ['20.4'], '∩', 'mo', { sourceNotation: '.%' }),
  token('operator.logical-and', ['⠈', '⠩'], ['20.5'], '∧', 'mo', { sourceNotation: '`%' }),
  token('operator.logical-or', ['⠈', '⠬'], ['20.5'], '∨', 'mo', { sourceNotation: '`+' }),
  token('operator.slash', ['⠸', '⠌'], ['20.8'], '/', 'mo', { sourceNotation: '_/' }),
  // The same cell begins several Rule 22 arrow constructions. Hold the
  // standalone operation briefly when a longer registered local code can
  // continue; Enter still commits the standalone divides meaning.
  token('operator.divides', ['⠳'], ['20.1', '20.8'], '∣', 'mo', { preferLonger: true, sourceNotation: '|' }),
  // BANA 20.7 distinguishes the multiplication dot from the cross and the
  // midline asterisk. The source example calls this printed sign a dot; the
  // U+00B7 middle-dot is the MathML projection used by the editor.
  token('operator.dot', ['⠡'], ['20.7'], '·', 'mo', { sourceNotation: '*' }),
  token('operator.asterisk', ['⠈', '⠼'], ['20.3'], '∗', 'mo', { sourceNotation: '`#' }),
  // BANA Appendix D writes infinity as `,=`. In the Nemeth source notation
  // the comma is the dot-6 cell (⠠), not the multipurpose indicator (⠈).
  token('misc.infinity', ['⠠', '⠿'], ['23.11'], '∞', 'mo', { sourceNotation: ',=' }),
  token('misc.angstrom', ['⠈', '⠠', '⠁'], ['23.1'], 'Å', 'mi', { sourceNotation: '`,a' }),
  token('misc.at', ['⠈', '⠁'], ['23.2'], '@', 'mo', { sourceNotation: '`a' }),
  // Added by the October 2025 BANA errata, Rule 23 symbol list and §23.4.
  // Errata 2025 restores crossed d as the ASCII sequence @$: at-sign
  // (⠈, multipurpose indicator) followed by shape ($, ⠫), not the ordinary
  // letter d cell.  The erratum's worked example uses the same sequence.
  Object.assign(token('misc.crossed-d', ['⠈', '⠫'], ['23.4'], 'đ', 'mi', { preferLonger: true, sourceNotation: '@$' }), {
    errataRefs: ['Rule 23 symbol list', 'Rule 23.4']
  }),
  token('misc.crossed-h', ['⠈', '⠓'], ['23.4'], 'ℏ', 'mi', { sourceNotation: '`h' }),
  // BANA prints crossed Lambda as `` `.l``: backtick, dot 4, l.
  token('misc.crossed-lambda', ['⠈', '⠨', '⠇'], ['23.4'], 'ƛ', 'mi', { sourceNotation: '`.l' }),
  token('misc.crossed-r', ['⠈', '⠠', '⠗'], ['23.4'], '℞', 'mi', { sourceNotation: '`,r' }),
  token('misc.caret', ['⠸', '⠣'], ['23.3'], '^', 'mo', { preferLonger: true, sourceNotation: '_<' }),
  token('misc.cent', ['⠈', '⠉'], ['23.13'], '¢', 'mo', { sourceNotation: '`c' }),
  token('misc.dollar', ['⠈', '⠎'], ['23.13'], '$', 'mo', { sourceNotation: '`s' }),
  token('misc.franc', ['⠈', '⠋'], ['23.13'], '₣', 'mo', { sourceNotation: '`f' }),
  token('misc.naira', ['⠈', '⠝'], ['23.13'], '₦', 'mo', { sourceNotation: '`n' }),
  token('misc.pound', ['⠈', '⠇'], ['23.13'], '£', 'mo', { sourceNotation: '`l' }),
  token('misc.euro', ['⠈', '⠑'], ['23.13'], '€', 'mo', { sourceNotation: '`e' }),
  token('misc.won', ['⠈', '⠺'], ['23.13'], '₩', 'mo', { sourceNotation: '`w' }),
  token('misc.yen', ['⠈', '⠽'], ['23.13'], '¥', 'mo', { sourceNotation: '`y' }),
  token('misc.per-mille', ['⠈', '⠴', '⠴'], ['23.15'], '‰', 'mo', { sourceNotation: '`00' }),
  token('misc.partial', ['⠈', '⠙'], ['23.14'], '∂', 'mo', { sourceNotation: '`d' }),
  token('misc.nabla', ['⠨', '⠫'], ['23.5'], '∇', 'mo', { sourceNotation: '.$', dataAttributes: { 'data-omniya-nemeth-intent': 'nabla' } }),
  token('misc.del-inverted', ['⠨', '⠫'], ['23.5'], '▽', 'mo', { sourceNotation: '.$', dataAttributes: { 'data-omniya-nemeth-intent': 'del-inverted' } }),
  token('misc.ditto', ['⠠', '⠄'], ['23.6'], '〃', 'mo', { sourceNotation: ",'" }),
  // BANA Rule 23.8: the end-of-proof icon is `@$qed`, preceded by an empty
  // cell. The UEB transcriber-defined shape indicator is ⠈⠫, followed by
  // q-e-d. The empty-cell/document spacing is represented by the surrounding
  // passage policy, not folded into this local mathematical token.
  // Rule 23.8's `$qed` is a transcriber-defined shape name, not the five
  // cells for the literal letters q-e-d. In the equation tree the resulting
  // square is the local QED token; its canonical Nemeth projection is ⠸⠳.
  token('misc.end-proof', ['⠈', '⠫', '⠟', '⠑', '⠙'], ['23.8'], '∎', 'mo', {
    preferLonger: true,
    sourceNotation: '@$qed',
    dataAttributes: { 'data-omniya-nemeth-intent': 'qed' }
  }),
  token('misc.hollow-dot', ['⠨', '⠡'], ['15.17', '23.10'], '∘', 'mo', { preferLonger: true, sourceNotation: '.*', dataAttributes: { 'data-omniya-nemeth-intent': 'hollow-dot-symbol' } }),
  // The hollow-dot symbol is `.*` when it is a standalone degree-like sign;
  // BANA's degree symbol in mathematical position is the same sign preceded
  // by the direct-over/superscript indicator `~.*` (Rule 23.10 and Example
  // 23-13). Keeping the indicator in sourceNotation prevents the two local
  // constructions from being conflated.
  token('misc.degree', ['⠘', '⠨', '⠡'], ['23.10'], '°', 'mo', { sourceNotation: '~.*' }),
  token('misc.prime', ['⠄'], ['23.16'], '′', 'mo', { preferLonger: true, sourceNotation: "'" }),
  token('misc.factorial', ['⠯'], ['23.9'], '!', 'mo', { sourceNotation: '&' }),
  token('misc.percent', ['⠈', '⠴'], ['23.15'], '%', 'mo', { preferLonger: true, sourceNotation: '`0' }),
  token('misc.empty-set', ['⠸', '⠴'], ['23.7'], '∅', 'mo', { sourceNotation: '_0' }),
  // The shape + left-head prefix is also the start of every left/vertical
  // arrow. Keep the local meaning pending while a shaft or right head may
  // follow; end-of-code commits the standalone angle.
  token('misc.angle', ['⠫', '⠪'], ['17.1'], '∠', 'mo', { preferLonger: true, sourceNotation: '$[' }),
  token('misc.therefore', ['⠠', '⠡'], ['23.18'], '∴', 'mo', { sourceNotation: ',*' }),
  // BANA 23.18 lists the negated therefore sign as /,*; the slash is an
  // oblique negation cell placed before the ordinary therefore construction.
  token('misc.not-therefore', ['⠌', '⠠', '⠡'], ['23.18'], '∴', 'mo', {
    sourceNotation: '/,*',
    dataAttributes: { 'data-omniya-nemeth-intent': 'negated-therefore' }
  }),
  token('misc.since', ['⠈', '⠌'], ['23.18'], '∵', 'mo', { sourceNotation: '`/' }),
  token('misc.double-prime', ['⠄', '⠄'], ['23.16'], '″', 'mo', { preferLonger: true, sourceNotation: "''" }),
  token('misc.triple-prime', ['⠄', '⠄', '⠄'], ['23.16'], '‴', 'mo', { preferLonger: true, sourceNotation: "'''" }),
  {
    // BANA examples 8-39 through 8-45 transcribe apostrophe-s as `_'s`:
    // punctuation indicator (456), apostrophe (3), and the letter s.
    id: 'script.possessive', cells: ['⠸', '⠄', '⠎'], banaRefs: ['8.4', '14.13'],
    action: 'append-possessive', commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, args: { sourceNotation: "_'s" }
  },
  // A plain s is ambiguous in a guided editor: it can be the next identifier
  // or BANA's plural ending. Expose both local meanings; the current focus
  // determines whether the ending is available and the author chooses when
  // both are valid. This is not passage-level lexical inference.
  { id: 'plural.s', cells: ['⠎'], banaRefs: ['8.4'], action: 'append-plural', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { sourceNotation: 's' } },
  // BANA Rule 3.7: ordinal endings are mathematical only when attached to a
  // numeral. The ending itself is one bounded local suffix; the surrounding
  // numeral and expression remain ordinary guided operations.
  { id: 'ordinal.st', cells: ['⠎', '⠞'], banaRefs: ['3.7'], action: 'append-ordinal', commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, args: { ending: 'st', sourceNotation: 'st' } },
  { id: 'ordinal.nd', cells: ['⠝', '⠙'], banaRefs: ['3.7'], action: 'append-ordinal', commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, args: { ending: 'nd', sourceNotation: 'nd' } },
  { id: 'ordinal.rd', cells: ['⠗', '⠙'], banaRefs: ['3.7'], action: 'append-ordinal', commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, args: { ending: 'rd', sourceNotation: 'rd' } },
  { id: 'ordinal.th', cells: ['⠞', '⠓'], banaRefs: ['3.7'], action: 'append-ordinal', commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, args: { ending: 'th', sourceNotation: 'th' } },
  // BANA 14.7's contracted comma is distinct from the baseline mathematical
  // comma: it preserves the current script level and represents the optional
  // following space as part of this one local follow-up.
  contractedComma('script.contracted-comma', ['⠪'], ['14.7'], '['),
  token('misc.tally', ['⠸'], ['23.19'], '|', 'mo', { preferLonger: true, sourceNotation: '_' }),
  // Rule 23.20's vertical-bar symbol uses the same cell as the operation bar;
  // its meaning is selected by the local context (such-that, grouping, or
  // operation), never by inventing a second Unicode bar glyph.
  token('misc.vertical-bar', ['⠳'], ['23.20'], '|', 'mo', { sourceNotation: '|' }),
  token('misc.does-not-divide', ['⠌', '⠳'], ['23.20'], '∤', 'mo', { sourceNotation: '/|' }),
  token('misc.parallel', ['⠫', '⠇'], ['17.2', '21.2'], '∥', 'mo', { sourceNotation: '$l', dataAttributes: { 'data-omniya-nemeth-intent': 'parallel-relation' } }),
  token('misc.not-parallel', ['⠌', '⠫', '⠇'], ['21.2'], '∦', 'mo', { sourceNotation: '/$l' }),
  sourceToken('misc.not-identical', '/_l', ['21.3'], '≢'),
  token('quantifier.forall', ['⠈', '⠯'], ['23.17'], '∀', 'mo', { sourceNotation: '`&' }),
  token('quantifier.exists', ['⠈', '⠿'], ['23.17'], '∃', 'mo', { preferLonger: true, sourceNotation: '`=' }),
  // BANA Rule 23.17 writes “there exists uniquely” as `=|.  It is a
  // composition of the existential quantifier and the ordinary vertical-bar
  // sign, not the unrelated backslash/operation sequence.  Keep it bounded
  // to this one local code while emitting a structural mrow so the projected
  // Nemeth remains ⠈⠿⠳ under SRE.
  composite('quantifier.exists-unique', ['⠈', '⠿', '⠳'], ['23.17'], [
    { name: 'mo', value: '∃' },
    { name: 'mo', value: '|' }
  ], { sourceNotation: '`=|', dataAttributes: { 'data-omniya-nemeth-intent': 'exists-unique' } }),
  token('quantifier.not-exists', ['⠌', '⠈', '⠿'], ['23.17'], '∄', 'mo', { sourceNotation: '/`=' }),
  sourceToken('comparison.contains', '`5', ['21.4'], '∋'),
  sourceToken('comparison.not-contains', '/`5', ['21.4'], '∌'),
  sourceToken('comparison.less-equal', '"k:', ['21.5'], '≤'),
  sourceToken('comparison.greater-equal', '.1:', ['21.5'], '≥'),
  sourceToken('comparison.identical', '_l', ['21.3'], '≡'),
  sourceToken('comparison.not-less', '/"k', ['21.8'], '≮'),
  sourceToken('comparison.not-greater', '/.1', ['21.8'], '≯'),
  token('arrow.up', ['⠫', '⠣', '⠒', '⠒', '⠕'], ['22.4', '22.5'], '↑', 'mo', { preferLonger: true, sourceNotation: '$<33o' }),
  token('arrow.down', ['⠫', '⠩', '⠒', '⠒', '⠕'], ['22.4', '22.5'], '↓', 'mo', { preferLonger: true, sourceNotation: '$%33o' }),
  token('arrow.vertical-both', ['⠫', '⠣', '⠪', '⠒', '⠒', '⠕'], ['22.4'], '↕', 'mo', { preferLonger: true, sourceNotation: '$<[33o' }),
  // Rule 22.3 Example 22-1 and 22-3.  These are complete local arrow
  // constructions: the six ordered components are held until Enter, then
  // emitted as one MathML operator.  The intent attribute preserves BANA's
  // head/shaft distinctions when Unicode has no exact glyph.
  sourceToken('arrow.bold.vertical-both', '$<_[33o', ['22.3'], '↕', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-two-way-vertical-bold-barbed' }
  }),
  sourceToken('arrow.spear.northwest-blunted', '$~=77', ['22.3'], '↖', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-northwest-blunted-double-shaft' }
  }),
  token('arrow.northwest', ['⠫', '⠘', '⠪', '⠒', '⠒'], ['22.4.3', '22.5'], '↖', 'mo', { sourceNotation: '$~[33' }),
  token('arrow.northeast', ['⠫', '⠘', '⠒', '⠒', '⠕'], ['22.4.3', '22.5'], '↗', 'mo', { preferLonger: true, sourceNotation: '$~33o' }),
  token('arrow.southeast', ['⠫', '⠰', '⠒', '⠒', '⠕'], ['22.4.3', '22.5'], '↘', 'mo', { preferLonger: true, sourceNotation: '$;33o' }),
  token('arrow.southwest', ['⠫', '⠰', '⠪', '⠒', '⠒'], ['22.4.3', '22.5'], '↙', 'mo', { sourceNotation: '$;[33' }),
  // BANA Rule 22.5 examples 22-17 through 22-27 and Rule 22.6 examples
  // 22-28 through 22-30. These are exact bounded constructions from the
  // standard; a shaft is never inferred from an arbitrary cell stream.
  token('arrow.counterclockwise', ['⠫', '⠢', '⠔', '⠕'], ['22.5.1'], '↝', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$59o' }),
  token('arrow.clockwise', ['⠫', '⠪', '⠢', '⠔'], ['22.5.1'], '↜', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[59' }),
  token('arrow.spear.right', ['⠫', '⠶', '⠶', '⠕'], ['22.5.2'], '⟹', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$77o' }),
  token('arrow.spear.left', ['⠫', '⠪', '⠶', '⠶'], ['22.5.2'], '⟸', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[77' }),
  token('arrow.spear.both', ['⠫', '⠪', '⠶', '⠶', '⠕'], ['22.5.2'], '⟺', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[77o' }),
  token('arrow.bold.right', ['⠫', '⠸', '⠒', '⠒', '⠕'], ['22.6'], '⇸', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$_33o' }),
  token('arrow.bold.left', ['⠫', '⠸', '⠪', '⠒', '⠒'], ['22.6'], '⟻', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$_[33' }),
  token('arrow.bold.both', ['⠫', '⠸', '⠪', '⠒', '⠒', '⠕'], ['22.6'], '⟷', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$_[33o' }),
  // Rule 22.7 examples 22-31 through 22-39 replace the two arrowheads
  // independently while retaining the ordinary shaft.
  token('arrow.blunted.right', ['⠫', '⠒', '⠒', '⠿'], ['22.7.1'], '⇢', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$33=' }),
  token('arrow.blunted.left', ['⠫', '⠿', '⠒', '⠒'], ['22.7.1'], '⇠', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$=33' }),
  token('arrow.blunted.both', ['⠫', '⠿', '⠒', '⠒', '⠿'], ['22.7.1'], '⇔', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$=33=' }),
  token('arrow.curved.right', ['⠫', '⠒', '⠒', '⠽'], ['22.7.1'], '⇝', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$33y' }),
  token('arrow.curved.left', ['⠫', '⠯', '⠒', '⠒'], ['22.7.1'], '⇜', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$&33' }),
  token('arrow.curved.both', ['⠫', '⠯', '⠒', '⠒', '⠽'], ['22.7.1'], '⇝', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$&33y' }),
  token('arrow.straight.right', ['⠫', '⠒', '⠒', '⠳'], ['22.7.1'], '⇥', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$33|' }),
  token('arrow.straight.left', ['⠫', '⠳', '⠒', '⠒'], ['22.7.1'], '⇤', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$|33' }),
  token('arrow.straight.both', ['⠫', '⠳', '⠒', '⠒', '⠳'], ['22.7.1'], '⇹', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$|33|' }),
  sourceToken('arrow.upper-left', '$`[33', ['22.7.2'], '↖', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-left-upper-barb' } }),
  sourceToken('arrow.lower-left', '$,[33', ['22.7.2'], '↙', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-left-lower-barb' } }),
  sourceToken('arrow.upper-right', '$33`o', ['22.7.2'], '↗', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-right-upper-barb' } }),
  sourceToken('arrow.lower-right', '$33,o', ['22.7.2'], '↘', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-right-lower-barb' } }),
  sourceToken('arrow.both-upper-barbs', '$`[33`o', ['22.7.2'], '↔', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-both-upper-barbs' } }),
  sourceToken('arrow.both-lower-barbs', '$,[33,o', ['22.7.2'], '↔', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-both-lower-barbs' } }),
  sourceToken('arrow.left-upper-right-lower', '$`[33,o', ['22.7.2'], '↔', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-left-upper-right-lower-barbs' } }),
  sourceToken('arrow.left-lower-right-upper', '$,[33`o', ['22.7.2'], '↔', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-left-lower-right-upper-barbs' } }),
  sourceToken('arrow.left-upper-right-full', '$`[33o', ['22.7.2'], '→', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-left-upper-right-full-barbs' } }),
  sourceToken('arrow.left-lower-right-full', '$,[33o', ['22.7.2'], '→', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-left-lower-right-full-barbs' } }),
  sourceToken('arrow.left-full-right-upper', '$[33`o', ['22.7.2'], '↔', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-left-full-right-upper-barb' } }),
  sourceToken('arrow.left-full-right-lower', '$[33,o', ['22.7.2'], '↔', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, dataAttributes: { 'data-omniya-nemeth-intent': 'arrow-left-full-right-lower-barb' } }),
  token('reference.asterisk', ['⠈', '⠼'], ['9.1'], '*', 'mo', { sourceNotation: '@#' }),
  token('reference.dagger', ['⠸', '⠻'], ['9.1'], '†', 'mo', { sourceNotation: '_]' }),
  token('reference.double-dagger', ['⠸', '⠸', '⠻'], ['9.1'], '‡', 'mo', { sourceNotation: '__]' }),
  mode('reference.general', ['⠈', '⠻'], ['9.2'], 'reference', true, '@]'),
  // October 2025 errata, Rule 9.1: no fixed checkmark symbol exists; the
  // documented transcriber-defined shape code is `.=$cm` (⠨⠿⠫⠉⠍ in the
  // source's expanded notation). It remains a bounded local reference atom,
  // not an invented Unicode glyph.
  Object.assign(token('reference.checkmark', ['⠨', '⠿', '⠈', '⠫', '⠉', '⠍'], ['9.1'], '✓', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '.=`$cm' }), {
    errataRefs: ['Rule 9.1 (approved August 2024; included in October 2025 errata)']
  }),
  token('shape.circle', ['⠫', '⠉'], ['17.1'], '○', 'mo', { preferLonger: true, sourceNotation: '$c' }),
  token('shape.diamond', ['⠫', '⠙'], ['17.1'], '◊', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$d' }),
  token('shape.ellipse', ['⠫', '⠑'], ['17.1'], '⬭', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$e' }),
  token('shape.regular-hexagon', ['⠫', '⠖'], ['17.1'], '⬡', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$6' }),
  token('shape.parallel', ['⠫', '⠇'], ['17.1'], '∥', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$l', dataAttributes: { 'data-omniya-nemeth-intent': 'parallel-shape' } }),
  token('shape.perpendicular', ['⠫', '⠏'], ['17.1'], '⟂', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$p', dataAttributes: { 'data-omniya-nemeth-intent': 'perpendicular-shape' } }),
  token('shape.parallelogram', ['⠫', '⠛'], ['17.1'], '▱', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$g' }),
  token('shape.regular-pentagon', ['⠫', '⠢'], ['17.1'], '⬠', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$5' }),
  token('shape.star', ['⠫', '⠎'], ['17.1'], '☆', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$s' }),
  token('shape.trapezoid', ['⠫', '⠵'], ['17.1'], '⏢', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$z' }),
  token('shape.inverted-triangle', ['⠨', '⠫'], ['17.1'], '▽', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '.$' }),
  token('shape.square', ['⠫', '⠲'], ['17.1'], '□', 'mo', { preferLonger: true, sourceNotation: '$4' }),
  token('shape.filled-circle', ['⠫', '⠸', '⠉'], ['17.3'], '●', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$_c' }),
  token('shape.filled-square', ['⠫', '⠸', '⠲'], ['17.3'], '■', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$_4' }),
  token('shape.shaded-circle', ['⠫', '⠨', '⠉'], ['17.3'], '◍', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$.c' }),
  token('shape.shaded-ellipse', ['⠫', '⠨', '⠑'], ['17.3'], '◌', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$.e' }),
  token('shape.triangle', ['⠫', '⠞'], ['17.1'], '△', 'mo', { preferLonger: true, sourceNotation: '$t' }),
  token('shape.rectangle', ['⠫', '⠗'], ['17.2'], '▭', 'mo', { preferLonger: true, sourceNotation: '$r' }),
  shapeToken('shape.arc.down', ['⠫', '⠁'], ['17.1'], '⁀', 'arc-down', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$a' }),
  shapeToken('shape.arc.up', ['⠫', '⠄'], ['17.1'], '⌢', 'arc-up', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: "$'" }),
  // BANA 17.2 basic-shape index entries without a dedicated Unicode glyph
  // remain valid local MathML tokens.  The source-linked shape metadata is
  // what preserves the distinction for export and later shape operations.
  shapeToken('shape.rhombus', ['⠫', '⠓'], ['17.2'], '◇', 'rhombus', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$h' }),
  shapeToken('shape.intersecting-lines', ['⠫', '⠊'], ['17.2'], '╳', 'intersecting-lines', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$i' }),
  shapeToken('shape.quadrilateral', ['⠫', '⠟'], ['17.2'], '▱', 'quadrilateral', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$q' }),
  shapeToken('shape.irregular-hexagon', ['⠫', '⠓', '⠭'], ['17.2'], '⬡', 'irregular-hexagon', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$hx' }),
  shapeToken('shape.irregular-pentagon', ['⠫', '⠏', '⠛'], ['17.2'], '⭔', 'irregular-pentagon', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$pg' }),
  shapeToken('shape.irregular-octagon', ['⠫', '⠕', '⠉'], ['17.4'], '⯃', 'irregular-octagon', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$oc' }),
  // Rule 17.4 regular polygons are local shape constructions. Their numeral
  // is collected with the shape indicator and then committed as one token;
  // no numeric passage is parsed.
  shapeToken('shape.regular-octagon', ['⠫', '⠦'], ['17.4'], '⯃', 'regular-octagon', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$8' }),
  shapeToken('shape.regular-dodecagon', ['⠫', '⠂', '⠆'], ['17.4'], '⯃', 'regular-12-gon', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$12' }),
  // Rule 17.5 structural shape modification: the base shape and the
  // modification letters are one bounded construction.  The metadata keeps
  // the exact BANA modifier while MathML remains a valid atomic operator.
  shapeModificationToken('shape.triangle.isosceles', ['⠫', '⠞', '⠨', '⠊', '⠻'], ['17.5'], '△', 'triangle', 'isosceles', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$t.i]' }),
  shapeModificationToken('shape.triangle.acute', ['⠫', '⠞', '⠨', '⠁', '⠻'], ['17.5'], '△', 'triangle', 'acute', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$t.a]' }),
  shapeModificationToken('shape.triangle.obtuse', ['⠫', '⠞', '⠨', '⠕', '⠻'], ['17.5'], '△', 'triangle', 'obtuse', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$t.o]' }),
  shapeModificationToken('shape.triangle.right', ['⠫', '⠞', '⠨', '⠗', '⠻'], ['17.5'], '⊿', 'triangle', 'right', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$t.r]' }),
  shapeModificationToken('shape.triangle.scalene', ['⠫', '⠞', '⠨', '⠎', '⠻'], ['17.5'], '△', 'triangle', 'scalene', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$t.s]' }),
  shapeModificationToken('shape.angle.right', ['⠫', '⠪', '⠨', '⠗', '⠻'], ['17.5'], '∟', 'angle', 'right', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$[.r]' }),
  shapeModificationToken('shape.angle.adjacent', ['⠫', '⠪', '⠨', '⠚', '⠻'], ['17.5'], '∠', 'angle', 'adjacent', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$[.j]' }),
  shapeModificationToken('shape.angle.alternate-exterior', ['⠫', '⠪', '⠨', '⠁', '⠑', '⠻'], ['17.5'], '∠', 'angle', 'alternate-exterior', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.ae]' }),
  shapeModificationToken('shape.angle.alternate-interior', ['⠫', '⠪', '⠨', '⠁', '⠊', '⠻'], ['17.5'], '∠', 'angle', 'alternate-interior', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.ai]' }),
  shapeModificationToken('shape.angle.complementary', ['⠫', '⠪', '⠨', '⠉', '⠏', '⠻'], ['17.5'], '∠', 'angle', 'complementary', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.cp]' }),
  shapeModificationToken('shape.angle.corresponding', ['⠫', '⠪', '⠨', '⠉', '⠻'], ['17.5'], '∠', 'angle', 'corresponding', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.c]' }),
  shapeModificationToken('shape.angle.exterior', ['⠫', '⠪', '⠨', '⠑', '⠻'], ['17.5'], '∠', 'angle', 'exterior', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.e]' }),
  shapeModificationToken('shape.angle.interior', ['⠫', '⠪', '⠨', '⠊', '⠻'], ['17.5'], '∠', 'angle', 'interior', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.i]' }),
  shapeModificationToken('shape.angle.obtuse', ['⠫', '⠪', '⠨', '⠕', '⠻'], ['17.5'], '∠', 'angle', 'obtuse', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.o]' }),
  shapeModificationToken('shape.angle.straight', ['⠫', '⠪', '⠨', '⠎', '⠻'], ['17.5'], '∠', 'angle', 'straight', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.s]' }),
  shapeModificationToken('shape.angle.supplementary', ['⠫', '⠪', '⠨', '⠎', '⠏', '⠻'], ['17.5'], '∠', 'angle', 'supplementary', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.sp]' }),
  shapeModificationToken('shape.angle.vertical', ['⠫', '⠪', '⠨', '⠧', '⠻'], ['17.5'], '∠', 'angle', 'vertical', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[.v]' }),
  // Rule 17.6 uses the interior-shape indicator (⠸⠫) and terminator. These
  // examples are intentionally bounded; a letter, operation, or arrow inside
  // a shape is represented by a separate named operation in a later editor
  // step rather than by buffering an arbitrary passage.
  shapeModificationToken('shape.circle.interior-plus', ['⠫', '⠉', '⠸', '⠫', '⠬', '⠻'], ['17.6.1'], '⨁', 'circle', 'interior-plus', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$c_$+]' }),
  // The printed `}` is the BANA interior-shape terminator, whose cell is ⠻.
  shapeModificationToken('shape.angle.interior-arc', ['⠫', '⠪', '⠸', '⠫', '⠫', '⠁', '⠻'], ['17.6.1'], '∡', 'angle', 'interior-arc', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[_$$a}' }),
  shapeModificationToken('shape.circle.interior-cross', ['⠫', '⠉', '⠸', '⠫', '⠈', '⠡', '⠻'], ['17.6.1'], '⊗', 'circle', 'interior-cross', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$c_$@*]' }),
  shapeModificationToken('shape.circle.interior-minus', ['⠫', '⠉', '⠸', '⠫', '⠤', '⠻'], ['17.6.1'], '⊖', 'circle', 'interior-minus', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$c_$-]' }),
  shapeModificationToken('shape.circle.interior-dot', ['⠫', '⠉', '⠸', '⠫', '⠡', '⠻'], ['17.6.1'], '⦿', 'circle', 'interior-dot', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$c_$*]' }),
  shapeModificationToken('shape.rectangle.interior-bar', ['⠫', '⠗', '⠸', '⠫', '⠱', '⠻'], ['17.6.1'], '▭', 'rectangle', 'interior-bar', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$r_$:]' }),
  shapeModificationToken('shape.square.interior-diagonals', ['⠫', '⠲', '⠸', '⠫', '⠢', '⠈', '⠔', '⠻'], ['17.6.1'], '⊠', 'square', 'interior-diagonals', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$4_$5@9]' }),
  shapeModificationToken('shape.square.interior-dot', ['⠫', '⠲', '⠸', '⠫', '⠡', '⠻'], ['17.6.1'], '⊡', 'square', 'interior-dot', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$4_$*]' }),
  shapeModificationToken('shape.square.interior-horizontal-bar', ['⠫', '⠲', '⠸', '⠫', '⠱', '⠻'], ['17.6.1'], '⊟', 'square', 'interior-horizontal-bar', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$4_$:]' }),
  shapeModificationToken('shape.square.interior-vertical-bar', ['⠫', '⠲', '⠸', '⠫', '⠳', '⠻'], ['17.6.1'], '◫', 'square', 'interior-vertical-bar', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$4_$\\]' }),
  shapeModificationToken('shape.square.interior-nw-se-diagonal', ['⠫', '⠲', '⠸', '⠫', '⠢', '⠻'], ['17.6.1'], '⧅', 'square', 'interior-nw-se-diagonal', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$4_$5]' }),
  shapeModificationToken('shape.square.interior-sw-ne-diagonal', ['⠫', '⠲', '⠸', '⠫', '⠔', '⠻'], ['17.6.1'], '⧄', 'square', 'interior-sw-ne-diagonal', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$4_$9]' }),
  shapeModificationToken('shape.circle.superposed-bar', ['⠳', '⠈', '⠫', '⠉', '⠻'], ['17.7'], '⌽', 'circle', 'superposed-vertical-bar', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '\\@$c]' }),
  shapeModificationToken('shape.circle.interior-bar', ['⠫', '⠉', '⠸', '⠫', '⠳', '⠻'], ['17.6.1'], '⦶', 'circle', 'interior-vertical-bar', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$c_$\\]' }),
  shapeModificationToken('shape.circle.interior-arrows-horizontal', sourceCells('$c_$$%33o"$<33o]'), ['17.6.2'], '⊚', 'circle', 'interior-arrows-horizontal', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$c_$$%33o"$<33o]' }),
  shapeModificationToken('shape.circle.interior-arrows-vertical', sourceCells('$c_$$33o$[33]'), ['17.6.3'], '⊚', 'circle', 'interior-arrows-vertical', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$c_$$33o$[33]' }),
  shapeToken('shape.triangle.plural', ['⠫', '⠞', '⠎'], ['17.9'], '⧌', 'triangle-plural', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$ts' }),
  // Rule 11.1.1: the general omission sign is the equals-shaped cell ⠿.
  // Its MathML placeholder is a question mark; it is not ordinary equals.
  token('omission.general', ['⠿'], ['11.1.1'], '?', 'mo', { sourceNotation: '=' }),
  open('cancellation.start', ['⠪'], ['12.1.1'], 'menclose', ['content'], { notation: 'updiagonalstrike' }, 'content', false, LOCAL_COMMIT_POLICIES.IMMEDIATE, { sourceNotation: '[' }),
  sourceClose('cancellation.end', ['⠻'], ['12.1.1'], 'menclose', ']'),
  token('arrow.right', ['⠫', '⠕'], ['22.1', '22.4'], '→', 'mo', { sourceNotation: '$o', allowImmediateBeforeContinuation: true }),
  // BANA 22.1 calls the ordinary right arrow `$o` only when it is regular,
  // single-shaft, and unmodified. The uncontracted `$33o` is a separate
  // bounded local construction (Examples 22-5 and 22-28), even though it
  // projects to the same mathematical relation.
  token('arrow.right.uncontracted', ['⠫', '⠒', '⠒', '⠕'], ['22.1', '22.3', '22.4'], '→', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$33o' }),
  token('arrow.left', ['⠫', '⠪', '⠒', '⠒'], ['22.4'], '←', 'mo', { preferLonger: true, sourceNotation: '$[33' }),
  token('arrow.both', ['⠫', '⠪', '⠒', '⠒', '⠕'], ['22.4'], '↔', 'mo', { preferLonger: true, sourceNotation: '$[33o' }),
  token('arrow.right.short', ['⠫', '⠒', '⠕'], ['22.5.3'], '⇢', 'mo', { preferLonger: true, sourceNotation: '$3o' }),
  token('arrow.left.short', ['⠫', '⠪', '⠒'], ['22.5.3'], '⇠', 'mo', { preferLonger: true, sourceNotation: '$[3' }),
  token('arrow.right.long', ['⠫', '⠒', '⠒', '⠒', '⠕'], ['22.5.3'], '⟶', 'mo', { preferLonger: true, sourceNotation: '$333o' }),
  token('arrow.left.long', ['⠫', '⠪', '⠒', '⠒', '⠒'], ['22.5.3'], '⟵', 'mo', { preferLonger: true, sourceNotation: '$[333' }),
  ...GREEK_SMALL.map(([cells, value, sourceNotation]) => token(`greek.${value}`, [...cells], ['6.1.4', '6.2.1'], value, 'mi', { sourceNotation })),
  ...GREEK_CAPITAL.map(([cells, value, sourceNotation]) => token(`greek.capital-${value}`, [...cells], ['5.1.1', '6.1.4', '6.2.1'], value, 'mi', { sourceNotation })),
  ...GREEK_VARIANTS.map(([cells, value, sourceNotation]) => token(`greek.variant-${value}`, [...cells], ['6.1.5', '6.2.2'], value, 'mi', { sourceNotation })),
  mode('indicator.number', ['⠼'], ['3.1', '3.3'], 'numeric', false, '#'),
  mode('indicator.capital', ['⠠'], ['5.1', '6.1'], 'capital', true, ','),
  // BANA 3.11.1: a double capital indicator introduces one uppercase Roman
  // numeral construction. Letters are collected only into that one local
  // identifier; ordinary expression input remains unaffected.
  mode('indicator.roman', ['⠠', '⠠'], ['3.11.1', '6.5'], 'roman', true, ',,'),
  // BANA Rules 6.2 and 10.3: one English-letter abbreviation is introduced
  // by a bounded indicator mode, not by a literary-word parser.
  mode('indicator.english-letter', ['⠰'], ['6.2', '10.3'], 'english-letter', true, ';')
].map((mapping) => mapping.id.startsWith('arrow.') && mapping.id !== 'arrow.right'
  ? withPolicy(mapping, LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE)
  : mapping);

// A complete BANA sign may also prefix another bounded local construction.
// This is common for indicators shared by shapes, functions, and arrows. The
// short sign remains an immediate registry row, but it opts into local
// lookahead so the longer BANA row can be completed before any tree mutation.
// Enter can still commit the short sign. This is bounded registry dispatch,
// never an expression parser or an unrestricted input buffer.
for (const mapping of MAPPINGS) {
  if (mapping.commitPolicy !== LOCAL_COMMIT_POLICIES.IMMEDIATE) continue;
  // `$o` is complete even though the same cells can be used by the separate
  // Rule 15.12 modifier construction. Context filtering resolves that
  // structural alternative; do not hold the ordinary arrow itself.
  const hasSameCodeAtomic = MAPPINGS.some((candidate) =>
    candidate.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
    candidate.cells.length === mapping.cells.length &&
    candidate.cells.every((cell, index) => cell === mapping.cells[index]));
  const hasAtomicContinuation = MAPPINGS.some((candidate) =>
    candidate.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
    candidate.cells.length > mapping.cells.length &&
    mapping.cells.every((cell, index) => cell === candidate.cells[index]));
  if ((hasSameCodeAtomic || hasAtomicContinuation) && !mapping.args?.allowImmediateBeforeContinuation) {
    mapping.args = { ...(mapping.args ?? {}), preferLonger: true };
  }
}

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
 * Return the same declarative registry grouped by the three local input
 * policies. This is intentionally a view, not a second registry: every
 * construction has one source row and therefore one BANA reference, action,
 * and policy. The dispatcher only ever consumes the source rows above.
 */
export function inputRegistry() {
  const entries = operationRegistry();
  return Object.freeze({
    immediate: entries.filter((entry) => entry.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE),
    atomicSequence: entries.filter((entry) => entry.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE),
    structuralFollowup: entries.filter((entry) => entry.commitPolicy === LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP)
  });
}

/**
 * Registry-level design checks. These protect the three local input policies
 * from becoming contradictory as BANA rows are added. An atomic construction
 * may share a prefix with an immediate code only when that immediate row is
 * explicitly marked for bounded longer-code lookahead.
 */
export function registryDiagnostics() {
  const entries = operationRegistry();
  const policies = new Set(Object.values(LOCAL_COMMIT_POLICIES));
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
    .filter(({ immediateId }) => {
      const entry = entries.find((candidate) => candidate.id === immediateId);
      return !entry?.args?.preferLonger && !entry?.args?.allowImmediateBeforeContinuation;
    });
  const shadowedImmediate = immediate
    .filter(hasLonger)
    .filter((entry) => !entry.args?.preferLonger && !entry.args?.allowImmediateBeforeContinuation)
    .map((entry) => ({ immediateId: entry.id, cells: entry.cells.join('') }));
  // Every BANA row is classified by the same three-policy contract. Keep the
  // checks data-driven so a new notation family cannot quietly introduce a
  // fourth buffering behavior or call a multi-cell construction immediate.
  const classificationErrors = entries.flatMap((entry) => {
    const errors = [];
    if (!policies.has(entry.commitPolicy)) errors.push({ id: entry.id, error: 'unknown-commit-policy' });
    if (entry.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE && entry.cells.length < 2 && !entry.args?.preferLonger) {
      errors.push({ id: entry.id, error: 'atomic-sequence-must-be-bounded' });
    }
    if (entry.commitPolicy === LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP &&
      !['move-slot', 'close-structure', 'extend-integral', 'superpose-token',
        'simultaneous-modifier', 'higher-order-modifier', 'insert-modifier', 'open-modifier',
        'move-binomial-lower', 'close-binomial', 'append-possessive', 'append-plural', 'append-ordinal',
        'insert-contracted-script-comma', 'set-mode', 'open-binomial', 'open-typeform-scope',
        'close-typeform-scope'].includes(entry.action)) {
      errors.push({ id: entry.id, error: 'structural-followup-needs-structural-action' });
    }
    return errors;
  });
  const actionSet = new Set(Object.keys(TREE_OPERATIONS));
  const operationErrors = entries
    .filter((entry) => !actionSet.has(entry.action))
    .map((entry) => ({ id: entry.id, action: entry.action }));
  return { shadowedAtomic, policyErrors, shadowedImmediate, classificationErrors, operationErrors };
}

function contextFor(document, focus) {
  const tree = parseMathML(document.mathml);
  return { tree, node: currentNode(tree, focus) };
}

function hasAncestor(tree, node, name) {
  const names = Array.isArray(name) ? name : [name];
  let current = node;
  while (current) {
    if (names.includes(current.name)) return current;
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
  // Modifier cells are only meaningful after an expression has been opened.
  // At an empty replacement root the same BANA cells may begin a shape code;
  // do not expose a spurious modifier choice or mutate an empty draft.
  if (mapping.action === 'insert-modifier' &&
    (context.node.name === 'math' || (isHole(context.node) && findMathParent(context.tree, context.node.attrs?.['data-omniya-id'])?.name !== 'munderover'))) return false;
  // The English-letter indicator is a local abbreviation mode, not a
  // structural navigation command.  In a script slot the same cell is a
  // Rule 14 return/move indicator, so leave that structural follow-up as the
  // unambiguous operation.  The user can still enter the letter itself (or
  // choose the named abbreviation command) inside the slot.
  if (mapping.id === 'indicator.english-letter' &&
    Boolean(hasAncestor(context.tree, context.node, 'msup') ||
      hasAncestor(context.tree, context.node, 'msub') ||
      hasAncestor(context.tree, context.node, 'msubsup') ||
      hasAncestor(context.tree, context.node, 'mover') ||
      hasAncestor(context.tree, context.node, 'munder') ||
      hasAncestor(context.tree, context.node, 'munderover'))) return false;
  // Rule 6.3's English-letter indicator is a boundary indicator.  When the
  // editor is already focused on a populated mathematical atom, dot-6 is the
  // Rule 14 subscript transition (or the prefix of a locally atomic
  // proportion code), not a request to start an English-letter mode.  Keeping
  // that distinction in the context predicate lets the same cell participate
  // in both BANA families without a passage parser or a global key override.
  if (mapping.id === 'indicator.english-letter') {
    const current = context.node;
    const boundary = current.name === 'math' || isHole(current) ||
      current.name === 'mspace' || current.name === 'mo';
    if (!boundary) return false;
  }
  if (mapping.id === 'operator.integral') {
    return !(context.node.name === 'mo' && ['∫', '∬', '∭'].includes(context.node.children?.[0]?.text));
  }
  if (mapping.id === 'integral.extend') {
    return context.node.name === 'mo' && ['∫', '∬'].includes(context.node.children?.[0]?.text);
  }
  if (mapping.action === 'superpose-token' && mapping.args?.allowedValues) {
    return context.node.name === 'mo' && ['∫', '∬', '∭'].includes(context.node.children?.[0]?.text);
  }
  if (mapping.action === 'superpose-token') return context.node.name === 'mo';
  const fraction = fractionAtFocus(context.tree, context.node);
  const fractionKind = fraction?.attrs?.['data-omniya-fraction-kind'] ?? 'simple';
  const numeratorFocus = Boolean(fraction && (contains(context.tree, fraction.children[0], context.node) ||
    (context.node === fraction && isHole(fraction.children[1]))));
  const denominatorFocus = Boolean(fraction && (contains(context.tree, fraction.children[1], context.node) ||
    (context.node === fraction && !isHole(fraction.children[1]))));
  if (mapping.id.startsWith('fraction.next.denominator')) {
    const kind = mapping.args?.fractionKind ?? (mapping.id === 'fraction.next.denominator' ? 'simple' : mapping.id.split('.').at(-1));
    return Boolean(fraction && fractionKind === kind && numeratorFocus &&
      (!mapping.id.includes('order3') || fraction.attrs?.['data-omniya-fraction-order'] === '3'));
  }
  if (mapping.id.startsWith('fraction.end.')) {
    const kind = mapping.id.split('.').at(-1);
    return Boolean(fraction && fractionKind === kind && denominatorFocus &&
      (!mapping.id.includes('order3') || fraction.attrs?.['data-omniya-fraction-order'] === '3'));
  }
  if (mapping.id === 'radical.next.radicand') return Boolean(hasAncestor(context.tree, context.node, 'mroot'));
  if (mapping.id === 'radical.end') return Boolean(hasAncestor(context.tree, context.node, 'msqrt'));
  if (mapping.id === 'radical.indexed.end') return Boolean(hasAncestor(context.tree, context.node, 'mroot'));
  if (mapping.args?.radicalOrder) {
    const radical = hasAncestor(context.tree, context.node, 'msqrt');
    return Boolean(radical && radical.attrs?.['data-omniya-radical-order'] === String(mapping.args.radicalOrder));
  }
  if (mapping.id === 'script.sup-sub.move-sub') return Boolean(hasAncestor(context.tree, context.node, 'msubsup'));
  if (mapping.id === 'script.sub-sup.move-sup') return Boolean(hasAncestor(context.tree, context.node, 'msubsup'));
  if (mapping.id === 'script.superscript') return !Boolean(hasAncestor(context.tree, context.node, 'msubsup'));
  if (mapping.id === 'script.subscript') return !Boolean(hasAncestor(context.tree, context.node, 'msubsup'));
  if (mapping.id === 'cancellation.end') return Boolean(hasAncestor(context.tree, context.node, 'menclose'));
  if (mapping.id === 'script.baseline') return Boolean(hasAncestor(context.tree, context.node, 'msup') || hasAncestor(context.tree, context.node, 'msub') || hasAncestor(context.tree, context.node, 'msubsup') || hasAncestor(context.tree, context.node, 'mover') || hasAncestor(context.tree, context.node, 'munder') || hasAncestor(context.tree, context.node, 'munderover'));
  if (mapping.action === 'simultaneous-modifier') {
    const container = hasAncestor(context.tree, context.node, ['mover', 'munder']);
    return Boolean(container && container.name !== 'munderover');
  }
  if (mapping.action === 'higher-order-modifier') {
    let node = context.node;
    if (node.name === 'math' || node.name === 'mrow') {
      node = [...(node.children ?? [])].reverse().find((child) => child.name === (mapping.args.direction === 'under' ? 'munder' : 'mover')) ?? node;
    }
    const container = hasAncestor(context.tree, node, mapping.args.direction === 'under' ? ['munder'] : ['mover']);
    return Boolean(container && container.name !== 'munderover');
  }
  if (mapping.action === 'move-binomial-lower') {
    const table = hasAncestor(context.tree, context.node, 'mtable');
    return Boolean(table?.attrs?.['data-omniya-role'] === 'binomial-table' &&
      table.children?.[0]?.children?.[0]?.children?.[0] === context.node);
  }
  if (mapping.action === 'close-binomial') {
    const table = hasAncestor(context.tree, context.node, 'mtable');
    return Boolean(table?.attrs?.['data-omniya-role'] === 'binomial-table' &&
      table.children?.[1]?.children?.[0]?.children?.[0] === context.node);
  }
  if (mapping.id === 'modifier.terminate.over') return Boolean(hasAncestor(context.tree, context.node, ['mover', 'munderover']));
  if (mapping.id === 'modifier.terminate.under') return Boolean(hasAncestor(context.tree, context.node, ['munder', 'munderover']));
  if (mapping.id === 'modifier.terminate.simultaneous') return Boolean(hasAncestor(context.tree, context.node, 'munderover'));
  if (mapping.action === 'close-structure' && mapping.args?.element === 'munderover') return Boolean(hasAncestor(context.tree, context.node, 'munderover'));
  if (mapping.id === 'indicator.multipurpose') return true;
  if (mapping.id === 'indicator.number' && fraction) return !contains(context.tree, fraction.children[1], context.node);
  if (mapping.action === 'insert-contracted-script-comma') {
    return Boolean(hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts']) &&
      context.node.name !== 'math' && !isHole(context.node));
  }
  if (mapping.action === 'append-possessive' || mapping.action === 'append-plural') {
    return context.node.name !== 'math' && !isHole(context.node) && Boolean(findMathParent(context.tree, context.node.attrs?.['data-omniya-id']));
  }
  if (mapping.action === 'append-ordinal') return context.node.name === 'mn' && !isHole(context.node);
  if (mapping.action === 'close-typeform-scope') {
    const scope = hasAncestor(context.tree, context.node, 'mstyle');
    return Boolean(scope?.attrs?.['data-omniya-nemeth-intent'] === 'typeform-scope');
  }
  if (mapping.id.startsWith('modifier.horizontal-')) {
    return Boolean(context.node.name !== 'math' &&
      hasAncestor(context.tree, context.node, ['mover', 'munder', 'munderover']));
  }
  // Dot 4 is the cancellation opener on the baseline, but inside a script
  // it is BANA 14.7's contracted comma.  Context selects the local meaning;
  // it never requires a passage-level interpretation.
  if (mapping.id === 'cancellation.start' &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) return false;
  if (mapping.id === 'misc.prime') {
    return context.node.name !== 'math' && !isHole(context.node);
  }
  return true;
}

function hasAtomicContinuation(prefix, nextCell, context) {
  const candidatePrefix = `${prefix}${nextCell}`;
  return MAPPINGS.some((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
    mapping.cells.length > candidatePrefix.length &&
    mapping.cells.slice(0, candidatePrefix.length).join('') === candidatePrefix &&
    mappingApplies(mapping, context));
}

// Input rows are intentionally richer than their tree operation. This table
// is the sole translation boundary from a recognized row to a structural
// transition. A new BANA row chooses an existing handler and supplies data;
// it does not add another parser branch.
const TREE_OPERATIONS = Object.freeze({
  'insert-token': ({ tree, focus, node, args, inputState }) => {
    const typeform = inputState.mode?.startsWith?.('typeform:')
      ? inputState.mode.slice('typeform:'.length).split(':')[0]
      : inputState.mode?.startsWith?.('numeric:')
        ? inputState.mode.slice('numeric:'.length)
        : null;
    return insertToken(tree, focus, args.name, args.value, {
      replace: node.name === 'math' && tree.children.length === 0,
      mathvariant: ['mi', 'mn'].includes(args.name) ? typeform : args.mathvariant ?? null,
      dataAttributes: args.dataAttributes ?? {}
    });
  },
  'insert-numeric': ({ tree, focus, node, args, inputState }) => {
    const numericVariant = inputState.mode?.startsWith?.('numeric:')
      ? inputState.mode.slice('numeric:'.length)
      : null;
    if (node.name === 'mn' && node.children?.length === 1) {
      return insertNumeric(tree, focus, args.value, { mathvariant: numericVariant, dataAttributes: args.dataAttributes ?? {} });
    }
    const inserted = atom('mn', args.value, { ...(numericVariant ? { mathvariant: numericVariant } : {}), ...(args.dataAttributes ?? {}) });
    const target = (node.name === 'math' && node.children.length === 0) || isHole(node)
      ? replaceCurrent(tree, focus, inserted)
      : insertAfter(tree, focus, inserted);
    return { tree, focus: focusNode(target) };
  },
  'insert-composite': ({ tree, focus, args }) => insertComposite(tree, focus, args.parts, args.dataAttributes),
  'insert-modifier': ({ tree, focus, inputState, args }) => insertModifier(tree, focus, args.value, inputState.mode, inputState.modifierScope, args.dataAttributes ?? {}),
  'open-structure': ({ tree, focus, args, inputState }) => {
    const primeWrapped = ['msup', 'msub', 'msubsup'].includes(args.element)
      ? wrapScriptAfterPrime(tree, focus, args.element, args.slots, args.attrs, args.initialSlot)
      : null;
    const radicalOrder = inputState.mode?.startsWith?.('radical-order:') ? inputState.mode.slice('radical-order:'.length) : null;
    const attrs = radicalOrder && ['msqrt', 'mroot'].includes(args.element)
      ? { ...(args.attrs ?? {}), 'data-omniya-radical-order': radicalOrder }
      : args.attrs;
    return primeWrapped ?? wrapCurrent(tree, focus, args.element, args.slots, attrs, args.initialSlot);
  },
  'open-function-limit': ({ tree, focus, args }) => openFunctionLimit(tree, focus, args.direction),
  'insert-contracted-script-comma': ({ tree, focus }) => insertContractedScriptComma(tree, focus),
  'append-possessive': ({ tree, focus }) => appendPossessive(tree, focus),
  'append-plural': ({ tree, focus }) => appendPlural(tree, focus),
  'append-ordinal': ({ tree, focus, args }) => appendOrdinal(tree, focus, args.ending),
  'open-typeform-scope': ({ tree, focus, args }) => openTypeformScope(tree, focus, args.mathvariant),
  'close-typeform-scope': ({ tree, focus }) => closeTypeformScope(tree, focus),
  'open-fixed-root': ({ tree, focus, args }) => openFixedRoot(tree, focus, args.index, args.indexText),
  'open-script-chain': ({ tree, focus, args }) => openScriptChain(tree, focus, args.directions),
  'open-modifier': ({ document, focus, tree, inputState, args }) => {
    if (inputState.mode !== args.requiresMode) throw new RangeError('A multipurpose indicator is required before a modifier.');
    const mode = args.slot === 'underscript' ? 'modifier-under' : 'modifier-over';
    return { status: 'pending', document, focus,
      inputState: { ...inputState, prefix: '', mode, modifierScope: inputState.modifierScope ?? scopeForCurrent(tree, focus) },
      announcement: `Modifier ${args.slot === 'underscript' ? 'under' : 'over'} is ready for its modifier cell.` };
  },
  'simultaneous-modifier': ({ tree, focus, args }) => addSimultaneousModifier(tree, focus, args.direction),
  'higher-order-modifier': ({ tree, focus, args }) => addHigherOrderModifier(tree, focus, args.direction),
  'open-binomial': ({ tree, focus }) => openBinomial(tree, focus),
  'move-binomial-lower': ({ tree, focus }) => moveBinomialLower(tree, focus),
  'close-binomial': ({ tree, focus }) => closeBinomial(tree, focus),
  'close-structure': ({ tree, focus, args }) => closeStructure(tree, focus, args.element),
  'extend-integral': ({ tree, focus, args }) => extendIntegral(tree, focus, args.values),
  'superpose-token': ({ tree, focus, args }) => superposeToken(tree, focus, args.value, args.intent, args.allowedValues),
  'move-slot': ({ tree, focus, node, args }) => {
    if (args.element === 'mfrac' && Object.hasOwn(args, 'bevelled')) {
      const fraction = fractionAtFocus(tree, node);
      if (fraction) fraction.attrs.bevelled = args.bevelled ? 'true' : 'false';
    }
    return focusRole(tree, focus, args.element, args.role);
  },
  'set-mode': ({ tree, focus, node, inputState, args, document }) => {
    if (args.mode === 'baseline') {
      const script = ancestor(tree, node, ['msup', 'msub']);
      const promoted = promoteScriptToPrescript(tree, focus, script?.name === 'msub' ? 'sub' : 'sup');
      if (promoted) return promoted;
      const container = ancestor(tree, node, ['msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover']);
      return { tree, focus: focusNode(container ? findMathParent(tree, container.attrs['data-omniya-id']) ?? tree : node) };
    }
    if (args.mode === 'letter-indicator') {
      if (!inputState.mode?.startsWith?.('typeform:')) throw new RangeError('The alphabetic indicator is not valid at this focus.');
      return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: `${inputState.mode}:alpha` }, announcement: 'Typeform alphabetic indicator active.' };
    }
    if (args.mode === 'numeric') {
      const typeform = inputState.mode?.startsWith?.('typeform:') ? inputState.mode.slice('typeform:'.length).split(':')[0] : null;
      return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: typeform ? `numeric:${typeform}` : 'numeric' }, announcement: 'Nemeth numeric indicator active.' };
    }
    if (args.mode === 'typeform-end') return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: null }, announcement: 'Nemeth typeform terminated.' };
    return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: args.mode }, announcement: `Nemeth ${args.mode} indicator active.` };
  }
});

function applyMapping(document, focus, inputState, mapping) {
  const { tree, node } = contextFor(document, focus);
  const args = mapping.args ?? {};
  const operation = TREE_OPERATIONS[mapping.action];
  if (!operation) return { status: 'rejected', document, focus, inputState, announcement: `Unknown local operation: ${mapping.action}` };
  let result;
  try {
    result = operation({ document, tree, node, focus, inputState, args, mapping });
  } catch (error) {
    return { status: 'rejected', document, focus, inputState, announcement: error.message };
  }
  if (result.status === 'pending') return result;
  const insertedAction = ['insert-token', 'insert-numeric', 'open-structure', 'open-fixed-root', 'open-function-limit', 'insert-contracted-script-comma', 'open-binomial'].includes(mapping.action);
  const collectingModifierScope = inputState.mode === 'multipurpose' || inputState.mode?.startsWith?.('modifier-');
  const nextModifierScope = collectingModifierScope && insertedAction
    ? extendModifierScope(result.tree, result.focus, inputState.modifierScope)
    : inputState.modifierScope;
  const nextMode = mapping.action === 'insert-modifier'
    ? 'modifier-complete'
    : mapping.action === 'simultaneous-modifier'
      ? `modifier-${args.direction}`
    : ['insert-token', 'insert-numeric'].includes(mapping.action) && inputState.mode?.startsWith?.('numeric')
    ? inputState.mode
    : ['insert-token', 'insert-numeric'].includes(mapping.action) && inputState.mode?.startsWith?.('modifier-')
      ? inputState.mode
      : ['insert-token', 'insert-numeric'].includes(mapping.action) && inputState.mode === 'multipurpose'
        ? 'multipurpose'
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
    inputState: {
      prefix: '',
      mode: nextMode,
      modifierScope: mapping.action === 'insert-modifier' || mapping.action === 'simultaneous-modifier'
        ? null
        : (inputState.mode === 'multipurpose' || inputState.mode?.startsWith?.('modifier-')) ? nextModifierScope : null
    },
    announcement: mapping.id
  };
}

export function applyNemethChoice({ document, focus, inputState = { prefix: '', mode: null }, operationId }) {
  const context = contextFor(document, focus);
  const mapping = MAPPINGS.find((candidate) => candidate.id === operationId);
  const prefix = inputState.prefix ?? '';
  const mappingPrefix = mapping?.cells.join('') ?? '';
  if (!mapping || !(mappingPrefix === prefix || prefix.startsWith(mappingPrefix)) || !mappingApplies(mapping, context)) {
    return {
      status: 'rejected',
      document,
      focus,
      inputState,
      announcement: 'That Nemeth choice is no longer valid at this draft focus.'
    };
  }
  const applied = applyMapping(document, focus, { ...inputState, prefix: '' }, mapping);
  if (applied.status === 'rejected') return applied;
  // Rules 24.1.i and 24.1.k keep a one-symbol follow-up active after the
  // author explicitly chooses the first meaning of a shared cell. Preserve
  // that local mode so the next cell completes the adjacent-bar or horizontal
  // tilde construction instead of starting an unrelated expression.
  if (prefix === mappingPrefix && mapping.id === 'misc.vertical-bar' && prefix === '⠳') {
    return { ...applied, inputState: { ...applied.inputState, mode: 'vertical-bar-horizontal' } };
  }
  if (prefix === mappingPrefix && mapping.id === 'comparison.similar' && prefix === '⠈⠱') {
    return { ...applied, inputState: { ...applied.inputState, mode: 'tilde-horizontal' } };
  }
  if (prefix === mappingPrefix) return applied;
  // Reprocess only the unmatched suffix of this one local code. This is the
  // same bounded transition loop used after a short code is selected from a
  // shared prefix, never an arbitrary-expression parser.
  let next = applied;
  for (const suffixCell of [...prefix.slice(mappingPrefix.length)]) {
    next = applyNemethCell({
      document: next.document,
      focus: next.focus,
      inputState: next.inputState,
      cell: suffixCell
    });
    if (next.status === 'rejected' || next.status === 'choice') break;
  }
  return next;
}

function digitMapping(cell) {
  return { id: `number.${DIGITS.get(cell)}`, cells: [cell], banaRefs: ['3.1.2', '3.3'], action: 'insert-numeric', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { value: DIGITS.get(cell) } };
}

function numericPunctuationMapping(cell, value, banaRef) {
  return { id: `number.${banaRef === '3.2.3' ? 'decimal-point' : 'comma'}`, cells: [cell], banaRefs: [banaRef], action: 'insert-numeric', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { value } };
}

function letterMapping(cell, inputState) {
  const value = LETTERS.get(cell);
  return { id: `letter.${value}`, cells: [cell], banaRefs: ['6.3', '6.4', ...(inputState.mode === 'english-letter' ? ['10.3'] : [])], action: 'insert-token', args: { name: 'mi', value: inputState.mode === 'capital' ? value.toUpperCase() : value } };
}

export function applyNemethCell({ document, focus, inputState = { prefix: '', mode: null }, cell }) {
  const normalized = normalizeCell(cell);
  const state = {
    prefix: inputState.prefix ?? '',
    mode: inputState.mode ?? null,
    modifierScope: inputState.modifierScope ?? null
  };
  const sequence = `${state.prefix}${normalized}`;
  const match = PREFIXES.get(sequence);
  const context = contextFor(document, focus);

  // Rule 13.8.2 has a finite three-dot prefix that overlaps the ordinary
  // punctuation/capital indicators. Resolve only the published fraction
  // opener here, before generic prefix choices, and leave all other meanings
  // to the normal local matcher.
  if (state.mode === null && state.prefix === '⠠⠠⠠' && normalized === '⠹') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'fraction.start.hypercomplex.order3');
    if (mapping) return applyMapping(document, focus, { ...state, prefix: '' }, mapping);
  }

  // BANA 16.3 repeats the order indicator before an inner radical and its
  // matching terminator. The value is carried as a bounded mode for this one
  // radical operation, never as a general nesting stack.
  if (/^⠨{1,3}$/.test(state.prefix) && (normalized === '⠜' || normalized === '⠣')) {
    const order = state.prefix.length;
    const radical = MAPPINGS.find((candidate) => candidate.id === (normalized === '⠜' ? 'radical.square' : 'radical.indexed'));
    if (radical && (context.node.name === 'math' || isHole(context.node) || hasAncestor(context.tree, context.node, 'msqrt'))) {
      return applyMapping(document, focus, { ...state, prefix: '', mode: `radical-order:${order}` }, radical);
    }
  }
  if (/^⠨{1,3}$/.test(state.prefix) && normalized === '⠻') {
    const order = state.prefix.length;
    const mapping = MAPPINGS.find((candidate) => candidate.id === `radical.end.order.${['one', 'two', 'three'][order - 1]}`);
    if (mapping && mappingApplies(mapping, context)) return applyMapping(document, focus, { ...state, prefix: '' }, mapping);
  }
  if (/^⠨{1,3}$/.test(state.prefix) && normalized === '⠻' && hasAncestor(context.tree, context.node, 'msqrt')) {
    return applyMapping(document, focus, { ...state, prefix: '' }, {
      id: 'radical.end.ordered-local', cells: [...state.prefix, normalized], banaRefs: ['16.3'], action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: 'msqrt', sourceNotation: `${'.'.repeat(state.prefix.length)}]` }
    });
  }

  // BANA Rule 9.2's general reference indicator is a one-symbol local
  // follow-up: @] is followed immediately by one letter or numeral. It does
  // not open a passage buffer or infer a footnote number; it inserts exactly
  // that next local atom and annotates the source role.
  if (state.mode === 'reference' && !state.prefix) {
    if (LETTERS.has(normalized)) {
      return applyMapping(document, focus, { ...state, mode: null }, {
        id: `reference.letter.${LETTERS.get(normalized)}`,
        cells: [normalized],
        banaRefs: ['9.2', '6.3'],
        action: 'insert-token',
        commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
        args: { name: 'mi', value: LETTERS.get(normalized), dataAttributes: { 'data-omniya-nemeth-intent': 'general-reference' } }
      });
    }
    if (DIGITS.has(normalized)) {
      return applyMapping(document, focus, { ...state, mode: null }, {
        id: `reference.number.${DIGITS.get(normalized)}`,
        cells: [normalized],
        banaRefs: ['9.2', '3.1.2'],
        action: 'insert-numeric',
        commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
        args: { value: DIGITS.get(normalized), dataAttributes: { 'data-omniya-nemeth-intent': 'general-reference' } }
      });
    }
  }

  // Give a registered atomic construction priority over a structural
  // follow-up when the cells seen so far are still a prefix of that one
  // construction. This matters for compound comparisons and similar BANA
  // signs whose first cells also have an ordinary follow-up meaning. The
  // lookahead is bounded by the registry row and never becomes an expression
  // buffer.
  const existingComparison = context.node.name === 'mo' &&
    ['<', '>', '=', '≤', '≥', '≠', '≡', '⊂', '⊃'].includes(context.node.children?.[0]?.text);
  // The two legacy one-cell msubsup moves are true structural follow-ups,
  // not prefixes of a new construction once the compound script exists.
  // Keep this narrow exception explicit so unrelated shared prefixes retain
  // the registry's normal atomic lookahead behavior.
  const scriptMove = PREFIXES.get(sequence)?.mappings
    ?.find((mapping) => ['script.sup-sub.move-sub', 'script.sub-sup.move-sup'].includes(mapping.id) && mappingApplies(mapping, context));
  if (state.mode === null && scriptMove) {
    return applyMapping(document, focus, { ...state, prefix: '' }, scriptMove);
  }
  const atomicContinuation = state.mode === null && !existingComparison && MAPPINGS.some((mapping) =>
    mapping.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
    mapping.cells.length > sequence.length &&
    mapping.cells.slice(0, sequence.length).join('') === sequence &&
    mappingApplies(mapping, context));
  const immediateBeforeContinuation = state.mode === null && (PREFIXES.get(sequence)?.mappings ?? [])
    .filter((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE && mapping.args?.allowImmediateBeforeContinuation)
    .filter((mapping) => mappingApplies(mapping, context));
  if (atomicContinuation && immediateBeforeContinuation.length === 0) {
    return {
      status: 'pending', document, focus,
      inputState: { ...state, prefix: sequence },
      announcement: 'Nemeth sequence may continue.'
    };
  }

  if (immediateBeforeContinuation.length === 1) return applyMapping(document, focus, state, immediateBeforeContinuation[0]);

  // BANA 24.1.f places a dot-5 multipurpose indicator between two adjacent
  // comparison signs. Some of those same prefixes begin Rule 21 compound
  // comparisons, so the generic longest-prefix matcher would otherwise hold
  // the input as an unrelated atomic sequence. Once the first comparison is
  // recognized, commit it and retain only the separator plus the next local
  // comparison prefix. This is the complete bounded follow-up, not a passage
  // buffer or precedence parser.
  if (state.mode === null && state.prefix === '⠐⠅' && normalized === '⠐') {
    const first = MAPPINGS.find((mapping) => mapping.id === 'comparison.less');
    const applied = applyMapping(document, focus, { ...state, prefix: '' }, first);
    if (applied.status !== 'rejected') return {
      status: 'pending', document: applied.document, focus: applied.focus,
      inputState: { ...applied.inputState, prefix: '⠐', mode: 'comparison-horizontal' },
      announcement: 'Horizontal comparison code pending.'
    };
  }
  if (state.mode === null && state.prefix === '⠨⠂' && normalized === '⠐') {
    const first = MAPPINGS.find((mapping) => mapping.id === 'comparison.greater');
    const applied = applyMapping(document, focus, { ...state, prefix: '' }, first);
    if (applied.status !== 'rejected') return {
      status: 'pending', document: applied.document, focus: applied.focus,
      inputState: { ...applied.inputState, prefix: '⠐', mode: 'comparison-horizontal' },
      announcement: 'Horizontal comparison code pending.'
    };
  }
  if (state.mode === 'comparison-horizontal' && state.prefix === '⠐' && normalized === '⠨') {
    return {
      status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠐⠨' },
      announcement: 'Horizontal comparison code pending.'
    };
  }
  if (state.mode === 'comparison-horizontal' && state.prefix === '⠐⠨' && normalized === '⠅') {
    const equals = MAPPINGS.find((mapping) => mapping.id === 'operator.equals');
    return applyMapping(document, focus, { ...state, prefix: '' }, equals);
  }

  if (state.mode?.startsWith?.('numeric') && !state.prefix) {
    if (DIGITS.has(normalized)) return applyMapping(document, focus, state, digitMapping(normalized));
    if (LETTERS.has(normalized) && context.node.name === 'mn') {
      // Rule 3.6: letters used as extra digits in a non-decimal base remain
      // in the same local numeric atom. The editor does not infer the base;
      // the transcriber-provided numeric indicator establishes this mode.
      const result = insertBaseDigit(context.tree, focus, LETTERS.get(normalized));
      return {
        status: 'applied', document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(result.tree), focus: result.focus },
        focus: result.focus, inputState: { ...state, prefix: '' }, announcement: `number.${LETTERS.get(normalized)}`
      };
    }
    if (normalized === '⠨') return applyMapping(document, focus, state, numericPunctuationMapping(normalized, '.', '3.2.3'));
    if (normalized === '⠠') return applyMapping(document, focus, state, numericPunctuationMapping(normalized, ',', '3.2.2'));
    // BANA 24.1.g: after a decimal point, dot 5 makes the next symbol
    // nonnumeric (unless it is the comma or punctuation indicator).  This is
    // a one-symbol local mode, not a numeric/passage parser: the following
    // token is inserted through the ordinary registry and the mode clears.
    if (normalized === '⠐') {
      const current = context.node;
      const decimal = current.name === 'mn' && current.children?.[0]?.text?.includes?.('.');
      if (decimal) return {
        status: 'pending', document, focus,
        inputState: { ...state, mode: 'decimal-nonnumeric', prefix: '' },
        announcement: 'Decimal nonnumeric indicator active for the next symbol.'
      };
    }
  }
  if (state.mode === 'decimal-nonnumeric' && !state.prefix) {
    // The indicator applies to exactly the next local symbol.  Resolve a
    // plain letter here instead of allowing a longer abbreviated-function
    // prefix to hold it; the author can still enter that function explicitly
    // as its own bounded atomic sequence after the decimal context ends.
    if (LETTERS.has(normalized)) {
      return applyMapping(document, focus, { ...state, mode: null }, letterMapping(normalized, { ...state, mode: null }));
    }
  }
  // BANA 24.1.f: a multipurpose indicator between adjacent comparison
  // symbols records that they are horizontal.  Once the focused symbol is a
  // comparison, this is a bounded one-follow-up mode for the next comparison
  // code, never a passage-level interpretation.
  if (state.mode === 'comparison-horizontal' && !state.prefix &&
    (normalized === '⠐' || normalized === '⠨')) {
    return { status: 'pending', document, focus,
      inputState: { ...state, prefix: normalized },
      announcement: 'Horizontal comparison code pending.' };
  }
  // BANA 24.1.i: dot 5 between adjacent vertical grouping bars is a
  // one-symbol structural follow-up.  The current bar remains untouched
  // until the next bar code is complete.
  if (state.mode === 'vertical-bar-horizontal' && !state.prefix && normalized === '⠐') {
    return { status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠐' },
      announcement: 'Adjacent-bar code pending.' };
  }
  if (state.mode === 'vertical-bar-horizontal' && state.prefix === '⠐' && normalized === '⠳') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'misc.vertical-bar');
    return applyMapping(document, focus, { ...state, mode: null }, mapping);
  }
  // BANA 24.1.k: dot 5 between two tildes marks horizontal succession.  The
  // second tilde is another local token, not a newly inferred compound
  // operator.
  if (state.mode === 'tilde-horizontal' && !state.prefix && normalized === '⠐') {
    return { status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠐' },
      announcement: 'Horizontal tilde code pending.' };
  }
  if (state.mode === 'tilde-horizontal' && state.prefix === '⠐' && normalized === '⠈') {
    return { status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠐⠈' },
      announcement: 'Horizontal tilde code pending.' };
  }
  if (state.mode === 'tilde-horizontal' && state.prefix === '⠐⠈' && normalized === '⠱') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'comparison.similar');
    return applyMapping(document, focus, { ...state, prefix: '', mode: null }, mapping);
  }
  // BANA 24.1.h: after a tally, dot 5 separates the tally from the
  // punctuation indicator. Both cells are local to this one punctuation
  // transition; no tally run or passage buffer is accumulated here.
  if (state.mode === 'tally-punctuation' && state.prefix === '⠸' && normalized === '⠠') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'punctuation.comma');
    return applyMapping(document, focus, { ...state, prefix: '', mode: null }, mapping);
  }
  // BANA 24.1.j: dot 5 between a regular-polygon operation symbol and the
  // following numeral is a one-number local transition. The shape remains a
  // MathML operator; only the next number indicator is consumed in this mode.
  if (state.mode === 'polygon-numeric' && !state.prefix && normalized === '⠼') {
    return applyMapping(document, focus, { ...state, mode: null }, MAPPINGS.find((candidate) => candidate.id === 'indicator.number'));
  }
  if (state.mode === 'roman' && !state.prefix && ROMAN_LETTERS.has(normalized)) {
    const result = insertRomanLetter(context.tree, focus, ROMAN_LETTERS.get(normalized).toUpperCase());
    return {
      status: 'applied', document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(result.tree), focus: result.focus },
      focus: result.focus, inputState: { ...state, prefix: '' }, announcement: `roman.${ROMAN_LETTERS.get(normalized)}`
    };
  }
  if ((state.mode === 'capital' || state.mode === 'english-letter') && !state.prefix && LETTERS.has(normalized)) return applyMapping(document, focus, { ...state, mode: null }, letterMapping(normalized, state));
  // After the Rule 24 multipurpose indicator, a letter begins the expression
  // being modified (Rule 15.2.1.b); it must not be held merely because the
  // same letter also starts a longer abbreviated-function code. The function
  // code remains available when no local modifier scope is active.
  if (state.mode === 'multipurpose' && !state.prefix && LETTERS.has(normalized)) {
    return applyMapping(document, focus, { ...state, mode: 'multipurpose' }, letterMapping(normalized, { ...state, mode: null }));
  }
  // In the standard five-step order the expression comes before the
  // directly-over/under indicator. Once that indicator arrives, the same
  // bounded modifier mode is used for the remaining modifier and terminator.
  // This explicit local choice also prevents ⠣/⠩ from being mistaken for an
  // indexed radical at this one focus.
  if (state.mode === 'multipurpose' && !state.prefix && (normalized === '⠣' || normalized === '⠩') && state.modifierScope) {
    const operationId = normalized === '⠣' ? 'modifier.directly-over' : 'modifier.directly-under';
    const mapping = MAPPINGS.find((candidate) => candidate.id === operationId);
    return applyMapping(document, focus, state, mapping);
  }
  if (state.mode === 'multipurpose' && !state.prefix && normalized === '⠱') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'modifier.bar-over');
    return applyMapping(document, focus, { ...state, mode: 'multipurpose' }, mapping);
  }
  // After the first modifier cell, Rule 15.4 permits the opposite-side
  // indicator before the single terminator.  This is still a one-structure
  // transition; the state carries only the local modifier phase.
  if (state.mode === 'modifier-complete' && !state.prefix && (normalized === '⠣' || normalized === '⠩')) {
    const operationId = normalized === '⠣' ? 'modifier.simultaneous.over' : 'modifier.simultaneous.under';
    const mapping = MAPPINGS.find((candidate) => candidate.id === operationId);
    return applyMapping(document, focus, state, mapping);
  }
  if (state.mode === 'modifier-under' && !state.prefix && normalized === '⠱') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'modifier.bar-over');
    return applyMapping(document, focus, state, mapping);
  }
  if (state.mode === 'modifier-complete' && !state.prefix && normalized === '⠻') {
    // The same terminator closes either a one-sided mover/munder or a
    // completed munderover.  Resolve that choice from the current local
    // structure only; it is not a passage-level parse.
    const container = hasAncestor(context.tree, context.node, ['mover', 'munder', 'munderover']);
    const operationId = container?.name === 'munderover'
      ? 'modifier.terminate.simultaneous'
      : container?.name === 'munder' ? 'modifier.terminate.under' : 'modifier.terminate.over';
    const mapping = MAPPINGS.find((candidate) => candidate.id === operationId);
    return applyMapping(document, focus, state, mapping);
  }
  if (state.mode === 'multipurpose' && state.prefix === '⠣' && normalized === '⠁') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'modifier.directly-over');
    return applyMapping(document, focus, { ...state, prefix: '' }, mapping);
  }
  if (state.mode === 'multipurpose' && state.prefix === '⠩' && normalized === '⠁') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'modifier.directly-under');
    return applyMapping(document, focus, { ...state, prefix: '' }, mapping);
  }
  if (((state.mode === null && state.prefix === '⠐') || (state.mode === 'multipurpose' && !state.prefix)) && normalized === '⠨' &&
    context.node.name === 'mo' && ['<', '>', '=', '≤', '≥', '≠', '≡', '⊂', '⊃'].includes(context.node.children?.[0]?.text)) {
    return { status: 'pending', document, focus,
      inputState: { ...state, prefix: state.mode === null ? '⠐⠨' : '⠨', mode: 'comparison-horizontal' },
      announcement: 'Horizontal comparison code pending.' };
  }
  if (state.mode === null && state.prefix === '⠐' && normalized === '⠸' &&
    context.node.name === 'mo' && context.node.children?.[0]?.text === '|') {
    return { status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠸', mode: 'tally-punctuation' },
      announcement: 'Tally punctuation code pending.' };
  }
  if (state.mode === null && state.prefix === '⠐' && normalized === '⠼' &&
    context.node.name === 'mo' && ['□', '■', '△', '▽', '◇', '⬡', '⬠', '⯃'].includes(context.node.children?.[0]?.text)) {
    return applyMapping(document, focus, { ...state, prefix: '', mode: null }, MAPPINGS.find((candidate) => candidate.id === 'indicator.number'));
  }
  if (state.mode === null && state.prefix === '⠐' && normalized === '⠳' &&
    context.node.name === 'mo' && context.node.children?.[0]?.text === '|') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'misc.vertical-bar');
    return applyMapping(document, focus, { ...state, prefix: '', mode: null }, mapping);
  }
  if (state.mode === null && state.prefix === '⠐' && normalized === '⠈' &&
    context.node.name === 'mo' && context.node.children?.[0]?.text === '∼') {
    return { status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠈', mode: 'tilde-horizontal' },
      announcement: 'Horizontal tilde code pending.' };
  }
  if (state.mode === null && state.prefix === '⠨' && normalized === '⠨' &&
    hasAncestor(context.tree, context.node, 'msqrt')) {
    return { status: 'pending', document, focus, inputState: { ...state, prefix: '⠨⠨' }, announcement: 'Nested radical order 2 pending.' };
  }
  if (state.mode === null && state.prefix === '⠨⠨' && normalized === '⠨' &&
    hasAncestor(context.tree, context.node, 'msqrt')) {
    return { status: 'pending', document, focus, inputState: { ...state, prefix: '⠨⠨⠨' }, announcement: 'Nested radical order 3 pending.' };
  }
  // Rule 14 permits a lower-cell numeral directly in a script slot.  Dot 6
  // is shared with the English-letter indicator, so it is held until the
  // following cell makes the local script context unambiguous.  This handles
  // `x` + subscript indicator + digit without introducing a numeric passage
  // parser or a persistent mode.
  if (state.mode === null && state.prefix === '⠰' && DIGITS.has(normalized) &&
    context.node.name !== 'math' && !isHole(context.node)) {
    const script = MAPPINGS.find((candidate) => candidate.id === 'script.subscript');
    const opened = applyMapping(document, focus, { ...state, prefix: '' }, script);
    if (opened.status !== 'rejected') {
      return applyMapping(opened.document, opened.focus, { ...opened.inputState, mode: 'numeric' }, digitMapping(normalized));
    }
  }
  // The same dot-6 prefix followed by a letter is the ordinary Rule 14
  // subscript transition whenever the current focus is a populated atom.
  // Resolve that local structural meaning before the English-letter mode;
  // the latter remains available at an empty/boundary focus.
  if (state.mode === null && state.prefix === '⠰' && LETTERS.has(normalized) &&
    context.node.name !== 'math' && !isHole(context.node)) {
    const script = MAPPINGS.find((candidate) => candidate.id === 'script.subscript');
    const opened = applyMapping(document, focus, { ...state, prefix: '' }, script);
    if (opened.status !== 'rejected') {
      return applyNemethCell({ document: opened.document, focus: opened.focus, inputState: opened.inputState, cell: normalized });
    }
  }
  // The held prime has already been committed as a local token.  If dot 6 is
  // followed by a script item while that prime is focused, wrap the exact
  // adjacent prime/base pair as the new script base (Rule 14.12).
  if (state.mode === null && state.prefix === '⠰' &&
    context.node.name === 'mo' && context.node.children?.[0]?.text === '′') {
    const script = MAPPINGS.find((candidate) => candidate.id === 'script.subscript');
    const opened = applyMapping(document, focus, { ...state, prefix: '' }, script);
    if (opened.status !== 'rejected') {
      return applyNemethCell({ document: opened.document, focus: opened.focus,
        inputState: opened.inputState, cell: normalized });
    }
  }
  // At an empty replacement root, dot 6 followed by a letter is the BANA
  // English-letter indicator (Rule 6.3/10.3), not a script with a missing
  // base.  Resolve that boundary meaning before the shared-prefix matcher.
  if (state.mode === null && state.prefix === '⠰' && LETTERS.has(normalized) &&
    (context.node.name === 'math' || isHole(context.node))) {
    const indicator = applyMapping(document, focus, { ...state, prefix: '' },
      MAPPINGS.find((candidate) => candidate.id === 'indicator.english-letter'));
    if (indicator.status === 'rejected') return indicator;
    return applyNemethCell({ document: indicator.document, focus: indicator.focus,
      inputState: indicator.inputState, cell: normalized });
  }
  // A baseline return is a structural follow-up when the current focus is a
  // script slot. It is deliberately resolved only here, after the complete
  // one-cell prefix is known, so shared dot-5 meanings elsewhere remain
  // untouched.
  if (state.mode === null && state.prefix === '⠐' && LETTERS.has(normalized) &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
    const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
    if (activated.status !== 'rejected') {
      const next = applyNemethCell({ document: activated.document, focus: activated.focus, inputState: activated.inputState, cell: normalized });
      if (next.status !== 'rejected') return { ...next, announcement: `${activated.announcement}; ${next.announcement}` };
      return activated;
    }
  }
  // In a script slot, dot 5 followed by the numeric indicator is the local
  // baseline return before a new number.  Resolve it here, before the shared
  // multipurpose indicator can claim the prefix.
  if (state.mode?.startsWith?.('numeric') && state.prefix === '⠐' && normalized === '⠼' &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
    const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
    const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
    if (returned.status !== 'rejected') {
      return applyNemethCell({ document: returned.document, focus: returned.focus, inputState: returned.inputState, cell: normalized });
    }
  }
  // Dot 5 is shared by the baseline and multipurpose indicators. When the
  // next cell is the first ordinary expression symbol, the local Rule 15
  // construction resolves it as multipurpose and continues with that symbol.
  // A script/baseline context still follows the ordinary structural mapping.
  if (state.mode === null && state.prefix === '⠐' && !match && LETTERS.has(normalized) &&
    !hasAncestor(context.tree, context.node, 'msup') &&
    !hasAncestor(context.tree, context.node, 'msub') &&
    !hasAncestor(context.tree, context.node, 'msubsup')) {
    const indicator = PREFIXES.get('⠐')?.mappings?.find((mapping) => mapping.id === 'indicator.multipurpose');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, indicator);
    if (activated.status !== 'rejected') {
      const next = applyNemethCell({ document: activated.document, focus: activated.focus, inputState: activated.inputState, cell: normalized });
      if (next.status !== 'rejected') return { ...next, announcement: `${activated.announcement}; ${next.announcement}` };
    }
  }

  if (!match && state.prefix) {
    const previous = PREFIXES.get(state.prefix);
    const previousMappings = previous?.mappings
      ?.filter((mapping) => mappingApplies(mapping, context))
      .filter((mapping) => state.mode === 'multipurpose'
        ? mapping.action !== 'open-modifier'
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
    .filter((mapping) => state.mode === 'comparison-horizontal'
      ? ['operator.equals', 'comparison.less', 'comparison.greater', 'comparison.less-equal', 'comparison.greater-equal', 'comparison.not-equal'].includes(mapping.id)
      : true)
    .filter((mapping) => state.mode?.startsWith?.('modifier-')
      ? ['insert-modifier', 'close-structure'].includes(mapping.action)
      : true)
    .filter((mapping) => state.mode === 'multipurpose'
      ? mapping.action !== 'open-modifier'
      : mapping.action !== 'open-modifier');
  // A structural follow-up that is valid at the current MathML node wins
  // over unrelated longer prefixes.  This keeps the established one-cell
  // move between msubsup slots immediate while atomic constructions that
  // actually share the same complete code still use their bounded Enter
  // policy.
  if (mappings.length === 1 && mappings[0].commitPolicy === LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP) {
    return applyMapping(document, focus, state, mappings[0]);
  }
  const hasLonger = [...PREFIXES.keys()].some((candidate) => candidate.startsWith(sequence) && candidate.length > sequence.length && [...(PREFIXES.get(candidate)?.mappings ?? [])].some((mapping) => mappingApplies(mapping, context)));
  if (!mappings.length) {
    if (hasLonger) return { status: 'pending', document, focus, inputState: { ...state, prefix: sequence }, announcement: 'Nemeth sequence pending.' };
    return { status: 'rejected', document, focus, inputState: { ...state }, announcement: 'That Nemeth cell is not valid at this draft focus.' };
  }
  if (state.mode === 'multipurpose' && !state.modifierScope &&
    mappings.length === 1 && mappings[0].action === 'open-modifier') {
    return applyMapping(document, focus, { ...state, prefix: '' }, mappings[0]);
  }
  // Rule 15.4 is a structural follow-up, not an ambiguous token choice: if
  // the current focus is already a one-sided modifier, the same local cell
  // deterministically opens the missing side even when it also begins a
  // longer radical or modifier code.
  const simultaneousMapping = mappings.find((mapping) => mapping.action === 'simultaneous-modifier');
  if (simultaneousMapping) return applyMapping(document, focus, state, simultaneousMapping);
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
  // In Rule 15's five-step order, the directly-over/under indicator is a
  // complete structural transition after the expression has been collected.
  // Do not let unrelated longer prefixes (for example indexed radicals that
  // also begin with ⠣) delay this local transition.
  if (mappings.length === 1 && mappings[0].action === 'open-modifier' && state.mode === 'multipurpose') {
    return applyMapping(document, focus, { ...state, prefix: '' }, mappings[0]);
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
    .filter((mapping) => inputState.mode?.startsWith?.('modifier-')
      ? ['insert-modifier', 'close-structure'].includes(mapping.action)
      : true)
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
