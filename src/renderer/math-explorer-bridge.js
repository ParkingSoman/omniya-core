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
  const focus = sourceNode ? slotFocus(sourceNode, focused) : null;
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
