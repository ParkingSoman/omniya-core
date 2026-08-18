import {
  canonicalizeMathML,
  insertMathRelative,
  parseMathML,
  replaceMathTarget,
  serializeMathML
} from './math-tree.js';

function emptyDraft() {
  const tree = parseMathML('<math xmlns="http://www.w3.org/1998/Math/MathML"/>');
  return {
    formatVersion: 2,
    mathml: serializeMathML(tree),
    focus: { kind: 'node', nodeId: tree.attrs['data-omniya-id'] }
  };
}

function sessionHasDraftMath(session) {
  try {
    return parseMathML(session?.draft?.mathml ?? '').children.length > 0;
  } catch {
    return false;
  }
}

export function replacementSessionHasDraftMath(session) {
  return sessionHasDraftMath(session);
}

function cloneSession(session) {
  return structuredClone(session);
}

export function startReplacementSession({ document = null, target, explorerFocus = null, method = 'nemeth', placement = 'replace' }) {
  if (!target?.kind) throw new TypeError('A replacement target is required');
  if (!['nemeth', 'latex'].includes(method)) throw new TypeError('Unknown authoring method');
  if (!['replace', 'append', 'prepend'].includes(placement)) throw new TypeError('Unknown placement');
  const draft = emptyDraft();
  return {
    originalDocument: document ? structuredClone(document) : null,
    target: structuredClone(target),
    originalExplorerFocus: explorerFocus ? structuredClone(explorerFocus) : null,
    method,
    placement,
    draft,
    draftFocus: draft.focus,
    latexSource: ''
  };
}

export function setReplacementMethod(session, method) {
  if (!['nemeth', 'latex'].includes(method)) throw new TypeError('Unknown authoring method');
  const next = cloneSession(session);
  if (next.latexSource || sessionHasDraftMath(next)) {
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
  // Nemeth authoring was torn out in the nemeth-v2 rewrite (see Task 0). The
  // `method` field and the 'nemeth' session shape survive so Task 5 can
  // re-add the branch without rebuilding this plumbing; until then any
  // session that reaches here in Nemeth mode has no way to have gathered
  // content and cannot be submitted.
  throw new Error('Nemeth input is unavailable on this branch.');
}

function applyDraftToDocument(document, target, tree, placement = 'replace') {
  const current = parseMathML(document.mathml);
  if (placement === 'append' || placement === 'prepend') {
    return insertMathRelative(current, target, tree, placement);
  }
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
  const nextTree = applyDraftToDocument(
    session.originalDocument,
    session.target,
    tree,
    session.placement ?? 'replace'
  );
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
