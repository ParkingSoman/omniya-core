import {
  canonicalizeMathML,
  insertMathRelative,
  parseMathML,
  replaceMathTarget,
  serializeMathML
} from './math-tree.js';
import { resolveBrailleInputTable, toNemethCells } from './nemeth-input.js';
import { parseNemeth } from './nemeth/index.js';

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
    latexSource: '',
    nemethSource: ''
  };
}

export function setReplacementMethod(session, method) {
  if (!['nemeth', 'latex'].includes(method)) throw new TypeError('Unknown authoring method');
  const next = cloneSession(session);
  if (next.latexSource || next.nemethSource || sessionHasDraftMath(next)) {
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

/**
 * The Nemeth counterpart of `setLatexSource`: the session accumulates the
 * authored source exactly as written, and nothing is parsed until submit.
 *
 * Like `latexSource` this is the author's text, not a processed form -- either
 * Unicode braille cells or the Braille ASCII that spells them. `materializeDraft`
 * is the single place both are converted and validated, so a caller cannot
 * store a partially-converted buffer and have it commit truncated.
 *
 * `U+2800` is an ordinary character here: it is a Nemeth TOKEN (Rule 20/21
 * comparison spacing), not a terminator, so this must never be routed through
 * `ueb-cell-buffer.js`, which flushes on it.
 */
export function setNemethSource(session, source) {
  if (session.method !== 'nemeth') throw new Error('The replacement session is not in Nemeth mode.');
  const next = cloneSession(session);
  next.nemethSource = String(source ?? '');
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

async function materializeDraft(session, convertLatexToMathML, brailleInputTable) {
  if (session.method === 'latex') {
    if (!session.latexSource.trim()) throw new Error('Replacement draft is empty.');
    if (typeof convertLatexToMathML !== 'function') throw new Error('The local LaTeX converter is unavailable.');
    const mathml = canonicalizeMathML(await convertLatexToMathML(session.latexSource));
    return parseMathML(mathml);
  }
  // Nemeth: cells -> LaTeX -> the SAME convertLatexToMathML path the LaTeX
  // branch above uses. Deliberately not a second MathML generator: routing both
  // authoring methods through one converter is what keeps Nemeth-authored and
  // LaTeX-authored expressions from drifting apart, and it is why the parser
  // emits LaTeX rather than MathML (src/domain must not import src/main).
  //
  // `parseNemeth` throws `NemethUnsupportedError` for anything out of scope.
  // That propagates to the caller unchanged: its `message` is the single
  // product-approved sentence, so a UI can show `error.message` directly, and
  // its developer-only `detail` never rides along in it.
  const authored = String(session.nemethSource ?? '');
  if (!authored.trim()) throw new Error('Replacement draft is empty.');
  // `brailleInputTable` must be the SAME table the composer classified with.
  // Omitting it here was the bug behind "I can enter an equation, but Enter
  // says cells must be in braille": a keyboard sending computer-braille ASCII
  // decoded fine on every keystroke and was then re-read with no table at
  // commit, so the buffer the status line had just narrated as "read as 2+2=4"
  // was refused character by character.
  // Resolve here too, not just in the composer: `'auto'` is not a decoder key,
  // so passing it through raw would decode nothing and refuse everything. Both
  // paths resolving the same pure function over the same buffer is what keeps
  // submit agreeing with the status line the author just heard.
  const { cells, rejected } = toNemethCells(
    authored,
    resolveBrailleInputTable(authored, brailleInputTable)
  );
  // Refuse rather than commit the cells that did convert. The composer strips
  // non-cell characters as they are typed, so this is normally unreachable --
  // but a session assembled any other way must not be able to commit a quietly
  // filtered buffer, which is exactly the plausible-but-wrong answer a braille
  // author has no way to notice.
  if (rejected.length) {
    throw new Error(
      `Braille cells only: ${JSON.stringify(rejected[0].character)} at character ${rejected[0].index + 1} is not one.`
    );
  }
  if (typeof convertLatexToMathML !== 'function') throw new Error('The local LaTeX converter is unavailable.');
  const { latex } = parseNemeth(cells);
  const mathml = canonicalizeMathML(await convertLatexToMathML(latex));
  return parseMathML(mathml);
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

export async function submitReplacement(session, { convertLatexToMathML, brailleInputTable } = {}) {
  const tree = await materializeDraft(session, convertLatexToMathML, brailleInputTable);
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
