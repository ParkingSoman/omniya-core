import { NodeSelection, TextSelection } from 'prosemirror-state';

// Word treats an equation as an object. Backspace or Delete next to it selects
// it first. A second press deletes the selected object (the base keymap does that).
function selectAdjacentMath(direction) {
  return (state, dispatch) => {
    const { selection } = state;
    if (!selection.empty) return false;
    const $pos = selection.$from;
    const node = direction < 0 ? $pos.nodeBefore : $pos.nodeAfter;
    if (!node || node.type.name !== 'math') return false;
    if (dispatch) {
      const start = direction < 0 ? $pos.pos - node.nodeSize : $pos.pos;
      dispatch(state.tr.setSelection(NodeSelection.create(state.doc, start)).scrollIntoView());
    }
    return true;
  };
}

export const backspaceSelectsMath = selectAdjacentMath(-1);
export const deleteSelectsMath = selectAdjacentMath(1);

// The title is the first line of the note. It behaves as one line of text that
// the body cannot be joined into, as in Apple Notes.
const inTitle = (state) => state.selection.$from.parent.type.name === 'title';

/** Enter in the title ends the line and moves to the body. It never splits the title. */
export function enterLeavesTitle(state, dispatch) {
  if (!inTitle(state)) return false;
  if (dispatch) {
    const $from = state.selection.$from;
    const bodyStart = $from.after(1) + 1;
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, bodyStart)).scrollIntoView());
  }
  return true;
}

/** Backspace at the start of the first body line goes to the end of the title and joins nothing. */
export function backspaceStopsAtTitle(state, dispatch) {
  const { selection } = state;
  if (!selection.empty || inTitle(state)) return false;
  const $from = selection.$from;
  if ($from.parentOffset !== 0 || $from.index(0) !== 1) return false;
  if (dispatch) {
    const titleEnd = $from.before(1) - 1;
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, titleEnd)).scrollIntoView());
  }
  return true;
}

/** Delete at the end of the title goes to the body and joins nothing. */
export function deleteStopsAtTitle(state, dispatch) {
  const { selection } = state;
  if (!selection.empty || !inTitle(state)) return false;
  const $from = selection.$from;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  return enterLeavesTitle(state, dispatch);
}
