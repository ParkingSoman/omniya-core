import { brailleLabelFor, clearMathWithin, renderMathInto, waitForSpeechLabel } from './math-render.js';

// Node view for the inline math atom. The wrapper is not editable. MathJax draws
// inside it. Until the explorer is entered the wrapper is one named image, so a
// reader says the equation once, as it passes. Entering the explorer lifts that
// so the reader can walk the parts (see `setExploring`).
// One blank braille cell. MathJax uses the same value for its own role word, so
// the display shows the equation and nothing in front of it.
const BRAILLE_NO_ROLE = '\u2800';

// EXPERIMENT, not for merge. When true, the equation is never wrapped as a named
// image and MathJax's own output is never hidden, so a screen reader meets
// MathJax's container as it ships (role description "math", speech label,
// assistive MathML). The question: does that read well inside the editor?
const EXPOSE_MATHJAX = true;

export class MathNodeView {
  constructor(node) {
    this.node = node;
    this.exploring = false;
    this.token = 0;
    this.label = '';
    this.braille = '';
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
    if (this.exploring || EXPOSE_MATHJAX) {
      this.dom.removeAttribute('role');
      this.dom.removeAttribute('aria-label');
      this.dom.removeAttribute('aria-roledescription');
      this.dom.removeAttribute('aria-braillelabel');
      this.dom.removeAttribute('aria-brailleroledescription');
      this.holder.removeAttribute('aria-hidden');
      this.holder.inert = false;
      return;
    }
    this.dom.setAttribute('role', 'img');
    this.dom.setAttribute('aria-label', this.label || this.node.attrs.source || 'equation');
    // A reader says "graphic" for an image with no role description. Testers asked
    // to hear "equation" (October 2026).
    this.dom.setAttribute('aria-roledescription', 'equation');
    const braille = this.brailleLabel();
    if (braille) {
      // The display shows the equation in Nemeth, with no role word in front of it.
      this.dom.setAttribute('aria-braillelabel', braille);
      this.dom.setAttribute('aria-brailleroledescription', BRAILLE_NO_ROLE);
    } else {
      this.dom.removeAttribute('aria-braillelabel');
      this.dom.removeAttribute('aria-brailleroledescription');
    }
    this.holder.setAttribute('aria-hidden', 'true');
    // MathJax's container is focusable (tabindex 0). Hidden from readers it must
    // not take focus either (axe: aria-hidden-focus). Entering the explorer lifts
    // this before it moves focus in.
    this.holder.inert = true;
  }

  // An equation typed in Nemeth shows exactly the cells that were typed. Any
  // other equation shows what MathJax writes in Nemeth, once it has made it.
  brailleLabel() {
    const { source, sourceKind } = this.node.attrs;
    if (sourceKind === 'nemeth' && /^[\u2800-\u28FF]+$/.test(source)) return source;
    return this.braille;
  }

  async render() {
    const token = ++this.token;
    this.braille = '';
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
    this.braille = brailleLabelFor(this.holder);
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
