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

function semanticReferences(node) {
  return [
    ...(node?.getAttribute('data-semantic-children') || '').split(/\s+/),
    ...(node?.getAttribute('data-semantic-content') || '').split(/\s+/),
    ...(node?.getAttribute('data-semantic-owns') || '').split(/\s+/)
  ].filter(Boolean);
}

function semanticDescendants(node, bySemanticId, seen = new Set()) {
  const id = node?.getAttribute?.('data-semantic-id');
  if (id) seen.add(id);
  for (const childId of semanticReferences(node)) {
    if (seen.has(childId)) continue;
    const child = bySemanticId.get(childId);
    if (child) semanticDescendants(child, bySemanticId, seen);
  }
  return seen;
}

function targetForCanonicalIds(sourceRoot, ids) {
  const wanted = new Set(ids);
  const nodes = [sourceRoot, ...sourceRoot.querySelectorAll('[data-omniya-id], [id^="omniya-source-"]')]
    .filter((node) => wanted.has(canonicalId(node)));
  if (!nodes.length) return null;
  // If the semantic focus includes a canonical ancestor and its descendants,
  // the ancestor is the exact target and is preferable to a range below it.
  const selected = nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
  if (selected.length === 1) return { kind: 'node', nodeId: canonicalId(selected[0]) };

  let parent = selected[0].parentElement;
  while (parent && !selected.every((node) => parent.contains(node))) parent = parent.parentElement;
  if (!parent) return null;
  const direct = selected.map((node) => {
    let current = node;
    while (current.parentElement && current.parentElement !== parent) current = current.parentElement;
    return current;
  });
  const unique = [...new Set(direct)];
  const canonicalChildren = [...parent.children].filter((child) => Boolean(canonicalId(child)));
  const positions = unique.map((node) => canonicalChildren.indexOf(node)).sort((a, b) => a - b);
  if (positions.some((position) => position < 0) || positions.at(-1) - positions[0] + 1 !== positions.length) return null;
  return {
    kind: 'range',
    parentNodeId: canonicalId(parent),
    firstNodeId: canonicalId(canonicalChildren[positions[0]]),
    lastNodeId: canonicalId(canonicalChildren[positions.at(-1)])
  };
}

export function captureExplorerFocus(article) {
  const speechExplorer = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech;
  // MathJax's public semanticFocus() method returns a selector, but it is
  // intentionally computed from the explorer's current node. During the
  // short focus hand-off used by VoiceOver, the selector can briefly point at
  // a node before its visual copy has been attached. Prefer that current node
  // when it belongs to this article, then use the selector as the stable DOM
  // fallback. This keeps the bridge exact without inventing an ancestor.
  const current = speechExplorer?.current || speechExplorer?.refocus;
  const semanticSelector = speechExplorer?.semanticFocus?.();
  const focused = (current && article.contains(current) ? current : null) || (semanticSelector
    ? article.querySelector(`mjx-container ${semanticSelector}`) || article.querySelector(`mjx-assistive-mml ${semanticSelector}`)
    : null) || article.querySelector('[data-semantic-focus="true"], [data-semantic-id][aria-current="true"]');
  if (!focused) throw new Error('MathJax explorer has no focused node');
  const semanticId = focused.getAttribute('data-semantic-id');
  if (!semanticId) throw new Error('MathJax explorer focus has no semantic identity');
  const sourceRoot = article.querySelector('mjx-assistive-mml math');
  const sourceNodes = sourceRoot && [sourceRoot, ...sourceRoot.querySelectorAll('[data-semantic-id]')];
  const sourceNode = sourceNodes?.find((candidate) => candidate.getAttribute('data-semantic-id') === semanticId) || null;
  // MathJax preserves source identities on the visual semantic nodes but
  // sanitizes unknown attributes in the assistive copy (for example,
  // `data-omniya-id` may become an empty `data-omniya-`). Prefer the source
  // node when it retained the identity, then use the matching visual node.
  const target = canonicalTargetForSourceNode(sourceNode) || canonicalTargetForSourceNode(focused) || (() => {
    // SRE can expose a virtual semantic node that has no presentation MathML
    // element of its own. Its semantic children still identify an exact
    // contiguous source range. Resolve those children through the source
    // MathML rather than broadening the edit to an arbitrary ancestor.
    const semanticNodes = [
      ...(article.querySelectorAll('[data-semantic-id]'))
    ];
    const bySemanticId = new Map(semanticNodes.map((node) => [node.getAttribute('data-semantic-id'), node]));
    const virtualNode = bySemanticId.get(semanticId) || focused;
    if (!sourceRoot || !virtualNode) return null;
    const semanticIds = semanticDescendants(virtualNode, bySemanticId);
    const canonicalIds = [...semanticIds]
      .map((id) => bySemanticId.get(id))
      .map((node) => canonicalId(node))
      .filter(Boolean);
    return targetForCanonicalIds(sourceRoot, canonicalIds);
  })();
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
