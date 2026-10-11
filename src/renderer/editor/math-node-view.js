// Node view for the inline math atom. The wrapper is not editable. MathJax
// renders inside it. The editor owns every key until the explorer is entered.
export class MathNodeView {
  constructor(node) {
    this.node = node;
    this.dom = document.createElement('span');
    this.dom.className = 'math-node';
    this.dom.contentEditable = 'false';
    this.dom.setAttribute('role', 'math');
    this.render();
  }

  render() {
    const { mathml, label } = this.node.attrs;
    if (label) this.dom.setAttribute('aria-label', label);
    this.dom.replaceChildren();
    const holder = document.createElement('span');
    // The label speaks the whole equation once. The explorer drops this
    // attribute when the user enters the equation to read it by parts.
    holder.setAttribute('aria-hidden', 'true');
    const parsed = new DOMParser().parseFromString(mathml, 'application/xml');
    if (!parsed.querySelector('parsererror')) {
      holder.appendChild(document.importNode(parsed.documentElement, true));
    }
    this.dom.appendChild(holder);
    const mj = globalThis.MathJax;
    if (mj?.typesetPromise) mj.typesetPromise([holder]).catch(() => {});
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode() { this.dom.classList.add('math-node-selected'); }
  deselectNode() { this.dom.classList.remove('math-node-selected'); }
  ignoreMutation() { return true; }
  stopEvent() { return false; }
}
