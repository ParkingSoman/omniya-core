export function createAuthoringState({
  surface = 'text',
  equationMethod = 'nemeth',
  uebGrade = 'g2',
  g1Passage = false,
  contentEmpty = true,
  replaceScopeLabel = null,
  placement = 'replace'
} = {}) {
  return { surface, equationMethod, uebGrade, g1Passage, contentEmpty, replaceScopeLabel, placement };
}

export function formatStatus(state) {
  if (state.surface === 'text') {
    const grade = state.contentEmpty
      ? `UEB ${state.uebGrade.toUpperCase()}`
      : (state.g1Passage ? 'UEB G2 · G1 passage on' : `UEB ${state.uebGrade.toUpperCase()}`);
    return `Text · ${grade}`;
  }
  const fill = state.contentEmpty ? 'empty' : 'editing';
  const scopeVerb = state.placement === 'append'
    ? 'appending after'
    : state.placement === 'prepend'
      ? 'prepending before'
      : 'replacing';
  const scope = state.replaceScopeLabel ? ` · ${scopeVerb}: ${state.replaceScopeLabel}` : '';
  return `Equation · ${state.equationMethod === 'latex' ? 'LaTeX' : 'Nemeth'} · ${fill}${scope}`;
}

/** Grade for liblouis backTranslate of a flushed UEB cell word. */
export function gradeForUebBackTranslate(state) {
  if ((state.contentEmpty && state.uebGrade === 'g1') || state.g1Passage) return 'g1';
  return 'g2';
}

export function enterTextSurface(state) {
  if (state.replaceScopeLabel) {
    return { state, announcement: "Can't switch to Text while replacing mathematics." };
  }
  if (state.surface === 'equation' && !state.contentEmpty) {
    return { state, announcement: "Can't switch to Text after equation content exists." };
  }
  if (state.surface === 'text') {
    return { state, announcement: formatStatus(state) };
  }
  const next = { ...state, surface: 'text', uebGrade: 'g2', g1Passage: false };
  return { state: next, announcement: formatStatus(next) };
}

export function enterEquationSurface(state, method) {
  if (state.surface === 'text' && !state.contentEmpty) {
    return { state, announcement: "Can't switch to Equation after text content exists." };
  }
  if (state.surface === 'equation' && !state.contentEmpty) {
    return { state, announcement: formatStatus(state) };
  }
  const next = { ...state, surface: 'equation', equationMethod: method, g1Passage: false };
  return { state: next, announcement: formatStatus(next) };
}

export function equationInsertIntent(state, { replacing = false } = {}) {
  // An empty equation switches method whether or not it is a replacement --
  // Ctrl+E/Ctrl+L should work the same way replacing focused mathematics
  // (r/a/o) as they do starting a brand new equation, as long as nothing has
  // been typed yet. Only STARTING a new equation at the caret is blocked
  // while replacing: that would abandon the replacement target, whereas
  // switching the method of the (still empty) replacement does not.
  if (state.surface === 'equation' && state.contentEmpty) return 'switch-method';
  if (state.surface === 'text') return (replacing || state.replaceScopeLabel) ? 'noop' : 'start';
  return 'noop';
}

export function toggleUebGrade(state) {
  if (state.surface !== 'text') {
    return { state, announcement: formatStatus(state) };
  }
  if (state.contentEmpty) {
    const uebGrade = state.uebGrade === 'g2' ? 'g1' : 'g2';
    const next = { ...state, uebGrade, g1Passage: false };
    return { state: next, announcement: formatStatus(next) };
  }
  const next = { ...state, g1Passage: !state.g1Passage, uebGrade: 'g2' };
  return { state: next, announcement: formatStatus(next) };
}
