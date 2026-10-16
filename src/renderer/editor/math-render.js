// Draw one equation with the local MathJax. Ported from the old `renderEquation`
// in app.js, without the item-list state. Nothing here knows about the editor.

let mathJaxReady;

export async function waitForMathJax() {
  if (mathJaxReady) return mathJaxReady;
  mathJaxReady = (async () => {
    const runtime = globalThis.MathJax;
    if (!runtime?.startup?.promise) return false;
    await runtime.startup.promise;
    return typeof runtime.typesetPromise === 'function';
  })().catch(() => false);
  return mathJaxReady;
}

/**
 * MathJax's assistive clone sanitizes unknown data attributes, so the visual tree
 * does not carry the application's node ids. The assistive MathML source and the
 * visual tree share semantic ids. Use that to copy each id across.
 */
export function stampCanonicalIds(container) {
  const sourceMath = container.querySelector('mjx-assistive-mml math');
  const visualMath = container.querySelector('mjx-math');
  if (!sourceMath || !visualMath) return;
  const visualBySemantic = new Map(
    [...visualMath.querySelectorAll('[data-semantic-id]')]
      .map((node) => [node.getAttribute('data-semantic-id'), node])
  );
  for (const sourceNode of [sourceMath, ...sourceMath.querySelectorAll('[data-omniya-id], [id^="omniya-source-"]')]) {
    const id = sourceNode.getAttribute('data-omniya-id') || sourceNode.id?.replace(/^omniya-source-/, '');
    const semanticId = sourceNode.getAttribute('data-semantic-id');
    if (!id || !semanticId) continue;
    const visualNode = visualBySemantic.get(semanticId);
    if (visualNode) visualNode.setAttribute('data-omniya-id', id);
  }
}

/** The MathML as an element, parsed as XML so the data-* stamps survive. */
export function parseMathMLElement(mathml) {
  const parsed = new DOMParser().parseFromString(mathml, 'application/xml');
  const root = parsed.documentElement;
  if (!root || root.localName !== 'math' || parsed.querySelector('parsererror')) return null;
  return document.importNode(root, true);
}

/**
 * Render `mathml` into `container`. Resolves true when drawn, false when MathJax
 * is missing or the MathML cannot be read. `isStale()` lets the caller drop a
 * render that was replaced while it was waiting.
 */
export async function renderMathInto(container, mathml, { isStale = () => false } = {}) {
  if (!await waitForMathJax()) return false;
  const source = document.createElement('span');
  const element = parseMathMLElement(mathml);
  if (!element) return false;
  source.appendChild(element);
  // Runtime-only identity token on each source element, so the explorer bridge can
  // recover the application node from any semantic focus. Never persisted.
  const intentById = new Map([...source.querySelectorAll('[data-omniya-id][data-omniya-nemeth-intent]')]
    .map((node) => [node.getAttribute('data-omniya-id'), node.getAttribute('data-omniya-nemeth-intent')]));
  const scriptCommaIds = new Set([...source.querySelectorAll('[data-omniya-id][data-omniya-script-comma="true"]')]
    .map((node) => node.getAttribute('data-omniya-id')));
  for (const node of source.querySelectorAll('[data-omniya-id]')) {
    node.id = `omniya-source-${node.getAttribute('data-omniya-id')}`;
  }
  if (isStale()) return false;
  container.replaceChildren(source);
  await globalThis.MathJax.typesetPromise([container]);
  if (isStale()) return false;
  stampCanonicalIds(container);
  for (const [nodeId, intent] of intentById) {
    container.querySelector(`#omniya-source-${CSS.escape(nodeId)}`)?.setAttribute('data-omniya-nemeth-intent', intent);
  }
  for (const nodeId of scriptCommaIds) {
    container.querySelector(`#omniya-source-${CSS.escape(nodeId)}`)?.setAttribute('data-omniya-script-comma', 'true');
  }
  return true;
}

/**
 * What a reader should say for a rendered equation, read from MathJax's own speech.
 * MathJax puts the plain text on the container as `data-semantic-speech-none`.
 * (`data-semantic-speech` is the same text with SSML marks, so it is not used.)
 */
export function speechLabelFor(container) {
  const mj = container.querySelector('mjx-container');
  const label = mj?.getAttribute('data-semantic-speech-none')
    || container.querySelector('mjx-speech')?.getAttribute('aria-label')?.replace(/,\s*math$/, '');
  return (label ?? '').trim();
}

/**
 * The braille MathJax makes for a rendered equation (Nemeth: it writes the Nemeth
 * equals sign for `y=x`). MathJax puts it on the container as
 * `data-semantic-braille`. Empty until MathJax has made it.
 */
export function brailleLabelFor(container) {
  const mj = container.querySelector('mjx-container');
  const label = mj?.getAttribute('data-semantic-braille')
    || container.querySelector('mjx-speech')?.getAttribute('aria-braillelabel');
  return (label ?? '').trim();
}

/**
 * Speech is generated after the equation is drawn, so it can arrive a moment
 * late. Wait for it, but not forever: the caller falls back to the source text.
 */
export async function waitForSpeechLabel(container, { timeoutMs = 4000, stepMs = 100, isStale = () => false } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const label = speechLabelFor(container);
    if (label || isStale() || Date.now() >= deadline) return label;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

/** Release MathJax's bookkeeping for a container that is going away. */
export function clearMathWithin(container) {
  const mj = globalThis.MathJax;
  if (!mj) return;
  try {
    if (typeof mj.typesetClear === 'function') {
      mj.typesetClear([container]);
    } else {
      mj.startup?.document?.clearMathItemsWithin?.([container]);
    }
  } catch (error) {
    console.warn('[omniya] MathJax typesetClear failed', error);
  }
}
