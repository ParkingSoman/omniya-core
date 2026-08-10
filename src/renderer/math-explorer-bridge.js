/** Boundary between MathJax/SRE's ephemeral explorer and the persisted tree. */
export function captureExplorerFocus(article) {
  const semanticSelector = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.semanticFocus?.();
  const focused = (semanticSelector
    ? article.querySelector(`mjx-container ${semanticSelector}`) || article.querySelector(`mjx-assistive-mml ${semanticSelector}`)
    : null) || article.querySelector('[data-semantic-focus="true"], [data-semantic-id][aria-current="true"]') || article.querySelector('[data-semantic-id]');
  if (!focused) throw new Error('MathJax explorer has no focused node');
  const semanticId = focused.getAttribute('data-semantic-id');
  const targetNode = focused.closest('[data-omniya-id]') || article.querySelector('[data-omniya-id]');
  if (!targetNode) throw new Error('Explorer focus cannot resolve to a canonical node');
  const semanticPath = [];
  let cursor = focused;
  while (cursor && cursor !== article) {
    semanticPath.unshift({ type: cursor.getAttribute('data-semantic-type') || cursor.tagName.toLowerCase(), role: cursor.getAttribute('data-semantic-role') || '', ordinal: [...(cursor.parentElement?.children ?? [])].indexOf(cursor) });
    cursor = cursor.parentElement;
  }
  return { semanticId, semanticPath, target: { kind: 'node', nodeId: targetNode.getAttribute('data-omniya-id') }, subtreeMathML: targetNode.outerHTML, speech: focused.getAttribute('data-speech') || '', nemeth: focused.getAttribute('data-braille') || '' };
}

export async function restoreExplorerFocus(article, address) {
  const node = [...article.querySelectorAll('[data-omniya-id]')].find((candidate) => candidate.getAttribute('data-omniya-id') === address.nodeId);
  if (!node) return false;
  node.focus?.();
  return true;
}
