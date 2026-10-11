import { EditorState, NodeSelection, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { closeHistory, history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { editorSchema } from './schema.js';
import { MathNodeView } from './math-node-view.js';
import { backspaceSelectsMath, deleteSelectsMath } from './commands.js';

const IS_MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

// Word: Alt+= on Windows, Control+= on Mac inserts an equation.
function isInsertEquationChord(event) {
  if (event.code !== 'Equal' || event.shiftKey) return false;
  return IS_MAC
    ? event.ctrlKey && !event.altKey && !event.metaKey
    : event.altKey && !event.ctrlKey && !event.metaKey;
}

/** The text of a paragraph, equations left out. Braille labels are keyed by it. */
export function paragraphText(node) {
  let text = '';
  node.forEach((child) => { if (child.isText) text += child.text; });
  return text;
}

// A braille label is an attribute on the paragraph's element. ProseMirror owns
// those elements and drops attributes it did not put there, so a label set by
// hand vanishes on the next redraw. A node decoration is the supported way.
const brailleKey = new PluginKey('braille-labels');
const brailleLabels = new Plugin({
  key: brailleKey,
  state: {
    init: () => new Map(),
    apply: (tr, value) => tr.getMeta(brailleKey) ?? value,
  },
  props: {
    decorations(state) {
      const labels = brailleKey.getState(state);
      const decorations = [];
      state.doc.forEach((node, offset) => {
        const label = labels.get(paragraphText(node));
        if (label) {
          decorations.push(Decoration.node(offset, offset + node.nodeSize, { 'aria-braillelabel': label }));
        }
      });
      return DecorationSet.create(state.doc, decorations);
    },
  },
});

// A paragraph that holds nothing but one equation is a display equation, centred
// as in Word. CSS cannot tell that from a sentence with one equation in it, so
// the editor marks it.
const displayEquations = new Plugin({
  props: {
    decorations(state) {
      const decorations = [];
      state.doc.forEach((node, offset) => {
        if (node.childCount === 1 && node.firstChild.type.name === 'math') {
          decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'display-equation' }));
        }
      });
      return DecorationSet.create(state.doc, decorations);
    },
  },
});

function makePlugins(handlers) {
  return [
    history(),
    brailleLabels,
    displayEquations,
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (event.isComposing) return false;
          if (isInsertEquationChord(event)) {
            event.preventDefault();
            handlers.onInsertEquation?.();
            return true;
          }
          if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 't') {
            event.preventDefault();
            handlers.onToggleGrade?.();
            return true;
          }
          const { selection } = view.state;
          const plain = !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
          if (event.key === 'Enter' && plain
              && selection instanceof NodeSelection && selection.node.type.name === 'math') {
            event.preventDefault();
            handlers.onEnterMath?.(selection.from);
            return true;
          }
          return false;
        },
      },
    }),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo,
      Backspace: backspaceSelectsMath,
      Delete: deleteSelectsMath,
    }),
    keymap(baseKeymap),
  ];
}

/**
 * A word-processor style editor: paragraphs of text with inline equations.
 * Undo and redo cover typing and equation edits in one history.
 *
 * handlers:
 *   onChange(docJSON)      the document changed
 *   onInsertEquation()     the insert-equation chord was pressed
 *   onEnterMath(pos)       Enter on a selected equation: read it by parts
 *   onToggleGrade()        Ctrl/Cmd+T
 */
export function createNapkinEditor({ host, doc, label = 'Napkin', placeholder = '', handlers = {} }) {
  const plugins = makePlugins(handlers);
  const stateFor = (json) => EditorState.create({
    schema: editorSchema,
    doc: PMNode.fromJSON(editorSchema, json),
    plugins,
  });

  // What the page needs to know after each change: whether Undo and Redo have
  // anything to do, and whether the note is empty (it then shows a hint).
  const isEmpty = (state) => state.doc.childCount === 1
    && state.doc.firstChild.type.name === 'paragraph'
    && state.doc.firstChild.content.size === 0;
  const historyState = (state) => ({
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0,
  });
  function announceState(target) {
    target.dom.dataset.empty = String(isEmpty(target.state));
    handlers.onStateChange?.({
      ...historyState(target.state),
      equationSelected: target.state.selection instanceof NodeSelection
        && target.state.selection.node.type.name === 'math',
    });
  }

  const view = new EditorView(host, {
    state: stateFor(doc),
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': label,
      ...(placeholder ? { 'aria-placeholder': placeholder } : {}),
    },
    nodeViews: { math: (node) => new MathNodeView(node) },
    // `this` is the view. The outer `view` does not exist yet if a transaction
    // fires while ProseMirror is still constructing it.
    dispatchTransaction(tr) {
      this.updateState(this.state.apply(tr));
      if (tr.docChanged) handlers.onChange?.(this.state.doc.toJSON());
      announceState(this);
    },
  });

  // The hint is drawn by CSS (see styles.css), so it is a custom property.
  if (placeholder) view.dom.style.setProperty('--placeholder', JSON.stringify(placeholder));
  announceState(view);

  const mathAttrs = ({ mathml, source = '', sourceKind = 'latex' }) => ({ mathml, source, sourceKind });

  // ProseMirror merges edits made within half a second into one undo step. An
  // equation insert, edit or delete must undo by itself, as in Word, so close the
  // history event before and after it.
  // `build` gets the current state, so the edit is made against the state that
  // exists after the first event is closed.
  const asOwnUndoStep = (build) => {
    view.dispatch(closeHistory(view.state.tr));
    view.dispatch(build(view.state));
    view.dispatch(closeHistory(view.state.tr));
  };

  return {
    view,
    getJSON: () => view.state.doc.toJSON(),
    /** Load another document. History starts empty, so undo never crosses napkins. */
    setDoc(json) { view.updateState(stateFor(json)); announceState(view); },
    historyState: () => historyState(view.state),
    setLabel(text) { view.dom.setAttribute('aria-label', text); },
    focus() { view.focus(); },
    /** Give each paragraph its braille label. `labels` maps paragraph text to braille. Not an undo step. */
    setBrailleLabels(labels) {
      view.dispatch(view.state.tr.setMeta(brailleKey, new Map(labels)).setMeta('addToHistory', false));
    },
    /** The text of each paragraph, equations left out. */
    paragraphTexts() {
      const texts = [];
      view.state.doc.forEach((node) => texts.push(paragraphText(node)));
      return texts;
    },
    /** Put an equation at the caret, replacing any selected text. The caret lands after it. */
    insertMath(attrs) {
      const node = editorSchema.nodes.math.create(mathAttrs(attrs));
      asOwnUndoStep((state) => state.tr.replaceSelectionWith(node, false).scrollIntoView());
      view.focus();
    },
    /** Change the equation at `pos` and leave it selected. One undo step. */
    updateMath(pos, attrs) {
      const existing = view.state.doc.nodeAt(pos);
      if (existing?.type.name !== 'math') throw new RangeError('No equation at that position');
      asOwnUndoStep((state) => {
        const tr = state.tr.setNodeMarkup(pos, null, { ...existing.attrs, ...mathAttrs(attrs) });
        return tr.setSelection(NodeSelection.create(tr.doc, pos));
      });
    },
    /** `{ pos, node }` when an equation is selected, else null. */
    selectedMath() {
      const { selection } = view.state;
      return selection instanceof NodeSelection && selection.node.type.name === 'math'
        ? { pos: selection.from, node: selection.node }
        : null;
    },
    selectMath(pos) {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    },
    /** Remove the equation at `pos`. One undo step. */
    deleteMath(pos) {
      const existing = view.state.doc.nodeAt(pos);
      if (existing?.type.name !== 'math') throw new RangeError('No equation at that position');
      asOwnUndoStep((state) => state.tr.delete(pos, pos + existing.nodeSize).scrollIntoView());
      view.focus();
    },
    undo() { return undo(view.state, (tr) => view.dispatch(tr)); },
    redo() { return redo(view.state, (tr) => view.dispatch(tr)); },
    mathNode(pos) { return view.state.doc.nodeAt(pos); },
    mathDOM(pos) { return view.nodeDOM(pos); },
    mathView(pos) { return view.nodeDOM(pos)?.__mathNodeView ?? null; },
    destroy() { view.destroy(); },
  };
}
