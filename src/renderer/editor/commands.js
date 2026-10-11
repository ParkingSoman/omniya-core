import { NodeSelection } from 'prosemirror-state';

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
