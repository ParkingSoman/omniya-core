import { clearMathWithin, renderMathInto, waitForSpeechLabel } from './math-render.js';

// Node view for the inline math atom. The wrapper is not editable. MathJax draws
// inside it. Until the explorer is entered the wrapper is one named image, so a
// reader says the equation once, as it passes. Entering the explorer lifts that
// so the reader can walk the parts (see `setExploring`).
export class MathNodeView {
  constructor(node) {
    this.node = node;
    this.exploring = false;
    this.token = 0;
    this.label = '';
    this.dom = document.createElement('span');
    this.dom.className = 'math-node';
    this.dom.contentEditable = 'false';
    this.dom.__mathNodeView = this;
    this.holder = document.createElement('span');
    this.holder.className = 'math-render';
    this.dom.appendChild(this.holder);
    this.applyAccessibleName();
    this.ready = this.render();
  }

  // CI run 2: NVDA said "line feed" and VoiceOver dropped the equation from the
  // line while the wrapper was role="math". An inline image with a name is the
  // pattern readers already announce inside text.
  applyAccessibleName() {
    if (this.exploring) {
      this.dom.removeAttribute('role');
      this.dom.removeAttribute('aria-label');
      this.holder.removeAttribute('aria-hidden');
      this.holder.inert = false;
      return;
    }
    this.dom.setAttribute('role', 'img');
    this.dom.setAttribute('aria-label', this.label || this.node.attrs.source || 'equation');
    this.holder.setAttribute('aria-hidden', 'true');
    // MathJax's container is focusable (tabindex 0). Hidden from readers it must
    // not take focus either (axe: aria-hidden-focus). Entering the explorer lifts
    // this before it moves focus in.
    this.holder.inert = true;
  }

  async render() {
    const token = ++this.token;
    const mathml = this.node.attrs.mathml;
    let drawn = false;
    try {
      drawn = await renderMathInto(this.holder, mathml, { isStale: () => token !== this.token });
    } catch {
      drawn = false;
    }
    if (token !== this.token) return false;
    if (!drawn) this.holder.textContent = this.node.attrs.source || 'equation';
    this.applyAccessibleName();
    // Speech can take a while the first time (the engine loads from the packaged
    // archive). The equation is usable by its source text meanwhile, and the
    // proper name replaces it whenever it arrives. Nothing waits for it.
    if (drawn) void this.watchSpeechLabel(token);
    return drawn;
  }

  async watchSpeechLabel(token) {
    const label = await waitForSpeechLabel(this.holder, {
      timeoutMs: 120_000,
      stepMs: 250,
      isStale: () => token !== this.token
    });
    if (token !== this.token || !label) return;
    this.label = label;
    this.applyAccessibleName();
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.mathml !== this.node.attrs.mathml;
    this.node = node;
    if (changed) this.ready = this.render();
    else this.applyAccessibleName();
    return true;
  }

  setExploring(on) {
    this.exploring = on;
    this.applyAccessibleName();
  }

  selectNode() { this.dom.classList.add('math-node-selected'); }
  deselectNode() { this.dom.classList.remove('math-node-selected'); }
  ignoreMutation() { return true; }
  // While the explorer owns the keys, the editor must not act on them.
  stopEvent(event) { return this.exploring && this.dom.contains(event.target); }
  destroy() {
    this.token += 1;
    clearMathWithin(this.holder);
  }
}
