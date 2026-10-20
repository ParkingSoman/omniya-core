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

// One arrow press passes a whole equation, like a letter. A reader names the
// equation once, as the caret arrives (NVDA, JAWS and MathCAT work this way).
// The first design stopped on the equation as a selected object and then moved
// on. That made a reader say it twice, and two equations in a row four times.
// Two testers reported it. Shift+arrow still selects, because the key map only
// matches an arrow with no modifier.
function passMath(direction) {
  return (state, dispatch) => {
    const { selection } = state;
    let target = null;
    if (selection instanceof NodeSelection && selection.node.type.name === 'math') {
      target = direction < 0 ? selection.from : selection.to;
    } else if (selection.empty) {
      const $pos = selection.$from;
      const next = direction < 0 ? $pos.nodeBefore : $pos.nodeAfter;
      if (next?.type.name === 'math') target = $pos.pos + direction * next.nodeSize;
    }
    if (target === null) return false;
    if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView());
    return true;
  };
}

export const arrowRightPassesMath = passMath(1);
export const arrowLeftPassesMath = passMath(-1);

/**
 * The equation that Enter should read by parts, as `{ pos }`, or null.
 * Enter opens an equation when a reader has just named it:
 *  - it is selected, or
 *  - it is the next thing after the caret (NVDA reads the item after the caret), or
 * Anywhere else Enter starts a new paragraph, as in Word.
 */
export function equationForEnter(state) {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    return selection.node.type.name === 'math' ? { pos: selection.from } : null;
  }
  if (!selection.empty) return null;
  const $pos = selection.$from;
  if ($pos.nodeAfter?.type.name === 'math') return { pos: $pos.pos };
  return null;
}

/**
 * Up or Down onto a line that holds only an equation puts the caret before the
 * equation, which is where Enter reads it (see `equationForEnter`). Left alone,
 * the browser may put the caret after it, and Enter there adds a blank line above
 * the equation. Each try adds one more. Two testers reported blank lines.
 * Returns true when it moved the caret. `view` is needed to know if the caret is
 * on the first or last visual line of its paragraph.
 */
export function verticalOntoLoneEquation(view, direction) {
  const { state } = view;
  const { selection } = state;
  const onEquation = selection instanceof NodeSelection && selection.node.type.name === 'math';
  if (!onEquation && !selection.empty) return false;
  if (!onEquation && !view.endOfTextblock(direction < 0 ? 'up' : 'down')) return false;
  const $pos = selection.$from;
  const index = $pos.index(0);
  const sibling = state.doc.maybeChild(index + direction);
  if (sibling?.type.name !== 'paragraph' || sibling.childCount !== 1
      || sibling.firstChild.type.name !== 'math') return false;
  let start = 0;
  for (let i = 0; i < index + direction; i += 1) start += state.doc.child(i).nodeSize;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start + 1)).scrollIntoView());
  return true;
}
