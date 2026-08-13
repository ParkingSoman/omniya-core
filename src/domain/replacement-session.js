import {
  canonicalizeMathML,
  completionReport,
  parseMathML,
  replaceMathTarget,
  serializeMathML
} from './math-tree.js';
import {
  applyNemethCell as applyDraftNemethCell,
  applyNemethChoice as applyDraftNemethChoice,
  commitNemethLocalCode as commitDraftNemethLocalCode
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
  // A single input cell may finish one immediate code and become the prefix
  // of the next bounded code (for example plus followed by a letter that is
  // also the start of an abbreviated function).  The domain transition keeps
  // that first mutation in `result.document` while reporting `pending` for the
  // new local prefix.  Do not drop the mutation merely because the next code
  // is not complete yet.
  // A local cell can finish one immediate code and then expose a choice for
  // the next cell in the same event (for example a letter immediately before
  // a shared closing indicator). Preserve that first mutation even while the
  // second bounded code waits for the user's explicit choice. Dropping the
  // changed document here makes the UI appear to accept the letter while the
  // eventual choice silently edits an older draft.
  // Structural follow-ups can move the draft focus without changing the
  // serialized MathML (for example `>` moving from an indexed radical's
  // index slot to its radicand). Preserve that focus exactly like a content
  // mutation; otherwise the next physical cell is routed back to the stale
  // slot at the renderer boundary.
  if (result.status === 'applied' || result.document?.mathml !== session.draft.mathml ||
      JSON.stringify(result.focus) !== JSON.stringify(session.draftFocus ?? session.draft.focus)) {
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
  // Selecting a shorter meaning can commit that operation and leave the
  // unmatched suffix as the next bounded local prefix. Preserve the committed
  // draft even while the suffix remains pending, exactly as one-cell input
  // does; otherwise the renderer drops the comma/indicator mutation and
  // repeatedly reopens the same choice.
  if (result.status === 'applied' || (result.status === 'pending' && (
    result.document?.mathml !== session.draft.mathml ||
    JSON.stringify(result.focus) !== JSON.stringify(session.draftFocus ?? session.draft.focus)
  ))) {
    next.draft = result.document;
    next.draftFocus = result.focus;
  }
  return { ...result, session: next };
}

/** Commit exactly the bounded local code currently held by the Nemeth input. */
export function commitNemethLocalCode(session) {
  if (session.method !== 'nemeth') throw new Error('The replacement session is not in Nemeth mode.');
  const result = commitDraftNemethLocalCode({
    document: session.draft,
    focus: session.draftFocus ?? session.draft.focus,
    inputState: session.nemethState
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
