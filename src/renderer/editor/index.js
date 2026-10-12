import { EditorState, NodeSelection, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { closeHistory, history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, chainCommands } from 'prosemirror-commands';
import { editorSchema } from './schema.js';
import { MathNodeView } from './math-node-view.js';

export { clearMathWithin, renderMathInto, waitForSpeechLabel } from './math-render.js';
import {
  backspaceSelectsMath, backspaceStopsAtTitle, deleteSelectsMath, deleteStopsAtTitle, enterLeavesTitle,
} from './commands.js';

const IS_MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

// Word: Alt+= on Windows, Control+= on Mac inserts an equation.
function isInsertEquationChord(event) {
  if (event.code !== 'Equal' || event.shiftKey) return false;
  return IS_MAC
    ? event.ctrlKey && !event.altKey && !event.metaKey
    : event.altKey && !event.ctrlKey && !event.metaKey;
}

// Find in note. The plugin keeps the query and the matches, and draws them: every
// match is highlighted and the current one is stronger. A match is a range of
// text, or a whole equation when the query is in the equation's source (the
// LaTeX or the braille cells that were typed). Case does not matter.
const findKey = new PluginKey('find');

function findMatches(doc, query) {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const matches = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      const hay = node.text.toLowerCase();
      for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
        matches.push({ from: pos + at, to: pos + at + needle.length, equation: false });
      }
    } else if (node.type.name === 'math' && node.attrs.source.toLowerCase().includes(needle)) {
      matches.push({ from: pos, to: pos + node.nodeSize, equation: true });
    }
  });
  return matches;
}

const firstFrom = (matches, from) => {
  const index = matches.findIndex((m) => m.from >= from);
  return index === -1 ? (matches.length ? 0 : -1) : index;
};

const findPlugin = new Plugin({
  key: findKey,
  state: {
    init: () => ({ query: '', matches: [], current: -1 }),
    apply(tr, value, _old, state) {
      const meta = tr.getMeta(findKey);
      if (meta?.query !== undefined) {
        const matches = findMatches(state.doc, meta.query);
        return { query: meta.query, matches, current: firstFrom(matches, state.selection.from) };
      }
      if (meta?.current !== undefined) return { ...value, current: meta.current };
      if (tr.docChanged && value.query) {
        const matches = findMatches(state.doc, value.query);
        return { ...value, matches, current: Math.min(value.current, matches.length - 1) };
      }
      return value;
    },
  },
  props: {
    decorations(state) {
      const { matches, current } = findKey.getState(state);
      if (!matches.length) return null;
      return DecorationSet.create(state.doc, matches.map((m, i) => {
        const attrs = { class: i === current ? 'find-match find-current' : 'find-match' };
        return m.equation
          ? Decoration.node(m.from, m.to, attrs)
          : Decoration.inline(m.from, m.to, attrs);
      }));
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

// The equation field. Typing an equation happens in the line, at the caret, as
// in Word: the field is drawn as a widget inside the paragraph, so it sits where
// the equation will be. The plugin only keeps where it goes. The field itself is
// an element the page owns and passes in, which is why its ids and its screen
// reader wiring did not have to change when it moved out of the top panel.
const fieldKey = new PluginKey('equation-field');

function makeFieldPlugin(element) {
  // The field is a form inside the editable page. It must not be editable itself.
  element?.setAttribute('contenteditable', 'false');
  return new Plugin({
    key: fieldKey,
    state: {
      init: () => ({ pos: null }),
      apply(tr, value) {
        const meta = tr.getMeta(fieldKey);
        if (meta !== undefined) return meta;
        return value.pos === null ? value : { pos: tr.mapping.map(value.pos) };
      },
    },
    props: {
      decorations(state) {
        const { pos } = fieldKey.getState(state);
        if (pos === null || !element) return null;
        return DecorationSet.create(state.doc, [Decoration.widget(pos, element, {
          key: 'equation-field',
          side: 1,
          // Keys and mouse go to the field, not to the document behind it.
          stopEvent: () => true,
          ignoreSelection: true,
        })]);
      },
    },
  });
}

// An empty title shows a hint. CSS cannot see that a node has no text, so the
// editor marks it, as it does for display equations.
const emptyTitle = new Plugin({
  props: {
    decorations(state) {
      const title = state.doc.firstChild;
      if (title?.type.name !== 'title' || title.content.size > 0) return null;
      return DecorationSet.create(state.doc, [Decoration.node(0, title.nodeSize, { class: 'title-empty', 'aria-label': 'Untitled note' })]);
    },
  },
});

function makePlugins(handlers, fieldElement) {
  return [
    history(),
    makeFieldPlugin(fieldElement),
    displayEquations,
    emptyTitle,
    findPlugin,
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (event.isComposing) return false;
          if (isInsertEquationChord(event)) {
            event.preventDefault();
            handlers.onInsertEquation?.();
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
      Enter: enterLeavesTitle,
      Backspace: chainCommands(backspaceStopsAtTitle, backspaceSelectsMath),
      Delete: chainCommands(deleteStopsAtTitle, deleteSelectsMath),
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
 */
export function createNapkinEditor({ host, doc, label = 'Napkin', placeholder = '', handlers = {}, equationField = null }) {
  const plugins = makePlugins(handlers, equationField);
  // A note opens with the caret at the start of the body. The title is reached
  // with Up, a click, or by making a new note.
  const stateFor = (json) => {
    const node = PMNode.fromJSON(editorSchema, json);
    return EditorState.create({
      schema: editorSchema,
      doc: node,
      selection: TextSelection.create(node, node.firstChild.nodeSize + 1),
      plugins,
    });
  };

  // What the page needs to know after each change: whether Undo and Redo have
  // anything to do, and whether the note is empty (it then shows a hint).
  const isEmpty = (state) => state.doc.childCount === 2
    && state.doc.firstChild.content.size === 0
    && state.doc.lastChild.content.size === 0;
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

  // When the field is not in the line, it goes back where the page put it, hidden.
  // The page keeps looking it up by id, and a field that left the document
  // altogether would make every one of those lookups come back empty.
  const fieldHome = equationField?.parentNode ?? null;
  const parkField = () => {
    if (fieldHome && equationField.parentNode !== fieldHome) fieldHome.appendChild(equationField);
  };

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
    /** Search for text. All matches are highlighted and the first one at or after the caret is current and selected. */
    setFind(query) {
      view.dispatch(view.state.tr.setMeta(findKey, { query }).setMeta('addToHistory', false));
      return this.selectCurrentMatch();
    },
    /** Move to the next (+1) or previous (-1) match, wrapping round. */
    findStep(delta) {
      const { matches, current } = findKey.getState(view.state);
      if (!matches.length) return this.findState();
      const next = (current + delta + matches.length) % matches.length;
      view.dispatch(view.state.tr.setMeta(findKey, { current: next }).setMeta('addToHistory', false));
      return this.selectCurrentMatch();
    },
    /** Select the current match so that closing the search leaves the caret on it. */
    selectCurrentMatch() {
      const { matches, current } = findKey.getState(view.state);
      const match = matches[current];
      if (match) {
        const tr = view.state.tr.setMeta('addToHistory', false).scrollIntoView();
        tr.setSelection(match.equation
          ? NodeSelection.create(tr.doc, match.from)
          : TextSelection.create(tr.doc, match.from, match.to));
        view.dispatch(tr);
      }
      return this.findState();
    },
    clearFind() {
      view.dispatch(view.state.tr.setMeta(findKey, { query: '' }).setMeta('addToHistory', false));
    },
    findState() {
      const { query, matches, current } = findKey.getState(view.state);
      return { query, count: matches.length, index: current };
    },
    /** The selected text if it is a short single line, to start a search with. */
    selectedText() {
      const { from, to, empty } = view.state.selection;
      if (empty || to - from > 80) return '';
      const text = view.state.doc.textBetween(from, to, ' ', '');
      return text.trim() === '' ? '' : text;
    },
    /** Draw the equation field in the line. `pos` is where it goes, or after the caret. */
    showEquationField(pos = null) {
      const at = pos ?? view.state.selection.to;
      view.dispatch(view.state.tr.setMeta(fieldKey, { pos: at }).setMeta('addToHistory', false));
      equationField?.scrollIntoView?.({ block: 'nearest' });
    },
    hideEquationField() {
      if (fieldKey.getState(view.state).pos === null) return;
      view.dispatch(view.state.tr.setMeta(fieldKey, { pos: null }).setMeta('addToHistory', false));
      parkField();
    },
    /** Put the caret in the title with its text selected, ready to type over. */
    focusTitle() {
      const title = view.state.doc.firstChild;
      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 1 + title.content.size));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    },
    setLabel(text) { view.dom.setAttribute('aria-label', text); },
    focus() { view.focus(); },
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
