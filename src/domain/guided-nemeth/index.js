/**
 * Guided, one-cell-at-a-time Nemeth editing.
 *
 * This is intentionally a transition interpreter, not a reverse parser. Each
 * registry entry cites the BANA 2022 rule family it implements. The official
 * BANA PDF and October 2025 errata are the normative sources; APH terminology
 * is used only for labels and teaching order.
 */
import {
  MATH_FORMAT_VERSION,
  createHole,
  findMathNode,
  findMathParent,
  parseMathML,
  serializeMathML,
  completionReport as reportCompletion
} from '../math-tree.js';

export const completionReport = reportCompletion;

export const BANA_2022_URL = 'https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf';
export const BANA_2022_ERRATA_URL = 'https://www.brailleauthority.org/sites/default/files/2026-08/Errata%20Nemeth%20Code%202022%20Approved%2010-2025.pdf';

const LETTERS = new Map([
  ['⠁','a'],['⠃','b'],['⠉','c'],['⠙','d'],['⠑','e'],['⠋','f'],['⠛','g'],['⠓','h'],['⠊','i'],['⠚','j'],['⠅','k'],['⠇','l'],['⠍','m'],['⠝','n'],['⠕','o'],['⠏','p'],['⠟','q'],['⠗','r'],['⠎','s'],['⠞','t'],['⠥','u'],['⠧','v'],['⠺','w'],['⠭','x'],['⠽','y'],['⠵','z']
]);
const DIGITS = new Map([['⠁','1'],['⠃','2'],['⠉','3'],['⠙','4'],['⠑','5'],['⠋','6'],['⠛','7'],['⠓','8'],['⠊','9'],['⠚','0']]);
const ASCII_TO_UNICODE = new Map([...LETTERS.entries()].map(([cell, value]) => [value, cell]));
for (const [ascii, cell] of [['+','⠬'],['-','⠤'],['=','⠨⠅'],['/','⠌'],['(', '⠷'],[')', '⠾'],['#','⠼'],['^','⠘'],['_','⠰'],[' ', ' ']]) ASCII_TO_UNICODE.set(ascii, cell);

function normalizeCell(cell) {
  if (typeof cell !== 'string' || !cell) throw new TypeError('Nemeth input must contain one cell');
  if (cell.length === 1) {
    const code = cell.codePointAt(0);
    if (code >= 0x2800 && code <= 0x28ff) return String.fromCodePoint(0x2800 + ((code - 0x2800) & 0x3f));
    if (ASCII_TO_UNICODE.has(cell)) return ASCII_TO_UNICODE.get(cell);
    if (/\s/.test(cell)) return ' ';
  }
  if (cell.length === 2 && cell === '⠨⠅') return cell;
  throw new TypeError(`Unsupported Nemeth cell: ${cell}`);
}

export function normalizeCellInput(cell) { return normalizeCell(cell); }

const element = (name, children = [], attrs = {}) => ({ name, attrs: { ...attrs, 'data-omniya-id': attrs['data-omniya-id'] ?? `omniya-${globalThis.crypto.randomUUID()}` }, children });
const text = (value) => ({ text: value });
const atom = (name, value) => element(name, [text(value)]);
const hole = (owner, role) => createHole({ ownerNodeId: owner.attrs['data-omniya-id'], role });
const isElement = (node) => Boolean(node && node.text === undefined);
const isHole = (node) => isElement(node) && node.attrs?.['data-omniya-hole'] === 'true';

function mathTree(document) { return parseMathML(document.mathml); }
function currentNode(tree, focus) { return findMathNode(tree, focus?.nodeId ?? focus?.firstNodeId) ?? tree; }
function focusNode(node) { return { kind: 'node', nodeId: node.attrs['data-omniya-id'] }; }
function rowForInsertion(tree, node) {
  if (node.name === 'math') {
    let row = node.children.find((child) => child.name === 'mrow');
    if (!row) { row = element('mrow'); node.children.push(row); }
    return row;
  }
  if (node.name === 'mrow') return node;
  const parent = findMathParent(tree, node.attrs['data-omniya-id']);
  return parent?.name === 'mrow' || parent?.name === 'math' ? parent : null;
}

function replaceFocused(tree, focus, replacement) {
  const current = currentNode(tree, focus);
  const inherit = (candidate) => {
    if (current.name !== 'math' && current.attrs?.['data-omniya-id']) candidate.attrs['data-omniya-id'] = current.attrs['data-omniya-id'];
    return candidate;
  };
  if (current.name === 'math') {
    const row = rowForInsertion(tree, current);
    const inserted = structuredClone(replacement);
    if (isHole(row)) {
      const index = current.children.indexOf(row);
      current.children.splice(index, 1, inserted);
    } else {
      row.children = [inserted];
    }
    return inserted;
  }
  if (isHole(current)) {
    const owner = findMathParent(tree, current.attrs['data-omniya-id']);
    if (!owner) throw new RangeError('Hole owner not found');
    const index = owner.children.indexOf(current);
    const inserted = inherit(structuredClone(replacement));
    owner.children[index] = inserted;
    return inserted;
  }
  const parent = findMathParent(tree, current.attrs['data-omniya-id']);
  if (parent && isElement(parent)) {
    const index = parent.children.indexOf(current);
    const inserted = inherit(structuredClone(replacement));
    parent.children.splice(index, 1, inserted);
    return inserted;
  }
  throw new Error('Focused node is not an editable MathML position');
}

function insertSibling(tree, focus, replacement) {
  const current = currentNode(tree, focus);
  const row = rowForInsertion(tree, current);
  if (!row) return replaceFocused(tree, focus, replacement);
  const index = current === row ? row.children.length : row.children.indexOf(current) + 1;
  row.children.splice(Math.max(0, index), 0, structuredClone(replacement));
  return row.children[index];
}

function makeEmptyDocument() {
  const root = element('math');
  const row = element('mrow', [], { 'data-omniya-hole': 'true', 'data-omniya-owner': root.attrs['data-omniya-id'], 'data-omniya-role': 'content' });
  row.children.push(element('mspace', [], { width: '1em' }));
  root.children.push(row);
  return { formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(root), focus: focusNode(row) };
}

export function createEmptyMathDocument() { return makeEmptyDocument(); }

function insertAtom(context, name, value) {
  const tree = mathTree(context.document);
  const created = atom(name, value);
  const current = currentNode(tree, context.focus);
  const inserted = (current.name === 'math' || isHole(current) || !context.inputState?.append) ? replaceFocused(tree, context.focus, created) : insertSibling(tree, context.focus, created);
  return { tree, inserted };
}

function wrapFocused(context, name, roles, { focusRole = roles[0] } = {}) {
  const tree = mathTree(context.document);
  const current = currentNode(tree, context.focus);
  const replacementId = current.name === 'math' ? null : current.attrs?.['data-omniya-id'];
  const wrapper = element(name);
  if (isHole(current) || current.name === 'math') roles.forEach((role) => wrapper.children.push(hole(wrapper, role)));
  else {
    const base = structuredClone(current);
    base.attrs['data-omniya-id'] = `omniya-${globalThis.crypto.randomUUID()}`;
    wrapper.children.push(base);
    for (const role of roles.slice(1)) wrapper.children.push(hole(wrapper, role));
  }
  replaceFocused(tree, context.focus, wrapper);
  const inserted = findMathNode(tree, replacementId ?? wrapper.attrs['data-omniya-id']);
  const child = inserted?.children?.find((candidate) => candidate.attrs?.['data-omniya-role'] === focusRole);
  return { tree, replacement: tree, focus: focusNode(child ?? inserted.children[0]) };
}

function transitionContext(document, focus) {
  const tree = mathTree(document);
  const node = currentNode(tree, focus);
  const parent = isElement(node) ? findMathParent(tree, node.attrs?.['data-omniya-id']) : null;
  return {
    document, focus, tree, node, parent,
    slot: node.attrs?.['data-omniya-role'] ?? null,
    isHole: isHole(node),
    inRow: parent?.name === 'mrow' || node.name === 'mrow'
  };
}

function ancestorMatching(tree, node, predicate) {
  let current = node;
  while (current) {
    if (predicate(current)) return current;
    current = isElement(current) ? findMathParent(tree, current.attrs?.['data-omniya-id']) : null;
  }
  return null;
}

function containsNode(tree, ancestor, node) {
  if (!ancestor || !node) return false;
  const ancestorId = ancestor.attrs?.['data-omniya-id'];
  let current = node;
  while (current) {
    if (current.attrs?.['data-omniya-id'] === ancestorId) return true;
    current = isElement(current) ? findMathParent(tree, current.attrs?.['data-omniya-id']) : null;
  }
  return false;
}

function focusAfterContainer(tree, container) {
  const parent = findMathParent(tree, container.attrs?.['data-omniya-id']);
  if (!parent || parent.name === 'math') return focusNode(container);
  return focusNode(parent);
}

function closeContainer(context, containerName, childIndex, announcement) {
  const container = ancestorMatching(context.tree, context.node, (candidate) => candidate.name === containerName);
  const child = container?.children?.[childIndex];
  if (!container || !child || !containsNode(context.tree, child, context.node)) {
    throw new RangeError(`No open ${containerName} at the current focus.`);
  }
  return { tree: context.tree, focus: focusAfterContainer(context.tree, container), announcement };
}

export function deriveNemethContext(document, focus) {
  const context = transitionContext(document, focus);
  return { slot: context.slot, nodeName: context.node.name, parentName: context.parent?.name ?? null, isHole: context.isHole, inRow: context.inRow };
}

/** Return the next or previous persisted required slot for Tab traversal. */
export function nextEmptyFocus(document, focus, direction = 1) {
  if (direction !== 1 && direction !== -1) throw new RangeError('Empty-slot direction must be 1 or -1');
  const tree = mathTree(document);
  const holes = reportCompletion(tree).holes
    .filter(({ nodeId }) => Boolean(findMathNode(tree, nodeId)))
    .map(({ nodeId }) => ({ kind: 'node', nodeId }));
  if (!holes.length) return null;
  const currentId = focus?.nodeId ?? focus?.firstNodeId;
  const currentIndex = holes.findIndex(({ nodeId }) => nodeId === currentId);
  const nextIndex = currentIndex < 0 ? (direction > 0 ? 0 : holes.length - 1) : currentIndex + direction;
  return holes[nextIndex] ?? null;
}

const OPERATIONS = [
  { id: 'atom.letter', commandLabel: 'Insert letter', banaRefs: ['6.3', '6.4'], nemethSequences: [...LETTERS.keys()], validContexts: ['row', 'hole', 'replacement'], apply: (ctx, value) => { const { tree, inserted } = insertAtom(ctx, 'mi', value); return { tree, focus: focusNode(inserted), announcement: `Inserted ${value}.` }; } },
  { id: 'atom.number', commandLabel: 'Insert number', banaRefs: ['3.1', '3.2'], nemethSequences: [], validContexts: ['row', 'hole', 'replacement'], apply: (ctx, value) => { const { tree, inserted } = insertAtom(ctx, 'mn', value); return { tree, focus: focusNode(inserted), announcement: `Inserted ${value}.` }; } },
  { id: 'operator.plus', commandLabel: 'Insert plus', banaRefs: ['20.1'], nemethSequences: ['⠬'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '+'); return { tree, focus: focusNode(inserted), announcement: 'Inserted plus.' }; } },
  { id: 'operator.minus', commandLabel: 'Insert minus', banaRefs: ['20.6'], nemethSequences: ['⠤'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '−'); return { tree, focus: focusNode(inserted), announcement: 'Inserted minus.' }; } },
  { id: 'operator.equals', commandLabel: 'Insert equals', banaRefs: ['21.1'], nemethSequences: ['⠨⠅'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '='); return { tree, focus: focusNode(inserted), announcement: 'Inserted equals.' }; } },
  { id: 'comparison.less', commandLabel: 'Insert less-than', banaRefs: ['21.7'], nemethSequences: ['⠨'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '<'); return { tree, focus: focusNode(inserted), announcement: 'Inserted less-than.' }; } },
  { id: 'comparison.greater', commandLabel: 'Insert greater-than', banaRefs: ['21.13'], nemethSequences: ['⠰'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '>'); return { tree, focus: focusNode(inserted), announcement: 'Inserted greater-than.' }; } },
  { id: 'operator.divide', commandLabel: 'Insert division', banaRefs: ['20.8'], nemethSequences: ['⠌'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '÷'); return { tree, focus: focusNode(inserted), announcement: 'Inserted division.' }; } },
  { id: 'operator.multiply', commandLabel: 'Insert multiplication', banaRefs: ['20.2', '20.3'], nemethSequences: ['⠐⠡'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '×'); return { tree, focus: focusNode(inserted), announcement: 'Inserted multiplication.' }; } },
  { id: 'operator.integral', commandLabel: 'Insert integral operator', banaRefs: ['23.11'], nemethSequences: ['⠮'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '∫'); return { tree, focus: focusNode(inserted), announcement: 'Inserted integral operator.' }; } },
  { id: 'operator.sum', commandLabel: 'Insert summation operator', banaRefs: ['23.11'], nemethSequences: ['⠠⠎'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '∑'); return { tree, focus: focusNode(inserted), announcement: 'Inserted summation operator.' }; } },
  { id: 'operator.product', commandLabel: 'Insert product operator', banaRefs: ['23.11'], nemethSequences: ['⠠⠏'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '∏'); return { tree, focus: focusNode(inserted), announcement: 'Inserted product operator.' }; } },
  { id: 'fraction.insert.simple', commandLabel: 'Insert simple fraction', banaRefs: ['13.1', '13.2'], nemethSequences: ['⠹'], validContexts: ['row', 'hole', 'replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'mfrac', ['numerator', 'denominator'], { focusRole: 'numerator' }); return { tree: result.replacement, focus: result.focus, announcement: 'Inserted fraction. Editing numerator.' }; } },
  { id: 'fraction.close.simple', commandLabel: 'End simple fraction', banaRefs: ['13.2.1'], nemethSequences: ['⠼'], validContexts: ['row', 'hole', 'replacement'], apply: (ctx) => closeContainer(ctx, 'mfrac', 1, 'Ended fraction. Returned to the surrounding expression.') },
  { id: 'script.superscript', commandLabel: 'Insert superscript', banaRefs: ['14.3', '14.4'], nemethSequences: ['⠘'], validContexts: ['replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'msup', ['base', 'superscript'], { focusRole: 'superscript' }); return { tree: result.replacement, focus: result.focus, announcement: 'Inserted superscript.' }; } },
  { id: 'script.subscript', commandLabel: 'Insert subscript', banaRefs: ['14.8'], nemethSequences: ['⠰'], validContexts: ['replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'msub', ['base', 'subscript'], { focusRole: 'subscript' }); return { tree: result.replacement, focus: result.focus, announcement: 'Inserted subscript.' }; } },
  { id: 'script.under', commandLabel: 'Insert underscript', banaRefs: ['14.8', '15.1'], nemethSequences: [], validContexts: ['replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'munder', ['base', 'underscript'], { focusRole: 'underscript' }); return { tree: result.replacement, focus: result.focus, announcement: 'Inserted underscript.' }; } },
  { id: 'script.over', commandLabel: 'Insert overscript', banaRefs: ['14.3', '15.1'], nemethSequences: [], validContexts: ['replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'mover', ['base', 'overscript'], { focusRole: 'overscript' }); return { tree: result.replacement, focus: result.focus, announcement: 'Inserted overscript.' }; } },
  { id: 'script.under-over', commandLabel: 'Insert underscript and overscript', banaRefs: ['14.3', '14.8'], nemethSequences: [], validContexts: ['replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'munderover', ['base', 'underscript', 'overscript'], { focusRole: 'underscript' }); return { tree: result.replacement, focus: result.focus, announcement: 'Inserted underscript and overscript.' }; } },
  { id: 'radical.insert.square', commandLabel: 'Insert square root', banaRefs: ['16.1', '16.2'], nemethSequences: ['⠜'], validContexts: ['row', 'hole', 'replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'msqrt', ['radicand'], { focusRole: 'radicand' }); return { tree: result.replacement, focus: result.focus, announcement: 'Inserted square root.' }; } },
  { id: 'radical.close', commandLabel: 'End radical', banaRefs: ['16.1.1'], nemethSequences: ['⠻'], validContexts: ['row', 'hole', 'replacement'], apply: (ctx) => closeContainer(ctx, 'msqrt', 0, 'Ended radical. Returned to the surrounding expression.') },
  { id: 'radical.insert.indexed', commandLabel: 'Insert indexed radical', banaRefs: ['16.2', '16.3'], nemethSequences: [], validContexts: ['row', 'hole', 'replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'mroot', ['radicand', 'index'], { focusRole: 'radicand' }); return { tree: result.replacement, focus: result.focus, announcement: 'Inserted indexed radical.' }; } },
  { id: 'group.insert.round', commandLabel: 'Insert grouped expression', banaRefs: ['19.1', '19.5'], nemethSequences: ['⠷'], validContexts: ['row', 'hole', 'replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'mrow', ['content'], { focusRole: 'content' }); result.replacement.attrs['data-omniya-group'] = 'round'; return { tree: result.replacement, focus: result.focus, announcement: 'Inserted grouped expression.' }; } },
  { id: 'bar.absolute', commandLabel: 'Insert absolute-value bars', banaRefs: ['19.9', '23.7'], nemethSequences: ['⠸'], validContexts: ['row', 'hole', 'replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'menclose', ['content'], { focusRole: 'content' }); result.replacement.attrs.notation = 'longdiv'; return { tree: result.replacement, focus: result.focus, announcement: 'Inserted absolute-value expression.' }; } },
  { id: 'bar.conditional', commandLabel: 'Insert conditional bar', banaRefs: ['23.7', '21.1'], nemethSequences: ['⠸'], validContexts: ['row', 'replacement'], apply: (ctx) => { const { tree, inserted } = insertAtom(ctx, 'mo', '|'); return { tree, focus: focusNode(inserted), announcement: 'Inserted conditional bar.' }; } },
  { id: 'function.sin', commandLabel: 'Insert sine function', banaRefs: ['18.1', '18.4'], nemethSequences: [], validContexts: ['row', 'hole', 'replacement'], apply: (ctx) => { const result = wrapFocused(ctx, 'mrow', ['function-argument'], { focusRole: 'function-argument' }); const fn = atom('mi', 'sin'); result.replacement.children.unshift(fn); return { tree: result.replacement, focus: result.focus, announcement: 'Inserted sine function. Editing argument.' }; } }
];

const OP_BY_ID = new Map(OPERATIONS.map((operation) => [operation.id, operation]));
const PREFIXES = new Map();
for (const operation of OPERATIONS) for (const sequence of operation.nemethSequences) {
  const normalized = [...sequence].map(normalizeCell).join('');
  for (let i = 1; i <= normalized.length; i += 1) {
    const prefix = normalized.slice(0, i);
    const current = PREFIXES.get(prefix) ?? { operations: [], complete: false };
    if (i === normalized.length) { current.complete = true; current.operations.push(operation); }
    PREFIXES.set(prefix, current);
  }
}
for (const prefix of PREFIXES.keys()) {
  const entry = PREFIXES.get(prefix);
  entry.hasLonger = [...PREFIXES.keys()].some((candidate) => candidate.startsWith(prefix) && candidate.length > prefix.length);
}

function applyOperation(context, operation, value) {
  if (context.node.name === 'math' && ['script.superscript', 'script.subscript'].includes(operation.id)) {
    return { status: 'rejected', inputState: context.inputState, announcement: `${operation.commandLabel} needs an expression to modify.` };
  }
  const kind = context.isHole ? 'hole' : context.inRow ? 'row' : 'replacement';
  if (!operation.validContexts.includes(kind)) return { status: 'rejected', inputState: context.inputState, announcement: `${operation.commandLabel} is not valid here.` };
  try {
    const result = operation.apply(context, value);
    const document = { ...context.document, formatVersion: MATH_FORMAT_VERSION, mathml: serializeMathML(result.tree), focus: result.focus };
    const append = operation.id.startsWith('atom.') || operation.id.startsWith('operator.');
    return { status: 'applied', document, focus: result.focus, inputState: { pendingCells: [], append, numeric: operation.id === 'atom.number' }, inversePatch: { document: context.document, focus: context.focus }, announcement: result.announcement };
  } catch (error) {
    return { status: 'rejected', inputState: context.inputState, announcement: error.message };
  }
}

export function operationRegistry() {
  return OPERATIONS.map(({ apply, ...entry }) => ({
    ...entry,
    errataRefs: entry.errataRefs ?? [],
    teachingRefs: entry.teachingRefs ?? [],
    focusAfter: entry.focusAfter ?? 'result',
    announcement: entry.announcement ?? entry.commandLabel
  }));
}

export function applyMathTransition({ document, focus, inputState = { pendingCells: [] }, input }) {
  if (!document?.mathml || !focus) return { status: 'rejected', inputState, announcement: 'No mathematical focus is active.' };
  const context = transitionContext(document, focus);
  context.inputState = inputState;
  if (input.kind === 'command') {
    const operation = OP_BY_ID.get(input.operationId);
    if (!operation) return { status: 'rejected', inputState, announcement: 'Unknown mathematical operation.' };
    return applyOperation(context, operation, null);
  }
  let cell;
  try { cell = normalizeCell(input.cell); } catch (error) { return { status: 'rejected', inputState, announcement: error.message }; }
  const pendingValue = Array.isArray(inputState.pendingCells) ? inputState.pendingCells.join('') : String(inputState.pendingCells ?? '');
  const pending = `${pendingValue}${cell}`;
  const contextKind = context.isHole ? 'hole' : context.inRow ? 'row' : 'replacement';
  if (!pendingValue && cell === '⠼') {
    const fraction = ancestorMatching(context.tree, context.node, (candidate) => candidate.name === 'mfrac');
    const denominator = fraction?.children?.[1];
    if (fraction && denominator && containsNode(context.tree, denominator, context.node)) {
      return applyOperation(context, OP_BY_ID.get('fraction.close.simple'), null);
    }
  }
  if (!pendingValue && cell === '⠻') {
    const radical = ancestorMatching(context.tree, context.node, (candidate) => candidate.name === 'msqrt');
    if (radical) return applyOperation(context, OP_BY_ID.get('radical.close'), null);
  }
  if (!pendingValue && cell === '⠼') return { status: 'pending', inputState: { pendingCells: '⠼' }, announcement: 'Number follows.' };
  if (inputState.numeric && DIGITS.has(cell)) return applyOperation(context, OP_BY_ID.get('atom.number'), DIGITS.get(cell));
  if (pendingValue === '⠼' && DIGITS.has(cell)) return applyOperation(context, OP_BY_ID.get('atom.number'), DIGITS.get(cell));
  if (!pendingValue && LETTERS.has(cell)) return applyOperation(context, OP_BY_ID.get('atom.letter'), LETTERS.get(cell));
  const match = PREFIXES.get(pending);
  if (match?.complete && match.operations.length > 1) {
    const candidates = [];
    for (const operation of OPERATIONS) {
      if (operation.validContexts.includes(contextKind) && operation.nemethSequences.some((sequence) => [...sequence].map(normalizeCell).join('').startsWith(pending)) && !candidates.includes(operation)) candidates.push(operation);
    }
    if (candidates.length === 1 && !match.hasLonger) return applyOperation(context, candidates[0], null);
    return { status: 'choice', choices: candidates.map(({ id, commandLabel, banaRefs }) => ({ operationId: id, label: commandLabel, banaRefs })), inputState: { pendingCells: pending }, announcement: 'Choose the meaning for this Nemeth sequence.' };
  }
  if (match?.complete && match.hasLonger) return { status: 'pending', inputState: { pendingCells: pending }, announcement: 'Nemeth sequence may continue.' };
  if (match?.complete && match.operations.length === 1) return applyOperation(context, match.operations[0], null);
  if (match && !match.complete) return { status: 'pending', inputState: { pendingCells: pending }, announcement: 'Nemeth sequence pending.' };
  return { status: 'rejected', inputState: { pendingCells: [] }, announcement: 'That Nemeth cell is not valid at this focus.' };
}
