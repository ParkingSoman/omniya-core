import {
  canonicalizeMathML,
  completionReport,
  parseMathML,
  replaceMathTarget,
  serializeMathML
} from './math-tree.js';
import {
  applyNemethCell as applyDraftNemethCell,
  applyNemethChoice as applyDraftNemethChoice
} from './guided-nemeth/index.js';

function emptyDraft() {
  const tree = parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML"/>');
  return {
    formatVersion: 2,
    mathml: serializeMathML(tree),
    focus: { kind: 'node', nodeId: tree.attrs['data-omniya-id'] }
  };
}

function cloneSession(session) {
  return structuredClone(session);
}

export function startReplacementSession({ document = null, target, explorerFocus = null, method = 'nemeth' }) {
  if (!target?.kind) throw new TypeError('A replacement target is required');
  if (!['nemeth', 'latex'].includes(method)) throw new TypeError('Unknown authoring method');
  const draft = emptyDraft();
  return {
    originalDocument: document ? structuredClone(document) : null,
    target: structuredClone(target),
    originalExplorerFocus: explorerFocus ? structuredClone(explorerFocus) : null,
    method,
    draft,
    draftFocus: draft.focus,
    nemethState: { prefix: '', mode: null },
    latexSource: ''
  };
}

export function setReplacementMethod(session, method) {
  if (!['nemeth', 'latex'].includes(method)) throw new TypeError('Unknown authoring method');
  const next = cloneSession(session);
  if (next.latexSource || next.nemethState?.prefix || next.nemethState?.mode || next.draft?.mathml?.includes('<mi>') || next.draft?.mathml?.includes('<mn>') || next.draft?.mathml?.includes('<mo>')) {
    throw new Error('Authoring method can only change before entering content.');
  }
  next.method = method;
  return next;
}

export function setLatexSource(session, source) {
  if (session.method !== 'latex') throw new Error('The replacement session is not in LaTeX mode.');
  const next = cloneSession(session);
  next.latexSource = String(source ?? '');
  return next;
}

export function applyNemethCell(session, cell) {
  if (session.method !== 'nemeth') throw new Error('The replacement session is not in Nemeth mode.');
  const result = applyDraftNemethCell({
    document: session.draft,
    focus: session.draftFocus ?? session.draft.focus,
    inputState: session.nemethState,
    cell
  });
  const next = cloneSession(session);
  next.nemethState = result.inputState;
  if (result.status === 'applied') {
    next.draft = result.document;
    next.draftFocus = result.focus;
  }
  return { ...result, session: next };
}

export function applyNemethChoice(session, operationId) {
  if (session.method !== 'nemeth') throw new Error('The replacement session is not in Nemeth mode.');
  const result = applyDraftNemethChoice({
    document: session.draft,
    focus: session.draftFocus ?? session.draft.focus,
    inputState: session.nemethState,
    operationId
  });
  const next = cloneSession(session);
  next.nemethState = result.inputState;
  if (result.status === 'applied') {
    next.draft = result.document;
    next.draftFocus = result.focus;
  }
  return { ...result, session: next };
}

function replacementNode(tree) {
  const children = tree.children.filter((child) => child.text === undefined);
  if (!children.length) throw new Error('Replacement draft is empty.');
  if (children.length === 1) return children[0];
  return {
    name: 'mrow',
    attrs: { 'data-omniya-id': `omniya-${globalThis.crypto.randomUUID()}` },
    children
  };
}

async function materializeDraft(session, convertLatexToMathML) {
  if (session.method === 'latex') {
    if (!session.latexSource.trim()) throw new Error('Replacement draft is empty.');
    if (typeof convertLatexToMathML !== 'function') throw new Error('The local LaTeX converter is unavailable.');
    const mathml = canonicalizeMathML(await convertLatexToMathML(session.latexSource));
    return parseMathML(mathml);
  }
  const tree = parseMathML(session.draft.mathml);
  if (!tree.children.length) throw new Error('Replacement draft is empty.');
  const completion = completionReport(tree);
  if (!completion.complete) {
    const first = completion.holes[0];
    throw new Error(`Replacement draft is incomplete at ${first.role}.`);
  }
  return tree;
}

function replaceRoot(document, target, tree) {
  const current = parseMathML(document.mathml);
  if (target.kind === 'node' && target.nodeId === current.attrs['data-omniya-id']) {
    const next = structuredClone(current);
    next.children = structuredClone(tree.children);
    return next;
  }
  const replacement = replacementNode(tree);
  return replaceMathTarget(current, target, replacement);
}

export async function submitReplacement(session, { convertLatexToMathML } = {}) {
  const tree = await materializeDraft(session, convertLatexToMathML);
  if (!session.originalDocument) {
    return {
      document: { formatVersion: 2, mathml: serializeMathML(tree), focus: null },
      focus: { kind: 'node', nodeId: tree.children[0].attrs['data-omniya-id'] },
      inversePatch: null
    };
  }
  const previous = structuredClone(session.originalDocument);
  const nextTree = replaceRoot(session.originalDocument, session.target, tree);
  const document = { ...previous, formatVersion: 2, mathml: serializeMathML(nextTree), focus: session.target };
  return {
    document,
    focus: session.target,
    inversePatch: { document: previous, focus: session.target }
  };
}

export function cancelReplacement(session) {
  return {
    document: session.originalDocument ? structuredClone(session.originalDocument) : null,
    focus: structuredClone(session.target),
    explorerFocus: session.originalExplorerFocus ? structuredClone(session.originalExplorerFocus) : null
  };
}
