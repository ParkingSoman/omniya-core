/** Boundary between MathJax/SRE's ephemeral explorer and the persisted tree. */

function descendantsWithCanonicalIds(node) {
  return [node, ...node.querySelectorAll?.('[data-omniya-id], [id^="omniya-source-"]') ?? []]
    .filter((candidate) => Boolean(canonicalId(candidate)));
}

function directCanonicalDescendants(node) {
  const all = descendantsWithCanonicalIds(node);
  return all.filter((candidate) => {
    let parent = candidate.parentElement;
    while (parent && parent !== node) {
      if (canonicalId(parent)) return false;
      parent = parent.parentElement;
    }
    return parent === node;
  });
}

function canonicalId(node) {
  return node?.getAttribute?.('data-omniya-id') || node?.id?.replace(/^omniya-source-/, '') || null;
}

function canonicalTargetForSourceNode(sourceNode) {
  const sourceId = canonicalId(sourceNode);
  if (sourceId) {
    return { kind: 'node', nodeId: sourceId };
  }
  const descendants = directCanonicalDescendants(sourceNode);
  if (!descendants.length) return null;
  let parent = sourceNode.parentElement;
  while (parent && !canonicalId(parent)) parent = parent.parentElement;
  if (!parent) throw new Error('Explorer focus cannot resolve to a canonical parent');
  const parentChildren = [...parent.children].filter((child) => Boolean(canonicalId(child)));
  const first = parentChildren.indexOf(descendants[0]);
  const last = parentChildren.indexOf(descendants.at(-1));
  if (first < 0 || last < first || parentChildren.slice(first, last + 1).some((child) => !descendants.includes(child))) {
    throw new Error('Explorer focus resolves to a non-contiguous canonical range');
  }
  return {
    kind: 'range',
    parentNodeId: canonicalId(parent),
    firstNodeId: canonicalId(descendants[0]),
    lastNodeId: canonicalId(descendants.at(-1))
  };
}

export function captureExplorerFocus(article) {
  const semanticSelector = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.semanticFocus?.();
  const focused = (semanticSelector
    ? article.querySelector(`mjx-container ${semanticSelector}`) || article.querySelector(`mjx-assistive-mml ${semanticSelector}`)
    : null) || article.querySelector('[data-semantic-focus="true"], [data-semantic-id][aria-current="true"]');
  if (!focused) throw new Error('MathJax explorer has no focused node');
  const semanticId = focused.getAttribute('data-semantic-id');
  if (!semanticId) throw new Error('MathJax explorer focus has no semantic identity');
  const sourceRoot = article.querySelector('mjx-assistive-mml math');
  const sourceNode = sourceRoot && [sourceRoot, ...sourceRoot.querySelectorAll('[data-semantic-id]')]
    .find((candidate) => candidate.getAttribute('data-semantic-id') === semanticId);
  // MathJax preserves source identities on the visual semantic nodes but
  // sanitizes unknown attributes in the assistive copy (for example,
  // `data-omniya-id` may become an empty `data-omniya-`). Prefer the source
  // node when it retained the identity, then use the matching visual node.
  const target = canonicalTargetForSourceNode(sourceNode) || canonicalTargetForSourceNode(focused);
  if (!target) throw new Error('Explorer focus cannot resolve to a canonical node or range');
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
    subtreeMathML: sourceNode?.outerHTML || '',
    speech: focused.getAttribute('data-speech') || focused.getAttribute('aria-label') || explorerSpeech?.getAttribute('aria-label') || '',
    nemeth: focused.getAttribute('data-braille') || focused.getAttribute('aria-braillelabel') || explorerSpeech?.getAttribute('aria-braillelabel') || ''
  };
}

export async function restoreExplorerFocus(article, address, explorerFocus = null) {
  const id = address?.kind === 'node' ? address.nodeId : address?.firstNodeId;
  const node = [...article.querySelectorAll('[data-omniya-id]')].find((candidate) => candidate.getAttribute('data-omniya-id') === id);
  if (!node) return false;
  node.focus?.();
  const explorer = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech;
  const semanticId = node.getAttribute('data-semantic-id') || explorerFocus?.semanticId;
  if (explorer?.setNode && semanticId) explorer.setNode(semanticId);
  return true;
}
