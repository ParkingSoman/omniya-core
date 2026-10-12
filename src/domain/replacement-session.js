import {
  buildMathIndex,
  canonicalizeMathML,
  insertMathRelative,
  parseMathML,
  replaceMathTarget,
  serializeMathML
} from './math-tree.js';
import { resolveBrailleInputTable, toNemethCells } from './nemeth-input.js';
import { parseNemeth } from './nemeth/index.js';
import { dropStaleLatex, latexFromTree, symbolText, withoutStretchyFences, leafNodes, leafPositionsUnder, nodeForInserted } from './math-latex.js';

const KEEP = { keepLatex: true };

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
    const mathml = canonicalizeMathML(await convertLatexToMathML(session.latexSource), KEEP);
    return parseMathML(mathml, KEEP);
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
  const mathml = canonicalizeMathML(await convertLatexToMathML(latex), KEEP);
  return parseMathML(mathml, KEEP);
}

function applyDraftToDocument(document, target, tree, placement = 'replace') {
  const current = parseMathML(document.mathml, KEEP);
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

/**
 * What the draft would draw, without inserting it: the MathML of the new part.
 * It goes through the same conversion as `submitReplacement`, so the preview and
 * the result cannot disagree. It throws what a submit would throw (an empty or
 * unfinished draft), and the caller treats that as "nothing to show yet".
 */
export async function previewDraftMathML(session, { convertLatexToMathML, brailleInputTable } = {}) {
  const tree = await materializeDraft(session, convertLatexToMathML, brailleInputTable);
  return serializeMathML(tree);
}

const idOf = (node) => node.attrs['data-omniya-id'];

/** The ids of the nodes above `nodeId`, nearest first, not counting the root. */
function ancestorIds(tree, nodeId) {
  const index = buildMathIndex(tree);
  const out = [];
  for (let at = index.get(nodeId)?.parent; at && at !== tree; at = index.get(idOf(at))?.parent) out.push(idOf(at));
  return out;
}

/**
 * Put the draft where the edit says, write the whole expression as LaTeX and
 * read it again, the way a new equation is read. The tree is then what a fresh
 * parse gives, whatever the splice produced, and this holds for every symbol the
 * converter knows. Returns the spliced tree, and `converted` when the rebuild worked.
 */
async function applyAndRebuild({ session, tree, target, placement, convertLatexToMathML }) {
  const spliced = applyDraftToDocument(session.originalDocument, target, tree, placement);

  // Nodes this edit made. A replacement takes the id of what it replaced.
  const made = new Set();
  const collect = (node) => {
    if (node.text !== undefined) return;
    made.add(idOf(node));
    node.children.forEach(collect);
  };
  collect(tree);
  if (placement === 'replace') made.add(target.kind === 'node' ? target.nodeId : target.firstNodeId);
  // Every node above the edit now describes something else, so what MathJax
  // wrote for it no longer applies.
  dropStaleLatex(spliced, made);

  if (typeof convertLatexToMathML !== 'function') return { spliced, made, converted: null };
  // First as MathJax wrote the parts that were not touched, so the equation keeps the
  // form it was typed in. Then from the structure alone, in case a label was wrong.
  // Each written text is tried as it is, then without \left ... \right, because
  // editing one fence of a pair leaves the other with nothing to match.
  for (const trust of [true, false]) {
    const written = latexFromTree(spliced, { trust });
    if (!written) continue;
    for (const candidate of new Set([written, withoutStretchyFences(written)])) {
      try {
        const mathml = canonicalizeMathML(await convertLatexToMathML(candidate), KEEP);
        // The rebuilt equation must hold exactly the symbols the edit left. If the
        // writer lost or made up a symbol, this form is not used.
        if (symbolText(parseMathML(mathml, KEEP)) !== symbolText(spliced)) continue;
        return { spliced, made, converted: { mathml, latex: candidate } };
      } catch {
        // try the next form
      }
    }
  }
  return { spliced, made, converted: null };
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
  const placement = session.placement ?? 'replace';
  const original = parseMathML(previous.mathml, KEEP);

  // Inserting beside a part that has no outline of its own (the accent on a letter,
  // say) is inserting beside the part it belongs to. So if the rebuild cannot be
  // done where the person pointed, it is tried one level up, then another.
  const targets = [session.target];
  if (placement !== 'replace' && session.target.kind === 'node') {
    for (const id of ancestorIds(original, session.target.nodeId).slice(0, 3)) targets.push({ kind: 'node', nodeId: id });
  }
  let attempt = null;
  for (const target of targets) {
    const tried = await applyAndRebuild({ session, tree, target, placement, convertLatexToMathML });
    attempt ??= tried; // if nothing can be rebuilt, the first splice is what the edit keeps
    if (tried.converted) { attempt = tried; break; }
  }

  let nextTree = attempt.spliced;
  let latex = null;
  let focus = session.target;
  if (attempt.converted) {
    const fresh = parseMathML(attempt.converted.mathml, KEEP);
    // Where the reader lands: on the new part after a replace, and still on the
    // part they were on after an append or prepend.
    const stays = placement === 'replace'
      ? attempt.made
      : new Set([session.target.kind === 'node'
        ? session.target.nodeId
        : (placement === 'append' ? session.target.lastNodeId : session.target.firstNodeId)]);
    const inserted = leafPositionsUnder(attempt.spliced, stays);
    nextTree = fresh;
    latex = attempt.converted.latex;
    // Fresh ids, so find the part by where its leaves sit in reading order. If the
    // two readings disagree on the leaf count, stand on the whole expression. Where
    // no node holds exactly the part, stand on its first leaf.
    const covering = inserted.length && leafNodes(fresh).length === leafNodes(attempt.spliced).length
      ? nodeForInserted(fresh, inserted[0], inserted.at(-1))
      : fresh;
    focus = { kind: 'node', nodeId: idOf(covering) };
  }
  // Otherwise the converter refused every form. The edit still happens, and keeps
  // the shape the splice gave it.
  const document = { ...previous, formatVersion: 2, mathml: serializeMathML(nextTree), focus };
  return {
    document,
    focus,
    latex,
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
