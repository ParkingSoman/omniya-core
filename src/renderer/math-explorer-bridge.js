/** Boundary between MathJax/SRE's ephemeral explorer and the persisted tree. */
export function captureExplorerFocus(article) {
  const semanticSelector = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.semanticFocus?.();
  const focused = (semanticSelector
    ? article.querySelector(`mjx-container ${semanticSelector}`) || article.querySelector(`mjx-assistive-mml ${semanticSelector}`)
    : null) || article.querySelector('[data-semantic-focus="true"], [data-semantic-id][aria-current="true"]') || article.querySelector('[data-semantic-id]');
  if (!focused) throw new Error('MathJax explorer has no focused node');
  const semanticId = focused.getAttribute('data-semantic-id');
  const targetNode = focused.closest('[data-omniya-id]');
  const descendants = [...focused.querySelectorAll?.('[data-omniya-id]') ?? []];
  let target = targetNode ? { kind: 'node', nodeId: targetNode.getAttribute('data-omniya-id') } : null;
  if (!target && descendants.length) {
    const first = descendants[0];
    const last = descendants.at(-1);
    const parent = first.parentElement;
    const siblings = [...(parent?.children ?? [])].filter((candidate) => candidate.hasAttribute?.('data-omniya-id'));
    const a = siblings.indexOf(first);
    const b = siblings.indexOf(last);
    if (!parent?.getAttribute('data-omniya-id') || a < 0 || b < a) throw new Error('Explorer focus resolves to a non-contiguous canonical range');
    target = { kind: 'range', parentNodeId: parent.getAttribute('data-omniya-id'), firstNodeId: first.getAttribute('data-omniya-id'), lastNodeId: last.getAttribute('data-omniya-id') };
  }
  if (!target) throw new Error('Explorer focus cannot resolve to a canonical node');
  // MathJax keeps the focused Nemeth string on the transient explorer speech
  // node, not on the source MathML element. Read that accessibility channel
  // while retaining the canonical source node as the edit target.
  const explorerSpeech = article.querySelector('mjx-speech[aria-braillelabel]');
  const semanticPath = [];
  let cursor = focused;
  while (cursor && cursor !== article) {
    semanticPath.unshift({ type: cursor.getAttribute('data-semantic-type') || cursor.tagName.toLowerCase(), role: cursor.getAttribute('data-semantic-role') || '', ordinal: [...(cursor.parentElement?.children ?? [])].indexOf(cursor) });
    cursor = cursor.parentElement;
  }
  return {
    semanticId,
    semanticPath,
    target,
    subtreeMathML: (targetNode || descendants[0])?.outerHTML || '',
    speech: focused.getAttribute('data-speech') || focused.getAttribute('aria-label') || explorerSpeech?.getAttribute('aria-label') || '',
    nemeth: focused.getAttribute('data-braille') || focused.getAttribute('aria-braillelabel') || explorerSpeech?.getAttribute('aria-braillelabel') || ''
  };
}

export async function restoreExplorerFocus(article, address) {
  const id = address?.kind === 'node' ? address.nodeId : address?.firstNodeId;
  const node = [...article.querySelectorAll('[data-omniya-id]')].find((candidate) => candidate.getAttribute('data-omniya-id') === id);
  if (!node) return false;
  node.focus?.();
  const explorer = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech;
  const semanticId = node.getAttribute('data-semantic-id');
  if (explorer?.setNode && semanticId) explorer.setNode(semanticId);
  return true;
}
