/** Join MathJax explorer focus in one article to a persisted MathML slot. */

export function canonicalId(node) {
  return node?.getAttribute?.('data-omniya-id') || node?.id?.replace(/^omniya-source-/, '') || null;
}

/** Application-owned MathML in the article, not MathJax's sanitized assistive clone. */
export function authoredSourceRoot(article) {
  const maths = [...(article.querySelectorAll?.('math') ?? [])];
  const notAssistive = (math) => !math.closest?.('mjx-assistive-mml');
  return maths.find((math) => notAssistive(math) && (canonicalId(math) || math.querySelector?.('[data-omniya-id], [id^="omniya-source-"]')))
    || maths.find((math) => canonicalId(math))
    || maths[0]
    || null;
}

function speechExplorerFor(article) {
  const doc = globalThis.MathJax?.startup?.document;
  if (!doc || typeof doc.getMathItemsWithin !== 'function') return null;
  return doc.getMathItemsWithin(article)?.[0]?.explorers?.speech ?? null;
}

function authoredNodeBySemanticId(sourceRoot, semanticId) {
  if (!sourceRoot || !semanticId) return null;
  return [sourceRoot, ...sourceRoot.querySelectorAll('[data-semantic-id]')]
    .find((node) => node.getAttribute('data-semantic-id') === semanticId) || null;
}

/** Every element in the article that carries this semantic id. */
const withSemanticId = (article, id) => (id ? [...article.querySelectorAll('[data-semantic-id]')] : [])
  .filter((element) => element.getAttribute('data-semantic-id') === id);

function authoredNodeBySlotId(sourceRoot, slotId) {
  if (!sourceRoot || !slotId) return null;
  return [sourceRoot, ...sourceRoot.querySelectorAll('[data-omniya-id], [id^="omniya-source-"]')]
    .find((node) => canonicalId(node) === slotId) || null;
}

function slotFocus(sourceNode, speechNode) {
  const nodeId = canonicalId(sourceNode);
  if (!nodeId) return null;
  return {
    semanticId: sourceNode.getAttribute?.('data-semantic-id') || `canonical:${nodeId}`,
    semanticPath: [],
    target: { kind: 'node', nodeId },
    subtreeMathML: sourceNode.outerHTML || '',
    speech: speechNode?.getAttribute?.('data-semantic-speech-none')
      || speechNode?.getAttribute?.('data-speech')
      || speechNode?.getAttribute?.('aria-label')
      || '',
    nemeth: speechNode?.getAttribute?.('data-braille')
      || speechNode?.getAttribute?.('aria-braillelabel')
      || ''
  };
}

/**
 * The parts of the saved equation that make up a group the reader can stand on.
 * MathJax makes groups of its own, such as "x plus 1" inside a root, that are not
 * one part of the saved equation. Each such group knows the ones it is made of, so
 * they are followed down until parts of the saved equation are reached.
 */
function authoredCover(article, sourceRoot, semanticId, seen = new Set()) {
  if (!semanticId || seen.has(semanticId)) return [];
  seen.add(semanticId);
  const direct = authoredNodeBySemanticId(sourceRoot, semanticId);
  if (direct && direct !== sourceRoot) return [direct];
  const holder = withSemanticId(article, semanticId)
    .find((element) => element.getAttribute('data-semantic-owns') != null || element.getAttribute('data-semantic-children') != null);
  // `owns` is everything inside the group, signs included. `children` leaves the signs out.
  const owned = (holder?.getAttribute('data-semantic-owns') ?? holder?.getAttribute('data-semantic-children') ?? '')
    .split(/[\s,]+/).filter(Boolean);
  return owned.flatMap((id) => authoredCover(article, sourceRoot, id, seen));
}

const hasIdentity = (element) => Boolean(canonicalId(element));

/** The parts of the saved equation directly under `element`, looking through wrappers MathJax added. */
const authoredChildren = (element) => [...element.children]
  .flatMap((child) => (hasIdentity(child) ? [child] : authoredChildren(child)));

/** The one part, or the run of neighbouring parts under one parent, that holds all of `nodes`. */
function coverTarget(sourceRoot, nodes) {
  if (!nodes.length) return null;
  if (nodes.length === 1) {
    const nodeId = canonicalId(nodes[0]);
    return nodeId ? { kind: 'node', nodeId } : null;
  }
  let parent = nodes[0].parentElement;
  while (parent && !(hasIdentity(parent) && nodes.every((node) => parent.contains(node)))) parent = parent.parentElement;
  if (!parent) return null;
  const children = authoredChildren(parent);
  const indices = nodes.map((node) => children.findIndex((child) => child.contains(node)));
  if (indices.some((i) => i < 0)) return null;
  const first = children[Math.min(...indices)];
  const last = children[Math.max(...indices)];
  return first === last
    ? { kind: 'node', nodeId: canonicalId(first) }
    : { kind: 'range', parentNodeId: canonicalId(parent), firstNodeId: canonicalId(first), lastNodeId: canonicalId(last) };
}

/**
 * A sign the reader stops on that is not in the saved equation at all, such as the
 * invisible "times" between two brackets. It is a spot between its neighbours, so
 * the part just before it is the target, and anything typed goes in after that part.
 */
function gapTarget(article, sourceRoot, focused) {
  const id = focused.getAttribute('data-semantic-id');
  const parentId = focused.getAttribute('data-semantic-parent');
  const parent = withSemanticId(article, parentId).find((element) => element.getAttribute('data-semantic-owns') != null);
  const owned = (parent?.getAttribute('data-semantic-owns') ?? '').split(/[\s,]+/).filter(Boolean);
  const at = owned.indexOf(id);
  if (at < 0) return null;
  for (let i = at - 1; i >= 0; i -= 1) {
    const cover = authoredCover(article, sourceRoot, owned[i]);
    const last = cover.at(-1);
    if (last && canonicalId(last)) return { kind: 'node', nodeId: canonicalId(last) };
  }
  return null;
}

function refuseReplace(debug) {
  console.warn('[omniya] replace refused', debug);
  globalThis.__omniyaReplaceRefusals ??= [];
  globalThis.__omniyaReplaceRefusals.push(debug);
  throw new Error('Explorer focus is not a MathML element that can be replaced');
}

export function captureExplorerFocus(article) {
  const sourceRoot = authoredSourceRoot(article);
  if (!sourceRoot) throw new Error('No authored MathML in this article');

  const explorer = speechExplorerFor(article);
  const current = explorer?.current || explorer?.refocus;
  const focused = current && article.contains?.(current) ? current : null;
  if (!focused) {
    const focus = slotFocus(sourceRoot, sourceRoot);
    if (!focus) throw new Error('Authored equation has no slot identity');
    return { ...focus, speech: focus.speech || 'whole equation' };
  }

  const sourceNode = authoredNodeBySemanticId(sourceRoot, focused.getAttribute('data-semantic-id'))
    || authoredNodeBySlotId(sourceRoot, canonicalId(focused));
  let focus = sourceNode ? slotFocus(sourceNode, focused) : null;
  if (!focus) {
    // A group MathJax made itself: edit the part or run of parts it is made of.
    const cover = authoredCover(article, sourceRoot, focused.getAttribute('data-semantic-id'));
    const target = coverTarget(sourceRoot, cover) ?? (cover.length ? null : gapTarget(article, sourceRoot, focused));
    if (target) {
      focus = {
        gap: cover.length === 0,
        semanticId: focused.getAttribute('data-semantic-id'),
        semanticPath: [],
        target,
        subtreeMathML: '',
        speech: focused.getAttribute('data-semantic-speech-none') || focused.getAttribute('data-speech') || focused.getAttribute('aria-label') || '',
        nemeth: focused.getAttribute('data-braille') || focused.getAttribute('aria-braillelabel') || ''
      };
    }
  }
  if (!focus) {
    refuseReplace({
      reason: 'virtual-or-unmapped',
      semanticId: focused.getAttribute('data-semantic-id'),
      semanticType: focused.getAttribute('data-semantic-type'),
      speech: focused.getAttribute('data-speech') || focused.getAttribute('aria-label') || '',
      currentOmniya: canonicalId(focused),
      rootId: canonicalId(sourceRoot)
    });
  }
  return focus;
}

export async function restoreExplorerFocus(article, address, explorerFocus = null) {
  const id = address?.kind === 'node' ? address.nodeId : address?.firstNodeId;
  const node = [...article.querySelectorAll('[data-omniya-id], [id^="omniya-source-"]')]
    .find((candidate) => canonicalId(candidate) === id);
  if (!node) return false;
  node.focus?.();
  const explorer = speechExplorerFor(article);
  const semanticId = node.getAttribute('data-semantic-id') || explorerFocus?.semanticId;
  if (explorer?.setCurrent) {
    explorer.setCurrent(node);
  } else if (explorer && semanticId) {
    explorer.restarted = `#${CSS.escape(node.id || `omniya-source-${id}`)}`;
    explorer.refocus = node;
    await explorer.Start?.();
  }
  return true;
}
