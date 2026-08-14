export function createCommandState({
  interaction = 'insert',
  itemKind = null, // 'text' | 'equation' | null
  equationMethod = 'nemeth',
  uebGrade = 'g2', // whole-item grade when contentEmpty started as text
  g1Passage = false, // mid-block pending G1 passage
  contentEmpty = true
} = {}) {
  return { interaction, itemKind, equationMethod, uebGrade, g1Passage, contentEmpty };
}

export function enterCommand(state) {
  return { ...state, interaction: 'command' };
}

export function enterInsert(state) {
  return { ...state, interaction: 'insert' };
}

export function formatStatus(state) {
  const mode = state.interaction === 'command' ? 'Command' : 'Insert';
  if (state.itemKind === 'text') {
    const grade = state.contentEmpty
      ? `UEB ${state.uebGrade.toUpperCase()}`
      : (state.g1Passage ? 'UEB G2 · G1 passage on' : `UEB ${state.uebGrade.toUpperCase()}`);
    return `${mode} · Text · ${grade}`;
  }
  if (state.itemKind === 'equation') {
    const fill = state.contentEmpty ? 'empty' : 'editing';
    return `${mode} · Equation · ${state.equationMethod === 'latex' ? 'LaTeX' : 'Nemeth'} · ${fill}`;
  }
  return `${mode} · (choosing)`;
}

/** Grade for liblouis backTranslate of a flushed UEB cell word. */
export function gradeForUebBackTranslate(state) {
  if ((state.contentEmpty && state.uebGrade === 'g1') || state.g1Passage) return 'g1';
  return 'g2';
}

/**
 * @returns {{ state, announcement: string, action?: string }}
 * action hints for app.js: 'submit' | 'cancel' | 'help' | 'set-type' | 'set-method' | none
 */
export function applyCommandKey(state, key) {
  if (state.interaction !== 'command') {
    return { state, announcement: formatStatus(state) };
  }
  if (key === 'i' || key === 'Enter') {
    const next = enterInsert(state);
    return { state: next, announcement: 'Insert mode' };
  }
  if (key === '?') return { state, announcement: formatStatus(state), action: 'help' };
  if (key === 'q') return { state, announcement: 'Cancelled', action: 'cancel' };
  if (key === 'n') return { state, announcement: formatStatus(state), action: 'submit' };

  if (key === 't') {
    if (state.itemKind === 'equation' && !state.contentEmpty) {
      return { state, announcement: "Can’t switch to Text after equation content exists." };
    }
    if (state.itemKind !== 'text') {
      const next = { ...state, itemKind: 'text', uebGrade: 'g2', g1Passage: false };
      return { state: next, announcement: formatStatus(next), action: 'set-type' };
    }
    if (state.contentEmpty) {
      const uebGrade = state.uebGrade === 'g2' ? 'g1' : 'g2';
      const next = { ...state, uebGrade, g1Passage: false };
      return { state: next, announcement: formatStatus(next), action: 'set-grade' };
    }
    const next = { ...state, g1Passage: !state.g1Passage, uebGrade: 'g2' };
    return { state: next, announcement: formatStatus(next), action: 'set-grade' };
  }

  if (key === 'e') {
    if (state.itemKind === 'text' && !state.contentEmpty) {
      return { state, announcement: "Can’t switch to Equation after text content exists." };
    }
    if (state.itemKind !== 'equation') {
      const next = { ...state, itemKind: 'equation', equationMethod: 'nemeth', g1Passage: false };
      return { state: next, announcement: formatStatus(next), action: 'set-type' };
    }
    if (!state.contentEmpty) {
      return { state, announcement: formatStatus(state) };
    }
    const equationMethod = state.equationMethod === 'nemeth' ? 'latex' : 'nemeth';
    const next = { ...state, equationMethod };
    return { state: next, announcement: formatStatus(next), action: 'set-method' };
  }

  return { state, announcement: `Unknown command ${key}. Press ? for help.` };
}
