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
const TYPEFORM_NUMBER_PREFIXES = Object.freeze({
  italic: '⠨⠼',
  bold: '⠸⠼',
  script: '⠈⠼',
  'sans-serif': '⠠⠨⠼',
  'double-struck': '⠠⠸⠼'
});
// Baseline arithmetic signs that keep a following lower-cell numeral in the
// same local numeric item (`#1.2+1.4`, `#1.4709`*10`). Leading signed-number
// mode stays plus/minus only.
const BASELINE_ARITHMETIC_SIGNS = Object.freeze(['+', '−', '-', '±', '∓', '×', '÷', '−+', '+−', '−−']);
const POST_OPERATOR_LOWER_CELL = Object.freeze([
  ...BASELINE_ARITHMETIC_SIGNS,
  '^', '′', '″', '‴', '∣', '§', '€', '∪', '∩', '/', '∗', '#', '〃'
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
  return [...notation].flatMap((character) => {
    if (character === '`') return '⠈';
    // BANA's printed source notation uses a few typographic aliases that do
    // not have a direct Braille-ASCII code point.  Keep these as explicit
    // source-notation aliases, rather than teaching the transition engine a
    // second encoding or inferring them from surrounding cells.
    if (character === '~') return '⠘'; // arrow direction: elevate nearer head
    if (character === ';') return '⠰'; // arrow direction: depress nearer head
    if (character === '|') return '⠳'; // BANA vertical bar cell
    if (character === '{') return '⠪'; // printed angle-shape alias for the dots-2-4-6 cell
    if (character === '}') return '⠻'; // local shape/modifier terminator
    if (character === 'K') character = 'k'; // BANA's printed capital K is the same dot-3 k cell
    if (/^[A-Z]$/.test(character)) {
      const lower = character.toLowerCase();
      const letterCell = [...LETTERS.entries()].find(([, value]) => value === lower)?.[0];
      if (letterCell) return ['⠠', letterCell];
    }
    const letterCell = [...LETTERS.entries()].find(([, value]) => value === character)?.[0];
    if (letterCell) return letterCell;
    const cell = ASCII_TO_UNICODE.get(character);
    if (cell) return cell;
    throw new TypeError(`Unsupported BANA source notation character: ${character}`);
  });
}

// Test and conformance tooling may translate one printed BANA local code into
// the exact Unicode cells fed to the transition engine. This is deliberately
// a character/code-table conversion only. It does not tokenize an expression,
// infer operands, or maintain a passage parser state.
export function sourceNotationToCells(notation) {
  return sourceCells(notation);
}

function id() { return `omniya-${globalThis.crypto.randomUUID()}`; }
function element(name, children = [], attrs = {}) { return { name, attrs: { ...attrs, 'data-omniya-id': attrs['data-omniya-id'] ?? id() }, children }; }
function text(value) { return { text: value }; }
function atom(name, value, attrs = {}) { return element(name, [text(value)], attrs); }
function hole(owner, role) { return createHole({ ownerNodeId: owner.attrs['data-omniya-id'], role }); }
function isElement(node) { return Boolean(node && node.text === undefined); }
function isHole(node) { return isElement(node) && node.attrs?.['data-omniya-hole'] === 'true'; }
function materializeHoleContainer(node) {
  if (!isHole(node) || node.name !== 'mrow') return;
  delete node.attrs['data-omniya-hole'];
  delete node.attrs['data-omniya-owner'];
  delete node.attrs['data-omniya-role'];
}
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
  // A required/group content row is represented by a hole wrapper around a
  // placeholder mspace. Materializing its first child must clear the wrapper
  // hole marker, otherwise completion traversal reports a stale empty slot
  // even though the row contains authored mathematics.
  if (isHole(parent) && parent.name === 'mrow' && current.name === 'mspace') {
    materializeHoleContainer(parent);
  }
  // A grouping structure owns its content through an mrow slot. Materialize
  // that slot in place so subsequent local tokens remain inside the group;
  // replacing the row itself would silently escape the structure.
  if (isHole(current) && current.attrs?.['data-omniya-role'] === 'content' &&
    parent.name === 'mrow' && parent.attrs?.['data-omniya-group']) {
    materializeHoleContainer(current);
    current.children = [replacement];
    return replacement;
  }
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
  // A group-close follow-up leaves focus on the fenced wrapper. An open
  // group still collects content before its closing fence. Once the wrapper
  // is marked closed, it is a finished operand: the next token belongs
  // beside it in the surrounding row, including unspaced identifiers such as
  // Rule 23 `dx`. Keep this state on the source node rather than inferring
  // it from siblings or maintaining a parser stack.
  if (current.name === 'mrow' && current.attrs?.['data-omniya-group']) {
    if (current.attrs?.['data-omniya-role'] === 'closed-group') {
      const surrounding = findMathParent(tree, current.attrs['data-omniya-id']);
      if (surrounding) {
        const groupIndex = surrounding.children.indexOf(current);
        surrounding.children.splice(groupIndex + 1, 0, replacement);
        return replacement;
      }
    }
    const content = current.children?.find((child) => isElement(child) && child.name === 'mrow' && child.attrs?.['data-omniya-role'] === 'content')
      ?? current.children?.find((child) => isElement(child) && child.name === 'mrow');
    if (content) {
      const last = content.children?.at(-1);
      if (last?.name === 'mo' && last.attrs?.['data-omniya-role'] === 'close-fence') {
        content.children.splice(content.children.length - 1, 0, replacement);
      } else {
        content.children.push(replacement);
      }
      return replacement;
    }
  }
  // Closing a nested local structure returns focus to its surrounding group.
  // A following token therefore belongs in that group's content row, not
  // after the group as a sibling of the parent expression. Keep this generic
  // for every grouped MathML construction; no Nemeth code is consulted here.
  const parent = findMathParent(tree, current.attrs['data-omniya-id']);
  if (!parent) return replaceCurrent(tree, focus, replacement);
  const index = parent.children.indexOf(current);
  // A baseline return inside an mroot promotes its radicand to an mrow. The
  // next local token belongs inside that row, even though the row itself is
  // the mroot's single radicand child. Keep the insertion local to that
  // structural slot rather than replacing the slot with a wrapper row.
  if ((parent.name === 'mroot' || parent.name === 'msqrt') && parent.children?.[0] === current && current.name === 'mrow') {
    current.children.push(replacement);
    return replacement;
  }
  if (['math', 'mrow'].includes(parent.name)) {
    // Inserting into the placeholder mspace of a required/group content row
    // materializes that row. Clear the hole marker on the owning row before
    // adding the token so completion traversal does not report a stale empty
    // slot after nested groups are authored.
    if (isHole(parent) && current.name === 'mspace') materializeHoleContainer(parent);
    // A closed group is a finished operand even when focus is still on one
    // of its fence children. Insert beside the wrapper, never before its
    // close fence.
    if (parent.attrs?.['data-omniya-group'] && parent.attrs?.['data-omniya-role'] === 'closed-group') {
      const surrounding = findMathParent(tree, parent.attrs['data-omniya-id']);
      if (surrounding) {
        const groupIndex = surrounding.children.indexOf(parent);
        surrounding.children.splice(groupIndex + 1, 0, replacement);
        return replacement;
      }
    }
    // A token focused inside a fenced group's content row stays in that row.
    // A token focused on the still-open group wrapper is inserted before the
    // close fence so the group can keep collecting local content.
    if (parent.attrs?.['data-omniya-group'] && current.attrs?.['data-omniya-role'] !== 'content') {
      const last = parent.children?.at(-1);
      if (last && isElement(last) && last.name === 'mo' && last.attrs?.['data-omniya-role'] === 'close-fence') {
        parent.children.splice(parent.children.length - 1, 0, replacement);
        return replacement;
      }
    }
    if (parent.attrs?.['data-omniya-group'] && current.attrs?.['data-omniya-role'] === 'close-fence') {
      parent.children.splice(index, 0, replacement);
      return replacement;
    }
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
    // An authored Nemeth blank is source semantics, not a request for a
    // full-em visual gap. Keep it as one full-width MathML source node so
    // Braille and local structural follow-ups retain the exact boundary. The
    // renderer suppresses only the derived mjx-mspace visual advance in CSS;
    // the canonical source and accessibility tree remain unchanged.
    ? element('mspace', [], { width: '1em', 'data-omniya-nemeth-intent': 'explicit-space', 'data-omniya-source-space': 'true' })
    : atom(name, value, { ...(mathvariant ? { mathvariant } : {}), ...dataAttributes });
  const inserted = replace || (current.name === 'math' && current.children.length === 0) || isHole(current)
    ? replaceCurrent(tree, focus, node)
    : insertAfter(tree, focus, node);
  return { tree, focus: focusNode(inserted) };
}

function wrapScriptToken(tree, focus, value, sourceNotation = null) {
  const current = currentNode(tree, focus);
  const wrapper = element('msup', [], {});
  const emptyBase = current.name === 'math' || isHole(current);
  const base = emptyBase
    ? hole(wrapper, 'base')
    : structuredClone(current);
  if (base !== current && base.attrs) base.attrs['data-omniya-id'] = id();
  wrapper.children.push(base, atom('mo', value, sourceNotation ? {
    'data-mjx-pseudoscript': 'true',
    'data-omniya-nemeth-cells': sourceNotationToCells(sourceNotation).join('')
  } : {}));
  replaceCurrent(tree, focus, wrapper);
  // In a fresh draft the local script code creates a required base hole and
  // puts the writer there. When decorating an existing focused expression,
  // the authored base is preserved and focus remains on the new decoration.
  return { tree, focus: focusNode(emptyBase ? wrapper.children[0] : wrapper.children[1]) };
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
function numericTextToCells(value) {
  const digitCells = new Map([...DIGITS].map(([cell, digit]) => [digit, cell]));
  digitCells.set('.', '⠨');
  digitCells.set(',', '⠠');
  return [...String(value)].map((character) => digitCells.get(character) ?? '').join('');
}

function stampTypeformNumber(node) {
  const variant = node?.attrs?.mathvariant;
  const prefix = TYPEFORM_NUMBER_PREFIXES[variant];
  if (!prefix || node.name !== 'mn') return;
  node.attrs['data-omniya-nemeth-intent'] = `typeform-${variant}-number`;
  node.attrs['data-omniya-nemeth-cells'] = `${prefix}${numericTextToCells(node.children?.[0]?.text ?? '')}`;
}

function insertNumeric(tree, focus, value, { replace = false, mathvariant = null, dataAttributes = {} } = {}) {
  const current = currentNode(tree, focus);
  if (!replace && current.name === 'mn' && current.children?.length === 1) {
    // BANA 24.1 baseline numbers after a single-letter criterion are a new
    // atom (C0"10), not an extension of that one-digit criterion number.
    if (current.attrs?.['data-omniya-nemeth-intent'] === 'single-letter-number'
      && dataAttributes?.['data-omniya-nemeth-intent'] === 'lower-cell-numeric') {
      return insertToken(tree, focus, 'mn', value, { replace, dataAttributes });
    }
    current.children[0].text += value;
    if (mathvariant) current.attrs.mathvariant = mathvariant;
    const nextAttributes = { ...dataAttributes };
    if (current.attrs['data-omniya-nemeth-intent'] === 'numeric-start' &&
      nextAttributes['data-omniya-nemeth-intent'] === 'lower-cell-numeric') {
      delete nextAttributes['data-omniya-nemeth-intent'];
    }
    Object.assign(current.attrs, nextAttributes);
    if (current.children?.[0]?.text?.startsWith?.('.') && current.attrs['data-omniya-nemeth-intent'] === 'numeric-start') {
      current.attrs['data-omniya-nemeth-intent'] = 'numeric-decimal';
    }
    return { tree, focus: focusNode(current) };
  }
  return insertToken(tree, focus, 'mn', value, { replace, dataAttributes });
}

// Rule 3.2.3's numeric decimal point is distinct from the ordinary decimal
// point. MathML uses the same punctuation glyph for both, so retain the
// bounded source distinction on the numeric atom for the Braille projection.
function insertNumericDecimal(tree, focus, value, dataAttributes = {}) {
  const current = currentNode(tree, focus);
  if (current.name === 'mn' && current.children?.length === 1) {
    current.children[0].text += value;
    Object.assign(current.attrs, dataAttributes, { 'data-omniya-nemeth-intent': 'numeric-decimal' });
    return { tree, focus: focusNode(current) };
  }
  return insertToken(tree, focus, 'mn', value, {
    dataAttributes: { ...dataAttributes, 'data-omniya-nemeth-intent': 'numeric-decimal' }
  });
}

function insertDecimalNonnumeric(tree, focus, value, dataAttributes = {}) {
  const current = currentNode(tree, focus);
  const parent = current.name === 'math' ? current : findMathParent(tree, current.attrs?.['data-omniya-id']);
  if (!parent || !['math', 'mrow'].includes(parent.name)) return insertToken(tree, focus, 'mi', value, { dataAttributes });
  const index = current.name === 'math' ? parent.children.length : parent.children.indexOf(current);
  const last = parent.children[index];
  if (last?.name === 'mi' && last.attrs?.['data-omniya-nemeth-intent'] === 'decimal-nonnumeric') {
    last.children[0].text += value;
    return { tree, focus: focusNode(last) };
  }
  const node = atom('mi', value, { ...dataAttributes, 'data-omniya-nemeth-intent': 'decimal-nonnumeric' });
  if (current.name === 'math') parent.children.push(node); else parent.children.splice(index + 1, 0, node);
  return { tree, focus: focusNode(node) };
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
function superposeToken(tree, focus, value, intent, allowedValues = null, sourceNotation = null) {
  const current = currentNode(tree, focus);
  // Rule 15.9 also defines bounded superposed signs whose source code starts
  // on the baseline (for example `:$4]`). Those constructions have no
  // pre-existing operator to mutate: the complete local code is itself one
  // authored mathematical atom. Keep this fallback explicit and atomic so
  // it cannot widen into an expression parser or affect the integral rows
  // that still require a focused operator.
  if ((current.name === 'math' || isHole(current)) && !allowedValues) {
    const node = atom('mo', value, {
      ...(intent ? { 'data-omniya-nemeth-intent': intent } : {}),
      ...(sourceNotation ? { 'data-omniya-nemeth-cells': sourceNotationToCells(sourceNotation).join('') } : {})
    });
    const inserted = replaceCurrent(tree, focus, node);
    return { tree, focus: focusNode(inserted) };
  }
  if (current.name !== 'mo' || (allowedValues && !allowedValues.includes(current.children?.[0]?.text))) {
    throw new RangeError('Superposition requires the focused mathematical sign.');
  }
  current.children = [text(value)];
  if (intent) current.attrs['data-omniya-nemeth-intent'] = intent;
  return { tree, focus: focusNode(current) };
}

// A finite modified comparison can be authored as one bounded local code
// whose printed form is a native MathML under/over sign. Keep this operation
// declarative: the registry supplies the two authored children and the
// transition only replaces the current empty slot. It never searches for a
// baseline operand or infers scope beyond that one local construction.
function insertStructuredToken(tree, focus, elementName, parts, attrs = {}) {
  if (!['munder', 'mover', 'munderover'].includes(elementName) || !Array.isArray(parts) || parts.length < 2) {
    throw new RangeError('A structured token needs a native modifier element and at least two parts.');
  }
  const current = currentNode(tree, focus);
  if (current.name !== 'math' && !isHole(current)) {
    throw new RangeError('A structured token requires an empty local slot.');
  }
  const children = parts.map((part) => atom(part.name ?? 'mo', part.value, {
    ...(part.role ? { 'data-omniya-role': part.role } : {}),
    ...(part.dataAttributes ?? {})
  }));
  const wrapper = element(elementName, children, attrs);
  const inserted = replaceCurrent(tree, focus, wrapper);
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

// Rule 8 literary/indicated periods can end a multi-letter numerator. Diagonal
// `_/` is then a structural follow-up over that punctuated item, not a fresh
// empty fraction after the period operator.
function wrapDiagonalFractionAfterPunctuatedItem(tree, focus, attrs = {}, initialSlot = 'denominator') {
  const current = currentNode(tree, focus);
  const intent = current.attrs?.['data-omniya-nemeth-intent'] ?? '';
  const literaryOrIndicatedPeriod = current.name === 'mo'
    && current.children?.[0]?.text === '.'
    && (intent === 'punctuation-literary-period'
      || intent === 'punctuation-period'
      || current.attrs?.['data-omniya-nemeth-cells'] === '⠲'
      || current.attrs?.['data-omniya-nemeth-cells'] === '⠸⠲');
  if (!literaryOrIndicatedPeriod) return null;
  const parent = findMathParent(tree, current.attrs?.['data-omniya-id']);
  if (!parent || !['math', 'mrow'].includes(parent.name)) return null;
  const endIndex = parent.children.indexOf(current);
  if (endIndex < 0) return null;
  let startIndex = endIndex;
  while (startIndex > 0) {
    const previous = parent.children[startIndex - 1];
    if (previous?.name === 'mi') {
      startIndex -= 1;
      continue;
    }
    if (previous?.name === 'mn'
      && previous.attrs?.['data-omniya-nemeth-intent'] === 'single-letter-number') {
      startIndex -= 1;
      continue;
    }
    break;
  }
  const span = parent.children.slice(startIndex, endIndex + 1);
  const numerator = span.length === 1
    ? (() => {
      const clone = structuredClone(span[0]);
      clone.attrs['data-omniya-id'] = id();
      return clone;
    })()
    : element('mrow', span.map((node) => {
      const clone = structuredClone(node);
      clone.attrs['data-omniya-id'] = id();
      return clone;
    }), { 'data-omniya-id': id() });
  const wrapper = element('mfrac', [], {
    ...attrs,
    'data-omniya-id': span[0].attrs?.['data-omniya-id'] ?? id()
  });
  wrapper.children.push(numerator, hole(wrapper, 'denominator'));
  parent.children.splice(startIndex, span.length, wrapper);
  const slot = wrapper.children.find((child) => child.attrs?.['data-omniya-role'] === initialSlot);
  return { tree, focus: focusNode(slot ?? wrapper) };
}


function openFixedRoot(tree, focus, index, indexText, radicalOrder = null, indexKind = 'mn') {
  const current = currentNode(tree, focus);
  const inheritedId = current.name !== 'math' ? current.attrs?.['data-omniya-id'] : null;
  // A numeric indicator plus the index cell is the authored prefix form for
  // an indexed radical (BANA 16.2). The digit is the root's index, not the
  // first radicand token. Consume that one local numeric atom into the mroot
  // index slot and retain the number-sign intent for the Braille projection.
  const authoredIndex = current.name === 'mn' &&
    current.attrs?.['data-omniya-nemeth-intent'] === 'numeric-start' &&
    String(current.children?.[0]?.text ?? '') === String(indexText);
  const wrapper = element('mroot', [], {
    ...(inheritedId ? { 'data-omniya-id': inheritedId } : {}),
    'data-omniya-nemeth-intent': 'indexed-radical',
    'data-omniya-nemeth-cells': indexText ? `⠣${sourceNotationToCells(indexText).join('')}⠜` : '⠣⠒⠜',
    ...(authoredIndex ? { 'data-omniya-nemeth-index-prefix': '⠼', 'data-omniya-nemeth-index-cells': sourceNotationToCells(indexText).join('') } : {}),
    ...(radicalOrder ? { 'data-omniya-radical-order': String(radicalOrder) } : {})
  });
  // A radical opener following a baseline operator starts a new sibling
  // expression. The operator is not the radicand. This is the same local
  // insertion rule used by fractions and scripts, expressed here because a
  // fixed-index root owns its index child immediately.
  const startsAfterOperator = current.name === 'mo' && ['+', '−', '-', '±'].includes(current.children?.[0]?.text);
  const radicand = !authoredIndex && current.name !== 'math' && !isHole(current) && !startsAfterOperator
    ? structuredClone(current)
    : hole(wrapper, 'radicand');
  if (radicand !== current && radicand.attrs) radicand.attrs['data-omniya-id'] = id();
  const rootIndex = authoredIndex
    ? structuredClone(current)
    : atom(indexKind, indexText, { 'data-omniya-role': 'index' });
  rootIndex.attrs['data-omniya-role'] = 'index';
  wrapper.children.push(radicand, rootIndex);
  if (startsAfterOperator) insertAfter(tree, focus, wrapper);
  else replaceCurrent(tree, focus, wrapper);
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
  const current = currentNode(tree, focus);
  let container = current;
  while (container) {
    if (names.includes(container.name) &&
      (elementName !== 'mrow' || container.attrs?.['data-omniya-group'])) break;
    container = isElement(container)
      ? findMathParent(tree, container.attrs?.['data-omniya-id'])
      : null;
  }
  if (!container) throw new RangeError(`No open ${elementName} at the current draft focus.`);
  const parent = findMathParent(tree, container.attrs['data-omniya-id']);
  // A radical's authored terminator closes the radical itself, but the next
  // local token may still belong to a surrounding script slot. Preserve that
  // slot boundary in MathML by returning to the script's parent rather than
  // leaving the focus on the radical child. This is the same local baseline
  // transition used when a scripted token is followed by `+` or another
  // sibling, and does not infer any passage-level operand.
  if (elementName === 'mroot' && parent?.name === 'msup' && parent.children?.[1] === container) {
    // The closed root occupied the exponent slot. Returning to the scripted
    // node lets the next local token be inserted beside the complete script,
    // rather than accidentally extending its exponent row.
    return { tree, focus: focusNode(parent) };
  }
  // A group is retained as a fenced MathML node, but after its close code the
  // next local expression belongs to the surrounding row. Focus the group
  // itself so insertAfter can place that sibling beside it.
  if (elementName === 'mrow' && container.attrs?.['data-omniya-group']) {
    // Use the same stable role attribute that the renderer already preserves
    // for authored fence nodes.  MathJax drops arbitrary editor-only flags
    // during enrichment, so a closed-group role keeps the local boundary
    // observable without introducing a second tree or parser state.
    container.attrs['data-omniya-role'] = 'closed-group';
    return { tree, focus: focusNode(container) };
  }
  // A completed radical is itself the next local operand. Returning the
  // radical node (rather than its surrounding row) lets a following script,
  // modifier, or replacement wrap that exact radical, just as MathJax's
  // explorer treats the radical as one navigable expression.
  if (elementName === 'msqrt' || elementName === 'mroot') {
    return { tree, focus: focusNode(container) };
  }
  // A completed cancellation is itself the next local operand. Leave focus
  // on the enclosure so a following opener becomes a sibling rather than
  // wrapping or replacing the surrounding math root.
  if (elementName === 'menclose') {
    return { tree, focus: focusNode(container) };
  }
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

// Rule 14.5 input is written in display order: the left script arrives before
// its base.  At an empty replacement root, create the native MathML
// multiscript shape with a base hole and one left-script hole.  Subsequent
// local level-return and script operations fill those holes; no operand is
// inferred from later passage text.
function createLeftScriptWrapper(direction, inheritedId = null) {
  const wrapper = element('mmultiscripts', [], inheritedId ? { 'data-omniya-id': inheritedId } : {});
  const base = hole(wrapper, 'base');
  const postSub = element('none');
  const postSup = element('none');
  const marker = element('mprescripts');
  const leftSub = direction === 'sub' ? hole(wrapper, 'left-subscript') : element('none');
  const leftSup = direction === 'sup' ? hole(wrapper, 'left-superscript') : element('none');
  wrapper.children.push(base, postSub, postSup, marker, leftSub, leftSup);
  return { wrapper, slot: direction === 'sub' ? leftSub : leftSup };
}

function openLeftScript(tree, focus, direction) {
  const current = currentNode(tree, focus);
  // After a completed sibling (Rule 14.9.2 `";c"`), a left-script opener
  // starts a new tensor beside that sibling. Replacing the math root would
  // destroy the already-authored right script.
  if (current.name === 'math' && current.children?.length) {
    const { wrapper, slot } = createLeftScriptWrapper(direction);
    current.children.push(wrapper);
    return { tree, focus: focusNode(slot) };
  }
  if (current.name !== 'math' && !isHole(current)) {
    const { wrapper, slot } = createLeftScriptWrapper(direction);
    insertAfter(tree, focus, wrapper);
    return { tree, focus: focusNode(slot) };
  }
  const inheritedId = current.name !== 'math' ? current.attrs?.['data-omniya-id'] : null;
  const { wrapper, slot } = createLeftScriptWrapper(direction, inheritedId);
  replaceCurrent(tree, focus, wrapper);
  return { tree, focus: focusNode(slot) };
}

function leftScriptSlots(multiscripts) {
  const markerIndex = multiscripts.children.findIndex((child) => child.name === 'mprescripts');
  if (markerIndex < 0) return null;
  return {
    markerIndex,
    leftSub: multiscripts.children[markerIndex + 1],
    leftSup: multiscripts.children[markerIndex + 2]
  };
}

function isPopulatedScriptSlot(node) {
  return Boolean(node && node.name !== 'none' && !isHole(node));
}

// Rule 14.11.2: after one left script is filled and baseline returns to the
// empty base, the opposite level indicator fills the other prescript. This
// is a local slot fill, not a nested tensor or an English-letter choice.
function fillEmptyLeftScript(tree, focus, direction) {
  const current = currentNode(tree, focus);
  const multiscripts = ancestor(tree, current, ['mmultiscripts']);
  if (!multiscripts || multiscripts.children?.[0] !== current || !isHole(current)) return null;
  const slots = leftScriptSlots(multiscripts);
  if (!slots) return null;
  const target = direction === 'sub' ? slots.leftSub : slots.leftSup;
  const other = direction === 'sub' ? slots.leftSup : slots.leftSub;
  if (!isPopulatedScriptSlot(other)) return null;
  if (target && target.name !== 'none' && !isHole(target)) return null;
  const role = direction === 'sub' ? 'left-subscript' : 'left-superscript';
  const replacement = isHole(target) ? target : hole(multiscripts, role);
  const targetIndex = direction === 'sub' ? slots.markerIndex + 1 : slots.markerIndex + 2;
  if (!isHole(target)) multiscripts.children[targetIndex] = replacement;
  return { tree, focus: focusNode(replacement) };
}

function isAbsorbableBaselineSibling(node) {
  if (!node) return false;
  if (node.name === 'mspace') return true;
  return node.name === 'mo' && (node.children?.[0]?.text === '…'
    || node.attrs?.['data-omniya-nemeth-intent'] === 'ellipsis');
}

// Rule 14.9.3/14.9.5: a space returns to baseline, then the next level
// indicator restores the preceding script slot and absorbs the intervening
// blanks/ellipsis. Adjacent-sibling repair only; it never scans a passage.
function reenterAdjacentScript(tree, focus, direction) {
  const current = currentNode(tree, focus);
  const parent = current.name === 'math' ? current : findMathParent(tree, current.attrs?.['data-omniya-id']);
  if (!parent || !['math', 'mrow'].includes(parent.name)) return null;
  const children = parent.children ?? [];
  const fromIndex = current.name === 'math' ? children.length - 1 : children.indexOf(current);
  if (fromIndex < 0) return null;
  const scriptName = direction === 'sup' ? 'msup' : 'msub';
  let scriptIndex = -1;
  for (let index = fromIndex; index >= 0; index -= 1) {
    const sibling = children[index];
    if (isAbsorbableBaselineSibling(sibling)) continue;
    if (sibling.name === scriptName || sibling.name === 'msubsup') {
      scriptIndex = index;
      break;
    }
    return null;
  }
  if (scriptIndex < 0) return null;
  const absorbedCount = fromIndex - scriptIndex;
  if (absorbedCount <= 0) return null;
  const script = children[scriptIndex];
  const slotIndex = script.name === 'msubsup' ? (direction === 'sub' ? 1 : 2) : 1;
  const slot = script.children?.[slotIndex];
  if (!slot || isHole(slot)) return null;
  const absorbed = parent.children.splice(scriptIndex + 1, absorbedCount);
  let row = slot;
  if (slot.name !== 'mrow' || isHole(slot)) {
    row = element('mrow', [slot]);
    script.children[slotIndex] = row;
  }
  for (const node of absorbed) row.children.push(node);
  return { tree, focus: focusNode(row.children.at(-1) ?? row) };
}

// Rule 14.5.1/14.5.2 can add a right script after a left script has already
// established an `mmultiscripts` base.  This is the same local structural
// operation as opening an ordinary msub/msup, but it fills the first missing
// post-script pair before the `mprescripts` marker.  It never searches for an
// operand or interprets a surrounding passage.
// BANA 14.3–14.4 counts superscript/subscript indicators from the item's
// baseline, not as relative wraps. Grouping and radicals occupy a script
// level without adding another one; only msup/msub/msubsup slots increment.
function isInScriptSlot(tree, slot, node) {
  let current = node;
  while (current) {
    if (current === slot) return true;
    current = isElement(current) ? findMathParent(tree, current.attrs?.['data-omniya-id']) : null;
  }
  return false;
}

function scriptSlot(parent, direction) {
  if (parent?.name === 'msup' && direction === 'sup') return parent.children[1];
  if (parent?.name === 'msub' && direction === 'sub') return parent.children[1];
  if (parent?.name === 'msubsup') return parent.children[direction === 'sub' ? 1 : 2];
  return null;
}

function scriptDepth(tree, node, direction) {
  let depth = 0;
  let current = node;
  while (current && current.name !== 'math') {
    const parent = findMathParent(tree, current.attrs?.['data-omniya-id']);
    if (!parent) break;
    const slot = scriptSlot(parent, direction);
    if (slot && isInScriptSlot(tree, slot, current)) depth += 1;
    current = parent;
  }
  return depth;
}

function returnToScriptLevel(tree, focus, targetDepth, direction) {
  let node = currentNode(tree, focus);
  while (node) {
    const parent = findMathParent(tree, node.attrs?.['data-omniya-id']);
    if (!parent) return { tree, focus: focusNode(node) };
    const slot = scriptSlot(parent, direction);
    if (slot && isInScriptSlot(tree, slot, node) && scriptDepth(tree, parent, direction) <= targetDepth) {
      return { tree, focus: focusNode(parent) };
    }
    node = parent;
  }
  return { tree, focus };
}

function applyAbsoluteScriptLevel(tree, focus, direction, targetDepth) {
  const current = currentNode(tree, focus);
  const depth = scriptDepth(tree, current, direction);
  if (isHole(current) && current.attrs?.['data-omniya-role'] === (direction === 'sub' ? 'subscript' : 'superscript') &&
    targetDepth <= depth) {
    return { tree, focus };
  }
  if (targetDepth < depth && targetDepth > 1) return returnToScriptLevel(tree, focus, targetDepth, direction);
  if (targetDepth === depth && targetDepth > 1 && current.name !== 'math' && !isHole(current)) {
    return { tree, focus };
  }
  return null;
}

function openScriptSlot(tree, focus, elementName, role) {
  const current = currentNode(tree, focus);
  const multiscripts = ancestor(tree, current, ['mmultiscripts']);
  if (multiscripts && multiscripts.children?.[0] === current) {
    const markerIndex = multiscripts.children.findIndex((child) => child.name === 'mprescripts');
    if (markerIndex < 0) throw new RangeError('The multiscript has no prescript boundary.');
    const postRole = role === 'subscript' ? 'subscript' : 'superscript';
    const existingPostCount = markerIndex - 1;
    if (existingPostCount === 0) {
      const postSub = role === 'subscript' ? hole(multiscripts, 'subscript') : element('none');
      const postSup = role === 'superscript' ? hole(multiscripts, 'superscript') : element('none');
      multiscripts.children.splice(markerIndex, 0, postSub, postSup);
      return { tree, focus: focusNode(role === 'subscript' ? postSub : postSup) };
    }
    if (existingPostCount === 2) {
      const slot = multiscripts.children[role === 'subscript' ? 1 : 2];
      if (isHole(slot)) return { tree, focus: focusNode(slot) };
      if (slot?.name === 'none') {
        const replacement = hole(multiscripts, postRole);
        multiscripts.children[role === 'subscript' ? 1 : 2] = replacement;
        return { tree, focus: focusNode(replacement) };
      }
    }
    throw new RangeError(`The multiscript ${postRole} slot is already occupied.`);
  }
  if (multiscripts && multiscripts.children?.[0] !== current) {
    const markerIndex = multiscripts.children.findIndex((child) => child.name === 'mprescripts');
    if (markerIndex < 0) throw new RangeError('The multiscript has no prescript boundary.');
    const postRole = role === 'subscript' ? 'subscript' : 'superscript';
    const postIndex = role === 'subscript' ? markerIndex + 1 : markerIndex + 2;
    const slot = multiscripts.children[postIndex];
    if (slot?.name === 'none' || isHole(slot)) {
      const replacement = isHole(slot) ? slot : hole(multiscripts, postRole);
      if (isHole(slot)) {
        replacement.attrs['data-omniya-role'] = postRole;
      }
      multiscripts.children[postIndex] = replacement;
      return { tree, focus: focusNode(replacement) };
    }
  }
  // Compose the opposite side of an existing one-sided script locally. This
  // is the generic MathML transition used by integral bounds, limits, and
  // scripted variables alike; it does not infer an operand or inspect a
  // wider passage.
  const oneSided = ancestor(tree, current, ['msub', 'msup']);
  if (oneSided && oneSided.children?.[1] === current) {
    const existingRole = oneSided.name === 'msub' ? 'subscript' : 'superscript';
    if (existingRole !== role) {
      const parent = findMathParent(tree, oneSided.attrs?.['data-omniya-id']);
      if (!parent) throw new RangeError('One-sided script has no parent.');
      const replacement = element('msubsup', [
        oneSided.children[0],
        existingRole === 'subscript' ? current : element('none'),
        existingRole === 'superscript' ? current : element('none')
      ], { ...oneSided.attrs });
      const missingIndex = role === 'subscript' ? 1 : 2;
      const missing = hole(replacement, role);
      replacement.children[missingIndex] = missing;
      parent.children[parent.children.indexOf(oneSided)] = replacement;
      return { tree, focus: focusNode(missing) };
    }
  }
  return wrapCurrent(tree, focus, elementName, ['base', role], {}, role);
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
  const same = directions.every((direction) => direction === directions[0]);
  let chain = directions;
  if (same) {
    const direction = directions[0];
    const currentDepth = scriptDepth(tree, current, direction);
    const target = directions.length;
    const absolute = applyAbsoluteScriptLevel(tree, focus, direction, target);
    if (absolute) return absolute;
    const delta = target - currentDepth;
    if (currentDepth > 0 && delta > 0) {
      if (delta === 1) {
        return wrapCurrent(tree, focus, direction === 'sub' ? 'msub' : 'msup',
          ['base', direction === 'sub' ? 'subscript' : 'superscript'], {},
          direction === 'sub' ? 'subscript' : 'superscript');
      }
      chain = Array.from({ length: delta }, () => direction);
    }
  } else if (current.name !== 'math' && !isHole(current)) {
    // BANA 14.4 absolute mixed chains (~~;, ~;~, ;~~, …) name a level path
    // from the unscripted base. When the writer is already on the item that
    // occupies the leading same-direction prefix, open only the remaining
    // opposite direction(s) on that item instead of rebuilding the prefix.
    const firstDirection = directions[0];
    let leading = 0;
    while (leading < directions.length && directions[leading] === firstDirection) leading += 1;
    const currentDepth = scriptDepth(tree, current, firstDirection);
    if (leading > 0 && leading < directions.length && currentDepth > 0) {
      let at = { tree, focus };
      if (currentDepth > leading) {
        const returned = applyAbsoluteScriptLevel(tree, focus, firstDirection, leading);
        if (returned) at = returned;
      }
      const rest = directions.slice(leading);
      if (rest.length === 1) {
        const direction = rest[0];
        const role = direction === 'sub' ? 'subscript' : 'superscript';
        return wrapCurrent(at.tree, at.focus, direction === 'sub' ? 'msub' : 'msup',
          ['base', role], {}, role);
      }
      return openScriptChain(at.tree, at.focus, rest);
    }
  }
  const inheritedId = current.name !== 'math' ? current.attrs?.['data-omniya-id'] : null;
  const base = current.name !== 'math' && !isHole(current)
    ? structuredClone(current)
    : null;
  if (base !== current && base.attrs && !isHole(base)) base.attrs['data-omniya-id'] = id();
  let nested = base ?? element('mrow', []);
  const slots = [];
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const direction = chain[index];
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
function openFunctionLimit(tree, focus, direction, sourceNotation = null) {
  const current = currentNode(tree, focus);
  const elementName = direction === 'under' ? 'munder' : 'mover';
  const role = direction === 'under' ? 'underscript' : 'overscript';
  const wrapper = element(elementName, [], {
    ...(current.name === 'math' ? {} : { 'data-omniya-id': current.attrs?.['data-omniya-id'] }),
    ...(sourceNotation ? {
      'data-omniya-nemeth-intent': 'function-limit',
      'data-omniya-nemeth-cells': sourceNotationToCells(sourceNotation).join('')
    } : {})
  });
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
function insertBaseDigit(tree, focus, value, dataAttributes = {}) {
  const current = currentNode(tree, focus);
  if (current.name === 'mn' && current.children?.length === 1) {
    current.children[0].text += value;
    return { tree, focus: focusNode(current) };
  }
  return insertToken(tree, focus, 'mn', value, { dataAttributes });
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
  const parent = findMathParent(tree, current.attrs?.['data-omniya-id']);
  const grand = parent ? findMathParent(tree, parent.attrs?.['data-omniya-id']) : null;
  const inScriptRow = parent?.name === 'mrow' && grand &&
    ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(grand.name) &&
    grand.children?.[0] !== parent;
  const target = inScriptRow ? current
    : (ancestor(tree, current, ['msup', 'msub', 'msubsup', 'mmultiscripts']) ?? current);
  const owner = inScriptRow ? parent : findMathParent(tree, target.attrs?.['data-omniya-id']);
  if (!owner || !['math', 'mrow'].includes(owner.name)) throw new RangeError('Apostrophe-s requires a local expression row.');
  const index = owner.children.indexOf(target);
  if (index < 0) throw new RangeError('The possessive target is unavailable.');
  const apostrophe = atom('mo', '′', {
    'data-omniya-nemeth-intent': 'possessive-apostrophe',
    'data-omniya-nemeth-cells': '⠸⠄'
  });
  const suffix = atom('mi', 's', {
    'data-omniya-nemeth-intent': 'possessive-s',
    'data-omniya-nemeth-cells': '⠎'
  });
  owner.children.splice(index + 1, 0, apostrophe, suffix);
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
  // A contracted bar is complete for the current atom, but BANA 15.5 still
  // permits an immediately adjacent parallel bar before the terminator. Keep
  // that one local continuation available without leaving ordinary following
  // tokens in modifier mode.
  if (modeValue === 'modifier-parallel' && value === '¯') {
    const current = currentNode(tree, focus);
    if (['mover', 'munder'].includes(current.name)) {
      const role = current.name === 'munder' ? 'underscript' : 'overscript';
      const slot = current.children.find((child) => child.attrs?.['data-omniya-role'] === role);
      if (slot?.name === 'mo' && slot.children?.[0]?.text === '¯') {
        const row = element('mrow', [slot, atom('mo', '¯', { 'data-omniya-role': role, ...dataAttributes })]);
        current.children[current.children.indexOf(slot)] = row;
        return { tree, focus: focusNode(current), wrapper: current };
      }
      if (slot?.name === 'mrow') {
        slot.children.push(atom('mo', '¯', { 'data-omniya-role': role, ...dataAttributes }));
        return { tree, focus: focusNode(current), wrapper: current };
      }
    }
  }
  // BANA 15.5: parallel horizontal bars are one modifier, not higher-order
  // modifiers.  Append only to the currently occupied local modifier slot.
  // Rule 15.16.2 stacks dots the same way: repeated •/∘ cells stay in one
  // overscript/underscript slot instead of nesting fresh movers.
  if (modeValue === 'modifier-complete' && (value === '¯' || value === '•' || value === '∘')) {
    const current = currentNode(tree, focus);
    const parent = current.name !== 'math' ? findMathParent(tree, current.attrs?.['data-omniya-id']) : null;
    const role = current.attrs?.['data-omniya-role'];
    if (parent && ['mover', 'munder', 'munderover'].includes(parent.name) &&
      ['overscript', 'underscript'].includes(role) && current.name === 'mo' && current.children?.[0]?.text === value) {
      const row = element('mrow', [current, atom('mo', value, { 'data-omniya-role': role, ...dataAttributes })]);
      const index = parent.children.indexOf(current);
      parent.children[index] = row;
      return { tree, focus: focusNode(row.children[1]), wrapper: parent };
    }
    if (parent && ['mover', 'munder', 'munderover'].includes(parent.name) &&
      ['overscript', 'underscript'].includes(role) && current.name === 'mrow') {
      current.children.push(atom('mo', value, { 'data-omniya-role': role, ...dataAttributes }));
      return { tree, focus: focusNode(current.children.at(-1)), wrapper: parent };
    }
    // A prior stacked-dot/bar append already promoted the slot to an mrow.
    // Keep later identical cells in that same local row.
    if (parent?.name === 'mrow' && current.name === 'mo' && current.children?.[0]?.text === value &&
      ['overscript', 'underscript'].includes(role)) {
      parent.children.push(atom('mo', value, { 'data-omniya-role': role, ...dataAttributes }));
      const wrapper = findMathParent(tree, parent.attrs?.['data-omniya-id']);
      return { tree, focus: focusNode(parent.children.at(-1)), wrapper };
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
    if (['mover', 'munder', 'munderover'].includes(slotParent?.name)) {
      const role = current.attrs?.['data-omniya-role']
        ?? (slotParent.name === 'munder' ? 'underscript' : 'overscript');
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
      // The contracted form is complete at the wrapper boundary.  Returning
      // the wrapper, rather than its bar child, lets the next ordinary local
      // token continue in the surrounding expression row (Rule 15.2.2/15.2.3
      // Examples 15-10, 15-20, and 15-21) instead of accidentally appending
      // siblings inside the overscript slot.
      return { tree, focus: focusNode(wrapper), wrapper };
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

// Provisions that govern passage/context decisions rather than constructing an
// equation node are recorded separately from the input registry. They are
// still normative source coverage, but exposing a fake Nemeth cell for them
// would misrepresent BANA and create an operation that users cannot actually
// perform inside an equation draft.
const CONTEXT_POLICY_REFS = [
  ...['1.1', '1.1.1', '1.1.2', '1.2', '1.2.1', '1.2.2', '1.3', '1.3.1', '1.3.2', '1.4', '1.4.1', '1.4.2', '1.4.3', '1.4.4', '1.4.5', '1.4.6', '1.4.7'],
  ...['2.1'],
  ...['10.1', '10.5', '10.1.2', '10.2', '10.4', '10.6', '10.6.1', '10.6.2', '10.6.3'],
  ...['5.1', '5.1.2', '5.1.3', '5.2', '5.3', '5.3.1', '5.3.2'],
  ...['6.1', '6.1.1', '6.1.2', '6.1.3', '6.1.4', '6.1.5', '6.2', '6.2.1', '6.2.2', '6.2.3', '6.3', '6.3.2', '6.3.3', '6.3.4', '6.4', '6.4.1', '6.4.2', '6.4.3', '6.4.4', '6.4.5', '6.4.6', '6.4.7', '6.4.8', '6.4.9', '6.4.10', '6.4.11', '6.6', '6.7'],
  ...['7.4', '7.4.1', '7.4.2', '7.4.3', '7.4.4', '7.5', '7.5.1', '7.5.2'],
  ...['errata-2025:24.1.e-24-2'],
  ...['errata-2025:7.2.1-7-2', 'errata-2025:7.3.3-7-5', 'errata-2025:7.3.5-7-6'],
  ...['errata-2025:15.7-15-12', 'errata-2025:B-2-B-2'],
  // These errata change normative context rules without introducing new
  // authored cells: switch scope, function-name continuation, degree-letter
  // context, and omission punctuation.
  ...['errata-2025:4.2-4-1', 'errata-2025:4.6.8.c-4-16', 'errata-2025:6.4.2-6-9', 'errata-2025:10.6.3-10-11', 'errata-2025:11.1.4-11-3'],
  ...['9.1', '9.3', '9.3.1', '9.3.2', '9.3.3', 'errata-2025:9.1-9-1'],
  ...['15.5', '15.7', '15.8', '15.14'],
  ...['13.3', '13.3.1', '13.3.2', '13.3.3', '13.9', '13.10', '13.10.1', '13.10.2', '13.10.3', '13.10.4', '13.10.5'],
  ...['12.1', '12.1.2'],
  ...['8.1', '8.2', '8.3', '8.3.1', '8.3.2', '8.3.3', '8.3.4'],
  ...['3.1', '3.1.1', '3.1.2', '3.2', '3.2.1', '3.2.2', '3.2.3', '3.3', '3.3.1', '3.3.2', '3.3.3', '3.3.4', '3.3.5', '3.3.6', '3.3.7', '3.3.8', '3.3.9', '3.4', '3.4.1', '3.4.2', '3.4.3', '3.4.4', '3.5', '3.5.1', '3.5.2', '3.5.3', '3.5.4', '3.6', '3.6.1', '3.6.2', '3.6.3', '3.7', '3.8', '3.9', '3.10', '3.11', '3.11.1', '3.11.2', '3.11.3', '3.12'],
  ...['4.1', '4.2', '4.3', '4.4', '4.4.1', '4.4.2', '4.4.3', '4.4.4', '4.4.5', '4.4.6', '4.4.7', '4.4.8', '4.4.9', '4.4.10', '4.5', '4.5.1', '4.5.2', '4.5.3', '4.6', '4.6.1', '4.6.2', '4.6.3', '4.6.4', '4.6.5', '4.6.6', '4.6.7', '4.6.8', '4.6.8.c', '4.7', '4.7.1', '4.7.2', '4.8', '4.8.1', '4.8.2', '4.8.3', '4.8.4', '4.8.5', '4.8.6', '4.8.7', '4.8.8', '4.8.9', '4.8.10', '4.8.11'],
  ...['17.1', '17.6', '17.10', '17.10.1', '17.10.2', '17.10.3', '17.10.4', '17.10.5'],
  ...['11.1', '11.1.1', '11.1.3', '11.1.4', '11.1.6', '11.1.7'],
  ...['22.1', '22.2', '22.7'],
  ...['20.1', '21.1', '21.10', '21.13'],
  ...['18.1', '18.2', '18.5'],
  ...['16.1', '15.1', '15.2', '14.3', '14.4', '13.1', '13.2'],
  ...['14.1', '14.2', '14.5', '14.6', '14.9', '14.9.1', '14.9.2', '14.9.3', '14.9.4', '14.9.5',
    '14.10', '14.10.1', '14.10.2', '14.10.3', '14.11', '14.11.1', '14.11.2',
    '14.12', '14.12.1', '14.12.2', '14.12.3'],
  ...['23.1', '23.4', '23.12', '24.1'],
  'errata-2025:23.13-23-9',
  'errata-2025:17.1-Special-Considerations-c-17-6'
];
const APPENDIX_POLICY_REFS = ['appendix-A', 'appendix-B', 'appendix-C'];

// A few local transitions are parameterized over a finite symbol table and
// therefore do not need one registry row per digit or letter. They remain
// explicit source-linked operations for the coverage ledger.
const PARAMETERIZED_OPERATION_REFS = ['3.1.2', '3.2.2', '3.2.3', '3.3', '3.6', '3.11.1', '6.3', '6.4', '10.3'];

export function contextPolicyRegistry() {
  return [...CONTEXT_POLICY_REFS, ...APPENDIX_POLICY_REFS].map((banaRef) => ({
    id: `context-policy.${banaRef}`,
    banaRefs: [banaRef],
    kind: 'context-policy',
    title: `BANA ${banaRef} context policy`
  }));
}

export function parameterizedOperationRefs() {
  return [...PARAMETERIZED_OPERATION_REFS];
}

// Appendix D is an index, not a second input language. These rows link the
// 63 indexed base symbols to the declarative operation families (or to the
// explicit context policy where the symbol is a mode/indicator). The ledger
// can therefore prove that every index entry has an owner without inventing
// a symbol-specific dispatcher branch.
const APPENDIX_D_OPERATION_REFS = Object.freeze({
  1: ['6.3'], 2: ['6.3'], 3: ['6.3'], 4: ['6.3'], 5: ['6.3'], 6: ['6.3'],
  7: ['6.3'], 8: ['6.3'], 9: ['6.3'], 10: ['6.3'], 11: ['6.3'], 12: ['6.3'],
  13: ['6.3'], 14: ['6.3'], 15: ['6.3'], 16: ['6.3'], 17: ['6.3'], 18: ['6.3'],
  19: ['6.3'], 20: ['6.3'], 21: ['6.3'], 22: ['6.3'], 23: ['6.3'], 24: ['6.3'],
  25: ['6.3'], 26: ['23.4'], 27: ['11.1.1'], 28: ['19.1'], 29: ['23.12'],
  30: ['19.1'], 31: ['20.7'], 32: ['16.1', '14.3'], 33: ['15.1'], 34: ['13.1'],
  35: ['15.2'], 36: ['17.1'], 37: ['19.1'], 38: ['19.1'], 39: ['19.1'],
  40: ['6.3'], 41: ['3.1.2'], 42: ['3.1.2'], 43: ['3.1.2'], 44: ['3.1.2'],
  45: ['3.1.2'], 46: ['3.1.2'], 47: ['3.1.2'], 48: ['3.1.2'], 49: ['3.1.2'],
  50: ['3.1.2'], 51: ['20.1'], 52: ['20.1'], 53: ['2.1'], 54: ['16.1'],
  55: ['8.1'], 56: ['8.1'], 57: ['2.1'], 58: ['2.1', '14.3'], 59: ['2.1', '7.1'],
  60: ['8.1'], 61: ['8.1'], 62: ['2.1', '14.3'], 63: ['8.1']
});

export function appendixDSymbolRefs() {
  return Object.entries(APPENDIX_D_OPERATION_REFS).map(([rank, banaRefs]) => ({ rank: Number(rank), banaRefs }));
}

const withPolicy = (mapping, commitPolicy) => ({ ...mapping, commitPolicy });
const token = (id, cells, banaRefs, value, name = 'mo', options = {}) => {
  const { commitPolicy = LOCAL_COMMIT_POLICIES.IMMEDIATE, ...args } = options;
  const dataAttributes = {
    ...(args.dataAttributes ?? {}),
    ...(options.sourceNotation ? { 'data-omniya-nemeth-cells': cells.join('') } : {})
  };
  return { id, cells, banaRefs, action: 'insert-token', commitPolicy,
    args: { name, value, ...args, ...(Object.keys(dataAttributes).length ? { dataAttributes } : {}) } };
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
  id, cells, banaRefs, value, options.mathmlName ?? 'mo', { ...options, dataAttributes: {
    'data-omniya-shape-kind': shapeKind,
    ...(options.dataAttributes ?? {})
  }}
);
const shapeModificationToken = (id, cells, banaRefs, value, shapeKind, modification, options = {}) => token(
  id, cells, banaRefs, value, 'mo', { ...options,
    ...(shapeKind === 'keystroke' ? { nextMode: 'keystroke-numeric' } : {}),
    dataAttributes: {
    'data-omniya-shape-kind': shapeKind,
    'data-omniya-shape-modification': modification,
    ...(options.dataAttributes ?? {})
  }}
);
const open = (id, cells, banaRefs, elementName, slots, attrs = {}, initialSlot = slots[0], preferLonger = false, commitPolicy = LOCAL_COMMIT_POLICIES.IMMEDIATE, options = {}) => ({ id, cells, banaRefs, action: options.action ?? 'open-structure', commitPolicy, args: { element: elementName, slots, attrs, initialSlot, preferLonger, ...options } });
const fixedRoot = (id, cells, banaRefs, index, indexText, sourceNotation = null) => ({ id, cells, banaRefs, action: 'open-fixed-root', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { index, indexText, ...(sourceNotation ? { sourceNotation } : {}) } });
const move = (id, cells, banaRefs, elementName, role, options = {}) => ({ id, cells, banaRefs, action: 'move-slot', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: elementName, role, ...options } });
const close = (id, cells, banaRefs, elementName, options = {}) => ({ id, cells, banaRefs, action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: elementName, ...options } });
const mode = (id, cells, banaRefs, value, preferLonger = false, sourceNotation = null, options = {}) => ({ id, cells, banaRefs, action: 'set-mode', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { mode: value, preferLonger, ...(sourceNotation ? { sourceNotation } : {}), ...options } });
const modifier = (id, cells, banaRefs, elementName, slot, requiresMode = 'multipurpose', options = {}) => ({
  id, cells, banaRefs, action: 'open-modifier', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: elementName, slot, requiresMode, ...options }
});
const modifierToken = (id, cells, banaRefs, value, options = {}) => {
  const dataAttributes = {
    ...(options.dataAttributes ?? {}),
    'data-omniya-nemeth-cells': options.dataAttributes?.['data-omniya-nemeth-cells'] ?? cells.join('')
  };
  return {
    id, cells, banaRefs, action: 'insert-modifier', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
    args: { name: 'mo', value, ...options, dataAttributes }
  };
};
// A BANA modifier can be a complete local code whose result is a standard
// MathML structure. Degree is the canonical example: `~.*` does not insert a
// free-standing degree glyph; it places the hollow dot at superscript level
// on the already-focused quantity. Keep this as one reusable tree action so
// other bounded script decorations can use the same composition without a
// notation-specific parser branch.
const scriptToken = (id, sourceNotation, banaRefs, value, options = {}) => ({
  id,
  cells: sourceCells(sourceNotation),
  banaRefs,
  action: 'wrap-script-token',
  commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
  args: { name: 'mo', value, sourceNotation, ...options }
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
const atomicModifierToken = (id, cells, banaRefs, value, options = {}) => {
  const dataAttributes = {
    ...(options.dataAttributes ?? {}),
    'data-omniya-nemeth-cells': options.dataAttributes?.['data-omniya-nemeth-cells'] ?? cells.join('')
  };
  return {
    id, cells, banaRefs, action: 'insert-modifier', commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    args: { name: 'mo', value, ...options, dataAttributes }
  };
};
const structuredToken = (id, sourceNotation, banaRefs, elementName, parts, options = {}) => ({
  id,
  cells: sourceCells(sourceNotation),
  banaRefs,
  action: 'insert-structured-token',
  commitPolicy: options.commitPolicy ?? LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
  args: {
    element: elementName,
    parts,
    sourceNotation,
    dataAttributes: {
      'data-omniya-nemeth-cells': sourceCells(sourceNotation).join(''),
      ...(options.dataAttributes ?? {})
    }
  }
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
      token(`german.${letter}`, ['⠸', base], ['6.1.1', '6.2.1'], lower, 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: `_${letter}`,
        dataAttributes: { 'data-omniya-nemeth-intent': 'german-fraktur' } }),
      token(`german.capital-${letter}`, ['⠸', '⠠', base], ['5.1.1', '6.1.1', '6.2.1'], upper, 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: `_,${letter}` })
    ];
  }),
  token('hebrew.aleph', ['⠠', '⠠', '⠁'], ['6.1.2', '6.2.1'], 'א', 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',,a', dataAttributes: { 'data-omniya-nemeth-intent': 'hebrew-letter', 'data-omniya-hebrew-zero': 'true' } }),
  token('russian.ell', ['⠈', '⠈', '⠇'], ['6.1.3', '6.2.1'], 'л', 'mi', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '@@l', dataAttributes: { 'data-omniya-nemeth-intent': 'russian-letter' } }),
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
  { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: name,
    dataAttributes: { 'data-omniya-nemeth-intent': 'function-name' } }
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
  // Rule 2's indicator table is printed on the symbol page rather than as a
  // numbered 2.4 provision. Keep the source row explicit so coverage tooling
  // can attribute this context-policy operation without inventing a rule.
  token('space', [' '], ['2.1'], '', 'mspace', { sourceNotation: ' ', sourceKind: 'context-policy' }),
  // Rule 8's mathematical punctuation cells are literal local symbols. The
  // punctuation indicator is a separate contextual operation used after a
  // preceding indicator; it must not be baked into every punctuation token.
  // Within the mathematical editor this is the mathematical comma (Braille
  // ASCII comma, ⠠). Literary comma ⠂ is a passage-format concern and is not
  // silently accepted as an equation comma.
  token('punctuation.comma', ['⠠'], ['8.1', '8.2'], ',', 'mo', {
    preferLonger: true,
    deferForAtomicContinuation: true,
    sourceNotation: ',',
    sourceKind: 'context-policy',
    // MathML does not retain whether BANA's punctuation indicator was
    // entered as a bound local code. Keep that source distinction so the
    // accessibility projection can avoid inventing a blank between the
    // punctuation indicator and its following atom.
    dataAttributes: { 'data-omniya-nemeth-intent': 'punctuation-comma' }
  }),
  // Rule 8.2 requires the punctuation indicator before mathematical
  // punctuation that would otherwise be read as a Nemeth numeral.  The
  // indicator and mark are one bounded local code; accepting the mark alone
  // would silently turn 4/3/2/8/6 into punctuation.
  token('punctuation.period', ['⠸', '⠲'], ['8.1', '8.2'], '.', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: '_4',
    dataAttributes: { 'data-omniya-nemeth-intent': 'punctuation-period' }
  }),
  token('punctuation.colon', ['⠸', '⠒'], ['8.1', '8.2', '8.5'], ':', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: '_3',
    dataAttributes: { 'data-omniya-nemeth-intent': 'punctuation-colon' }
  }),
  token('punctuation.semicolon', ['⠸', '⠆'], ['8.1', '8.2', '8.6'], ';', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: '_2',
    dataAttributes: { 'data-omniya-nemeth-intent': 'punctuation-semicolon' }
  }),
  token('punctuation.question', ['⠸', '⠦'], ['8.1', '8.2'], '?', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: '_8',
    dataAttributes: { 'data-omniya-nemeth-intent': 'punctuation-question' }
  }),
  token('punctuation.exclamation', ['⠸', '⠖'], ['8.1', '8.2'], '!', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: '_6',
    dataAttributes: { 'data-omniya-nemeth-intent': 'punctuation-exclamation' }
  }),
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
  // BANA 3.2.3/24.1.g: when the long dash follows a numeric decimal, the
  // dot-4 punctuation indicator and dot-5 nonnumeric return are part of the
  // same bounded local construction (`."----`). Keeping that complete code
  // registered prevents the decimal-return prefix from being mistaken for an
  // incomplete comparison or from consuming the dash one cell at a time.
  sourceToken('omission.decimal-long-dash', '."----', ['3.2.3', '24.1'], '―', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    dataAttributes: { 'data-omniya-nemeth-intent': 'omission-decimal-long-dash' }
  }),
  token('punctuation.ellipsis', ['⠄', '⠄', '⠄'], ['8.8'], '…', 'mo', { sourceNotation: "'''" }),
  token('punctuation.left-single-quote', ['⠠', '⠦'], ['8.1'], '‘', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',8' }),
  // Rule 8's closing single quotation mark is punctuation indicator + dot 0
  // (⠴), not punctuation indicator + dot 6 (the apostrophe). The distinction
  // is explicit in the BANA punctuation table and matters after a MathML
  // expression at baseline.
  token('punctuation.right-single-quote', ['⠠', '⠴'], ['8.1'], '’', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',0' }),
  token('punctuation.left-double-quote', ['⠦'], ['8.1'], '“', 'mo', {
    sourceNotation: '8',
    dataAttributes: { 'data-omniya-nemeth-intent': 'punctuation-left-double-quote' }
  }),
  token('punctuation.right-double-quote', ['⠴'], ['8.1'], '”', 'mo', {
    sourceNotation: '0',
    dataAttributes: { 'data-omniya-nemeth-intent': 'punctuation-right-double-quote' }
  }),
  token('punctuation.left-double-quote.indicated', ['⠸', '⠦'], ['8.1', '8.2'], '“', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: '_8',
    dataAttributes: {
      'data-omniya-nemeth-intent': 'punctuation-left-double-quote',
      'data-omniya-nemeth-cells': '⠸⠦'
    }
  }),
  token('punctuation.right-double-quote.indicated', ['⠸', '⠴'], ['8.1', '8.2'], '”', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: '_0',
    dataAttributes: {
      'data-omniya-nemeth-intent': 'punctuation-right-double-quote',
      'data-omniya-nemeth-cells': '⠸⠴'
    }
  }),
  token('punctuation.literary-period', ['⠲'], ['8.1', '8.3'], '.', 'mo', {
    sourceNotation: '4',
    dataAttributes: {
      'data-omniya-nemeth-intent': 'punctuation-literary-period',
      'data-omniya-nemeth-cells': '⠲'
    }
  }),
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
  // Rule 13.2's diagonal form may begin with an already-entered numerator
  // (`#1_/2`). This is a bounded structural follow-up: wrap only the current
  // local numeric atom, then move into the denominator slot.
  open('fraction.start.diagonal', ['⠸', '⠌'], ['13.2'], 'mfrac', ['numerator', 'denominator'], { 'data-omniya-fraction-kind': 'simple', bevelled: true }, 'denominator', false, LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, { sourceNotation: '_/', action: 'open-structure' }),
  sourceMove('fraction.next.denominator', ['⠌'], ['13.2'], 'mfrac', 'denominator', '/', { bevelled: false, fractionKind: 'simple' }),
  // When the numerator ends in a scripted/modified atom, BANA permits the
  // dot-5 separator before the fraction-line slash (`"/`). It is still the
  // same local denominator transition, not the baseline indicator.
  sourceMove('fraction.next.denominator.contracted', ['⠐', '⠌'], ['13.2'], 'mfrac', 'denominator', '"/', { bevelled: false, fractionKind: 'simple' }),
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
  {
    id: 'script.left-subscript', cells: ['⠰'], banaRefs: ['14.5.1'], action: 'open-left-script',
    commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
    args: { direction: 'sub', sourceNotation: ';' }
  },
  {
    id: 'script.left-superscript', cells: ['⠘'], banaRefs: ['14.5.2'], action: 'open-left-script',
    // Rule 14.5.2 shares the ordinary superscript indicator. It is available
    // only when the author explicitly chooses the prescript interpretation.
    choiceOnly: true,
    commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
    args: { direction: 'sup', sourceNotation: '~', preferLonger: true }
  },
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
  mode('switch.ueb-passage.open', sourceCells('_%'), ['4.1', '4.2'], 'ueb-passage', true, '_%'),
  mode('switch.ueb-passage.close', sourceCells('_:'), ['4.1', '4.2'], 'typeform-end', false, '_:'),
  mode('switch.ueb-word', sourceCells(",'") , ['4.1', '4.2'], 'ueb-word', true, ",'"),
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
  // Rule 15.18 Example 15-84: the multipurpose/equality/under/question
  // sequence is one finite modified comparison. Its canonical structure is
  // native munder (equals base with a subscribed question), not a free
  // question token or an unfinished modifier hole.
  structuredToken('modifier.equals.question-under', '".k%_8]', ['15.18'], 'munder', [
    { name: 'mo', value: '=' },
    { name: 'mo', value: '?', role: 'underscript' }
  ], { dataAttributes: { 'data-omniya-nemeth-intent': 'comparison.equals.question-under' } }),
  modifierToken('modifier.tilde.extended', ['⠠', '⠱'], ['15.19'], '〰', { sourceNotation: '`,:' }),
  modifierToken('modifier.tilde.simple', ['⠈', '⠱'], ['15.19'], '~', { sourceNotation: '`:' }),
  modifierToken('modifier.triangle', ['⠫', '⠞'], ['15.10'], '△', { sourceNotation: '$t' }),
  modifierToken('modifier.bar-over', ['⠱'], ['15.1', '15.2', '15.13'], '¯', { sourceNotation: ':' }),
  // Rule 19.2 sends a transcribed horizontal grouping sign through the
  // ordinary Rule 15.2.1 over/under modifier workflow. These rows are only
  // available while that modifier slot is active, so their baseline grouping
  // counterparts remain separate atomic local signs.
  modifierToken('modifier.horizontal-brace-over', ['⠨', '⠷'], ['19.2', '15.2.1'], '⏞', { sourceNotation: '.(', dataAttributes: { 'data-omniya-nemeth-intent': 'horizontal-brace-over', 'data-omniya-nemeth-cells': '⠨⠷' } }),
  modifierToken('modifier.horizontal-brace-under', ['⠨', '⠾'], ['19.2', '15.2.1'], '⏟', { sourceNotation: '.)', dataAttributes: { 'data-omniya-nemeth-intent': 'horizontal-brace-under', 'data-omniya-nemeth-cells': '⠨⠾' } }),
  modifierToken('modifier.horizontal-bracket-over', ['⠈', '⠷'], ['19.2', '15.2.1'], '⏜', { sourceNotation: '@(', dataAttributes: { 'data-omniya-nemeth-intent': 'horizontal-bracket-over', 'data-omniya-nemeth-cells': '⠈⠷' } }),
  modifierToken('modifier.horizontal-bracket-under', ['⠈', '⠾'], ['19.2', '15.2.1'], '⏝', { sourceNotation: '@)', dataAttributes: { 'data-omniya-nemeth-intent': 'horizontal-bracket-under', 'data-omniya-nemeth-cells': '⠈⠾' } }),
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
  { id: 'radical.end.order.one', cells: ['⠨', '⠻'], banaRefs: ['16.3'], action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: 'mroot', radicalOrder: 1, sourceNotation: '.]' } },
  { id: 'radical.end.order.two', cells: ['⠨', '⠨', '⠻'], banaRefs: ['16.3'], action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: 'mroot', radicalOrder: 2, sourceNotation: '..]' } },
  { id: 'radical.end.order.three', cells: ['⠨', '⠨', '⠨', '⠻'], banaRefs: ['16.3'], action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: 'mroot', radicalOrder: 3, sourceNotation: '...]' } },
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
  token('group.vertical-enlarged-open', ['⠠', '⠳'], ['19.5', '19.6'], '|', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: ',\\', dataAttributes: { 'data-omniya-nemeth-cells': '⠠⠳' } }),
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
  // BANA 20.9 uses the simple tilde as an operation sign, predominantly
  // meaning logical negation.  The same cells are a comparison sign under
  // Rule 21.6; an empty root is the unambiguous operation context, while a
  // populated expression can still expose the standards-defined choice.
  token('operator.tilde', ['⠈', '⠱'], ['20.9'], '∼', 'mo', { sourceNotation: '`:' }),
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
  // BANA uses `,'&` as the bounded mathematical word “and” construction in
  // equations (6.4.6 and the examples throughout Rules 3, 4, and 20). It is
  // not a ditto mark followed by a factorial. Keep it as one local text token
  // so the registry resolves the complete code before insertion while the
  // canonical tree remains ordinary MathML.
  token('misc.and', ['⠠', '⠄', '⠯'], ['3.11.1', '4.4.1', '6.4.6', '20.2'], 'and', 'mtext', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: ",'&",
    dataAttributes: { 'data-omniya-nemeth-intent': 'and-word', 'data-omniya-nemeth-cells': '⠠⠄⠯' }
  }),
  token('misc.or', ['⠠', '⠄', '⠕', '⠗'], ['6.4.6', '8.2'], 'or', 'mtext', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: ",'or",
    dataAttributes: { 'data-omniya-nemeth-intent': 'or-word', 'data-omniya-nemeth-cells': '⠠⠄⠕⠗' }
  }),
  // BANA's mathematical “then” abbreviation in Rule 6.4.7 is one bounded
  // local text construction. It is not a literary word parser: the four
  // registered cells create one MathML text atom and subsequent mathematics
  // continues through ordinary local insertions.
  token('misc.then', ['⠠', '⠄', '⠮', '⠝'], ['6.4.7'], 'then', 'mtext', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: ",'!n",
    dataAttributes: { 'data-omniya-nemeth-intent': 'then-word', 'data-omniya-nemeth-cells': '⠠⠄⠮⠝' }
  }),
  // Rule 6.4.7's abbreviated contrast word “but” is another bounded local
  // construction. The leading punctuation indicator is part of its BANA
  // code and must remain visible in the source-linked Braille projection.
  token('misc.but', ['⠠', '⠄', '⠃'], ['6.4.7'], 'but', 'mtext', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: ",'b",
    dataAttributes: { 'data-omniya-nemeth-intent': 'but-word', 'data-omniya-nemeth-cells': '⠠⠄⠃' }
  }),
  // BANA Rule 10.1.1's abbreviated “vs.” construction is one bounded
  // literary abbreviation inside a mathematical passage. Preserve its
  // punctuation indicator and final period as source-linked cells.
  token('misc.vs', ['⠠', '⠄', '⠧', '⠎', '⠲'], ['10.1.1'], 'vs.', 'mtext', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: ",'vs4",
    dataAttributes: { 'data-omniya-nemeth-intent': 'vs-abbreviation', 'data-omniya-nemeth-cells': '⠠⠄⠧⠎⠲' }
  }),
  // BANA Rule 23.8: the end-of-proof icon is `@$qed`, preceded by an empty
  // cell. The UEB transcriber-defined shape indicator is ⠈⠫, followed by
  // q-e-d. The empty-cell/document spacing is represented by the surrounding
  // passage policy, not folded into this local mathematical token.
  // Rule 23.8's `$qed` is a transcriber-defined shape name, not the five
  // cells for the literal letters q-e-d. In the equation tree the resulting
  // square is the local QED token; its canonical Nemeth projection is ⠸⠳.
  token('misc.end-proof', ['⠈', '⠫', '⠟', '⠑', '⠙'], ['23.8'], '∎', 'mo', {
    commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE,
    sourceNotation: '@$qed',
    dataAttributes: { 'data-omniya-nemeth-intent': 'qed' }
  }),
  token('misc.hollow-dot', ['⠨', '⠡'], ['15.17', '23.10'], '∘', 'mo', { preferLonger: true, sourceNotation: '.*', dataAttributes: { 'data-omniya-nemeth-intent': 'hollow-dot-symbol' } }),
  // The hollow-dot symbol is `.*` when it is a standalone degree-like sign;
  // BANA's degree symbol in mathematical position is the same sign preceded
  // by the direct-over/superscript indicator `~.*` (Rule 23.10 and Example
  // 23-13). Keeping the indicator in sourceNotation prevents the two local
  // constructions from being conflated.
  scriptToken('misc.degree', '~.*', ['23.10'], '°'),
  token('misc.prime', ['⠄'], ['23.16'], '′', 'mo', { preferLonger: true, sourceNotation: "'" }),
  token('misc.factorial', ['⠯'], ['23.9'], '!', 'mo', { sourceNotation: '&' }),
  token('misc.percent', ['⠈', '⠴'], ['23.15'], '%', 'mo', { preferLonger: true, sourceNotation: '`0' }),
  token('misc.empty-set', ['⠸', '⠴'], ['23.7'], '∅', 'mo', {
    sourceNotation: '_0',
    dataAttributes: { 'data-omniya-nemeth-intent': 'empty-set', 'data-omniya-nemeth-cells': '⠸⠴' }
  }),
  // The shape + left-head prefix is also the start of every left/vertical
  // arrow. Keep the local meaning pending while a shaft or right head may
  // follow; end-of-code commits the standalone angle.
  // The angle sign is a complete immediate construction. Arrow and interior
  // shape codes share its prefix, but they are explicitly atomic sequences;
  // do not delay the standalone angle or force an unrelated following local
  // code (such as possessive `_'s`) to press an extra boundary key.
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
  token('arrow.northwest', ['⠫', '⠘', '⠪', '⠒', '⠒'], ['22.4.3', '22.5'], '↖', 'mo', { preferLonger: true, sourceNotation: '$~[33' }),
  token('arrow.northeast', ['⠫', '⠘', '⠒', '⠒', '⠕'], ['22.4.3', '22.5'], '↗', 'mo', { preferLonger: true, sourceNotation: '$~33o' }),
  token('arrow.southeast', ['⠫', '⠰', '⠒', '⠒', '⠕'], ['22.4.3', '22.5'], '↘', 'mo', { preferLonger: true, sourceNotation: '$;33o' }),
  token('arrow.southwest', ['⠫', '⠰', '⠪', '⠒', '⠒'], ['22.4.3', '22.5'], '↙', 'mo', { preferLonger: true, sourceNotation: '$;[33' }),
  token('arrow.northwest-southeast', ['⠫', '⠘', '⠪', '⠒', '⠒', '⠕'], ['22.4.3'], '⤡', 'mo', { preferLonger: true, sourceNotation: '$~[33o' }),
  token('arrow.southwest-northeast', ['⠫', '⠰', '⠪', '⠒', '⠒', '⠕'], ['22.4.3'], '⤢', 'mo', { preferLonger: true, sourceNotation: '$;[33o' }),
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
  token('reference.star', ['⠫', '⠎'], ['9.1'], '☆', 'mo', { preferLonger: true, sourceNotation: '$s', dataAttributes: { 'data-omniya-nemeth-intent': 'reference-star' } }),
  mode('reference.general', ['⠈', '⠻'], ['9.2'], 'reference', true, '@]'),
  token('reference.icon.pencil', ['⠈', '⠫', '⠏'], ['9.4'], '✎', 'mo', { sourceNotation: '`$p', dataAttributes: { 'data-omniya-nemeth-intent': 'transcriber-defined-pencil-icon' } }),
  token('reference.icon.pencil-capital', ['⠈', '⠫', '⠠', '⠏'], ['9.4'], '✎', 'mo', { sourceNotation: '`$P', dataAttributes: { 'data-omniya-nemeth-intent': 'transcriber-defined-pencil-icon-capital' } }),
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
  shapeToken('shape.filled-circle', ['⠫', '⠸', '⠉'], ['17.3'], '●', 'filled-circle', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$_c' }),
  shapeToken('shape.filled-ellipse', ['⠫', '⠸', '⠑'], ['17.3'], '◉', 'filled-ellipse', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$_e' }),
  shapeToken('shape.filled-square', ['⠫', '⠸', '⠲'], ['17.3'], '■', 'filled-square', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$_4' }),
  // Shaded presentation glyphs are still canonical operator atoms. Braille
  // comes from data-omniya-nemeth-cells; do not demote them to mtext or the
  // official editor cannot select an atomic replacement target.
  shapeToken('shape.shaded-circle', ['⠫', '⠨', '⠉'], ['17.3'], '◍', 'shaded-circle', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$.c' }),
  shapeToken('shape.shaded-ellipse', ['⠫', '⠨', '⠑'], ['17.3'], '◌', 'shaded-ellipse', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$.e' }),
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
  // Rule 17.4/17.3: filled regular polygons retain the fill indicator before
  // the polygon code.  Keep the numeral local to this bounded construction.
  shapeToken('shape.filled-regular-octagon', ['⠫', '⠸', '⠦'], ['17.4'], '⬢', 'filled-regular-octagon', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$_8' }),
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
  shapeModificationToken('shape.circle.interior-letter-a', sourceCells('$c_$,a]'), ['17.6.1'], 'Ⓐ', 'circle', 'interior-letter-a', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$c_$,a]' }),
  shapeModificationToken('shape.angle.interior-degree', sourceCells('$[_$#30^.*"]'), ['17.6.1'], '∠°', 'angle', 'interior-degree', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[_$#30^.*"]' }),
  shapeModificationToken('shape.angle.interior-arrow', sourceCells('$[_$$59o]'), ['17.6.1', '17.10.1'], '∡', 'angle', 'interior-arrow', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$[_$$59o]', dataAttributes: { 'data-omniya-projection-cells': sourceCells('$[_$$a]').join('') } }),
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
  shapeToken('shape.triangle.plural', ['⠫', '⠞', '⠎'], ['17.9'], '⧌', 'triangle-plural', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, preferLonger: true, sourceNotation: '$ts', dataAttributes: { 'data-omniya-nemeth-cells': '⠫⠞⠎' } }),
  // Rule 17.6.4 keystrokes are bounded shape labels.  The label remains a
  // single local token; longer calculator sequences are composed by repeating
  // this operation rather than buffering an entire expression.
  shapeModificationToken('shape.keystroke.plus', sourceCells('$k+]'), ['17.6.4'], '+', 'keystroke', 'plus', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k+]', dataAttributes: { 'data-omniya-projection-cells': '⠬' } }),
  shapeModificationToken('shape.keystroke.square', sourceCells('$k8]'), ['17.6.4'], '8', 'keystroke', 'square', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k8]' }),
  shapeModificationToken('shape.keystroke.radical', sourceCells('$k>x]]'), ['17.6.4'], '√x', 'keystroke', 'radical', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k>x]]' }),
  shapeModificationToken('shape.keystroke.open-paren', sourceCells('$k(]'), ['17.6.4'], '(', 'keystroke', 'open-paren', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k(]', dataAttributes: { 'data-omniya-projection-cells': '⠷' } }),
  shapeModificationToken('shape.keystroke.close-paren', sourceCells('$k)]'), ['17.6.4'], ')', 'keystroke', 'close-paren', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k)]', dataAttributes: { 'data-omniya-projection-cells': '⠾' } }),
  shapeModificationToken('shape.keystroke.dot', sourceCells('$k@*]'), ['17.6.4'], '·', 'keystroke', 'dot', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k@*]', dataAttributes: { 'data-omniya-projection-cells': '⠡' } }),
  shapeModificationToken('shape.keystroke.minus', sourceCells('$k-]'), ['17.6.4'], '−', 'keystroke', 'minus', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k-]', dataAttributes: { 'data-omniya-projection-cells': '⠤' } }),
  shapeModificationToken('shape.keystroke.decimal', sourceCells('$k.]'), ['17.6.4'], '.', 'keystroke', 'decimal', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k.]', dataAttributes: { 'data-omniya-projection-cells': '⠨' } }),
  shapeModificationToken('shape.keystroke.equals', sourceCells('$k.k]'), ['17.6.4'], '=', 'keystroke', 'equals', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k.k]', dataAttributes: { 'data-omniya-projection-cells': '⠨⠅' } }),
  shapeModificationToken('shape.keystroke.plus-minus', sourceCells('$k+_/-]'), ['17.6.4'], '±', 'keystroke', 'plus-minus', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k+_/-]', dataAttributes: { 'data-omniya-projection-cells': '⠬⠤' } }),
  shapeModificationToken('shape.keystroke.divide', sourceCells('$k./]'), ['17.6.4'], '÷', 'keystroke', 'divide', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k./]', dataAttributes: { 'data-omniya-projection-cells': '⠨⠌' } }),
  shapeModificationToken('shape.keystroke.at-zero', sourceCells('$k@0]'), ['17.6.4'], '0', 'keystroke', 'at-zero', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k@0]', dataAttributes: { 'data-omniya-projection-cells': '⠼⠴' } }),
  shapeModificationToken('shape.keystroke.power', sourceCells('$ky^x"]'), ['17.6.4'], 'yˣ', 'keystroke', 'power', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$ky^x"]', dataAttributes: { 'data-omniya-projection-cells': '⠽ˣ' } }),
  shapeModificationToken('shape.keystroke.enter-arrow', sourceCells('$k,,enter$<33o]'), ['17.6.4'], 'ENTER↑', 'keystroke', 'enter-arrow', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k,,enter$<33o]' }),
  shapeModificationToken('shape.keystroke.arrow-degree-c', sourceCells('$k$33o^.*",c]'), ['17.6.4'], '→°C', 'keystroke', 'arrow-degree-c', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k$33o^.*",c]' }),
  shapeModificationToken('shape.keystroke.xy-arrows', sourceCells('$kx$3o$[3y]'), ['17.6.4'], 'x⇄y', 'keystroke', 'xy-arrows', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$kx$3o$[3y]' }),
  shapeModificationToken('shape.keystroke.ee-arrow', sourceCells('$k,,ee$%33o]'), ['17.6.4', '17.10.5'], 'EE↓', 'keystroke', 'ee-arrow', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$k,,ee$%33o]' }),
  // Rule 11.1.1: the general omission sign is the equals-shaped cell ⠿.
  // Its MathML placeholder is a question mark; it is not ordinary equals.
  token('omission.general', ['⠿'], ['11.1.1'], '?', 'mo', { sourceNotation: '=' }),
  open('cancellation.start', ['⠪'], ['12.1.1'], 'menclose', ['content'], { notation: 'updiagonalstrike', 'data-omniya-nemeth-cells': '⠪⠻' }, 'content', false, LOCAL_COMMIT_POLICIES.IMMEDIATE, { sourceNotation: '[' }),
  sourceClose('cancellation.end', ['⠻'], ['12.1.1'], 'menclose', ']'),
  token('arrow.right', ['⠫', '⠕'], ['22.1', '22.4'], '→', 'mo', {
    sourceNotation: '$o', allowImmediateBeforeContinuation: true
  }),
  // BANA 22.1 calls the ordinary right arrow `$o` only when it is regular,
  // single-shaft, and unmodified. The uncontracted `$33o` is a separate
  // bounded local construction (Examples 22-5 and 22-28), even though it
  // projects to the same mathematical relation.
  token('arrow.right.uncontracted', ['⠫', '⠒', '⠒', '⠕'], ['22.1', '22.3', '22.4'], '→', 'mo', { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: '$33o' }),
  token('arrow.left', ['⠫', '⠪', '⠒', '⠒'], ['22.4'], '←', 'mo', { preferLonger: true, sourceNotation: '$[33' }),
  token('arrow.both', ['⠫', '⠪', '⠒', '⠒', '⠕'], ['22.4'], '↔', 'mo', { preferLonger: true, sourceNotation: '$[33o' }),
  token('arrow.right.short', ['⠫', '⠒', '⠕'], ['22.5.3'], '⇢', 'mo', { preferLonger: true, sourceNotation: '$3o' }),
  token('arrow.left.short', ['⠫', '⠪', '⠒'], ['22.5.3'], '⇠', 'mo', { preferLonger: true, sourceNotation: '$[3' }),
  token('arrow.both.short', ['⠫', '⠪', '⠒', '⠕'], ['22.5.3'], '↔', 'mo', { preferLonger: true, sourceNotation: '$[3o' }),
  token('arrow.right.long', ['⠫', '⠒', '⠒', '⠒', '⠕'], ['22.5.3'], '⟶', 'mo', { preferLonger: true, sourceNotation: '$333o' }),
  token('arrow.left.long', ['⠫', '⠪', '⠒', '⠒', '⠒'], ['22.5.3'], '⟵', 'mo', { preferLonger: true, sourceNotation: '$[333' }),
  token('arrow.both.long', ['⠫', '⠪', '⠒', '⠒', '⠒', '⠕'], ['22.5.3'], '⟷', 'mo', { preferLonger: true, sourceNotation: '$[333o' }),
  ...GREEK_SMALL.map(([cells, value, sourceNotation]) => token(`greek.${value}`, [...cells], ['6.1.4', '6.2.1'], value, 'mi', { sourceNotation })),
  ...GREEK_CAPITAL.map(([cells, value, sourceNotation]) => token(`greek.capital-${value}`, [...cells], ['5.1.1', '6.1.4', '6.2.1'], value, 'mi', { sourceNotation })),
  ...GREEK_VARIANTS.map(([cells, value, sourceNotation]) => token(`greek.variant-${value}`, [...cells], ['6.1.5', '6.2.2'], value, 'mi', { sourceNotation })),
  mode('indicator.number', ['⠼'], ['3.1', '3.3'], 'numeric', false, '#'),
  mode('indicator.capital', ['⠠'], ['5.1', '6.1'], 'capital', true, ',', { deferForAtomicContinuation: true }),
  ...[...LETTERS.entries()].map(([cell, value]) => token(
    `letter.capital-${value}`, ['⠠', cell], ['5.1', '6.1'], value.toUpperCase(), 'mi',
    { commitPolicy: LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE, sourceNotation: `,${value}` }
  )),
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
// Choice-only rows remain in the declarative registry for operation lookup and
// explicit application, but never participate in automatic dispatch.
const MATCHABLE_MAPPINGS = MAPPINGS.filter((mapping) => !mapping.choiceOnly);

for (const mapping of MATCHABLE_MAPPINGS) {
  if (mapping.commitPolicy !== LOCAL_COMMIT_POLICIES.IMMEDIATE) continue;
  // `$o` is complete even though the same cells can be used by the separate
  // Rule 15.12 modifier construction. Context filtering resolves that
  // structural alternative; do not hold the ordinary arrow itself.
  const hasSameCodeAtomic = MATCHABLE_MAPPINGS.some((candidate) =>
    candidate.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
    candidate.cells.length === mapping.cells.length &&
    candidate.cells.every((cell, index) => cell === mapping.cells[index]));
  const hasAtomicContinuation = MATCHABLE_MAPPINGS.some((candidate) =>
    candidate.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
    candidate.cells.length > mapping.cells.length &&
    mapping.cells.every((cell, index) => cell === candidate.cells[index]));
  if ((hasSameCodeAtomic || hasAtomicContinuation) && !mapping.args?.allowImmediateBeforeContinuation) {
    mapping.args = { ...(mapping.args ?? {}), preferLonger: true };
  }
}

const PREFIXES = new Map();
for (const mapping of MATCHABLE_MAPPINGS) {
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
  const matchableEntries = entries.filter((entry) => !entry.choiceOnly);
  const policies = new Set(Object.values(LOCAL_COMMIT_POLICIES));
  const immediate = matchableEntries.filter((entry) => entry.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE);
  const hasLonger = (entry) => matchableEntries.some((candidate) => candidate.cells.length > entry.cells.length &&
    entry.cells.every((cell, index) => cell === candidate.cells[index]));
  const shadowedAtomic = entries
    .filter((entry) => entry.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE && !entry.choiceOnly)
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
        'move-binomial-lower', 'close-binomial', 'append-possessive', 'append-plural', 'append-ordinal', 'open-structure',
        'insert-contracted-script-comma', 'insert-structured-token', 'set-mode', 'open-binomial', 'open-typeform-scope', 'open-structure',
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

function openFractionNearFocus(tree, focus) {
  const node = currentNode(tree, focus);
  const direct = hasAncestor(tree, node, 'mfrac');
  if (direct?.children?.[1] && isHole(direct.children[1])) return direct;
  const parent = findMathParent(tree, node.attrs?.['data-omniya-id']);
  if (!parent || !['math', 'mrow'].includes(parent.name)) return null;
  const index = parent.children.indexOf(node);
  return parent.children.slice(0, index + 1).reverse().find((candidate) =>
    candidate.name === 'mfrac' && candidate.children?.[1] && isHole(candidate.children[1])) ?? null;
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
    ((context.node.name === 'math' && !(context.node.children?.length > 0)) ||
      (isHole(context.node) && !['mover', 'munder', 'munderover'].includes(findMathParent(context.tree, context.node.attrs?.['data-omniya-id'])?.name)))) return false;
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
  if (mapping.id === 'superposition.bar-shape' || mapping.id === 'superposition.operation-equals' ||
      mapping.id === 'superposition.comparison') {
    return context.node.name === 'math' || isHole(context.node);
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
    return Boolean(fraction && fractionKind === kind && (numeratorFocus ||
      (context.node === fraction && isHole(fraction.children?.[0]))) &&
      (!mapping.id.includes('order3') || fraction.attrs?.['data-omniya-fraction-order'] === '3'));
  }
  // Inside an open stacked fraction, `_/` is the local denominator transition.
  // Starting a second diagonal fraction would nest a sibling bevelled fraction
  // and leave the outer denominator hole empty.
  if (mapping.id === 'fraction.start.diagonal') {
    if (fraction && numeratorFocus && isHole(fraction.children?.[1])) return false;
    // Rule 20.8: after an ordinary identifier, `_/` is the slash operator.
    // Numeric atoms and literary-period unit fractions still wrap.
    if (context.node.name === 'mi') return false;
  }
  if (mapping.id.startsWith('fraction.end.')) {
    const kind = mapping.id.split('.').at(-1);
    // A denominator may contain a new numeric item after an explicit blank
    // (for example `.../cos #2x#`). At that bounded boundary the immediate
    // number indicator wins; the final terminator is still handled by the
    // numeric-mode close below once the lower-cell number is complete.
    const denominatorBoundary = context.node.name === 'mrow' && context.node.children?.at(-1)?.name === 'mspace';
    const parent = findMathParent(context.tree, context.node.attrs?.['data-omniya-id']);
    const trailingBlank = context.node.name === 'mspace' && parent?.name === 'mrow' && parent.children?.at(-1) === context.node;
    if (denominatorBoundary || trailingBlank) return false;
    return Boolean(fraction && fractionKind === kind && denominatorFocus &&
      (!mapping.id.includes('order3') || fraction.attrs?.['data-omniya-fraction-order'] === '3'));
  }
  if (mapping.id === 'radical.next.radicand') return Boolean(hasAncestor(context.tree, context.node, 'mroot'));
  if (mapping.id === 'radical.end') return Boolean(hasAncestor(context.tree, context.node, 'msqrt'));
  if (mapping.id === 'radical.indexed.end') return Boolean(hasAncestor(context.tree, context.node, 'mroot'));
  if (mapping.args?.radicalOrder) {
    const radical = hasAncestor(context.tree, context.node, mapping.args.element ?? ['msqrt', 'mroot']);
    return Boolean(radical && radical.attrs?.['data-omniya-radical-order'] === String(mapping.args.radicalOrder));
  }
  if (mapping.id === 'script.sup-sub.move-sub') {
    const compound = hasAncestor(context.tree, context.node, 'msubsup');
    return Boolean(compound && isHole(compound.children?.[1]));
  }
  if (mapping.id === 'script.sub-sup.move-sup') {
    const compound = hasAncestor(context.tree, context.node, 'msubsup');
    return Boolean(compound && isHole(compound.children?.[2]));
  }
  // Inside a filled msubsup, further level indicators nest on the focused
  // script item (BANA 14.4.3). Keep the one-cell openers blocked only while
  // either compound slot is still an empty hole that the move rows own.
  if (mapping.id === 'script.superscript' || mapping.id === 'script.subscript') {
    const compound = hasAncestor(context.tree, context.node, 'msubsup');
    if (!compound) return true;
    const openHole = isHole(compound.children?.[1]) || isHole(compound.children?.[2]);
    if (openHole) return false;
    return context.node.name !== 'math' && !isHole(context.node);
  }
  if (mapping.id === 'script.left-subscript') return context.node.name === 'math' || isHole(context.node);
  if (mapping.id === 'cancellation.end') return Boolean(hasAncestor(context.tree, context.node, 'menclose'));
  if (mapping.id === 'script.baseline') return Boolean(hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts', 'mover', 'munder', 'munderover']) ||
    (context.node.name === 'mo' && context.node.attrs?.['data-omniya-nemeth-cells'] === '⠘⠨⠡'));
  if (mapping.action === 'simultaneous-modifier') {
    const container = hasAncestor(context.tree, context.node, ['mover', 'munder']);
    if (!container || container.name === 'munderover') return false;
    return mapping.args.direction === 'over' ? container.name === 'munder' : container.name === 'mover';
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
  // `⠾` closes a round group only when that group is actually open. Mixed
  // grouping such as `[a)` must commit the parenthesis token instead of
  // offering a close-structure choice that cannot apply.
  if (mapping.id === 'group.round.end') {
    let current = context.node;
    while (current) {
      if (current.name === 'mrow' && current.attrs?.['data-omniya-group'] === 'round'
        && current.attrs?.['data-omniya-role'] !== 'closed-group') {
        return true;
      }
      current = isElement(current) ? findMathParent(context.tree, current.attrs?.['data-omniya-id']) : null;
    }
    return false;
  }
  if (mapping.id === 'comparison.ratio') {
    // BANA 24.1 reuses the same "1 cells for a multipurpose indicator plus a
    // baseline digit after a letter or single-letter numeric criterion. Ratio
    // remains available after ordinary numeric/operator foci.
    if (context.node.name === 'mi') return false;
    if (context.node.name === 'mn'
      && context.node.attrs?.['data-omniya-nemeth-intent'] === 'single-letter-number') return false;
    if (context.node.name === 'mo' && context.node.attrs?.['data-omniya-nemeth-cells']
      && !['∶', ':', '<', '>', '=', '≤', '≥', '≠', '≡', '⊂', '⊃'].includes(context.node.children?.[0]?.text)) {
      return false;
    }
  }
  if (mapping.id === 'indicator.multipurpose') {
    // Inside a script the same cell is the Rule 14 baseline indicator.
    return !Boolean(hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts']));
  }
  if (mapping.id === 'indicator.number' && fraction) {
    if (!contains(context.tree, fraction.children[1], context.node)) return true;
    const parent = findMathParent(context.tree, context.node.attrs?.['data-omniya-id']);
    return context.node.name === 'mrow' && context.node.children?.at(-1)?.name === 'mspace' ||
      context.node.name === 'mspace' && parent?.name === 'mrow' && parent.children?.at(-1) === context.node;
  }
  if (mapping.action === 'insert-contracted-script-comma') {
    return Boolean(hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts']) &&
      context.node.name !== 'math' && !isHole(context.node));
  }
  if (mapping.action === 'append-possessive' || mapping.action === 'append-plural') {
    return context.node.name !== 'math' && context.node.name !== 'mspace' && !isHole(context.node) &&
      Boolean(findMathParent(context.tree, context.node.attrs?.['data-omniya-id']));
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
  // Rule 14.3's superscript asterisk shares `⠈⠼` with the script-number
  // typeform. A script hole still needs a local atom, so the typeform number
  // mode must not consume those cells before the asterisk can fill the slot.
  if (mapping.id.startsWith('typeform.') && mapping.id.endsWith('.number') &&
    isHole(context.node) &&
    ['superscript', 'subscript', 'left-superscript', 'left-subscript'].includes(context.node.attrs?.['data-omniya-role'])) {
    return false;
  }
  // Typeform number modes start a fresh numeric passage. After an ordinary
  // identifier or numeral they yield to the shared Rule 20 operation rows
  // (`⠈⠼` asterisk, `⠨⠼` number-sign). After an existing typeform numeral,
  // another typeform number mode may begin (`.#3_#4`#5`).
  if ((mapping.id === 'typeform.script.number' || mapping.id === 'typeform.italic.number') &&
    (context.node.name === 'mi' || context.node.name === 'mn')) {
    if (TYPEFORM_NUMBER_PREFIXES[context.node.attrs?.mathvariant]) return true;
    return false;
  }
  // At an empty root, hole, or authored blank, `.#` is Rule 7.2's italic
  // numeric typeform. Rule 20.3's number-sign follows an ordinary atom.
  // After a typeform numeral the same cells continue the decimal passage.
  if (mapping.id === 'operator.number-sign') {
    const script = hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup']);
    if (script && isHole(context.node) && script.children?.[0] && !isHole(script.children[0])) {
      return true;
    }
    if ((context.node.name === 'math' && !(context.node.children?.length > 0)) ||
      isHole(context.node) || context.node.name === 'mspace' ||
      TYPEFORM_NUMBER_PREFIXES[context.node.attrs?.mathvariant]) {
      return false;
    }
  }
  // After a typeform numeral, `` `# `` is the next typeform number mode, not
  // Rule 20.3's asterisk.
  if ((mapping.id === 'operator.asterisk' || mapping.id === 'reference.asterisk') &&
    TYPEFORM_NUMBER_PREFIXES[context.node.attrs?.mathvariant]) {
    return false;
  }
  // After a hex-style numeric atom, `.t` is a decimal plus digit, not theta.
  if (mapping.id.startsWith('greek.') && context.node.name === 'mn') {
    const text = String(context.node.children?.[0]?.text ?? '');
    if (/[A-Za-z]/.test(text)) return false;
  }
  // Footnote reference asterisks follow prose. After a math operand, the same
  // cells are BANA 20.3's operation asterisk.
  if (mapping.id === 'reference.asterisk' &&
    (context.node.name === 'mi' || context.node.name === 'mn')) {
    return false;
  }
  if (mapping.id === 'misc.prime') {
    return context.node.name !== 'math' && !isHole(context.node);
  }
  if (mapping.id === 'comparison.member') {
    if ((context.node.name === 'math' && !(context.node.children?.length > 0)) || isHole(context.node)) {
      return false;
    }
  }
  if (mapping.id === 'misc.empty-set') {
    const parent = context.node.name !== 'math'
      ? findMathParent(context.tree, context.node.attrs?.['data-omniya-id'])
      : context.node;
    if (parent?.children) {
      const focusIndex = parent.children.indexOf(context.node);
      const ahead = focusIndex >= 0 ? parent.children.slice(0, focusIndex + 1) : parent.children;
      let openQuotes = 0;
      for (const child of ahead) {
        const intent = child.attrs?.['data-omniya-nemeth-intent'];
        const text = child.children?.[0]?.text;
        if (intent === 'punctuation-left-double-quote' || text === '“') openQuotes += 1;
        if (intent === 'punctuation-right-double-quote' || text === '”') openQuotes -= 1;
      }
      if (openQuotes > 0) return false;
    }
    if (context.node.name === 'math' && !(context.node.children?.length > 0)) return true;
    if (isHole(context.node)) return true;
    const text = context.node.children?.[0]?.text;
    return context.node.name === 'mo' && ['=', '≡', '≠', '≈', '∼'].includes(text);
  }
  if (mapping.id === 'punctuation.left-double-quote.indicated') {
    if (context.node.name === 'math' && !(context.node.children?.length > 0)) return true;
    if (context.node.name === 'mspace' || isHole(context.node)) return true;
    if (context.node.attrs?.['data-omniya-role'] === 'open-fence') return true;
    const text = context.node.children?.[0]?.text;
    return context.node.name === 'mo' && ['–', '―', '−', '(', '[', '{', '⟨'].includes(text);
  }
  if (mapping.id === 'punctuation.question') {
    if (context.node.name === 'math' && !(context.node.children?.length > 0)) return false;
    if (context.node.name === 'mspace' || isHole(context.node)) return false;
    if (context.node.attrs?.['data-omniya-role'] === 'open-fence') return false;
    const text = context.node.children?.[0]?.text;
    if (context.node.name === 'mo' && ['–', '―', '(', '[', '{', '⟨', '“'].includes(text)) return false;
    return true;
  }
  if (mapping.id === 'punctuation.right-double-quote.indicated') {
    if (context.node.name === 'math' && !(context.node.children?.length > 0)) return false;
    if (isHole(context.node) && !hasAncestor(context.tree, context.node, 'msqrt')) return false;
    return true;
  }
  if (mapping.id === 'punctuation.literary-period') {
    if (context.node.name === 'math' || isHole(context.node) || context.node.name === 'mn') return false;
    return context.node.name === 'mi' || context.node.name === 'mtext' ||
      (context.node.name === 'mo' && context.node.attrs?.['data-omniya-nemeth-intent'] === 'punctuation-literary-period');
  }
  return true;
}


function resolveModifierAmbiguity(mappings, modeValue) {
  if (modeValue?.startsWith?.('modifier-') && modeValue !== 'modifier-parallel') {
    return mappings.filter((mapping) => ['insert-modifier', 'close-structure'].includes(mapping.action));
  }
  // Contracted modifiers remain valid directly after an existing expression.
  // Only suppress them when the same complete cells also name an ordinary
  // operation (for example a Rule 17 shape); modifier mode then remains the
  // bounded discriminator for the modifier meaning.
  return mappings.some((mapping) => mapping.action !== 'insert-modifier')
    ? mappings.filter((mapping) => mapping.action !== 'insert-modifier')
    : mappings;
}

function hasAtomicContinuation(prefix, nextCell, context) {
  const candidatePrefix = `${prefix}${nextCell}`;
  return MATCHABLE_MAPPINGS.some((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
    mapping.cells.length > candidatePrefix.length &&
    mapping.cells.slice(0, candidatePrefix.length).join('') === candidatePrefix &&
    mappingApplies(mapping, context));
}

function hasApplicableContinuation(prefix, nextCell, context) {
  const candidatePrefix = `${prefix}${nextCell}`;
  return MATCHABLE_MAPPINGS.some((mapping) => mapping.cells.length > candidatePrefix.length &&
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
      mathvariant: ['mi', 'mn'].includes(args.name)
        ? (typeform === 'bold' ? 'bold' : typeform === 'italic' ? 'italic' : typeform === 'script' ? 'script' : typeform === 'double-struck' ? 'double-struck' : typeform === 'sans-serif' ? 'sans-serif' : args.mathvariant ?? null)
        : args.mathvariant ?? null,
      dataAttributes: {
        ...(inputState.mode === 'decimal-nonnumeric' ? { 'data-omniya-nemeth-intent': 'decimal-nonnumeric' } : {}),
        ...(args.dataAttributes ?? {})
      }
    });
  },
  'wrap-script-token': ({ tree, focus, args }) => wrapScriptToken(tree, focus, args.value, args.sourceNotation),
  'insert-numeric': ({ tree, focus, node, args, inputState }) => {
    const numericVariant = inputState.mode?.startsWith?.('numeric:')
      ? inputState.mode.slice('numeric:'.length)
      : null;
    // A mathematical punctuation cell after a one-cell identifier or a
    // completed local number is punctuation, not another digit in the same
    // <mn>. Numeric-mode punctuation (decimal/comma inside a number) is
    // intentionally handled by insertNumeric below; outside that bounded
    // numeric context keep the comma/period as its own <mo> sibling.
    if (['.', ','].includes(args.value) && !inputState.mode?.startsWith?.('numeric') && node.name === 'mn') {
      return insertToken(tree, focus, 'mo', args.value, { dataAttributes: args.dataAttributes ?? {} });
    }
    // A fresh number indicator or typeform numeral after a different typeform
    // atom starts a sibling numeric item (`.#43#56`, `.#3_#4`#5`), not an
    // extension of the previous typeform atom.
    const startNewNumericItem = node.name === 'mn' && node.children?.length === 1
      && Boolean(TYPEFORM_NUMBER_PREFIXES[node.attrs?.mathvariant])
      && node.attrs?.mathvariant !== numericVariant
      && (args.dataAttributes?.['data-omniya-nemeth-intent'] === 'numeric-start' || Boolean(numericVariant));
    if (node.name === 'mn' && node.children?.length === 1 && !startNewNumericItem) {
      const extended = insertNumeric(tree, focus, args.value, { mathvariant: numericVariant, dataAttributes: args.dataAttributes ?? {} });
      stampTypeformNumber(currentNode(extended.tree, extended.focus));
      return extended;
    }
    const inserted = atom('mn', args.value, {
      ...(numericVariant ? { mathvariant: numericVariant } : {}),
      ...(args.value === '0' && node.attrs?.['data-omniya-nemeth-intent'] === 'hebrew-letter'
        ? { 'data-omniya-nemeth-intent': 'hebrew-subscript-zero' } : {}),
      ...(args.dataAttributes ?? {}),
      ...(['signed-numeric', 'signed-numeric-indicator'].includes(inputState.mode) ? { 'data-omniya-nemeth-intent': 'signed-numeric-indicator' } : {})
    });
    stampTypeformNumber(inserted);
    const target = startNewNumericItem
      ? insertAfter(tree, focus, inserted)
      : ((node.name === 'math' && node.children.length === 0) || isHole(node)
        ? replaceCurrent(tree, focus, inserted)
        : insertAfter(tree, focus, inserted));
    return { tree, focus: focusNode(target) };
  },
  'insert-numeric-decimal': ({ tree, focus, args }) => {
    const result = insertNumericDecimal(tree, focus, args.value, args.dataAttributes ?? {});
    stampTypeformNumber(currentNode(result.tree, result.focus));
    return result;
  },
  'insert-decimal-nonnumeric': ({ tree, focus, args }) => insertDecimalNonnumeric(tree, focus, args.value, args.dataAttributes ?? {}),
  'insert-composite': ({ tree, focus, args }) => insertComposite(tree, focus, args.parts, args.dataAttributes),
  'insert-structured-token': ({ tree, focus, args }) => insertStructuredToken(tree, focus, args.element, args.parts, args.dataAttributes),
  'open-left-script': ({ tree, focus, args }) => openLeftScript(tree, focus, args.direction),
  'insert-modifier': ({ tree, focus, inputState, args }) => insertModifier(tree, focus, args.value, inputState.mode, inputState.modifierScope, args.dataAttributes ?? {}),
  'superpose-token': ({ tree, focus, args }) => superposeToken(tree, focus, args.value, args.intent, args.allowedValues, args.sourceNotation),
  'open-structure': ({ tree, focus, node, args, inputState }) => {
    // A preceding explicit blank is a sibling separator, not the operand of
    // the new structure.  Start the structure after that local boundary so
    // fraction numerators, scripts, and radicals retain their required hole
    // as the first editable slot.
    // Grouping is mathematical content, not an invisible editor container.
    // Keep the bounded content slot, but represent its fence characters as
    // ordinary MathML operators so MathJax/SRE can render and emit the same
    // Nemeth grouping indicators the author entered.
  if (args.element === 'mrow' && args.attrs?.['data-omniya-group'] === 'round') {
      const wrapper = element('mrow', [], args.attrs);
      wrapper.children.push(atom('mo', '(', {
        'data-omniya-role': 'open-fence',
        'data-omniya-nemeth-cells': '⠷'
      }));
      const content = hole(wrapper, args.initialSlot ?? 'content');
      wrapper.children.push(content);
      wrapper.children.push(atom('mo', ')', {
        'data-omniya-role': 'close-fence',
        'data-omniya-nemeth-cells': '⠾'
      }));
      // A fence following a populated atom starts a new sibling group; only
      // an actual empty slot is replaced by the group itself.
      const inserted = isHole(node) ? replaceCurrent(tree, focus, wrapper) : insertAfter(tree, focus, wrapper);
      return { tree, focus: focusNode(content) };
    }
    if (args.element === 'mfrac' && node.name === 'mspace') {
      const wrapper = element(args.element, [], args.attrs ?? {});
      for (const role of args.slots ?? []) wrapper.children.push(hole(wrapper, role));
      const inserted = insertAfter(tree, focus, wrapper);
      const first = wrapper.children.find((child) => child.attrs?.['data-omniya-role'] === args.initialSlot);
      return { tree, focus: focusNode(first ?? inserted) };
    }
    if (args.element === 'mfrac' && (args.attrs?.bevelled === true || args.attrs?.bevelled === 'true')) {
      const punctuated = wrapDiagonalFractionAfterPunctuatedItem(tree, focus, args.attrs ?? {}, args.initialSlot ?? 'denominator');
      if (punctuated) return punctuated;
    }
    if (args.element === 'mfrac' && node.name !== 'math' && !isHole(node) &&
      args.attrs?.bevelled !== true && args.attrs?.bevelled !== 'true' &&
      (findMathParent(tree, node.attrs?.['data-omniya-id'])?.name === 'mrow' ||
        findMathParent(tree, node.attrs?.['data-omniya-id'])?.name === 'math' ||
        ['mi', 'mn', 'mo', 'mtext'].includes(node.name) ||
        (args.attrs?.['data-omniya-fraction-kind'] === 'mixed' && node.name === 'mn'))) {
      const wrapper = element(args.element, [], args.attrs ?? {});
      for (const role of args.slots ?? []) wrapper.children.push(hole(wrapper, role));
      const inserted = insertAfter(tree, focus, wrapper);
      const first = wrapper.children.find((child) => child.attrs?.['data-omniya-role'] === args.initialSlot);
      return { tree, focus: focusNode(first ?? inserted) };
    }
    if (args.element === 'menclose' && args.attrs?.notation === 'updiagonalstrike') {
      // Cancellation is an opener-first enclosure. Wrapping the current node
      // (or replacing the whole math root) would consume already-authored
      // siblings; insert a fresh content hole after the local focus instead.
      const wrapper = element(args.element, [], args.attrs ?? {});
      for (const role of args.slots ?? ['content']) wrapper.children.push(hole(wrapper, role));
      const inserted = insertAfter(tree, focus, wrapper);
      const first = wrapper.children.find((child) => child.attrs?.['data-omniya-role'] === args.initialSlot)
        ?? wrapper.children[0];
      return { tree, focus: focusNode(first ?? inserted) };
    }
    if (['msup', 'msub'].includes(args.element) && (node.name === 'mspace' || isAbsorbableBaselineSibling(node))) {
      const direction = args.element === 'msub' || args.initialSlot === 'subscript' ? 'sub' : 'sup';
      const reentered = reenterAdjacentScript(tree, focus, direction);
      if (reentered) return reentered;
    }
    if (node.name === 'mspace' || (args.element === 'mfrac' && node.name === 'mo')) {
      const wrapper = element(args.element, [], args.attrs ?? {});
      for (const role of args.slots ?? []) wrapper.children.push(hole(wrapper, role));
      const inserted = insertAfter(tree, focus, wrapper);
      const first = wrapper.children.find((child) => child.attrs?.['data-omniya-role'] === args.initialSlot);
      return { tree, focus: focusNode(first ?? inserted) };
    }
    const primeWrapped = ['msup', 'msub', 'msubsup'].includes(args.element)
      ? wrapScriptAfterPrime(tree, focus, args.element, args.slots, args.attrs, args.initialSlot)
      : null;
    const radicalOrder = inputState.mode?.startsWith?.('radical-order:') ? inputState.mode.slice('radical-order:'.length) : null;
    const attrs = radicalOrder && ['msqrt', 'mroot'].includes(args.element)
      ? { ...(args.attrs ?? {}), 'data-omniya-radical-order': radicalOrder }
      : args.attrs;
    if (['msup', 'msub'].includes(args.element)) {
      const direction = args.element === 'msub' || args.initialSlot === 'subscript' ? 'sub' : 'sup';
      const absolute = applyAbsoluteScriptLevel(tree, focus, direction, 1);
      if (absolute) return absolute;
    }
    // BANA 14.4/14.8: `~;` and `;~` are absolute from the item being
    // modified. When that item is already at the first named level, the
    // remaining indicator opens the opposite script of the current item
    // instead of wrapping a fresh msubsup with an empty hole.
    if (args.element === 'msubsup') {
      const firstDirection = args.initialSlot === 'subscript' ? 'sub' : 'sup';
      const depth = scriptDepth(tree, node, firstDirection);
      if (depth > 0 && node.name !== 'math' && !isHole(node)) {
        const opposite = firstDirection === 'sup' ? 'sub' : 'sup';
        let targetFocus = focus;
        const parent = findMathParent(tree, node.attrs?.['data-omniya-id']);
        const grand = parent ? findMathParent(tree, parent.attrs?.['data-omniya-id']) : null;
        if (parent?.name === 'mrow' && grand && scriptSlot(grand, firstDirection) === parent) {
          targetFocus = focusNode(parent);
        }
        const oppositeRole = opposite === 'sub' ? 'subscript' : 'superscript';
        return wrapCurrent(tree, targetFocus, opposite === 'sub' ? 'msub' : 'msup',
          ['base', oppositeRole], {}, oppositeRole);
      }
    }
    if (!primeWrapped && ['msup', 'msub'].includes(args.element) && !(node.name === 'math' || isHole(node))) {
      const result = openScriptSlot(tree, focus, args.element, args.initialSlot);
      return result;
    }
    return primeWrapped ?? wrapCurrent(tree, focus, args.element, args.slots, attrs, args.initialSlot);
  },
  'open-function-limit': ({ tree, focus, args }) => openFunctionLimit(tree, focus, args.direction, args.sourceNotation),
  'insert-contracted-script-comma': ({ tree, focus }) => insertContractedScriptComma(tree, focus),
  'append-possessive': ({ tree, focus }) => appendPossessive(tree, focus),
  'append-plural': ({ tree, focus }) => appendPlural(tree, focus),
  'append-ordinal': ({ tree, focus, args }) => appendOrdinal(tree, focus, args.ending),
  'open-typeform-scope': ({ tree, focus, args }) => openTypeformScope(tree, focus, args.mathvariant),
  'close-typeform-scope': ({ tree, focus }) => closeTypeformScope(tree, focus),
  'open-fixed-root': ({ tree, focus, args, inputState }) => openFixedRoot(tree, focus, args.index, args.indexText,
    inputState.mode?.startsWith?.('radical-order:') ? inputState.mode.slice('radical-order:'.length) : null, args.indexKind ?? 'mn'),
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
  'move-slot': ({ tree, focus, node, args }) => {
    if (args.element === 'mfrac' && Object.hasOwn(args, 'bevelled')) {
      const fraction = fractionAtFocus(tree, node);
      if (fraction) fraction.attrs.bevelled = args.bevelled ? 'true' : 'false';
    }
    return focusRole(tree, focus, args.element, args.role);
  },
  'set-mode': ({ tree, focus, node, inputState, args, document }) => {
    // Rule 16.3 order indicators can be authored immediately after an
    // already-open grouping fence (for example `(.5`).  The indicator is a
    // bounded source prefix for that local group; retain it on the group so
    // projection can restore the authored cells without changing MathML
    // structure or inferring an operand.
    if (args.mode?.startsWith?.('radical-order:')) {
      let owner = node;
      while (owner) {
        if (owner.name === 'mrow' && owner.attrs?.['data-omniya-group'] === 'round') {
          owner.attrs['data-omniya-radical-order'] = args.mode.slice('radical-order:'.length);
          document.mathml = serializeMathML(tree);
          break;
        }
        owner = isElement(owner) ? findMathParent(tree, owner.attrs?.['data-omniya-id']) : null;
      }
    }
    if (args.mode === 'baseline') {
      const multiscript = ancestor(tree, node, ['mmultiscripts']);
      if (multiscript && multiscript.children?.[0]?.attrs?.['data-omniya-hole'] === 'true') {
        return { tree, focus: focusNode(multiscript.children[0]) };
      }
      const script = ancestor(tree, node, ['msup', 'msub']);
      const scriptParent = script ? findMathParent(tree, script.attrs?.['data-omniya-id']) : null;
      // A scripted radicand initially occupies the single first child of an
      // mroot. Returning to baseline must keep subsequent local tokens in
      // that radicand, rather than inserting them beside the entire root.
      // Promote that one child to an mrow before returning focus. This is a
      // structural MathML operation, not operand inference or passage
      // parsing, and gives MathJax the same sibling navigation it uses for a
      // populated row everywhere else.
      if (script && (scriptParent?.name === 'mroot' || scriptParent?.name === 'msqrt') &&
        scriptParent.children?.[0] === script) {
        const row = element('mrow', [script]);
        scriptParent.children[0] = row;
        // Focus the newly-created radicand row, not the script itself. The
        // next local operator must be a sibling of the completed script. If
        // focus stayed on the msup, a following radical opener could be
        // interpreted as its exponent, corrupting nested-root structure.
        return { tree, focus: focusNode(row) };
      }
      // A lone scripted numerator/denominator must remain inside that fraction
      // slot after baseline return. Promote the script to an mrow so a blank
      // or following identifier stays in the same slot rather than becoming a
      // sibling of the whole fraction.
      if (script && scriptParent?.name === 'mfrac') {
        const index = scriptParent.children.indexOf(script);
        if (index >= 0) {
          const row = element('mrow', [script]);
          scriptParent.children[index] = row;
          return { tree, focus: focusNode(row) };
        }
      }
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
    if (args.mode === 'capital' && inputState.mode?.startsWith?.('typeform:')) {
      return { status: 'pending', document, focus, inputState: { ...inputState, prefix: '', mode: `${inputState.mode}:capital` }, announcement: 'Nemeth capital indicator active within the typeform.' };
    }
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
  if (result.status === 'pending' && mapping.action === 'set-mode' && args.mode?.startsWith?.('radical-order:')) {
    let owner = currentNode(result.tree, result.focus);
    while (owner) {
      if (owner.name === 'mrow' && owner.attrs?.['data-omniya-group'] === 'round') {
        owner.attrs['data-omniya-radical-order'] = args.mode.slice('radical-order:'.length);
        result.document = { ...document, mathml: serializeMathML(result.tree) };
        break;
      }
      owner = isElement(owner) ? findMathParent(result.tree, owner.attrs?.['data-omniya-id']) : null;
    }
  }
  if (result.status === 'pending') return result;
  const insertedAction = ['insert-token', 'insert-numeric', 'insert-numeric-decimal', 'open-structure', 'open-script-chain', 'open-fixed-root', 'open-function-limit', 'insert-contracted-script-comma', 'insert-structured-token', 'open-binomial', 'wrap-script-token', 'open-left-script', 'extend-integral', 'superpose-token'].includes(mapping.action);
  const collectingModifierScope = inputState.mode === 'multipurpose' ||
    (inputState.mode?.startsWith?.('modifier-') && inputState.mode !== 'modifier-parallel');
  const nextModifierScope = collectingModifierScope && insertedAction
    ? extendModifierScope(result.tree, result.focus, inputState.modifierScope)
    : inputState.modifierScope;
  // Five-step Rule 15 keeps collecting the modified expression across local
  // scripts, groups, and the baseline return that leaves those scripts.
  const retainCollectedModifierMode = collectingModifierScope && (
    ['open-structure', 'open-script-chain', 'open-fixed-root',
      'open-function-limit', 'open-left-script'].includes(mapping.action)
    || (mapping.action === 'close-structure'
      && !['mover', 'munder', 'munderover'].includes(args.element))
    || (mapping.action === 'set-mode' && args.mode === 'baseline')
  );
  // BANA numeric mode remains active across a baseline arithmetic operator.
  // This is the local rule that permits `#1.2+1.4` and `#1.4709`*10` without
  // a second number sign. It is not a passage parser: only the immediately
  // following local digit/decimal transition can consume the retained mode.
  const retainNumericAfterOperator = inputState.mode?.startsWith?.('numeric') &&
    mapping.action === 'insert-token' && args.name === 'mo' &&
    BASELINE_ARITHMETIC_SIGNS.includes(args.value);
  const beginSignedNumeric = inputState.mode === null &&
    mapping.action === 'insert-token' && args.name === 'mo' &&
    ['+', '−', '-', '±'].includes(args.value) &&
    (node.name === 'math' || node.name === 'mspace' ||
      (node.name === 'mo' && ['+', '−', '-', '±'].includes(node.children?.[0]?.text)));
  // A contracted modifier (for example x: or x% in Rule 15.2.2/15.2.3)
  // completes the one local decoration immediately.  Only the five-step
  // form, which entered through multipurpose/modifier mode, remains in the
  // modifier-complete phase for a possible second side or terminator.  This
  // distinction is structural and registry-wide: it keeps a following +,
  // script, or sibling token in the surrounding MathML slot instead of
  // accidentally treating it as another modifier operand.
  const nextMode = args.nextMode ?? (mapping.action === 'insert-modifier'
    ? (inputState.mode === 'modifier-parallel'
      ? 'modifier-parallel'
      : (inputState.mode === 'multipurpose' || inputState.mode?.startsWith?.('modifier-') ? 'modifier-complete' : 'modifier-parallel'))
    : mapping.action === 'simultaneous-modifier' || mapping.action === 'higher-order-modifier'
      ? `modifier-${args.direction}`
    : mapping.action === 'extend-integral' && inputState.mode === 'multipurpose'
      ? 'multipurpose'
    : beginSignedNumeric
    ? 'signed-numeric'
    : retainNumericAfterOperator
    ? inputState.mode
    : ['insert-token', 'insert-numeric', 'insert-numeric-decimal', 'wrap-script-token'].includes(mapping.action) && (inputState.mode?.startsWith?.('numeric') || inputState.mode === 'ueb-numeric') && !(args.name === 'mspace' || args.name === 'mo')
    ? inputState.mode
    : ['insert-token', 'insert-numeric', 'insert-numeric-decimal', 'wrap-script-token'].includes(mapping.action) && inputState.mode?.startsWith?.('modifier-') && inputState.mode !== 'modifier-parallel'
      ? inputState.mode
    : ['insert-token', 'insert-numeric', 'insert-numeric-decimal', 'wrap-script-token'].includes(mapping.action) && inputState.mode === 'multipurpose'
        ? 'multipurpose'
    : retainCollectedModifierMode
      ? inputState.mode
    : (['insert-token', 'insert-numeric', 'insert-numeric-decimal', 'wrap-script-token'].includes(mapping.action) && inputState.mode === 'ueb-word'
      ? null
      : null));
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
  // Capitalization is a mode indicator whose selected meaning consumes the
  // complete local prefix. A prefix such as ⠠⠁ therefore applies the mode to
  // the suffix letter, rather than replaying that suffix as an unrelated
  // punctuation code.
  if (mapping.id === 'indicator.capital' && prefix.startsWith(mappingPrefix) && prefix.length > mappingPrefix.length) {
    const suffix = [...prefix.slice(mappingPrefix.length)];
    let next = applyMapping(document, focus, { ...inputState, prefix: '' }, mapping);
    for (const suffixCell of suffix) {
      next = applyNemethCell({ document: next.document, focus: next.focus, inputState: next.inputState, cell: suffixCell });
      if (next.status !== 'applied' && next.status !== 'pending') break;
    }
    return next;
  }
  if (mapping.id === 'punctuation.comma' && prefix.startsWith(mappingPrefix) && prefix.length > mappingPrefix.length) {
    const suffix = [...prefix.slice(mappingPrefix.length)];
    let next = applyMapping(document, focus, { ...inputState, prefix: '' }, mapping);
    for (const suffixCell of suffix) {
      next = applyNemethCell({ document: next.document, focus: next.focus, inputState: next.inputState, cell: suffixCell });
      if (next.status !== 'applied' && next.status !== 'pending') break;
    }
    return next;
  }
  if (mapping.id === 'indicator.english-letter' && prefix.startsWith(mappingPrefix) && prefix.length > mappingPrefix.length) {
    const suffix = [...prefix.slice(mappingPrefix.length)];
    let next = applyMapping(document, focus, { ...inputState, prefix: '' }, mapping);
    for (const suffixCell of suffix) {
      next = applyNemethCell({ document: next.document, focus: next.focus, inputState: next.inputState, cell: suffixCell });
      if (next.status !== 'applied' && next.status !== 'pending') break;
    }
    return next;
  }
  if (mapping.id === 'script.left-superscript' && prefix.startsWith(mappingPrefix) && prefix.length > mappingPrefix.length) {
    const suffix = [...prefix.slice(mappingPrefix.length)];
    let next = applyMapping(document, focus, { ...inputState, prefix: '' }, mapping);
    for (const suffixCell of suffix) {
      next = applyNemethCell({ document: next.document, focus: next.focus, inputState: next.inputState, cell: suffixCell });
      if (next.status !== 'applied' && next.status !== 'pending') break;
    }
    return next;
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
  if (mapping.id === 'script.baseline' && DIGITS.has([...prefix.slice(mappingPrefix.length)][0])) {
    next = { ...next, inputState: { ...next.inputState, mode: 'numeric' } };
  }
  // The UI presents a complete shared prefix as the choice target. Once the
  // author selects the shorter punctuation/capital meaning, the unmatched
  // suffix is still part of the same local code and must be replayed through
  // the bounded transition engine. This is one code, never a passage buffer.
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
  return { id: `number.${DIGITS.get(cell)}`, cells: [cell], banaRefs: ['3.1.2', '3.3'], action: 'insert-numeric', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { value: DIGITS.get(cell), dataAttributes: { 'data-omniya-nemeth-intent': 'numeric-start' } } };
}

function numericPunctuationMapping(cell, value, banaRef) {
  return {
    id: `number.${banaRef === '3.2.3' ? 'decimal-point' : 'comma'}`,
    cells: [cell], banaRefs: [banaRef],
    action: 'insert-numeric',
    commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
    args: { value, ...(banaRef === '3.2.3' ? { dataAttributes: { 'data-omniya-nemeth-intent': 'numeric-decimal' } } : {}) }
  };
}

function letterMapping(cell, inputState) {
  const value = LETTERS.get(cell);
  const typeform = inputState.typeform
    ?? (inputState.mode?.startsWith?.('typeform:')
      ? inputState.mode.slice('typeform:'.length).replace(/:capital$/, '')
      : null);
  const capital = inputState.capital === true || inputState.mode === 'capital' || inputState.mode?.endsWith?.(':capital');
  const typeformPrefix = typeform === 'bold' ? '⠸⠰'
    : typeform === 'script' ? '⠈⠰'
      : typeform === 'italic' ? '⠨⠰'
        : typeform === 'double-struck' ? (capital ? '⠠⠸' : '⠠⠸⠰')
          : '';
  return {
    id: `letter.${value}`,
    cells: [cell],
    banaRefs: ['6.3', '6.4', ...(inputState.mode?.startsWith?.('english-letter') ? ['10.3'] : [])],
    action: 'insert-token',
    args: {
      name: 'mi',
      value: capital ? value.toUpperCase() : value,
      ...(inputState.mode?.startsWith?.('english-letter') ? {
        dataAttributes: {
          'data-omniya-nemeth-intent': 'english-letter',
          'data-omniya-nemeth-cells': `⠰${capital ? '⠠' : ''}${cell}`
        }
      } : {}),
      ...(typeform ? {
        dataAttributes: {
          'data-omniya-nemeth-intent': `typeform-${typeform}`,
          'data-omniya-nemeth-cells': `${typeformPrefix}${capital ? '⠠' : ''}${cell}`
        }
      } : {})
    }
  };
}

function insertTallyMarks(document, focus, state, count) {
  const tally = MAPPINGS.find((mapping) => mapping.id === 'misc.tally');
  let result = { status: 'applied', document, focus, inputState: { ...state, prefix: '' } };
  for (let index = 0; index < count; index += 1) {
    result = applyMapping(result.document, result.focus, { ...result.inputState, prefix: '' }, tally);
    if (result.status === 'rejected') return result;
  }
  return result;
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
  // Rule 15.16.1 continues a decimal after a completed overscripted digit
  // (example 15-78). Digits typed while focused on the closed mover, or on
  // the math root whose last child is that mover, belong to the surrounding
  // numeric item as a sibling continuation.
  if (!state.prefix && DIGITS.has(normalized)) {
    const focusNodeName = context.node.name;
    const lastChild = focusNodeName === 'math' ? context.node.children?.at(-1) : null;
    const continueFrom = ['mroot', 'mover', 'munder'].includes(focusNodeName)
      ? context.node
      : (lastChild && ['mroot', 'mover', 'munder'].includes(lastChild.name) ? lastChild : null);
    if (continueFrom) {
      return applyMapping(
        document,
        focusNode(continueFrom),
        { ...state, mode: 'numeric' },
        digitMapping(normalized)
      );
    }
  }
  // Rule 15 contracted bar after an ordinary letter/number (example 8-15).
  // Keep following operators/punctuation on the surrounding row: only the
  // bar itself uses the parallel-modifier continuation, and arithmetic or
  // Rule 8 punctuation must clear that mode before insertion.
  if (!state.prefix && normalized === '⠱' &&
    (context.node.name === 'mi' || context.node.name === 'mn') &&
    !isHole(context.node) &&
    state.mode !== 'multipurpose' &&
    !state.mode?.startsWith?.('modifier-')) {
    const bar = MAPPINGS.find((candidate) => candidate.id === 'modifier.bar-over');
    if (bar && mappingApplies(bar, context)) {
      return applyMapping(document, focus, { ...state, mode: null }, bar);
    }
  }
  // Rule 15.2.3 contracted under: after a letter or digit, `%` plus the
  // modifier symbol wraps only that atom. Do not steal Rule 15.6's binomial
  // lower-cell move, and do not open five-step mode without a multipurpose.
  const binomialLower = MAPPINGS.find((candidate) => candidate.id === 'binomial.lower');
  const binomialTable = hasAncestor(context.tree, context.node, 'mtable');
  if (!state.prefix && normalized === '⠩' &&
    (context.node.name === 'mi' || context.node.name === 'mn') &&
    !isHole(context.node) &&
    state.mode !== 'multipurpose' &&
    !state.mode?.startsWith?.('modifier-') &&
    binomialTable?.attrs?.['data-omniya-role'] !== 'binomial-table' &&
    !(binomialLower && mappingApplies(binomialLower, context))) {
    return {
      status: 'pending', document, focus,
      inputState: { ...state, prefix: normalized },
      announcement: 'Contracted under-modifier pending.'
    };
  }
  if (state.prefix === '⠩' &&
    (context.node.name === 'mi' || context.node.name === 'mn') &&
    !isHole(context.node) &&
    state.mode !== 'multipurpose' &&
    !state.mode?.startsWith?.('modifier-') &&
    binomialTable?.attrs?.['data-omniya-role'] !== 'binomial-table' &&
    (normalized === '⠱' || LETTERS.has(normalized) || DIGITS.has(normalized))) {
    const parent = findMathParent(context.tree, context.node.attrs?.['data-omniya-id']);
    const index = parent?.children.indexOf(context.node) ?? -1;
    if (!parent || index < 0) {
      return { status: 'rejected', document, focus, inputState: { ...state }, announcement: 'A contracted under-modifier has no parent expression.' };
    }
    const value = normalized === '⠱' ? '¯' : (LETTERS.get(normalized) ?? DIGITS.get(normalized));
    const wrapper = element('munder', [], { 'data-omniya-id': context.node.attrs['data-omniya-id'] });
    const base = structuredClone(context.node);
    base.attrs['data-omniya-id'] = id();
    wrapper.children.push(base, atom('mo', value, { 'data-omniya-role': 'underscript' }));
    parent.children[index] = wrapper;
    return {
      status: 'applied',
      localCommitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
      document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(context.tree), focus: focusNode(wrapper) },
      focus: focusNode(wrapper),
      inputState: { prefix: '', mode: 'modifier-parallel', modifierScope: null },
      announcement: 'modifier.contracted-under'
    };
  }
  if (state.mode === 'modifier-parallel' && !state.prefix &&
    (normalized === '⠬' || normalized === '⠤' || normalized === '⠸' || normalized === '⠲')) {
    return applyNemethCell({
      document,
      focus,
      inputState: { ...state, mode: null, modifierScope: null },
      cell: normalized
    });
  }
  // After a left double quote, `.k_0` is equals then indicated closer.
  if (state.prefix === '⠨⠅' && normalized === '⠸') {
    const parent = context.node.name !== 'math' ? findMathParent(context.tree, context.node.attrs?.['data-omniya-id']) : null;
    const index = parent?.children?.indexOf?.(context.node) ?? -1;
    const previous = index > 0 ? parent.children[index - 1] : null;
    const quoteFocus = context.node.attrs?.['data-omniya-nemeth-intent'] === 'punctuation-left-double-quote' ||
      context.node.children?.[0]?.text === '“' ||
      previous?.attrs?.['data-omniya-nemeth-intent'] === 'punctuation-left-double-quote' ||
      previous?.children?.[0]?.text === '“';
    if (quoteFocus) {
      const equals = MAPPINGS.find((candidate) => candidate.id === 'operator.equals');
      if (equals) {
        const committed = applyMapping(document, focus, { ...state, prefix: '' }, equals);
        if (committed.status !== 'rejected') {
          return applyNemethCell({
            document: committed.document,
            focus: committed.focus,
            inputState: committed.inputState,
            cell: normalized
          });
        }
      }
    }
  }
  // UEB literary passage/word modes admit neutral alphabetic cells without
  // changing the mathematical mode. Preserve the authored Braille cells on
  // speech-safe mtext so projection can reproduce the source exactly.

  if (!state.prefix && (state.mode === 'ueb-passage' || state.mode === 'ueb-word') && LETTERS.has(normalized)) {
    return applyMapping(document, focus, state, {
      id: `ueb-neutral.${LETTERS.get(normalized)}`,
      cells: [normalized],
      banaRefs: ['4.1', '4.2'],
      action: 'insert-token',
      commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
      args: { name: 'mtext', value: LETTERS.get(normalized), dataAttributes: {
        'data-omniya-nemeth-intent': state.mode,
        'data-omniya-nemeth-cells': normalized
      } }
    });
  }
  if (state.mode === null && (state.prefix === '⠘' || state.prefix === '⠰') &&
    (LETTERS.has(normalized) || DIGITS.has(normalized)) && isHole(context.node)) {
    const filled = fillEmptyLeftScript(context.tree, focus, state.prefix === '⠰' ? 'sub' : 'sup');
    if (filled) {
      return applyNemethCell({
        document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(filled.tree), focus: filled.focus },
        focus: filled.focus,
        inputState: { prefix: '', mode: null, modifierScope: state.modifierScope ?? null },
        cell: normalized
      });
    }
  }
  if (state.mode === null && state.prefix === '⠘' && LETTERS.has(normalized) &&
    (context.node.name === 'math' || isHole(context.node))) {
    const superscript = MATCHABLE_MAPPINGS.find((mapping) => mapping.id === 'script.superscript');
    const leftSuperscript = MAPPINGS.find((mapping) => mapping.id === 'script.left-superscript');
    return {
      status: 'choice',
      choices: [superscript, leftSuperscript].filter(Boolean).map(({ id, banaRefs }) => ({ operationId: id, label: id, banaRefs })),
      document, focus,
      inputState: { ...state, prefix: sequence },
      announcement: 'This local Nemeth prefix can begin a superscript or a left-superscript construction. Choose its meaning.'
    };
  }
  // Rule 20.3's crosshatch in a superscript (`~.#`) is the number-sign
  // operator in that script slot, not an italic numeric typeform.
  if (state.mode === null && state.prefix === '⠘⠨' && normalized === '⠼' &&
    ['mi', 'mn', 'mo'].includes(context.node.name) &&
    !hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
    const superscript = MAPPINGS.find((mapping) => mapping.id === 'script.superscript');
    const numberSign = MAPPINGS.find((mapping) => mapping.id === 'operator.number-sign');
    const opened = applyMapping(document, focus, { ...state, prefix: '' }, superscript);
    if (opened.status !== 'rejected' && numberSign) {
      const applied = applyMapping(opened.document, opened.focus, opened.inputState, numberSign);
      if (applied.status !== 'rejected') return applied;
    }
  }
  const inScript = Boolean(hasAncestor(context.tree, context.node,
    ['msup', 'msub', 'msubsup', 'mmultiscripts']));
  const inSimpleSubscript = Boolean(hasAncestor(context.tree, context.node, 'msub')) &&
    !Boolean(hasAncestor(context.tree, context.node, ['msubsup', 'mmultiscripts']));
  if (state.mode === null && state.prefix === '⠰' && normalized === '⠠' &&
    (context.node.name === 'math' || context.node.name === 'mspace' || isHole(context.node))) {
    return { status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠰⠠', mode: 'english-letter' },
      announcement: 'English-letter capital continuation pending.' };
  }
  if (state.mode?.startsWith?.('english-letter') && state.prefix === '⠰⠠' && LETTERS.has(normalized)) {
    return applyMapping(document, focus,
      { ...state, prefix: '', mode: 'english-letter:capital' },
      letterMapping(normalized, { ...state, prefix: '', mode: 'english-letter:capital' }));
  }
  // Dot 6 is held for one cell so an immediately following alphabetic cell
  // can form a bounded capital identifier. An explicit space proves the dot
  // 6 was punctuation instead; commit that local atom and then route the
  // space normally.
  if (state.mode === null && state.prefix === '⠠' && normalized === ' ') {
    const punctuation = MAPPINGS.find((mapping) => mapping.id === 'punctuation.comma');
    const applied = applyMapping(document, focus, { ...state, prefix: '' }, punctuation);
    if (applied.status === 'rejected') return applied;
    return applyNemethCell({ document: applied.document, focus: applied.focus, inputState: applied.inputState, cell: normalized });
  }
  // A multipurpose scope may begin with a capitalized identifier. Keep the
  // same two-cell dot-6 decision inside that scope so the capital atom also
  // extends the exact modifier operand range.
  if (state.mode === 'multipurpose' && !state.prefix && normalized === '⠠') {
    return {
      status: 'pending', document, focus,
      inputState: { ...state, prefix: normalized },
      announcement: 'Capital identifier cell pending in the modifier scope.'
    };
  }
  if (state.mode === 'multipurpose' && state.prefix === '⠠' && LETTERS.has(normalized)) {
    const capital = MAPPINGS.find((mapping) => mapping.id === `letter.capital-${LETTERS.get(normalized)}`);
    if (capital) return applyMapping(document, focus, state, capital);
  }
  // Rule 14.8.8: dot 6 before a symbol that does not itself change level
  // preserves the current script level.  It is therefore a local lookahead
  // boundary, not another subscript opener.  Keep only this one-cell state;
  // the next registered symbol is applied to the existing script row.
  if (state.mode === null && !state.prefix && normalized === '⠰' && inSimpleSubscript) {
    return {
      status: 'pending', document, focus,
      inputState: { ...state, mode: 'script-level-preserved' },
      announcement: 'Current script level preserved for the next symbol.'
    };
  }
  if (state.mode === 'script-level-preserved') {
    // Rule 8.3.2 / 14.8 geometry words: the level-preserving dot-6 before a
    // following letter is also the English-letter indicator for that word.
    // Stamp the indicator cells on the first letter so projection can restore
    // them after an explicit blank (for example `;polygon` after `reg4 `).
    if (!state.prefix && LETTERS.has(normalized)) {
      return applyMapping(
        document,
        focus,
        { ...state, prefix: '', mode: 'english-letter' },
        letterMapping(normalized, { ...state, prefix: '', mode: 'english-letter' })
      );
    }
    const localSequence = `${state.prefix}${normalized}`;
    const localCandidates = (PREFIXES.get(localSequence)?.mappings ?? [])
      .filter((mapping) => mappingApplies(mapping, context));
    const localContinues = MATCHABLE_MAPPINGS.some((mapping) =>
      mapping.cells.join('').startsWith(localSequence) && mapping.cells.length > localSequence.length &&
      mappingApplies(mapping, context));
    // Once the next cell cannot extend the held code, commit the completed
    // code and replay that cell at the same script level.  This is the
    // ordinary bounded longest-match rule, but it is important here because
    // `.k` is both a complete equals sign and a prefix of longer comparison
    // constructions.
    if (state.prefix && !localContinues) {
      const completed = (PREFIXES.get(state.prefix)?.mappings ?? [])
        .filter((mapping) => mappingApplies(mapping, context));
      if (completed.length === 1) {
        const committed = applyMapping(document, focus, { ...state, prefix: '', mode: null }, completed[0]);
        if (committed.status !== 'rejected') {
          return applyNemethCell({
            document: committed.document,
            focus: committed.focus,
            inputState: committed.inputState,
            cell: normalized
          });
        }
      }
      if (completed.length > 1) {
        return {
          status: 'choice', choices: completed.map((mapping) => ({
            operationId: mapping.id,
            label: mapping.id,
            banaRefs: mapping.banaRefs ?? []
          })), document, focus,
          inputState: { ...state, prefix: state.prefix },
          announcement: 'Choose the completed symbol that stays at the current script level.'
        };
      }
    }
    if (localCandidates.length === 1 && !localContinues) {
      return applyMapping(document, focus, { ...state, prefix: '', mode: null }, localCandidates[0]);
    }
    if (localCandidates.length > 1 && !localContinues) {
      return {
        status: 'choice', choices: localCandidates.map((mapping) => ({
          operationId: mapping.id,
          label: mapping.id,
          banaRefs: mapping.banaRefs ?? []
        })), document, focus,
        inputState: { ...state, prefix: localSequence },
        announcement: 'Choose the symbol that stays at the current script level.'
      };
    }
    if (localContinues || localSequence.length > 0) {
      return {
        status: 'pending', document, focus,
        inputState: { ...state, prefix: localSequence },
        announcement: 'A current-level symbol code is pending.'
      };
    }
  }
  // Horizontal grouping signs are local modifier operands. Their complete
  // two-cell code (for example `.(`) is valid only after the directly-over
  // or directly-under transition has opened a modifier slot. Resolve that
  // bounded registry row before the baseline grouping-prefix choices, which
  // otherwise see only the shared `(` cell and open an unrelated group.
  if ((state.mode === 'modifier-over' || state.mode === 'modifier-under') && state.prefix) {
    const localModifier = MAPPINGS.find((mapping) =>
      mapping.action === 'insert-modifier' && mapping.id.startsWith('modifier.horizontal-') &&
      mapping.cells.join('') === `${state.prefix}${normalized}`);
    if (localModifier) {
      return applyMapping(document, focus, { ...state, prefix: '' }, localModifier);
    }
    const slotToken = MAPPINGS.find((mapping) =>
      mapping.action === 'insert-token' &&
      mapping.cells.join('') === `${state.prefix}${normalized}` &&
      mappingApplies(mapping, context));
    if (slotToken && !hasApplicableContinuation(state.prefix, normalized, context) &&
      !MAPPINGS.some((mapping) => mapping.action === 'insert-modifier'
        && mapping.cells.join('') === `${state.prefix}${normalized}`)) {
      return applyMapping(document, focus, { ...state, prefix: '' }, {
        ...slotToken,
        action: 'insert-modifier',
        commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP
      });
    }
  }
  // A letter entered into an already-open script slot is an identifier atom,
  // not the beginning of an abbreviated function name. Function-name
  // lookahead is useful at a baseline row, but applying it here would hold
  // `t` as a possible `tan` prefix and make the following separator appear to
  // open another script. This context rule is shared by every script
  // construction, not a notation-specific exception.
  if (!state.prefix && state.mode === null && normalized === '⠎' && inScript) {
    const plural = MAPPINGS.find((mapping) => mapping.id === 'plural.s');
    if (plural && mappingApplies(plural, context)) return applyMapping(document, focus, state, plural);
  }
  if (!state.prefix && state.mode === null && LETTERS.has(normalized) && inScript) {
    return applyMapping(document, focus, state, letterMapping(normalized, state));
  }
  if (state.prefix === '⠸⠠' && normalized === '⠄' && !hasAncestor(context.tree, context.node, 'mstyle')) {
    return { status: 'rejected', document, focus, inputState: { ...state }, announcement: 'That local typeform code is invalid at this draft focus.' };
  }
  // Decimal-to-Greek boundary: after a completed decimal atom, a question
  // cell starts the local Greek-theta code rather than a new fraction. Handle
  // this before the shared prefix matcher so the structural boundary cannot
  // be claimed by the ordinary fraction opener.
  if (state.mode?.startsWith?.('numeric') && !state.prefix &&
      context.node.name === 'mn' && String(context.node.children?.[0]?.text ?? '').endsWith('.') &&
      normalized === '⠹') {
    return applyNemethCell({ document, focus, inputState: { ...state, mode: null }, cell: normalized });
  }
  // Rule 19 word-list examples use a lower-cell comma immediately after a
  // completed numeric suffix (for example `wed4,`). This is a local suffix
  // operation owned by that number, even though the numeric mode has already
  // cleared. It must not accept a comma after a decimal number.
  if (state.mode === null && !state.prefix && normalized === '⠂' && context.node.name === 'mn' &&
      !String(context.node.children?.[0]?.text ?? '').includes('.')) {
    return applyMapping(document, focus, { ...state, mode: null }, {
      id: 'punctuation.comma-after-number', cells: ['⠂'], banaRefs: ['19.1'],
      action: 'insert-token', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
      args: { value: ',', name: 'mo', dataAttributes: { 'data-omniya-nemeth-intent': 'punctuation-comma' } }
    });
  }
  // Function-name atoms such as `antilog` share prefixes with ordinary
  // letters. Once the first letter has already been inserted, an unmatched
  // continuation cell belongs to the registered bounded function code. Hold
  // only that local prefix and let its remaining cells complete or reject it
  // at Enter, without buffering the surrounding expression.
  if (!state.prefix && context.node.name === 'mi' && normalized === '⠁' &&
      !state.mode?.endsWith?.(':capital') && state.mode !== 'capital' &&
      BANA_FUNCTION_MAPPINGS.some((mapping) => mapping.cells.length > 1 && mapping.cells[0] === normalized && mappingApplies(mapping, context))) {
    return { status: 'pending', document, focus, inputState: { ...state, prefix: normalized }, announcement: 'Nemeth function code pending.' };
  }
  // Limit notation composes the same native under/over structure used by
  // ordinary MathJax navigation. A second BANA side indicator upgrades the
  // already-created local limit node and focuses only its missing slot.
  if (!state.prefix && (normalized === '⠣' || normalized === '⠩')) {
    const limit = hasAncestor(context.tree, context.node, ['mover', 'munder']);
    if (limit?.attrs?.['data-omniya-nemeth-intent'] === 'function-limit') {
      const existing = limit.children?.[1];
      // In the lower-limit spelling `%lim%n`, the second dot-5 is the
      // bounded lower-slot indicator, not a request to add an upper slot.
      // The slot is still empty at this point, so retain the native munder
      // and wait for exactly the next local operand.  This is the same
      // structural-followup model used by ordinary script slots and avoids
      // inventing a munderover hole for a one-sided limit.
      if (limit.name === 'munder' && isHole(existing) && normalized === '⠩') {
        return {
          status: 'pending', document, focus,
          inputState: { ...state, prefix: '', mode: 'function-limit-lower' },
          announcement: 'Lower limit slot is ready.'
        };
      }
      // `<lim` followed by the under-limit indicator is a one-sided lower
      // limit. Do not leave an invented overscript hole in the MathML; the
      // local follow-up changes the structure to native munder in place.
      if (limit.name === 'mover' && isHole(existing)) {
        const under = hole(limit, 'underscript');
        limit.name = 'munder';
        limit.children = [limit.children[0], under];
        return { status: 'applied', document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(context.tree), focus: focusNode(under) }, focus: focusNode(under), inputState: { ...state, prefix: '', mode: null }, announcement: 'function.limit.lower' };
      }
      const under = limit.name === 'munder' ? existing : hole(limit, 'underscript');
      const over = limit.name === 'mover' ? existing : hole(limit, 'overscript');
      limit.name = 'munderover';
      limit.children = [limit.children[0], under, over];
      return { status: 'applied', document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(context.tree), focus: focusNode(normalized === '⠩' ? under : over) }, focus: focusNode(normalized === '⠩' ? under : over), inputState: { ...state, prefix: '', mode: null }, announcement: 'function.limit.side' };
    }
  }
  if (state.mode === 'function-limit-lower' && !state.prefix &&
    (LETTERS.has(normalized) || DIGITS.has(normalized))) {
    const mapping = LETTERS.has(normalized)
      ? letterMapping(normalized, { ...state, mode: null })
      : digitMapping(normalized);
    return applyMapping(document, focus, { ...state, mode: null }, mapping);
  }
  // Rule 8 quotes the radical sign itself (`8>_0`) without a radicand.
  if (state.mode === null && !state.prefix && normalized === '⠜' &&
    context.node.name === 'mo' &&
    (context.node.attrs?.['data-omniya-nemeth-intent'] === 'punctuation-left-double-quote' ||
      context.node.children?.[0]?.text === '“')) {
    return applyMapping(document, focus, state, {
      id: 'radical.sign',
      cells: ['⠜'],
      banaRefs: ['8.2', '16.1'],
      action: 'insert-token',
      commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
      args: {
        name: 'mo',
        value: '√',
        dataAttributes: {
          'data-omniya-nemeth-intent': 'radical-sign',
          'data-omniya-nemeth-cells': '⠜'
        }
      }
    });
  }
  // An indexed radical with a letter order is one bounded local construction
  // (`<n>`). Hold only the opener plus that single index letter until its
  // closing cell arrives. This is not an expression buffer and cannot absorb
  // a second mathematical token.
  if (state.prefix === '⠣' && LETTERS.has(normalized) &&
    (context.node.name === 'math' || isHole(context.node)) &&

    // A letter-index radical is the fallback meaning of the bare `<` cell.
    // Do not take that fallback while a longer registered construction (for
    // example `<lim`) begins with the same two cells.  Consult the exact
    // registry rows here rather than a broad prefix test so this remains a
    // declarative, bounded disambiguation.
    !BANA_LIMIT_MAPPINGS.some((mapping) => mapping.cells.length > 2 &&
      mapping.cells[0] === '⠣' && mapping.cells[1] === normalized)) {
    const opener = MAPPINGS.find((mapping) => mapping.id === 'radical.indexed');
    if (opener) {
      const opened = applyMapping(document, focus, { ...state, prefix: '' }, opener);
      if (opened.status === 'applied') {
        return applyNemethCell({ document: opened.document, focus: opened.focus,
          inputState: opened.inputState, cell: normalized });
      }
    }
  }
  if (state.mode?.startsWith?.('typeform:') && state.prefix === '⠠' && LETTERS.has(normalized)) {
    const capital = MAPPINGS.find((candidate) => candidate.id === 'indicator.capital');
    if (capital) {
      const activated = applyMapping(document, focus, { ...state, prefix: '' }, capital);
      if (activated.status !== 'rejected') {
        return applyNemethCell({ document: activated.document, focus: activated.focus, inputState: activated.inputState, cell: normalized });
      }
    }
  }
  // Rule 23.17's double-struck capital (`,_,n`) uses the capital indicator
  // in place of the English-letter cell. Keep the barred typeform mode and
  // replay this one capital cell.
  if (state.mode === null && state.prefix === '⠠⠸' && normalized === '⠠') {
    const barred = MAPPINGS.find((mapping) => mapping.id === 'typeform.barred');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, barred);
    if (activated.status !== 'rejected') {
      return applyNemethCell({
        document: activated.document,
        focus: activated.focus,
        inputState: activated.inputState,
        cell: normalized
      });
    }
  }

  // Rule 8.3's English capital after a literary apostrophe (`,',J`) holds the
  // three-cell prefix `⠠⠄⠠` and then the letter. Without this local hold,
  // `⠠⠄` would replay as ditto/prime and open a fresh capital letter.
  if (state.mode === null && state.prefix === '⠠⠄' && normalized === '⠠') {
    return {
      status: 'pending',
      document,
      focus,
      inputState: { ...state, prefix: '⠠⠄⠠', mode: null },
      announcement: 'Nemeth sequence may continue.'
    };
  }
  if (state.mode === null && state.prefix === '⠠⠄⠠' && LETTERS.has(normalized)) {
    const letter = LETTERS.get(normalized);
    return applyMapping(document, focus, { ...state, prefix: '', mode: null }, {
      id: 'letter.english-capital-apostrophe',
      cells: ['⠠', '⠄', '⠠', normalized],
      banaRefs: ['8.3', '6.1'],
      action: 'insert-token',
      commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
      args: {
        name: 'mi',
        value: letter.toUpperCase(),
        sourceNotation: `,',${letter}`,
        dataAttributes: {
          'data-omniya-nemeth-intent': 'english-letter',
          'data-omniya-nemeth-cells': `⠠⠄⠠${normalized}`
        }
      },
      commandLabel: `letter.english-capital-${letter}`,
      validContexts: ['empty-root', 'row', 'structure-slot'],
      errataRefs: []
    });
  }

  // Function-name constructions are bounded atoms, but their ordinary
  // letter prefixes may be entered one cell at a time. If a pending prefix
  // has no applicable registered continuation for the next cell, commit the
  // already-held single-letter immediates and reprocess that cell. This is a
  // local prefix boundary, never a word or expression parser.
  if (state.mode === null && state.prefix === '⠐' && normalized === '⠠' &&
    !hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
    const indicator = PREFIXES.get('⠐')?.mappings?.find((mapping) => mapping.id === 'indicator.multipurpose');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, indicator);
    if (activated.status !== 'rejected') {
      return applyNemethCell({ document: activated.document, focus: activated.focus,
        inputState: activated.inputState, cell: normalized });
    }
  }
  // Five-step `".,s` holds `"`. as a Greek prefix. Once capitalization
  // arrives, the leading multipurpose still owns the collected expression.
  if (state.mode === null && state.prefix === '⠐⠨' && normalized === '⠠' &&
    !hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
    const indicator = PREFIXES.get('⠐')?.mappings?.find((mapping) => mapping.id === 'indicator.multipurpose');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, indicator);
    if (activated.status !== 'rejected') {
      let replay = applyNemethCell({
        document: activated.document, focus: activated.focus, inputState: activated.inputState, cell: '⠨'
      });
      if (replay.status !== 'rejected') {
        replay = applyNemethCell({
          document: replay.document, focus: replay.focus, inputState: replay.inputState, cell: normalized
        });
      }
      if (replay.status !== 'rejected') return replay;
    }
  }
  // Five-step `" .%` / `" .+` is multipurpose plus the complete union or
  // intersection operator, not an under-opener on a decimal point.
  if (state.mode === null && state.prefix === '⠐⠨' && (normalized === '⠩' || normalized === '⠬') &&
    !hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
    const indicator = PREFIXES.get('⠐')?.mappings?.find((mapping) => mapping.id === 'indicator.multipurpose');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, indicator);
    const operator = MAPPINGS.find((mapping) => mapping.id === (normalized === '⠩' ? 'operator.intersection' : 'operator.union'));
    if (activated.status !== 'rejected' && operator) {
      const applied = applyMapping(
        activated.document,
        activated.focus,
        { ...activated.inputState, prefix: '', mode: 'multipurpose' },
        operator
      );
      if (applied.status !== 'rejected') return applied;
    }
  }
  if (state.mode !== 'numeric-function-prefix' && state.prefix && (normalized === '⠨' || normalized === '⠠') && [...state.prefix].every((prefixCell) =>
    LETTERS.has(prefixCell) &&
    (PREFIXES.get(prefixCell)?.mappings ?? []).some((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE && mappingApplies(mapping, context))) &&
    !(PREFIXES.get(state.prefix)?.mappings ?? []).some((mapping) =>
      mapping.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE && mappingApplies(mapping, context)) &&
    !hasApplicableContinuation(state.prefix, normalized, context)) {
    let replayDocument = document;
    let replayFocus = focus;
    for (const prefixCell of [...state.prefix]) {
      const mapping = (PREFIXES.get(prefixCell)?.mappings ?? []).find((candidate) => candidate.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE && mappingApplies(candidate, context));
      const applied = applyMapping(replayDocument, replayFocus, { ...state, prefix: '' }, mapping);
      if (applied.status === 'rejected') break;
      replayDocument = applied.document;
      replayFocus = applied.focus;
    }
    return applyNemethCell({ document: replayDocument, focus: replayFocus, inputState: { ...state, prefix: '' }, cell: normalized });
  }
  if (state.mode?.startsWith?.('english-letter') && state.prefix === '⠠' && LETTERS.has(normalized)) {
    const capital = MAPPINGS.find((candidate) => candidate.id === 'indicator.capital');
    if (capital) {
      const activated = applyMapping(document, focus, { ...state, prefix: '' }, capital);
      if (activated.status !== 'rejected') {
        return applyNemethCell({
          document: activated.document,
          focus: activated.focus,
          inputState: { ...activated.inputState, mode: 'english-letter:capital' },
          cell: normalized
        });
      }
    }
  }

  // After a fraction terminator the writer is focused on the denominator
  // slot so that it can be filled next. A following blank is the ordinary
  // expression separator after the completed fraction, not denominator
  // content. Return to the fraction node for this one local boundary and
  // reprocess the same blank there. This keeps `?33# xy` compositional and
  // does not introduce a delimiter stack or passage parser.
  if (!state.prefix && normalized === ' ' && isHole(context.node) &&
    context.node.attrs?.['data-omniya-role'] === 'denominator') {
    const fraction = ancestor(context.tree, context.node, ['mfrac']);
    if (fraction) {
      // A denominator hole is a required slot, but a user-entered blank after
      // the fraction terminator is its explicit separator. Materialize the
      // denominator as a harmless empty row so the saved draft is complete,
      // then continue the separator in the surrounding row. This preserves
      // local editability without inventing an operand or widening scope.
      const holeNode = context.node;
      if (holeNode.children?.length === 1 && holeNode.children[0]?.name === 'mspace') {
        delete holeNode.attrs['data-omniya-hole'];
        delete holeNode.attrs['data-omniya-owner'];
        delete holeNode.attrs['data-omniya-role'];
      }
      const materializedDocument = {
        ...document,
        mathml: serializeMathML(context.tree)
      };
      return applyNemethCell({
        document: materializedDocument,
        focus: focusNode(fraction),
        inputState: { ...state, mode: null },
        cell: normalized
      });
    }
  }

  // Function names are bounded atomic sequences. If a held function prefix
  // is complete and the next cell cannot continue any registered name,
  // commit that one function and reprocess the next local cell. This keeps
  // `root1`, `sin x`, and similar constructions compositional without an
  // expression-sized buffer.
  if (state.prefix) {
    // A plus sign can be the prefix of a longer local fraction code, but
    // when its next cell is a lower-cell digit BANA uses the same immediate
    // signed-number transition as a committed plus followed by that digit.
    // Resolve only this one-cell suffix; do not retain an expression buffer.
    if ((state.prefix === '⠬' || state.prefix === '⠤') && DIGITS.has(normalized)) {
      const operator = MAPPINGS.find((candidate) => candidate.id === (state.prefix === '⠬' ? 'operator.plus' : 'operator.minus'));
      const applied = applyMapping(document, focus, { ...state, prefix: '' }, operator);
      if (applied.status !== 'rejected') {
        return applyNemethCell({
          document: applied.document,
          focus: applied.focus,
          inputState: applied.inputState,
          cell: normalized
        });
      }
    }
    if (state.prefix === '⠳' && DIGITS.has(normalized)) {
      const divides = MAPPINGS.find((candidate) => candidate.id === 'operator.divides');
      const applied = applyMapping(document, focus, { ...state, prefix: '' }, divides);
      if (applied.status !== 'rejected') {
        return applyNemethCell({
          document: applied.document,
          focus: applied.focus,
          inputState: applied.inputState,
          cell: normalized
        });
      }
    }
    if (state.prefix === '⠠⠄' && normalized === ' ' &&
      !hasAncestor(context.tree, context.node, 'mstyle')) {
      const ditto = MAPPINGS.find((candidate) => candidate.id === 'misc.ditto');
      const applied = applyMapping(document, focus, { ...state, prefix: '' }, ditto);
      if (applied.status !== 'rejected') {
        return applyNemethCell({
          document: applied.document,
          focus: applied.focus,
          inputState: applied.inputState,
          cell: normalized
        });
      }
    }
    if (!state.mode?.startsWith?.('numeric') &&
      state.prefix.length > 0 && [...state.prefix].every((prefixCell) => prefixCell === '⠸') &&
      ((normalized === '⠸' && state.prefix.length >= 2) || normalized === ' ') &&
      !hasApplicableContinuation(state.prefix, normalized, context)) {
      const inserted = insertTallyMarks(document, focus, state, state.prefix.length);
      if (inserted.status !== 'rejected') {
        return applyNemethCell({
          document: inserted.document,
          focus: inserted.focus,
          inputState: inserted.inputState,
          cell: normalized
        });
      }
    }
    const functionPrefix = BANA_FUNCTION_MAPPINGS.find((mapping) => mapping.cells.join('') === state.prefix && mappingApplies(mapping, context));
    const sequenceFunction = BANA_FUNCTION_MAPPINGS.find((mapping) => mapping.cells.join('') === sequence && mappingApplies(mapping, context));
    const functionContinues = BANA_FUNCTION_MAPPINGS.some((mapping) => mapping.cells.join('').startsWith(sequence) && mapping.cells.length > sequence.length && mappingApplies(mapping, context));
    // A registered abbreviation such as `cos` is only a function when its
    // bounded code ends here. If another letter follows and no registered
    // function continues the sequence (for example `cosine`), replay the
    // held cells as ordinary identifiers and reprocess this one cell. This
    // is a local disambiguation, not a word or expression buffer.
    if (!sequenceFunction && state.prefix.length > 1 && (!functionPrefix && !functionContinues || functionPrefix && !functionContinues) && LETTERS.has(normalized) && [...state.prefix].every((prefixCell) => LETTERS.has(prefixCell))) {
      let replayDocument = document;
      let replayFocus = focus;
      for (const prefixCell of [...state.prefix]) {
        const letter = LETTERS.get(prefixCell);
        if (!letter) break;
        const applied = applyMapping(replayDocument, replayFocus, { ...state, prefix: '', mode: null }, letterMapping(prefixCell, { ...state, mode: null }));
        if (applied.status === 'rejected') break;
        replayDocument = applied.document;
        replayFocus = applied.focus;
      }
      return applyNemethCell({
        document: replayDocument,
        focus: replayFocus,
        inputState: { ...state, prefix: '', mode: null },
        cell: normalized
      });
    }
    if (functionPrefix && !functionContinues) {
      const applied = applyMapping(document, focus, { ...state, prefix: '', mode: null }, functionPrefix);
      if (applied.status !== 'rejected') {
        // Rule 8 literary period after an abbreviated function (`min4`, `log4`)
        // must win before the bare lower-cell digit path can open a numeric
        // subscript on the just-committed function atom. After commit, focus is
        // no longer on that <mi>, so replaying ⠲ alone would miss the mi-scoped
        // literary check and become numeral 4.
        if (normalized === '⠲') {
          const literary = MAPPINGS.find((candidate) => candidate.id === 'punctuation.literary-period');
          if (literary) {
            const withPeriod = applyMapping(applied.document, applied.focus, applied.inputState, literary);
            if (withPeriod.status !== 'rejected') return withPeriod;
          }
        }
        return applyNemethCell({ document: applied.document, focus: applied.focus, inputState: applied.inputState, cell: normalized });
      }
    }

  }

  // A fraction opener can be entered while focus is on the surrounding row;
  // its next lower-cell digit or separator belongs to the numerator slot.
  // Resolve this before the ordinary digit mapping claims the same cell.
  if (!state.prefix && normalized === '⠂' && context.node.name === 'mfrac') {
    const numerator = context.node.children?.[0];
    if (numerator?.attrs?.['data-omniya-hole'] === 'true') {
      return applyMapping(document, focusNode(numerator), state,
        MAPPINGS.find((mapping) => mapping.id === 'fraction.next.denominator'));
    }
  }

  // Rule 13.2 diagonal fraction notation can follow a completed numerator
  // without an explicit opener. The two cells are one structural follow-up
  // over the focused numerator, not a slash token followed by a stray digit.
  if (state.mode === 'numeric' && state.prefix === '⠸' && normalized === '⠌' && context.node.name === 'mn') {
    const parent = findMathParent(context.tree, context.node.attrs?.['data-omniya-id']);
    if (parent && ['math', 'mrow'].includes(parent.name)) {
      const fraction = element('mfrac', [], { 'data-omniya-fraction-kind': 'simple', bevelled: 'true', 'data-omniya-nemeth-cells': '⠼⠂⠸⠌' });
      const numerator = structuredClone(context.node);
      numerator.attrs['data-omniya-id'] = id();
      fraction.children.push(numerator, hole(fraction, 'denominator'));
      parent.children[parent.children.indexOf(context.node)] = fraction;
      return { status: 'applied', document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(context.tree), focus: focusNode(fraction.children[1]) }, focus: focusNode(fraction.children[1]), inputState: { ...state, prefix: '', mode: null }, announcement: 'fraction.denominator' };
    }
  }

  // BANA 3.2.3 permits a decimal point plus lower-cell digit after an
  // operator without repeating the numeric indicator (`#.1+.2`). Once the
  // plus/minus token has ended the preceding numeric run, resolve this
  // two-cell local decimal before the shared dot-4 radical/indicator prefix.
  // The scope is deliberately limited to a baseline operator, so it cannot
  // alter indexed radicals or script-level dot-4 meanings.
  if (state.mode === null && state.prefix === '⠨' && DIGITS.has(normalized) &&
    (context.node.name === 'mspace' ||
      (context.node.name === 'math' && context.node.children?.at(-1)?.name === 'mspace') ||
      (context.node.name === 'mo' && (
        ['+', '−', '-', '±', '='].includes(context.node.children?.[0]?.text) ||
        POST_OPERATOR_LOWER_CELL.includes(context.node.children?.[0]?.text)
      )))) {
    const decimal = applyMapping(document, focus, { ...state, prefix: '' }, numericPunctuationMapping('⠨', '.', '3.2.3'));
    if (decimal.status !== 'rejected') {
      return applyNemethCell({
        document: decimal.document,
        focus: decimal.focus,
        inputState: { ...decimal.inputState, mode: 'numeric' },
        cell: normalized
      });
    }
  }

  // Rule 19.10's final local denominator uses a lower-cell digit immediately
  // after the division sign (`./3`). The division sign is already a complete
  // local operator, so the following digit must be inserted directly rather
  // than rejected for lacking a fresh number sign. This is a one-cell
  // structural follow-up, not numeric passage buffering.
  if (state.mode === null && !state.prefix && DIGITS.has(normalized) &&
    context.node.name === 'mo' && context.node.children?.[0]?.text === '÷') {
    const digit = digitMapping(normalized);
    digit.args = { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } };
    return applyMapping(document, focus, state, digit);
  }

  // A leading dot-4 decimal marker after a relation is a new numeric item.
  // Resolve this before shared comparison prefixes such as ."k, because the
  // preceding focused operator is the local context that disambiguates it.
  // Rule 13.8.2 has a finite three-dot prefix that overlaps the ordinary
  // punctuation/capital indicators. Resolve only the published fraction
  // opener here, before generic prefix choices, and leave all other meanings
  // to the normal local matcher.
  if (state.mode === null && state.prefix === '⠠⠠⠠' && normalized === '⠹') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'fraction.start.hypercomplex.order3');
    if (mapping) return applyMapping(document, focus, { ...state, prefix: '' }, mapping);
  }

  // BANA 24.1: letter/largeop/single-letter-number followed by multipurpose
  // then a decimal point is a baseline number (X".6), not radical order.
  if (state.mode === null && state.prefix === '⠐' && normalized === '⠨'
    && !hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])
    && (context.node.name === 'mi'
      || (context.node.name === 'mn'
        && context.node.attrs?.['data-omniya-nemeth-intent'] === 'single-letter-number')
      || (context.node.name === 'mo'
        && context.node.attrs?.['data-omniya-nemeth-cells']
        && !['<', '>', '=', '≤', '≥', '≠', '≡', '⊂', '⊃', '∶'].includes(context.node.children?.[0]?.text)))) {
    const indicator = PREFIXES.get('⠐')?.mappings?.find((mapping) => mapping.id === 'indicator.multipurpose');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, indicator);
    if (activated.status !== 'rejected') {
      const decimal = numericPunctuationMapping('⠨', '.', '3.2.3');
      const next = applyMapping(activated.document, activated.focus, { ...activated.inputState, mode: 'multipurpose' }, {
        ...decimal,
        args: {
          ...decimal.args,
          dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' }
        }
      });
      if (next.status !== 'rejected') {
        return { ...next, announcement: `${activated.announcement}; ${next.announcement}` };
      }
    }
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
  // that next local atom and annotates the source role. A following number
  // sign belongs to that same reference atom (`]#1`), never a new numeric
  // passage.
  if (state.mode === 'reference' && !state.prefix && normalized === '⠼') {
    return {
      status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠼' },
      announcement: 'Nemeth general reference numeric indicator pending.'
    };
  }
  if (state.mode === 'reference' && (!state.prefix || state.prefix === '⠰' || state.prefix === '⠼')) {
    const referencePrefix = state.prefix === '⠰' || state.prefix === '⠼' ? state.prefix : '';
    if (LETTERS.has(normalized) && state.prefix !== '⠼') {
      return applyMapping(document, focus, { ...state, mode: null }, {
        id: `reference.letter.${LETTERS.get(normalized)}`,
        cells: [normalized],
        banaRefs: ['9.2', '6.3'],
        action: 'insert-token',
        commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
        args: { name: 'mi', value: LETTERS.get(normalized), dataAttributes: { 'data-omniya-nemeth-intent': 'general-reference', 'data-omniya-nemeth-cells': `⠈⠻${referencePrefix}${normalized}` } }
      });
    }
    if (DIGITS.has(normalized)) {
      return applyMapping(document, focus, { ...state, mode: null }, {
        id: `reference.number.${DIGITS.get(normalized)}`,
        cells: [normalized],
        banaRefs: ['9.2', '3.1.2'],
        action: 'insert-numeric',
        commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
        args: { value: DIGITS.get(normalized), dataAttributes: { 'data-omniya-nemeth-intent': 'general-reference', 'data-omniya-nemeth-cells': `⠈⠻${referencePrefix}${normalized}` } }
      });
    }
  }

  const localPreviousComma = context.node.attrs?.['data-omniya-nemeth-intent'] === 'punctuation-comma' ||
    context.node.attrs?.['data-omniya-nemeth-cells'] === '⠂' ||
    context.node.children?.at?.(-1)?.attrs?.['data-omniya-nemeth-cells'] === '⠂' ||
    context.node.children?.at?.(-1)?.attrs?.['data-omniya-nemeth-intent'] === 'punctuation-comma';
  if (!state.prefix && localPreviousComma && DIGITS.has(normalized)) {
    return applyMapping(document, focus, { ...state, mode: null }, {
      id: `number.after-comma.${DIGITS.get(normalized)}`, cells: [normalized], banaRefs: ['9.3.2'],
      action: 'insert-numeric', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
      args: { value: DIGITS.get(normalized), dataAttributes: { 'data-omniya-nemeth-intent': 'numeric-start' } }
    });
  }
  if (!state.prefix && normalized === ' ' &&
      hasAncestor(context.tree, context.node, 'msup')) {
    const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
    if (baseline) {
      const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
      if (returned.status !== 'rejected') {
        // The blank is both the local level boundary and authored spacing in
        // the surrounding row. The baseline transition moves focus out of the
        // superscript; replay the same blank once at that returned focus so it
        // is not silently consumed before the following lower-cell numeral.
        return applyNemethCell({
          document: returned.document,
          focus: returned.focus,
          inputState: { ...returned.inputState, mode: null },
          cell: normalized
        });
      }
    }
  }
  // A numeric subscript such as `log10` omits the level indicator. An
  // authored blank after that completed lower-cell atom is the baseline
  // boundary before the next item, not a space inside the subscript.
  if (!state.prefix && normalized === ' ' && context.node.name === 'mn') {
    const subscript = ancestor(context.tree, context.node, ['msub']);
    if (subscript && subscript.children?.[1] === context.node) {
      const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
      if (baseline) {
        const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
        if (returned.status !== 'rejected') {
          return applyNemethCell({
            document: returned.document,
            focus: returned.focus,
            inputState: { ...returned.inputState, mode: null },
            cell: normalized
          });
        }
      }
    }
  }
  // A selected baseline-return indicator has already moved focus to the
  // surrounding row. Consume the immediately following local cell there;
  // retaining `baseline` would leave the numeric operand rejected and drop
  // the authored `⠐⠆⠴` continuation.
  if (state.mode === 'baseline' && !state.prefix) {
    return applyNemethCell({ document, focus, inputState: { ...state, mode: null }, cell: normalized });
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
  const exactImmediate = (PREFIXES.get(sequence)?.mappings ?? [])
    .some((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE &&
      !mapping.args?.deferForAtomicContinuation && mappingApplies(mapping, context));
  const atomicContinuation = state.mode === null && !existingComparison && !exactImmediate && MATCHABLE_MAPPINGS.some((mapping) =>
    mapping.commitPolicy === LOCAL_COMMIT_POLICIES.ATOMIC_SEQUENCE &&
    mapping.cells.length > sequence.length &&
    mapping.cells.slice(0, sequence.length).join('') === sequence &&
    mappingApplies(mapping, context));
  // Complex/hypercomplex closers begin with the same cells as the capital
  // indicator. Hold that prefix when the containing fraction still needs its
  // registered terminator, rather than committing capitalization first.
  const structuralContinuation = state.mode === null && !existingComparison && !exactImmediate && MATCHABLE_MAPPINGS.some((mapping) =>
    mapping.commitPolicy === LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP &&
    mapping.cells.length > sequence.length &&
    mapping.cells.slice(0, sequence.length).join('') === sequence &&
    mappingApplies(mapping, context));
  const immediateBeforeContinuation = state.mode === null && (PREFIXES.get(sequence)?.mappings ?? [])
    .filter((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE && mapping.args?.allowImmediateBeforeContinuation)
    .filter((mapping) => !mapping.args?.deferForAtomicContinuation)
    .filter((mapping) => mappingApplies(mapping, context));
  if ((atomicContinuation || structuralContinuation) && immediateBeforeContinuation.length === 0) {
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
  if (state.mode === null && state.prefix === '⠐' && normalized === '⠌' &&
    openFractionNearFocus(context.tree, focus)) {
    const script = hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover']);
    if (script) {
      const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
      const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
      if (returned.status !== 'rejected') {
        return applyNemethCell({ document: returned.document, focus: returned.focus, inputState: returned.inputState, cell: normalized });
      }
    }
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'fraction.next.denominator.contracted');
    if (mapping) {
      const fraction = openFractionNearFocus(context.tree, focus);
      const denominator = fraction.children[1];
      return applyMapping(document, focusNode(denominator), { ...state, prefix: '' }, mapping);
    }
  }
  // In an explicitly grouped script, dot-5 followed by a fraction slash is
  // the local return from the exponent, not a request to open a new fraction
  // at the outer row. Preserve the authored one-cell return and continue
  // with the slash in the surrounding grouping slot.
  if (state.mode === null && state.prefix === '⠐' && normalized === '⠌' &&
    context.node.name === 'mrow' && hasAncestor(context.tree, context.node, ['msup', 'mrow'])) {
    const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
    const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
    if (returned.status !== 'rejected') {
      return applyNemethCell({ document: returned.document, focus: returned.focus, inputState: returned.inputState, cell: normalized });
    }
  }
  // In a scripted fraction denominator, dot-5 followed by the fraction
  // terminator is a two-step local return: leave the script slot, then close
  // the containing fraction. Resolve the baseline first and reprocess only
  // this one terminator cell; do not let the shared number indicator create a
  // new numeric item.
  if (state.mode === null && state.prefix === '⠐' && normalized === '⠼' &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover'])) {
    const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
    const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
    if (returned.status !== 'rejected') {
      return applyNemethCell({ document: returned.document, focus: returned.focus, inputState: returned.inputState, cell: normalized });
    }
  }
  // Rule 15.4 can follow a scripted numeric atom. Dot-5 first returns from
  // the script, then the same directly-over/under cell opens the modifier in
  // the surrounding row. Both steps are local structural follow-ups.
  if (state.mode?.startsWith?.('numeric') && state.prefix === '⠐' &&
    (normalized === '⠣' || normalized === '⠩') &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
    const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
    const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
    if (returned.status !== 'rejected') {
      return applyNemethCell({ document: returned.document, focus: returned.focus,
        inputState: returned.inputState, cell: normalized });
    }
  }
  if (state.mode === null && state.prefix === '⠣' && normalized === '⠱' &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
    const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
    const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
    if (returned.status !== 'rejected') {
      const bar = MAPPINGS.find((candidate) => candidate.id === 'modifier.bar-over');
      if (bar) return applyMapping(returned.document, returned.focus,
        { ...returned.inputState, mode: 'modifier-over', prefix: '' }, bar);
    }
  }
  // A number sign immediately after a signed baseline operator is the local
  // numeric indicator for the following digit. Resolve it before the shared
  // choice table can treat the same cell as a fraction terminator.
  if (state.mode === 'signed-numeric' && !state.prefix && normalized === '⠼') {
    const indicator = applyMapping(document, focus, state, MAPPINGS.find((candidate) => candidate.id === 'indicator.number'));
    // Keep the signed-number phase through the indicator. The next digit
    // owns the explicit source intent that distinguishes `−#3` from an
    // ordinary isolated number; collapsing to generic numeric mode here
    // loses that bounded provenance before insertion.
    if (indicator.status === 'pending') {
      return { ...indicator, inputState: { ...indicator.inputState, mode: 'signed-numeric-indicator' } };
    }
    return indicator;
  }
  // A lower-cell numeric run in a fraction numerator ends with the ordinary
  // fraction terminator. Resolve that local structural follow-up before the
  // shared number-indicator mapping can claim the same cell. The transition
  // only consults the nearest containing fraction and moves to its existing
  // denominator hole, never a wider expression.
  if (state.mode?.startsWith?.('numeric') && !state.prefix && normalized === '⠼') {
    const fraction = fractionAtFocus(context.tree, context.node);
    const numerator = fraction?.children?.[0];
    const denominator = fraction?.children?.[1];
    if (fraction && numerator && denominator && isHole(denominator) && contains(context.tree, numerator, context.node)) {
      // BANA's short `?numerator#` form closes a fraction with an empty
      // denominator. Materialize that required child as an empty editable row
      // and return to the surrounding baseline. A later local token then
      // becomes a sibling, exactly as the printed construction indicates.
      delete denominator.attrs['data-omniya-hole'];
      delete denominator.attrs['data-omniya-owner'];
      delete denominator.attrs['data-omniya-role'];
      const parent = findMathParent(context.tree, fraction.attrs['data-omniya-id']);
      const materialized = { ...document, mathml: serializeMathML(context.tree) };
      return { status: 'applied', document: materialized, focus: focusNode(parent ?? fraction), inputState: { ...state, mode: null, prefix: '' }, announcement: 'fraction.end.simple' };
    }
  }
  // The same fraction terminator is a local close when the denominator is an
  // empty materialized row. Keep the MathML fraction, but return focus to its
  // parent and retain the source boundary so the projection emits `#` rather
  // than an extra denominator line indicator.
  if (!state.prefix && normalized === '⠼' && context.node.name === 'mrow' &&
    context.node.children?.length === 1 && context.node.children[0]?.name === 'mspace' &&
    context.node.attrs?.['data-omniya-role'] === undefined &&
    ancestor(context.tree, context.node, ['mfrac'])) {
    const fraction = ancestor(context.tree, context.node, ['mfrac']);
    const parent = findMathParent(context.tree, fraction.attrs['data-omniya-id']);
    return { status: 'applied', document, focus: focusNode(parent ?? fraction), inputState: { ...state, prefix: '', mode: null }, announcement: 'fraction.end.simple' };
  }

  // Numeric bases and abbreviated functions share their initial letters
  // (for example, t may begin either a base-ten digit run or `tan`). Keep
  // only that short, registry-bounded ambiguity pending. A complete
  // function commits as one local construction; a prefix that cannot become
  // a function falls back to the existing base-digit operation, then the
  // current cell is reprocessed normally. This is intentionally local and
  // bounded by the longest registered function name.
  if (state.mode === 'numeric-function-prefix' && state.prefix) {
    const candidate = `${state.prefix}${normalized}`;
    const functions = BANA_FUNCTION_MAPPINGS.filter((mapping) => mappingApplies(mapping, context));
    const exact = functions.filter((mapping) => mapping.cells.join('') === candidate);
    const continues = functions.some((mapping) => mapping.cells.join('').startsWith(candidate) && mapping.cells.length > candidate.length);
    if (exact.length || continues) {
      if (exact.length && !continues) {
        return applyMapping(document, focus, { ...state, prefix: candidate, mode: null }, exact[0]);
      }
      return {
        status: 'pending', document, focus,
        inputState: { ...state, prefix: candidate },
        announcement: 'Nemeth function code pending.'
      };
    }
    // The held prefix itself may already be a complete function while the
    // next cell starts another local operation (normally the required blank
    // before its argument). Commit that one function and reprocess the next
    // cell against the new focus. This is the same bounded longest-match rule
    // used by the registry everywhere else.
    const completed = functions.find((mapping) => mapping.cells.join('') === state.prefix);
    if (completed) {
      const applied = applyMapping(document, focus, { ...state, prefix: '', mode: null }, completed);
      if (applied.status !== 'rejected') {
        return applyNemethCell({
          document: applied.document,
          focus: applied.focus,
          inputState: applied.inputState,
          cell: normalized
        });
      }
    }
    const current = contextFor(document, focus);
    let fallbackTree = current.tree;
    let fallbackFocus = focus;
    for (const prefixCell of [...state.prefix]) {
      const letter = LETTERS.get(prefixCell);
      if (!letter) return {
        status: 'rejected', document, focus, inputState: state,
        announcement: 'That local numeric/function prefix is invalid.'
      };
      const inserted = insertBaseDigit(
        fallbackTree,
        fallbackFocus,
        letter,
        current.node.name === 'mn' ? {} : { 'data-omniya-nemeth-intent': 'numeric-start' }
      );
      fallbackTree = inserted.tree;
      fallbackFocus = inserted.focus;
    }
    const fallbackDocument = {
      formatVersion: MATH_FORMAT_VERSION,
      mathml: serializeMathML(fallbackTree),
      focus: fallbackFocus
    };
    return applyNemethCell({
      document: fallbackDocument,
      focus: fallbackFocus,
      inputState: { ...state, prefix: '', mode: 'numeric' },
      cell: normalized
    });
  }

  // BANA fraction numerators may begin with lower-cell digits immediately
  // after the opener (`?12/`). The fraction itself supplies the numeric
  // context, so start the bounded numeric run only in that required slot.
  if (state.mode === 'keystroke-numeric' && !state.prefix && DIGITS.has(normalized)) {
    const digit = digitMapping(normalized);
    digit.args = { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } };
    return applyMapping(document, focus, { ...state, mode: 'numeric' }, digit);
  }
  if (state.mode === null && !state.prefix && DIGITS.has(normalized) &&
    context.node.attrs?.['data-omniya-hole'] === 'true' &&
    ancestor(context.tree, context.node, 'mfrac')?.attrs?.['data-omniya-fraction-kind']) {
    const digit = digitMapping(normalized);
    if (hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
      digit.args = { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } };
    }
    return applyMapping(document, focus, { ...state, mode: 'numeric' }, digit);
  }
  // Rule 8 left double quote shares digit-8. Prefer the quote at an empty
  // root or after an authored blank/comma so `8>_0` stays a quotation.
  if (state.mode === null && !state.prefix && normalized === '⠦' &&
    ((context.node.name === 'math' && !(context.node.children?.length > 0)) ||
      context.node.name === 'mspace' ||
      context.node.attrs?.['data-omniya-nemeth-intent'] === 'punctuation-comma')) {
    const quote = MAPPINGS.find((candidate) => candidate.id === 'punctuation.left-double-quote');
    if (quote) return applyMapping(document, focus, state, quote);
  }
  // BANA 6.4.5 permits a lower-cell numeral after a mathematical blank
  // inside a grouped expression without repeating the number indicator. This
  // is one bounded numeric atom at the current row boundary, not a passage
  // buffer. Keep the temporary numeric mode only for the digit run.
  if (state.mode === null && !state.prefix && DIGITS.has(normalized) &&
    (context.node.name === 'mspace' || (isHole(context.node) && hasAncestor(context.tree, context.node, 'mrow')))) {

    const digit = digitMapping(normalized);
    digit.args = { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } };
    return applyMapping(document, focus, { ...state, mode: 'numeric' }, digit);
  }
  // A lower-cell numeral may also begin immediately after a relation or
  // arithmetic operator in the same mathematical expression (`... +3 cos`)
  // without reopening a numeric passage. Keep this one digit local and mark
  // it for the source-intent Braille projection; no surrounding operands are
  // inferred.
  if (state.mode === null && !state.prefix && DIGITS.has(normalized) &&
    context.node.name === 'mo' && POST_OPERATOR_LOWER_CELL.includes(context.node.children?.[0]?.text)) {
    const digit = digitMapping(normalized);
    digit.args = { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } };
    return applyMapping(document, focus, { ...state, mode: 'numeric' }, digit);
  }
  // Spatial arithmetic and coefficients such as `2x` omit the numeric
  // indicator at an empty replacement root. Start one lower-cell numeric
  // atom there; a following letter leaves that mode as an identifier sibling.
  if (state.mode === null && !state.prefix && DIGITS.has(normalized) &&
    ['math', 'mrow'].includes(context.node.name) &&
    context.node.children?.length > 0 &&
    ['msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover'].includes(context.node.children.at(-1)?.name)) {
    const digit = digitMapping(normalized);
    digit.args = { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } };
    return applyMapping(document, focus, { ...state, mode: 'numeric' }, digit);
  }
  if (state.mode === null && !state.prefix && DIGITS.has(normalized) &&
    context.node.name === 'math' && !(context.node.children?.length > 0)) {
    const digit = digitMapping(normalized);
    digit.args = { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } };
    return applyMapping(document, focus, { ...state, mode: 'numeric' }, digit);
  }
  // Within a fraction slot, a lower-cell digit can continue the local
  // numerator/denominator item after an identifier (`n1`) without opening a
  // baseline numeric passage. The containing mfrac is the only context used.
  if (state.mode === null && !state.prefix && DIGITS.has(normalized)) {
    const fraction = hasAncestor(context.tree, context.node, 'mfrac');
    const numerator = fraction?.children?.[0];
    const denominator = fraction?.children?.[1];
    if ((numerator && contains(context.tree, numerator, context.node)) ||
        (denominator && contains(context.tree, denominator, context.node))) {
      return applyMapping(document, focus, { ...state, mode: 'numeric' }, digitMapping(normalized));
    }
  }
  // BANA relation abbreviations may be followed by one lower-cell numeral
  // as part of the same local label (`R1`, `R2`, ...). Scope this numeric
  // continuation to the relation token itself; it does not create a global
  // numeric passage mode.
  if (state.mode === null && !state.prefix && DIGITS.has(normalized) &&
    context.node.name === 'mi' && ['R', 'r'].includes(context.node.children?.[0]?.text)) {
    const result = applyMapping(document, focus, { ...state, mode: 'numeric' }, {
      ...digitMapping(normalized),
      args: { ...digitMapping(normalized).args, dataAttributes: { 'data-omniya-nemeth-intent': 'single-letter-number' } }
    });
    return result.status === 'applied'
      ? { ...result, inputState: { ...result.inputState, mode: null } }
      : result;
  }
  // Rule 6.3's single-letter criteria allow a lower-cell numeral immediately
  // after an ordinary one-letter identifier (for example `n1`, `n2`, `s1`).
  // This is a one-token contextual continuation, not a numeric passage: the
  // digit becomes its own <mn> sibling and the mode clears after that cell.
  // Keep the condition deliberately narrow so a digit never becomes an
  // implicit subscript or an expression-sized numeric buffer.
  if (state.prefix && normalized === '⠲') {
    const functions = BANA_FUNCTION_MAPPINGS.filter((mapping) =>
      mapping.cells.join('') === state.prefix && mappingApplies(mapping, context));
    if (functions.length === 1) {
      const committed = applyMapping(document, focus, { ...state, prefix: '' }, functions[0]);
      if (committed.status !== 'rejected') {
        return applyNemethCell({
          document: committed.document,
          focus: committed.focus,
          inputState: committed.inputState,
          cell: normalized
        });
      }
    }
  }
  if (state.mode === null && !state.prefix && normalized === '⠲' &&
    context.node.name === 'mi' &&
    (context.node.attrs?.['data-omniya-nemeth-intent'] === 'function-name' ||
      String(context.node.children?.[0]?.text ?? '').length > 1 ||
      (() => {
        const parent = findMathParent(context.tree, context.node.attrs?.['data-omniya-id']);
        const index = parent?.children?.indexOf?.(context.node) ?? -1;
        const previous = index > 0 ? parent.children[index - 1] : null;
        return previous?.name === 'mi' && /^[A-Za-z]$/.test(previous.children?.[0]?.text ?? '');
      })())) {
    const literary = MAPPINGS.find((candidate) => candidate.id === 'punctuation.literary-period');
    if (literary) return applyMapping(document, focus, state, literary);
  }
  // BANA numeric subscripts on abbreviated functions (`log10`) omit the
  // subscript indicator. The function atom is already committed; the digit
  // opens that one required subscript slot and starts a lower-cell run.
  if (state.mode === null && !state.prefix && DIGITS.has(normalized) &&
    context.node.name === 'mi' && context.node.attrs?.['data-omniya-nemeth-intent'] === 'function-name') {

    const script = MAPPINGS.find((candidate) => candidate.id === 'script.subscript');
    const opened = applyMapping(document, focus, state, script);
    if (opened.status !== 'rejected') {
      const digit = digitMapping(normalized);
      digit.args = { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } };
      return applyMapping(opened.document, opened.focus, { ...opened.inputState, mode: 'numeric' }, digit);
    }
  }
  if (state.mode === null && !state.prefix && DIGITS.has(normalized) &&
    context.node.name === 'mi' && /^[A-Za-z]$/.test(context.node.children?.[0]?.text ?? '')) {
    const digit = digitMapping(normalized);
    const result = applyMapping(document, focus, { ...state, mode: 'numeric' }, {
      ...digit,
      args: { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'single-letter-number' } }
    });
    // This is the one-cell lower numeral in a single-letter criterion, not a
    // continuing numeric passage. Clear the temporary mode immediately so a
    // following punctuation indicator is interpreted as punctuation rather
    // than as a numeric comma/decimal transition.
    return result.status === 'applied'
      ? { ...result, inputState: { ...result.inputState, mode: null } }
      : result;
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

  // A numeric indicator governs only the current lower-cell number.  A
  // script-level indicator is the explicit local boundary that follows that
  // number (for example `#2.;0~.p` in BANA Example 19-13).  Clear the
  // transient numeric mode before replaying the structural indicator so the
  // next registered local code can open the script and then insert its
  // operand.  A baseline-return cell after a numeric script operand is the
  // same local boundary. Leave ⠐ on a baseline numeral for Rule 24.1.g's
  // decimal-return transition. This is not expression parsing: it is the
  // same one-cell mode boundary used for every structural follow-up after a
  // numeric atom.
  if (state.mode?.startsWith?.('numeric') && !state.prefix &&
    (normalized === '⠘' || normalized === '⠰' || normalized === '⠻' || normalized === '⠾' ||
      (normalized === '⠐' && hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts']))) &&
    context.node.name === 'mn') {
    return applyNemethCell({
      document,
      focus,
      inputState: { ...state, mode: null },
      cell: normalized
    });
  }

  // Resolve a dot-4 lookahead held inside numeric mode.  A matching
  // nonnumeric registry row, such as the Greek theta code, consumes the
  // complete local sequence.  Rule 20.3's number-sign operator shares the
  // same first cell with the decimal point; when `⠨⠼` completes that row,
  // prefer the authored operator over inventing a decimal digit passage.
  // If no such row matches, commit the numeric decimal point and replay this
  // one cell as the next local operation.
  if (state.mode?.startsWith?.('numeric') && state.prefix === '⠨') {
    const candidate = `${state.prefix}${normalized}`;
    const complete = (PREFIXES.get(candidate)?.mappings ?? [])
      .filter((mapping) => mapping.id !== 'number.decimal-point')
      .filter((mapping) => mappingApplies(mapping, context));
    const allowed = DIGITS.has(normalized)
      ? complete.filter((mapping) => mapping.id.startsWith('greek.') || mapping.id === 'operator.number-sign')
      : complete;
    if (allowed.length === 1) {
      return applyMapping(document, focus, { ...state, prefix: '', mode: null }, allowed[0]);
    }
    const decimal = numericPunctuationMapping('⠨', '.', '3.2.3');
    const decimalMode = state.mode?.startsWith?.('numeric:') ? state.mode : 'numeric';
    const committed = applyMapping(document, focus, { ...state, prefix: '', mode: decimalMode }, decimal);
    if (committed.status !== 'rejected') {
      return applyNemethCell({
        document: committed.document,
        focus: committed.focus,
        inputState: committed.inputState.mode?.startsWith?.('numeric')
          ? committed.inputState
          : { ...committed.inputState, mode: decimalMode },
        cell: normalized
      });
    }
  }

  if (state.mode?.startsWith?.('numeric') && !state.prefix) {
    // In a numeric item, dot-4 is the punctuation indicator for a period
    // (`#1_4`). It shares its first cell with the tally symbol, so hold the
    // bounded punctuation prefix before the generic registry can commit the
    // tally meaning. This is one local code, never a passage parser.
    if (normalized === '⠸' && MATCHABLE_MAPPINGS.some((mapping) => mapping.id === 'punctuation.period' && mappingApplies(mapping, context))) {
      return { status: 'pending', document, focus, inputState: { ...state, prefix: '⠸' }, announcement: 'Nemeth punctuation period pending.' };
    }
    if (FUNCTION_INITIAL_CELLS.has(normalized) && BANA_FUNCTION_MAPPINGS.some((mapping) =>
      mapping.cells[0] === normalized && mappingApplies(mapping, context))) {
      return {
        status: 'pending', document, focus,
        inputState: { ...state, mode: 'numeric-function-prefix', prefix: normalized },
        announcement: 'Nemeth numeric/function code pending.'
      };
    }
    if (DIGITS.has(normalized)) {
      const digit = digitMapping(normalized);
      // A number sign remains active across a baseline operator, but BANA's
      // following one-cell number is lower-cell. Preserve that distinction in
      // the source intent so MathJax cannot reintroduce a second number sign.
      // Digits that continue an already lower-cell atom keep that marker.
      // A fresh number after ⠼ (for example after a blank following a pencil)
      // must remain numeric-start so projection can restore the number sign.
      const parent = context.node.name !== 'math' ? findMathParent(context.tree, context.node.attrs?.['data-omniya-id']) : null;
      const preceding = parent?.children?.[Math.max(0, parent.children.indexOf(context.node) - 1)];
      const afterOperator = (context.node.name === 'mo' && BASELINE_ARITHMETIC_SIGNS.includes(context.node.children?.[0]?.text)) ||
        (preceding?.name === 'mo' && BASELINE_ARITHMETIC_SIGNS.includes(preceding.children?.[0]?.text));
      const continuingLowerCell = context.node.name === 'mn' &&
        context.node.attrs?.['data-omniya-nemeth-intent'] === 'lower-cell-numeric';
      if (afterOperator || continuingLowerCell) {
        digit.args = { ...digit.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } };
      }
      return applyMapping(document, focus, state, digit);
    }
    if (LETTERS.has(normalized) && context.node.name === 'mn') {
      // A lower-cell numeral without a number sign is juxtaposition, not a
      // non-decimal digit. `#2A` still uses insertBaseDigit because the
      // numeric indicator marked that atom numeric-start.
      if (context.node.attrs?.['data-omniya-nemeth-intent'] === 'lower-cell-numeric') {
        return applyNemethCell({
          document,
          focus,
          inputState: { ...state, mode: null },
          cell: normalized
        });
      }
      // Rule 3.6: letters used as extra digits in a non-decimal base remain
      // in the same local numeric atom. The editor does not infer the base;
      // the transcriber-provided numeric indicator establishes this mode.
      const result = insertBaseDigit(context.tree, focus, LETTERS.get(normalized));
      return {
        status: 'applied', document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(result.tree), focus: result.focus },
        focus: result.focus, inputState: { ...state, prefix: '' }, announcement: `number.${LETTERS.get(normalized)}`
      };
    }
    if (normalized === '⠨') {
      const nonnumericContinuation = MATCHABLE_MAPPINGS.some((mapping) =>
        mapping.cells.length > 1 && mapping.cells[0] === '⠨' &&
        (mapping.id.startsWith('greek.') || mapping.id === 'operator.number-sign') &&
        mappingApplies(mapping, context));
      if (nonnumericContinuation) {
        return {
          status: 'pending', document, focus,
          inputState: { ...state, prefix: '⠨' },
          announcement: 'Nemeth dot-4 local code pending.'
        };
      }
      return applyMapping(document, focus, state, numericPunctuationMapping(normalized, '.', '3.2.3'));
    }
    if (normalized === '⠠') {
      const text = String(context.node.children?.[0]?.text ?? '');
      if (context.node.name === 'mn' && text.includes('.')) {
        const punctuation = MAPPINGS.find((mapping) => mapping.id === 'punctuation.comma');
        if (punctuation) {
          return applyMapping(document, focus, { ...state, mode: null }, punctuation);
        }
      }
      return applyMapping(document, focus, state, numericPunctuationMapping(normalized, ',', '3.2.2'));
    }
    // After a decimal point, dot 5 is shared by Rule 24.1.g (nonnumeric next
    // symbol) and Rule 15.16 (multipurpose before an overscripted digit).
    // Hold the cell until the next local symbol chooses between those paths.
    if (normalized === '⠐') {
      const current = context.node;
      const decimal = current.name === 'mn' && current.children?.[0]?.text?.includes?.('.');
      if (decimal) {
        return {
          status: 'pending', document, focus,
          inputState: { ...state, mode: 'decimal-dot5', prefix: '' },
          announcement: 'Decimal dot-5 transition pending for the next symbol.'
        };
      }
    }
  }
  if (state.mode?.startsWith?.('numeric') && state.prefix === '⠸') {
    const punctuation = MATCHABLE_MAPPINGS.filter((mapping) =>
      mapping.id.startsWith('punctuation.') &&
      mapping.cells.length === 2 &&
      mapping.cells[0] === '⠸' &&
      mapping.cells[1] === normalized &&
      mappingApplies(mapping, context));
    if (punctuation.length === 1) {
      return applyMapping(document, focus, { ...state, prefix: '', mode: null }, punctuation[0]);
    }
  }
  if (state.mode === 'signed-numeric-indicator' && !state.prefix) {
    if (DIGITS.has(normalized)) {
      return applyMapping(document, focus, { ...state, mode: 'signed-numeric-indicator' }, digitMapping(normalized));
    }
    if (normalized === '⠨') return applyMapping(document, focus, { ...state, mode: 'numeric' }, numericPunctuationMapping(normalized, '.', '3.2.3'));
  }
  if (state.mode === 'signed-numeric' && !state.prefix) {
    if (DIGITS.has(normalized)) {
      return applyMapping(document, focus, { ...state, mode: 'numeric' }, digitMapping(normalized));
    }
    if (normalized === '⠨') return applyMapping(document, focus, { ...state, mode: 'numeric' }, numericPunctuationMapping(normalized, '.', '3.2.3'));
  }
  // Rule 3.1.1: a freestanding UEB numeral may follow a currency symbol
  // without the Nemeth number indicator. This is a bounded local mode owned
  // by the immediately preceding currency atom; it accepts only the next
  // numeric run's cells and never becomes a passage buffer.
  const currency = context.node.name === 'mo' && ['$', '£', '¢', '₣', '₦', '€', '₩', '¥', '§'].includes(context.node.children?.[0]?.text);
  if (currency && state.mode === null && !state.prefix && normalized === '⠸' &&
    MATCHABLE_MAPPINGS.some((mapping) => mapping.id === 'punctuation.period' && mappingApplies(mapping, context))) {
    return { status: 'pending', document, focus, inputState: { ...state, prefix: '⠸' }, announcement: 'Nemeth punctuation period pending.' };
  }
  if (currency && state.prefix === '⠸' && normalized === '⠲') {
    const punctuation = MAPPINGS.find((mapping) => mapping.id === 'punctuation.period');
    if (punctuation) return applyMapping(document, focus, { ...state, prefix: '', mode: null }, punctuation);
  }
  if (state.mode === null && currency && DIGITS.has(normalized)) {

    return applyMapping(document, focus, { ...state, mode: 'ueb-numeric' }, {
      id: `ueb-number.${DIGITS.get(normalized)}`,
      cells: [normalized], banaRefs: ['3.1.1'], action: 'insert-numeric',
      commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { value: DIGITS.get(normalized), dataAttributes: { 'data-omniya-nemeth-intent': 'ueb-numeric' } }
    });
  }
  if (state.mode === 'ueb-numeric' && !state.prefix) {
    if (DIGITS.has(normalized)) {
      return applyMapping(document, focus, state, {
        id: `ueb-number.${DIGITS.get(normalized)}`, cells: [normalized], banaRefs: ['3.1.1'], action: 'insert-numeric',
        commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { value: DIGITS.get(normalized), dataAttributes: { 'data-omniya-nemeth-intent': 'ueb-numeric' } }
      });
    }
    if (normalized === '⠠') return applyMapping(document, focus, state, { id: 'ueb-number.comma', cells: [normalized], banaRefs: ['3.2.1'], action: 'insert-numeric', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { value: ',' } });
    if (normalized === '⠨') return applyMapping(document, focus, state, { id: 'ueb-number.decimal', cells: [normalized], banaRefs: ['3.2.1'], action: 'insert-numeric', commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { value: '.', dataAttributes: { 'data-omniya-nemeth-intent': 'ueb-decimal' } } });
  }
  if (state.mode === 'decimal-dot5' && !state.prefix) {
    if (DIGITS.has(normalized)) {
      const indicator = PREFIXES.get('⠐')?.mappings?.find((mapping) => mapping.id === 'indicator.multipurpose');
      if (!indicator) {
        return { status: 'rejected', document, focus, inputState: { ...state }, announcement: 'Decimal multipurpose indicator unavailable.' };
      }
      const multipurpose = applyMapping(document, focus, { ...state, mode: null }, indicator);
      if (multipurpose.status === 'rejected') return multipurpose;
      return applyNemethCell({
        document: multipurpose.document,
        focus: multipurpose.focus,
        inputState: multipurpose.inputState,
        cell: normalized
      });
    }
    return applyNemethCell({
      document,
      focus,
      inputState: { ...state, mode: 'decimal-nonnumeric', prefix: '' },
      cell: normalized
    });
  }
  if ((state.mode === 'decimal-nonnumeric' || context.node.attrs?.['data-omniya-nemeth-intent'] === 'decimal-nonnumeric') && !state.prefix) {
    // The indicator applies to exactly the next local symbol.  Resolve a
    // plain letter here instead of allowing a longer abbreviated-function
    // prefix to hold it; the author can still enter that function explicitly
    // as its own bounded atomic sequence after the decimal context ends.
    if (LETTERS.has(normalized)) {
      const result = applyMapping(document, focus, { ...state, mode: null }, {
        id: `decimal-nonnumeric.letter.${LETTERS.get(normalized)}`,
        cells: [normalized], banaRefs: ['3.2.3', '24.1.g'], action: 'insert-decimal-nonnumeric',
        commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE, args: { value: LETTERS.get(normalized) }
      });
      return result.status === 'applied' ? { ...result, inputState: { ...result.inputState, mode: null } } : result;
    }
    if (DIGITS.has(normalized)) {
      // Once dot 5 has declared the following symbol nonnumeric, a lower-cell
      // digit is still a local token, not a continuation of the preceding
      // numeric <mn>. Keep the mode for the next cell only and insert the
      // digit as a normal number atom.
      const result = applyMapping(document, focus, { ...state, mode: null }, {
        id: `decimal-nonnumeric.${DIGITS.get(normalized)}`,
        cells: [normalized],
        banaRefs: ['3.2.3', '24.1.g'],
        action: 'insert-decimal-nonnumeric',
        commitPolicy: LOCAL_COMMIT_POLICIES.IMMEDIATE,
        args: { name: 'mn', value: DIGITS.get(normalized), dataAttributes: { 'data-omniya-nemeth-intent': 'decimal-nonnumeric' } }
      });
      return result.status === 'applied' ? { ...result, inputState: { ...result.inputState, mode: null } } : result;
    }
    // BANA treats an omission as nonnumeric even when it stands for a
    // missing number. Hand the first dash back to the ordinary bounded
    // omission sequence, rather than allowing decimal context to consume it.
    if (normalized === '⠤') {
      return applyNemethCell({ document, focus, inputState: { ...state, mode: null }, cell: normalized });
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
  if (state.mode === 'roman' && !state.prefix && normalized === '⠎') {
    const result = insertRomanLetter(context.tree, focus, 'S');
    return {
      status: 'applied', document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(result.tree), focus: result.focus },
      focus: result.focus, inputState: { ...state, prefix: '' }, announcement: 'roman.s'
    };
  }
  // The double-capital indicator is itself a complete local mode. The next
  // Roman letter is consumed by that mode and remains one authored numeral,
  // rather than being emitted as ordinary lowercase identifiers.
  if (state.mode === 'roman' && !state.prefix && LETTERS.has(normalized)) {
    const roman = ROMAN_LETTERS.get(normalized);
    if (roman) {
      const result = insertRomanLetter(context.tree, focus, roman.toUpperCase());
      return {
        status: 'applied', document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(result.tree), focus: result.focus },
        focus: result.focus, inputState: { ...state, prefix: '' }, announcement: `roman.${roman}`
      };
    }
  }
  if ((state.mode === 'capital' || state.mode?.startsWith?.('english-letter') || state.mode?.startsWith?.('typeform:')) && !state.prefix && LETTERS.has(normalized)) {
    const capitalized = state.mode === 'capital' || state.mode?.endsWith?.(':capital');
    const typeform = state.mode?.startsWith?.('typeform:')
      ? state.mode.slice('typeform:'.length).replace(/:capital$/, '')
      : null;
    const letterState = { ...state, capital: capitalized, ...(typeform ? { typeform } : {}) };
    // Keep the typeform mode in the transition state so the generic MathML
    // operation applies mathvariant, while the explicit capital flag controls
    // the identifier text and the source-linked Nemeth cells.
    return applyMapping(document, focus, { ...state, mode: state.mode, capital: capitalized }, letterMapping(normalized, letterState));
  }
  // After the Rule 24 multipurpose indicator, a letter begins the expression
  // being modified (Rule 15.2.1.b); it must not be held merely because the
  // same letter also starts a longer abbreviated-function code. The function
  // code remains available when no local modifier scope is active.
  if (state.mode === 'multipurpose' && !state.prefix && LETTERS.has(normalized)) {
    return applyMapping(document, focus, { ...state, mode: 'multipurpose' }, letterMapping(normalized, { ...state, mode: null }));
  }
  // A lower-cell digit can continue the expression collected after the
  // multipurpose indicator (for example `"x1<:]`). It is the same local
  // numeric insertion used everywhere else, while the modifier scope remains
  // bounded to the already authored x and 1 atoms.
  if (state.mode === 'multipurpose' && !state.prefix && DIGITS.has(normalized)) {
    const mapping = digitMapping(normalized);
    return applyMapping(document, focus, { ...state, mode: 'multipurpose' }, {
      ...mapping,
      args: { ...mapping.args, dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' } }
    });
  }
  // BANA 24.1: after multipurpose, a decimal point begins a baseline number
  // such as X".6. Do not hold dot-4 as a radical-order or comparison prefix.
  if (state.mode === 'multipurpose' && !state.prefix && normalized === '⠨') {
    const decimal = numericPunctuationMapping('⠨', '.', '3.2.3');
    return applyMapping(document, focus, { ...state, mode: 'multipurpose' }, {
      ...decimal,
      args: {
        ...decimal.args,
        dataAttributes: { 'data-omniya-nemeth-intent': 'lower-cell-numeric' }
      }
    });
  }
  // Rule 15.2.1: after a directly-over/under indicator, the next ordinary
  // symbol is the modifier itself. It is still one local structural edit,
  // not a second operand parser. Reuse the generic modifier insertion for
  // letters and digits so `lim%x` composes the underscript from the same
  // guided tree operation as a bar, arc, or other modifier.
  if ((state.mode === 'modifier-under' || state.mode === 'modifier-over') &&
    !state.prefix && (LETTERS.has(normalized) || DIGITS.has(normalized))) {
    const value = LETTERS.has(normalized) ? LETTERS.get(normalized) : DIGITS.get(normalized);
    return applyMapping(document, focus, state, {
      id: `modifier.local.${value}`,
      cells: [normalized], banaRefs: ['15.2.1'], action: 'insert-modifier',
      commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
      args: { name: LETTERS.has(normalized) ? 'mi' : 'mn', value }
    });
  }
  // A blank terminates the local modifier transition.  The modifier has
  // already been composed into MathML, so the blank belongs to the
  // surrounding row and must be handled by the ordinary spacing operation.
  // This is a general boundary rule for all directly/completely applied
  // modifiers, not a notation-specific exception.
  if ((state.mode === 'modifier-complete' || state.mode === 'modifier-parallel') &&
    !state.prefix && normalized === ' ') {
    const spacing = MAPPINGS.find((candidate) => candidate.id === 'space');
    if (spacing) {
      const inserted = applyMapping(document, focus, { ...state, mode: null }, spacing);
      if (inserted.status === 'applied') {
        return inserted;
      }
    }
  }
  if (state.mode === 'modifier-parallel' && !state.prefix &&
    (LETTERS.has(normalized) || DIGITS.has(normalized))) {
    return applyNemethCell({ document, focus,
      inputState: { ...state, mode: null, modifierScope: null }, cell: normalized });
  }
  if (state.mode === 'modifier-parallel' && !state.prefix && normalized === '⠄') {
    const apostrophe = MAPPINGS.find((candidate) => candidate.id === 'misc.prime');
    if (apostrophe) return applyMapping(document, focus,
      { ...state, mode: null, modifierScope: null }, apostrophe);
  }
  if (state.mode === 'numeric' && !state.prefix && normalized === '⠣' && context.node.name === 'mn') {
    const cubePrefix = MATCHABLE_MAPPINGS.some((candidate) => candidate.id === 'radical.cube');
    if (cubePrefix) return { status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠣', mode: null }, announcement: 'Indexed radical code pending.' };
    const bar = MAPPINGS.find((candidate) => candidate.id === 'modifier.bar-over');
    if (bar) return applyMapping(document, focus, { ...state, mode: null }, bar);
  }
  if (state.prefix === '⠐⠨' && normalized === '⠻' && hasAncestor(context.tree, context.node, 'mroot')) {
    const returned = applyMapping(document, focus, { ...state, prefix: '' }, MAPPINGS.find((candidate) => candidate.id === 'radical.indexed.end'));
    if (returned.status !== 'rejected') return returned;
  }
  if (state.mode?.startsWith?.('numeric') && state.prefix === '⠣' && normalized === '⠒') {
    const cube = MAPPINGS.find((candidate) => candidate.id === 'radical.cube');
    if (cube) return { status: 'pending', document, focus,
      inputState: { ...state, prefix: '⠣⠒', mode: null }, announcement: 'Indexed radical code pending.' };
  }
  // A diagonal fraction has no fraction-line terminator in the ordinary
  // `_/` form.  Once its denominator has received a complete local atom, an
  // authored blank is therefore the boundary *after* that fraction.  Keep
  // this decision local to the nearest bevelled mfrac and move the same blank
  // to its surrounding row.  This is a structural follow-up, not passage
  // parsing: it neither infers an operand nor buffers any later cells.
  if (!state.prefix && normalized === ' ' && !isHole(context.node)) {
    const diagonal = ancestor(context.tree, context.node, 'mfrac');
    const denominator = diagonal?.children?.[1];
    if (diagonal?.attrs?.bevelled === 'true' && denominator &&
      !isHole(denominator) && contains(context.tree, denominator, context.node)) {
      const spacing = MAPPINGS.find((candidate) => candidate.id === 'space');
      if (spacing) {
        return applyMapping(document, focusNode(diagonal), { ...state, mode: null }, spacing);
      }
    }
  }
  if (state.mode?.startsWith?.('numeric') && !state.prefix && normalized === '⠱' &&
    context.node.name === 'mn') {
    const bar = MAPPINGS.find((candidate) => candidate.id === 'modifier.bar-over');
    if (bar) return applyMapping(document, focus, { ...state, mode: null }, bar);
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
    const container = hasAncestor(context.tree, context.node, ['mover', 'munder', 'munderover']);
    const sameSide = (normalized === '⠣' && container?.name === 'mover')
      || (normalized === '⠩' && container?.name === 'munder');
    if (sameSide) {
      return {
        status: 'pending', document, focus,
        inputState: { ...state, prefix: normalized },
        announcement: 'Higher-order modifier may continue.'
      };
    }
    const operationId = normalized === '⠣' ? 'modifier.simultaneous.over' : 'modifier.simultaneous.under';
    const mapping = MAPPINGS.find((candidate) => candidate.id === operationId);
    return applyMapping(document, focus, state, mapping);
  }
  if (state.mode === 'modifier-complete' && state.prefix === '⠣' && normalized === '⠣') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'modifier.directly-over.higher');
    if (mapping) return applyMapping(document, focus, { ...state, prefix: '' }, mapping);
  }
  if (state.mode === 'modifier-complete' && state.prefix === '⠩' && normalized === '⠩') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'modifier.directly-under.higher');
    if (mapping) return applyMapping(document, focus, { ...state, prefix: '' }, mapping);
  }
  if (state.mode === 'modifier-under' && !state.prefix && normalized === '⠱') {
    const mapping = MAPPINGS.find((candidate) => candidate.id === 'modifier.bar-over');
    return applyMapping(document, focus, state, mapping);
  }
  // A bounded limit function is an ordinary under/over structure after its
  // local limit code. Let the same terminator close it once the active slot
  // has been populated, rather than leaving a hidden overscript hole.
  if (!state.prefix && normalized === '⠻' &&
    hasAncestor(context.tree, context.node, ['munder', 'mover', 'munderover']) &&
    ancestor(context.tree, context.node, ['munder', 'mover', 'munderover'])?.attrs?.['data-omniya-nemeth-intent'] === 'function-limit') {
    const container = ancestor(context.tree, context.node, ['munder', 'mover', 'munderover']);
    if (!isHole(container.children?.[1]) && (container.name === 'munder' || container.name === 'mover')) {
      return applyMapping(document, focus, { ...state, prefix: '' }, { id: 'function.limit.end', cells: ['⠻'], banaRefs: ['18.3'], action: 'close-structure', commitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP, args: { element: container.name } });
    }
  }
  if ((state.mode === 'modifier-complete' || state.mode === 'modifier-parallel') && !state.prefix && normalized === '⠻') {
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
  // A directly-over/under modifier can begin with a local shape cell.  The
  // standard treats `.(]`/`.)]` as the bounded horizontal grouping sign, so
  // after the shape cell has been consumed the same terminator closes the
  // already-open mover/munder.  Resolve it before the general prefix matcher
  // can mistake the terminator for an unrelated radical or reference code.
  if ((state.mode === 'modifier-over' || state.mode === 'modifier-under' ||
       state.mode === 'modifier-complete' || state.mode === 'modifier-parallel') &&
      !state.prefix && normalized === '⠻') {
    const container = hasAncestor(context.tree, context.node, ['mover', 'munder', 'munderover']);
    if (container) {
      const operationId = container.name === 'munder'
        ? 'modifier.terminate.under'
        : container.name === 'munderover'
          ? 'modifier.terminate.simultaneous'
          : 'modifier.terminate.over';
      const mapping = MAPPINGS.find((candidate) => candidate.id === operationId);
      if (mapping) return applyMapping(document, focus, { ...state, mode: null }, mapping);
    }
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
    context.node.name !== 'math' && !isHole(context.node) && !['mspace', 'mo'].includes(context.node.name)) {
    const script = MAPPINGS.find((candidate) => candidate.id === 'script.subscript');
    const opened = applyMapping(document, focus, { ...state, prefix: '' }, script);
    if (opened.status !== 'rejected') {
      return applyMapping(opened.document, opened.focus, { ...opened.inputState, mode: 'numeric' }, digitMapping(normalized));
    }
  }
  // BANA 14.8.8/19.1.2 uses a level indicator before a symbol that must
  // remain at the level already in effect. In a subscript row, `;.k` is not
  // a request to create a nested subscript. Consume the dot-6 boundary and
  // replay the next local symbol at the current script-row focus. This is a
  // one-symbol structural follow-up, not an operand parser.
  if (state.mode === null && state.prefix === '⠰' &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts']) &&
    !LETTERS.has(normalized) && !DIGITS.has(normalized) && normalized !== '⠼' && normalized !== '⠰') {
    const replay = applyNemethCell({
      document,
      focus,
      inputState: { ...state, prefix: '' },
      cell: normalized
    });
    if (replay.status !== 'rejected') return { ...replay, announcement: `Stayed at the current script level; ${replay.announcement}` };
  }
  // BANA 14.8.7: `~;` after a populated superscript is the subscript of that
  // superscripted item, not a conversion of the outer msup into msubsup.
  // Hold the two-cell prefix when a longer absolute chain such as `~;~`
  // remains registered, so three-component indicators stay one local code.
  if (state.mode === null && state.prefix === '⠘' && normalized === '⠰' &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts']) &&
    context.node.name !== 'math' && !isHole(context.node)) {
    const held = `${state.prefix}${normalized}`;
    const longerChain = MATCHABLE_MAPPINGS.some((mapping) =>
      mapping.action === 'open-script-chain' &&
      mapping.cells.length > held.length &&
      mapping.cells.slice(0, held.length).join('') === held &&
      mappingApplies(mapping, context));
    if (longerChain) {
      return {
        status: 'pending',
        document,
        focus,
        inputState: { ...state, prefix: held },
        announcement: 'Nemeth sequence may continue.'
      };
    }
    const depth = scriptDepth(context.tree, context.node, 'sup');
    if (depth > 0) {
      let targetFocus = focus;
      const parent = findMathParent(context.tree, context.node.attrs?.['data-omniya-id']);
      const grand = parent ? findMathParent(context.tree, parent.attrs?.['data-omniya-id']) : null;
      if (parent?.name === 'mrow' && grand && scriptSlot(grand, 'sup') === parent) {
        targetFocus = focusNode(parent);
      }
      const wrapped = wrapCurrent(context.tree, targetFocus, 'msub', ['base', 'subscript'], {}, 'subscript');
      return {
        status: 'applied',
        localCommitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
        document: { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(wrapped.tree), focus: wrapped.focus },
        focus: wrapped.focus,
        inputState: { prefix: '', mode: null, modifierScope: state.modifierScope ?? null },
        announcement: 'script.subscript'
      };
    }
  }
  // BANA 14.4: a single superscript indicator names absolute level 1. After
  // a nested (level 2+) script, `~` followed by a non-level cell returns to
  // that first superscript rather than wrapping another empty hole.
  if (state.mode === null && state.prefix === '⠘' &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts']) &&
    !LETTERS.has(normalized) && !DIGITS.has(normalized) &&
    normalized !== '⠼' && normalized !== '⠘' && normalized !== '⠰') {
    const depth = scriptDepth(context.tree, context.node, 'sup');
    if (depth > 0) {
    const returned = depth > 1
      ? returnToScriptLevel(context.tree, focus, 1, 'sup')
      : { tree: context.tree, focus };
    const replay = applyNemethCell({
      document,
      focus: returned.focus,
      inputState: { ...state, prefix: '' },
      cell: normalized
    });
    if (replay.status !== 'rejected') {
      return {
        ...replay,
        announcement: depth > 1
          ? `Returned to the first superscript level; ${replay.announcement}`
          : `Stayed at the current script level; ${replay.announcement}`
      };
    }
    }
  }
  // The same dot-6 prefix followed by a letter is the ordinary Rule 14
  // subscript transition whenever the current focus is a populated atom.
  // Resolve that local structural meaning before the English-letter mode;
  // the latter remains available at an empty/boundary focus.
  if (state.mode === null && state.prefix === '⠰' && LETTERS.has(normalized) &&
    context.node.name !== 'math' && !isHole(context.node) &&
    !(['mspace', 'mo'].includes(context.node.name) &&
      !(context.node.name === 'mo' && ['∫', '∬', '∭'].includes(context.node.children?.[0]?.text)))) {
    const multiscript = ancestor(context.tree, context.node, ['mmultiscripts']);
    if (multiscript && multiscript.children?.[0] === context.node) {
      const script = MAPPINGS.find((candidate) => candidate.id === 'script.subscript');
      const opened = applyMapping(document, focus, { ...state, prefix: '' }, script);
      if (opened.status !== 'rejected') {
        return applyNemethCell({ document: opened.document, focus: opened.focus, inputState: opened.inputState, cell: normalized });
      }
    }
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
  // English-letter indicator (Rule 6.3/10.3), but Rule 14.5 also permits the
  // same local prefix to begin a left-subscript construction.  Keep both
  // standards-defined meanings available as an explicit local choice rather
  // than silently selecting the literary/English-letter interpretation. The
  // chosen row then consumes only this one prefix and reprocesses the suffix
  // cell through the ordinary tree operation.
  if (state.mode === null && state.prefix === '⠰' && LETTERS.has(normalized) &&
    (context.node.name === 'math' || isHole(context.node))) {
    return {
      status: 'choice',
      choices: [
        { operationId: 'indicator.english-letter', label: 'English-letter indicator', banaRefs: ['6.3', '10.3'] },
        { operationId: 'script.left-subscript', label: 'Begin left-subscript construction', banaRefs: ['14.5.1'] }
      ],
      document,
      focus,
      inputState: { ...state, prefix: `${state.prefix}${normalized}` },
      announcement: 'This local Nemeth prefix can begin an English-letter indicator or a left-subscript construction. Choose its meaning.'
    };
  }
  // After an explicit mathematical blank, dot-6 plus a letter is the
  // ordinary English-letter indicator. It is not a left-subscript opener:
  // there is no populated base at this boundary to attach one to. Integral
  // operators are handled by the structural follow-up above.
  if (state.mode === null && state.prefix === '⠰' && LETTERS.has(normalized) && context.node.name === 'mspace') {
    const indicator = MAPPINGS.find((candidate) => candidate.id === 'indicator.english-letter');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, indicator);
    if (activated.status !== 'rejected') {
      return applyNemethCell({ document: activated.document, focus: activated.focus, inputState: activated.inputState, cell: normalized });
    }
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
  // A baseline return is also the first half of a local code whose second
  // cell is an operator, terminator, or another structural indicator.  The
  // ordinary letter/number cases above are not sufficient for constructions
  // such as `x^2"+` and `y^2".]` inside a radical.  Resolve the shared dot-5
  // from the script context, then replay exactly this one following cell at
  // the returned focus.  This is still one bounded structural follow-up,
  // never a passage buffer or expression parser.
  if (state.prefix === '⠐' && DIGITS.has(normalized) &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts'])) {
    const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
    if (baseline) {
      const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
      if (returned.status !== 'rejected') {
        return applyNemethCell({
          document: returned.document,
          focus: returned.focus,
          inputState: { ...returned.inputState, mode: null },
          cell: normalized
        });
      }
    }
  }
  if (state.prefix === '⠐' &&
    hasAncestor(context.tree, context.node, ['msup', 'msub', 'msubsup', 'mmultiscripts']) &&
    !LETTERS.has(normalized) && !DIGITS.has(normalized) && normalized !== '⠼') {
    const baseline = MAPPINGS.find((candidate) => candidate.id === 'script.baseline');
    if (baseline) {
      // Rule 14.11 non-simultaneous scripts: multipurpose/baseline followed by
      // the opposite level indicator attaches that script to the same item.
      // Promote the one-sided script through openScriptSlot while focus is still
      // on its script child, then continue with any later symbol cells.
      const oneSided = ancestor(context.tree, context.node, ['msup', 'msub']);
      const oppositeRole = normalized === '⠘' ? 'superscript'
        : normalized === '⠰' ? 'subscript'
          : null;
      const existingRole = oneSided?.name === 'msub' ? 'subscript'
        : oneSided?.name === 'msup' ? 'superscript'
          : null;
      if (oneSided && oppositeRole && existingRole && oppositeRole !== existingRole
        && (oneSided.children?.[1] === context.node
          || isInScriptSlot(context.tree, oneSided.children?.[1], context.node))) {
        // An empty base is still a left-script in progress. Promote it, then
        // let the opposite indicator fill the other prescript instead of
        // converting the unfinished script into a right msubsup.
        if (isHole(oneSided.children?.[0])) {
          const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
          if (returned.status !== 'rejected') {
            return applyNemethCell({
              document: returned.document,
              focus: returned.focus,
              inputState: returned.inputState,
              cell: normalized
            });
          }
        }
        const slotFocus = oneSided.children[1] === context.node
          ? focus
          : focusNode(oneSided.children[1]);
        const opened = openScriptSlot(
          context.tree,
          slotFocus,
          oppositeRole === 'subscript' ? 'msub' : 'msup',
          oppositeRole
        );
        const compound = ancestor(opened.tree, currentNode(opened.tree, opened.focus), ['msubsup']);
        if (compound) {
          compound.attrs['data-omniya-nemeth-intent'] = existingRole === 'subscript'
            ? 'non-simultaneous-scripts:sub-sup'
            : 'non-simultaneous-scripts:sup-sub';
        }
        return {
          status: 'applied',
          localCommitPolicy: LOCAL_COMMIT_POLICIES.STRUCTURAL_FOLLOWUP,
          document: {
            formatVersion: MATH_FORMAT_VERSION,
            mathml: serializeMathML(opened.tree),
            focus: opened.focus
          },
          focus: opened.focus,
          inputState: { prefix: '', mode: null, modifierScope: state.modifierScope ?? null },
          announcement: `script.baseline; script.${oppositeRole === 'subscript' ? 'subscript' : 'superscript'}`
        };
      }
      const returned = applyMapping(document, focus, { ...state, prefix: '' }, baseline);
      if (returned.status !== 'rejected') {
        const next = applyNemethCell({ document: returned.document, focus: returned.focus,
          inputState: returned.inputState, cell: normalized });
        if (next.status !== 'rejected') return { ...next, announcement: `${returned.announcement}; ${next.announcement}` };
        return returned;
      }
    }
  }
  // Dot 5 is shared by the baseline and multipurpose indicators. When the
  // next cell is the first ordinary expression symbol, the local Rule 15
  // construction resolves it as multipurpose and continues with that symbol.
  // A script/baseline context still follows the ordinary structural mapping.
  if (state.mode === null && state.prefix === '⠐' && !match && LETTERS.has(normalized) &&
    !hasAncestor(context.tree, context.node, 'msup') &&
    !hasAncestor(context.tree, context.node, 'msub') &&
    !hasAncestor(context.tree, context.node, 'msubsup') &&
    !hasAncestor(context.tree, context.node, 'mmultiscripts')) {
    const indicator = PREFIXES.get('⠐')?.mappings?.find((mapping) => mapping.id === 'indicator.multipurpose');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, indicator);
    if (activated.status !== 'rejected') {
      const next = applyNemethCell({ document: activated.document, focus: activated.focus, inputState: activated.inputState, cell: normalized });
      if (next.status !== 'rejected') return { ...next, announcement: `${activated.announcement}; ${next.announcement}` };
    }
  }
  // Same Rule 24.1 activation when the multipurpose indicator is followed by
  // a baseline digit after a letter, single-letter number, or large operator.
  // comparison.ratio shares the "1 cells, so this path must win locally.
  if (state.mode === null && state.prefix === '⠐' && !match && DIGITS.has(normalized) &&
    !hasAncestor(context.tree, context.node, 'msup') &&
    !hasAncestor(context.tree, context.node, 'msub') &&
    !hasAncestor(context.tree, context.node, 'msubsup') &&
    !hasAncestor(context.tree, context.node, 'mmultiscripts') &&
    (context.node.name === 'mi'
      || (context.node.name === 'mn'
        && context.node.attrs?.['data-omniya-nemeth-intent'] === 'single-letter-number')
      || (context.node.name === 'mo' && context.node.attrs?.['data-omniya-nemeth-cells']))) {
    const indicator = PREFIXES.get('⠐')?.mappings?.find((mapping) => mapping.id === 'indicator.multipurpose');
    const activated = applyMapping(document, focus, { ...state, prefix: '' }, indicator);
    if (activated.status !== 'rejected') {
      const next = applyNemethCell({ document: activated.document, focus: activated.focus, inputState: activated.inputState, cell: normalized });
      if (next.status !== 'rejected') return { ...next, announcement: `${activated.announcement}; ${next.announcement}` };
    }
  }

  if (!match && state.prefix) {
    // Within a typeform's alphabetic mode, comma-dot followed by a letter is
    // the capital indicator plus that letter, not the ordinary punctuation
    // comma. Resolve this shared prefix locally before presenting a choice.
    if (state.mode?.startsWith?.('typeform:') && state.prefix === '⠠' && LETTERS.has(normalized)) {
      const capital = MAPPINGS.find((candidate) => candidate.id === 'indicator.capital');
      if (capital) {
        const activated = applyMapping(document, focus, { ...state, prefix: '' }, capital);
        if (activated.status !== 'rejected') {
          return applyNemethCell({
            document: activated.document,
            focus: activated.focus,
            inputState: { ...activated.inputState, mode: state.mode },
            cell: normalized
          });
        }
      }
    }
    const previous = PREFIXES.get(state.prefix);
    const previousMappings = resolveModifierAmbiguity(previous?.mappings
      ?.filter((mapping) => mappingApplies(mapping, context)) ?? [], state.mode)
      .filter((mapping) => state.mode === 'multipurpose'
        ? mapping.action !== 'open-modifier'
        : mapping.action !== 'open-modifier');
    if (previousMappings.length === 1 &&
      !hasApplicableContinuation(state.prefix, normalized, context)) {
      const first = applyMapping(document, focus, { ...state, prefix: '' }, previousMappings[0]);
    if (first.status !== 'rejected') {
      const second = applyNemethCell({ document: first.document, focus: first.focus, inputState: first.inputState, cell: normalized });
      if (second.status !== 'rejected') {
        return { ...second, announcement: `${first.announcement}; ${second.announcement}` };
      }
      return first;
    }
    }
    if (previousMappings.length > 1 && !hasApplicableContinuation(state.prefix, normalized, context)) {
      return {
        status: 'choice',
        choices: previousMappings.map(({ id, banaRefs }) => ({ operationId: id, label: id, banaRefs })),
        document,
        focus,
        inputState: { ...state, prefix: sequence },
        announcement: 'Choose the meaning for this local Nemeth prefix.'
      };
    }
  }

  if (!match && state.prefix.length > 1) {
    // The last cell may prove that a previously held prefix was actually an
    // immediate code followed by another local code.  Replay only the
    // bounded suffix after committing the shortest applicable immediate
    // prefix.  This is needed for constructions such as `~.p`, where `~`
    // opens a superscript and `.p` is the next Greek-pi token.
    for (let split = 1; split < state.prefix.length; split += 1) {
      const head = state.prefix.slice(0, split);
      const tail = [...state.prefix.slice(split)];
      const immediate = (PREFIXES.get(head)?.mappings ?? [])
        .filter((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE)
        .filter((mapping) => mappingApplies(mapping, context));
      if (immediate.length !== 1) continue;
      const committed = applyMapping(document, focus, { ...state, prefix: '' }, immediate[0]);
      if (committed.status === 'rejected') continue;
      let replay = committed;
      for (const replayCell of [...tail, normalized]) {
        replay = applyNemethCell({
          document: replay.document,
          focus: replay.focus,
          inputState: replay.inputState,
          cell: replayCell
        });
        if (replay.status === 'rejected') break;
      }
      if (replay.status !== 'rejected') return replay;
    }
  }
  if (!match) return {
    status: 'rejected', document, focus,
    inputState: { ...state },
    announcement: state.prefix
      ? 'That cell does not complete the current local Nemeth code. The draft was not changed.'
      : 'That Nemeth cell is not valid at this draft focus.'
  };
  const mappings = resolveModifierAmbiguity(match.mappings
    .filter((mapping) => mappingApplies(mapping, context)), state.mode)
    .filter((mapping) => state.mode === 'comparison-horizontal'
      ? ['operator.equals', 'comparison.less', 'comparison.greater', 'comparison.less-equal', 'comparison.greater-equal', 'comparison.not-equal'].includes(mapping.id)
      : true)
    .filter((mapping) => state.mode === 'multipurpose'
      ? mapping.action !== 'open-modifier'
      : mapping.action !== 'open-modifier');
  // The indexed-radical terminator is a structural follow-up even when the
  // focus is the final radical atom or an expression row inside the root.
  // Resolve it before the generic shared-cell matcher so completed Rule 16.2
  // examples close their root instead of treating dot-2 as an unrelated
  // letter or leaving the draft incomplete.
  if (normalized === '⠜' && hasAncestor(context.tree, context.node, 'mroot')) {
    const radical = ancestor(context.tree, context.node, 'mroot');
    const role = context.node.attrs?.['data-omniya-role'];
    if (role === 'index' || radical.children?.[1] === context.node || contains(context.tree, radical.children?.[1], context.node)) {
      const moveRadicand = MAPPINGS.find((mapping) => mapping.id === 'radical.next.radicand');
      if (moveRadicand) return applyMapping(document, focus, { ...state, prefix: '' }, moveRadicand);
    }
  }
  if (normalized === '⠻' && hasAncestor(context.tree, context.node, 'mroot')) {
    const radicalEnd = MAPPINGS.find((mapping) => mapping.id === 'radical.indexed.end');
    if (radicalEnd) return applyMapping(document, focus, { ...state, prefix: '' }, radicalEnd);
  }
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
    // A longer atomic row may temporarily shadow an immediate structural
    // row.  If the newly received cell proves that the longer row cannot be
    // completed, split the held prefix at the shortest registered immediate
    // boundary and replay the remaining cells as fresh local input.  This is
    // bounded registry lookahead, not passage parsing.  For example, the
    // degree code `~.*` shares `~` with the immediate superscript transition,
    // while `~.p` is a superscript followed by the local Greek-pi token.
    if (state.prefix.length > 1) {
      for (let split = 1; split < state.prefix.length; split += 1) {
        const head = state.prefix.slice(0, split);
        const tail = [...state.prefix.slice(split)];
        const immediate = (PREFIXES.get(head)?.mappings ?? [])
          .filter((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE)
          .filter((mapping) => mappingApplies(mapping, context));
        if (immediate.length !== 1) continue;
        const committed = applyMapping(document, focus, { ...state, prefix: '' }, immediate[0]);
        if (committed.status === 'rejected') continue;
        let replay = committed;
        for (const replayCell of [...tail, normalized]) {
          replay = applyNemethCell({
            document: replay.document,
            focus: replay.focus,
            inputState: replay.inputState,
            cell: replayCell
          });
          if (replay.status === 'rejected') break;
        }
        if (replay.status !== 'rejected') return replay;
      }
    }
    const heldMappings = (PREFIXES.get(state.prefix)?.mappings ?? [])
      .filter((mapping) => mappingApplies(mapping, context));
    const heldImmediate = heldMappings.filter((mapping) => mapping.commitPolicy === LOCAL_COMMIT_POLICIES.IMMEDIATE);
    // Commit the held immediate only when this new cell cannot continue any
    // applicable local construction.  The prefix may have a longer BANA row,
    // but that row must win whenever the current cell is actually its next
    // cell.  This keeps shared forms such as `@$qed` and angle refinements
    // intact while still allowing a short sign to be followed by a new code.
    if (heldImmediate.length === 1 && !hasApplicableContinuation(state.prefix, normalized, context)) {
      const committed = applyMapping(document, focus, { ...state, prefix: '' }, heldImmediate[0]);
      if (committed.status !== 'rejected') {
        return applyNemethCell({ document: committed.document, focus: committed.focus, inputState: committed.inputState, cell: normalized });
      }
    }
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
  // Rule 20.9 and Rule 21.6 intentionally share the simple-tilde cells. Once
  // that complete local code is present, keep the BANA meanings as an
  // explicit choice rather than guessing from the rendered glyph.
  if (sequence === '⠈⠱' && mappings.some((mapping) => mapping.id === 'operator.tilde')) {
    return {
      status: 'choice',
      choices: mappings.map(({ id, banaRefs }) => ({ operationId: id, label: id, banaRefs })),
      document, focus, inputState: { ...state, prefix: sequence },
      announcement: 'Choose the meaning for this Nemeth sequence.'
    };
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
  const mappings = resolveModifierAmbiguity((PREFIXES.get(prefix)?.mappings ?? [])
    .filter((mapping) => mappingApplies(mapping, context)), inputState.mode)
    .filter((mapping) => inputState.mode === 'multipurpose'
      ? mapping.action === 'open-modifier' || mapping.action === 'insert-token'
      : mapping.action !== 'open-modifier');
  // A capital indicator followed by a word is still a bounded local
  // construction. When the prefix is an otherwise ambiguous capitalized
  // letter, commit the capital meaning and let the following cells build the
  // next local letters one at a time. This avoids leaving a word-sized prefix
  // stranded at Enter while preserving the no-passage-buffer invariant.
  if (mappings.length > 1 && prefix.length > 1 && prefix.startsWith('⠠') && mappings.some((mapping) => mapping.id === 'indicator.capital')) {
    const capital = mappings.find((mapping) => mapping.id === 'indicator.capital');
    return applyMapping(document, focus, { ...inputState, prefix: '' }, capital);
  }
  // A numeric punctuation prefix has a longer registered period meaning that
  // must win over the ordinary dot-4 tally symbol. The caller has already
  // established the numeric context, so commit the exact period construction
  // instead of selecting the shorter one-cell tally.
  if (inputState.mode?.startsWith?.('numeric') && prefix === '⠸') {
    const period = MAPPINGS.find((mapping) => mapping.id === 'punctuation.period');
    if (period && mappings.some((mapping) => mapping.id === 'misc.tally')) {
      return { status: 'pending', document, focus, inputState, announcement: 'Nemeth punctuation period is incomplete; enter its terminating cell.' };
    }
  }
  if (!inputState.mode?.startsWith?.('numeric') && /^⠸+$/.test(prefix) &&
    (prefix.length >= 2 || context.node.attrs?.['data-omniya-nemeth-cells'] === '⠸')) {
    const inserted = insertTallyMarks(document, focus, inputState, prefix.length);
    if (inserted.status !== 'rejected') return inserted;
  }
  if (prefix === '⠠⠄' && !hasAncestor(context.tree, context.node, 'mstyle')) {
    const ditto = mappings.find((mapping) => mapping.id === 'misc.ditto')
      ?? MAPPINGS.find((mapping) => mapping.id === 'misc.ditto');
    if (ditto) return applyMapping(document, focus, { ...inputState, prefix: '' }, ditto);
  }
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
