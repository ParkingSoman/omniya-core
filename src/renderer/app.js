import {
  addItem,
  createNapkin,
  deleteNapkin,
  deleteItem,
  selectItem,
  switchNapkin,
  updateItem
} from '../domain/model.js';
import { captureExplorerFocus, restoreExplorerFocus } from './math-explorer-bridge.js';
import { createSixKeyInput } from './braille-input.js';
import { createEmptyMathDocument, nextEmptyFocus } from '../domain/guided-nemeth/index.js';

const elements = Object.fromEntries([
  'app-shell', 'napkin-list', 'new-napkin-button', 'new-napkin-form', 'napkin-name',
  'napkin-name-error', 'cancel-new-napkin', 'current-napkin-name', 'item-count',
  'save-status', 'reading-section', 'reading-heading', 'reading-help',
  'empty-message', 'transcript', 'reading-actions', 'open-add-button',
  'open-operations-button', 'operation-dialog', 'operation-list', 'close-operation-dialog',
  'keyboard-help-button', 'keyboard-help', 'close-keyboard-help', 'composer-dock',
  'composer-form', 'composer-heading', 'composer-back',
  'mode-switch', 'note-toggle', 'composer-source', 'note-row', 'composer-note',
  'composer-help', 'composer-error', 'editing-indicator', 'composer-submit',
  'composer-discard', 'composer-cancel', 'app-error', 'app-error-message', 'retry-save'
].map((id) => [id, document.getElementById(id)]));

let state;
let mode = 'read';
let editingItemId = null;
let noteVisible = false;
let draft = { source: '', note: '', type: 'text' };
let selectionSaveTimer;
let saveChain = Promise.resolve();
let transcriptRenderVersion = 0;
let mathJaxReady;
let exploringEquationItemId = null;
let inlineEditor = null;
const mathHistory = new Map();

function activeNapkin() {
  return state.napkins.find(({ id }) => id === state.activeNapkinId) ?? null;
}

function activeItem() {
  const napkin = activeNapkin();
  if (!napkin) return null;
  return napkin.items.find(({ id }) => id === napkin.selectedItemId) ?? null;
}

function showError(message, { retry = false } = {}) {
  elements['app-error-message'].textContent = message;
  elements['app-error'].hidden = false;
  elements['retry-save'].hidden = !retry;
}

function clearAppError() {
  elements['app-error'].hidden = true;
  elements['retry-save'].hidden = true;
  elements['app-error-message'].textContent = '';
}

function disableInteractiveControls() {
  document.querySelectorAll('button, input, textarea').forEach((control) => {
    control.disabled = true;
  });
}

function setFieldError(field, output, message = '') {
  field.setAttribute('aria-invalid', message ? 'true' : 'false');
  output.textContent = message;
  output.hidden = !message;
}

function saveState({ announce = true } = {}) {
  const stateToSave = structuredClone(state);
  if (announce) elements['save-status'].textContent = 'Saving…';
  saveChain = saveChain
    .catch(() => {})
    .then(() => window.omniya.saveState(stateToSave))
    .then(() => {
      clearAppError();
      if (announce) elements['save-status'].textContent = 'Saved';
    })
    .catch(() => {
      if (announce) elements['save-status'].textContent = 'Not saved';
      showError('The napkins could not be saved locally.', { retry: true });
      throw new Error('Save failed');
    });
  return saveChain;
}

function saveSelectionSoon() {
  clearTimeout(selectionSaveTimer);
  selectionSaveTimer = setTimeout(() => void saveState().catch(() => {}), 250);
}

function renderNapkins() {
  elements['napkin-list'].replaceChildren();
  for (const napkin of state.napkins) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.napkinId = napkin.id;
    button.textContent = napkin.name;
    if (napkin.id === state.activeNapkinId) button.setAttribute('aria-current', 'page');
    elements['napkin-list'].append(button);
  }
}

function itemSummary(item, index, count) {
  const kind = item.type === 'equation' ? 'Equation' : 'Text';
  return `${kind} item ${index + 1} of ${count}`;
}

async function waitForMathJax() {
  if (mathJaxReady) return mathJaxReady;
  mathJaxReady = (async () => {
    const runtime = globalThis.MathJax;
    if (!runtime?.startup?.promise) return false;
    await runtime.startup.promise;
    return typeof runtime.typesetPromise === 'function';
  })().catch(() => false);
  return mathJaxReady;
}

async function renderEquation(container, item, version) {
  try {
    if (!await waitForMathJax()) throw new Error('MathJax accessibility runtime unavailable');
    const source = document.createElement('span');
    const persistedMathML = item.math?.mathml || item.mathml;
    if (persistedMathML) source.innerHTML = persistedMathML;
    else source.textContent = `\\[${item.source}\\]`;
    const canonicalIds = [...source.querySelectorAll('[data-omniya-id]')].map((node) => node.getAttribute('data-omniya-id'));
    container.replaceChildren(source);
    await globalThis.MathJax.typesetPromise([container]);
    stampCanonicalIds(container, canonicalIds);
    if (version !== transcriptRenderVersion || !container.isConnected) return;
    container.removeAttribute('aria-busy');
    if (item.math?.focus && activeNapkin()?.selectedItemId === item.id) {
      setTimeout(() => void restoreExplorerFocus(articleForContainer(container), item.math.focus), 0);
    }
  } catch {
    if (version !== transcriptRenderVersion || !container.isConnected) return;
    container.removeAttribute('aria-busy');
    container.setAttribute('role', 'alert');
    container.textContent = 'Local MathJax could not render this equation.';
    showError('The local MathJax runtime could not render an equation. Run npm install and restart the app.');
  }
}

function articleForContainer(container) { return container.closest('article.napkin-article') ?? container.parentElement; }

function stampCanonicalIds(container, canonicalIds = []) {
  const sourceMath = container.querySelector('mjx-assistive-mml math');
  const visualMath = container.querySelector('mjx-math');
  if (!sourceMath || !visualMath) return;
  const sourceNodes = [sourceMath, ...sourceMath.querySelectorAll('*')]
    .filter((node) => node.hasAttribute('data-omniya-id'));
  const visualNodes = [visualMath, ...visualMath.querySelectorAll('*')]
    .filter((node) => node.localName?.startsWith('mjx-') && node.localName !== 'mjx-c');
  for (let index = 0; index < sourceNodes.length; index += 1) {
    const id = canonicalIds[index] || sourceNodes[index].getAttribute('data-omniya-id');
    if (id) sourceNodes[index].setAttribute('data-omniya-id', id);
    if (visualNodes[index] && id) visualNodes[index].setAttribute('data-omniya-id', id);
  }
}

function renderTranscript() {
  const version = ++transcriptRenderVersion;
  const napkin = activeNapkin();
  elements['transcript'].replaceChildren();
  if (!napkin) {
    elements['empty-message'].textContent = 'No napkin selected. Create one with New napkin.';
    elements['empty-message'].hidden = false;
    elements['item-count'].textContent = '0 items';
    return;
  }
  elements['empty-message'].textContent = 'No items yet. Add the first item below.';
  elements['empty-message'].hidden = napkin.items.length > 0;
  elements['item-count'].textContent = `${napkin.items.length} ${napkin.items.length === 1 ? 'item' : 'items'}`;

  for (const [index, item] of napkin.items.entries()) {
    const article = document.createElement('article');
    article.className = 'napkin-article';
    article.tabIndex = item.id === napkin.selectedItemId ? 0 : -1;
    article.dataset.itemId = item.id;
    article.setAttribute('aria-posinset', String(index + 1));
    article.setAttribute('aria-setsize', String(napkin.items.length));

    const descriptor = document.createElement('span');
    descriptor.className = 'sr-only';
    descriptor.id = `item-description-${item.id}`;
    descriptor.textContent = itemSummary(item, index, napkin.items.length) +
      (item.type === 'equation' ? '. Press Enter to explore the equation.' : '. Press Enter to edit.');
    article.setAttribute('aria-describedby', descriptor.id);

    const content = document.createElement('div');
    content.className = 'item-content';
    if (item.type === 'equation') {
      content.setAttribute('aria-busy', 'true');
      content.textContent = 'Loading equation…';
      void renderEquation(content, item, version);
    } else {
      const text = document.createElement('p');
      text.className = 'item-text';
      text.textContent = item.source;
      content.append(text);
    }

    article.append(descriptor, content);
    if (item.note) {
      const note = document.createElement('p');
      note.className = 'item-note';
      note.textContent = `Note: ${item.note}`;
      article.append(note);
    }
    elements['transcript'].append(article);
  }
}

function renderHeader() {
  const napkin = activeNapkin();
  elements['current-napkin-name'].textContent = napkin?.name ?? 'No napkin selected';
}

function renderMode() {
  const reading = mode === 'read';
  elements['reading-actions'].hidden = !reading;
  elements['composer-dock'].hidden = reading;
  elements['open-add-button'].disabled = reading && !activeNapkin();
  elements['open-operations-button'].disabled = reading && !activeNapkin();
  elements['reading-help'].textContent = reading
    ? 'Up and Down arrows move between items. Enter explores an equation; E edits the exact focus with Nemeth.'
    : 'Reading remains available above. Escape returns without saving.';
}

async function openOperationPalette() {
  const article = exploringEquationItemId
    ? elements['transcript'].querySelector(`article.napkin-article[data-item-id="${CSS.escape(exploringEquationItemId)}"]`)
    : null;
  if (!article) { elements['save-status'].textContent = 'Enter an equation before choosing a math operation.'; return; }
  const focus = captureExplorerFocus(article);
  const operations = await window.omniya.listMathOperations();
  elements['operation-list'].replaceChildren();
  for (const operation of operations.filter((candidate) => candidate.validContexts?.length)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = operation.commandLabel;
    button.title = `${operation.id} · BANA ${operation.banaRefs.join(', ')}`;
    button.addEventListener('click', async () => {
      const item = activeNapkin()?.items.find(({ id }) => id === article.dataset.itemId);
      if (!item) return;
      const result = await window.omniya.applyMathTransition({ document: item.math, focus: focus.target, inputState: { pendingCells: [] }, input: { kind: 'command', operationId: operation.id } });
      if (result.status !== 'applied') { elements['save-status'].textContent = result.announcement; return; }
      const history = mathHistory.get(item.id) ?? { undo: [], redo: [] };
      history.undo.push({ document: structuredClone(item.math), focus: item.math.focus });
      history.undo = history.undo.slice(-100);
      history.redo = [];
      mathHistory.set(item.id, history);
      state = updateItem(state, item.id, { note: item.note, math: result.document });
      elements['operation-dialog'].close?.();
      renderAll();
      await saveState().catch(() => {});
    });
    elements['operation-list'].append(button);
  }
  if (typeof elements['operation-dialog'].showModal === 'function') elements['operation-dialog'].showModal();
  else elements['operation-dialog'].hidden = false;
  elements['operation-list'].querySelector('button')?.focus();
}

function renderComposer() {
  const editing = mode === 'edit';
  const item = editing ? activeItem() : null;
  const values = editing
    ? { source: item?.source ?? '', note: item?.note ?? '', type: item?.type ?? 'text' }
    : draft;

  elements['composer-heading'].textContent = editing
    ? `Editing item ${activeNapkin().items.findIndex(({ id }) => id === editingItemId) + 1}`
    : `Adding to ${activeNapkin().name}`;
  elements['composer-submit'].textContent = editing ? 'Save changes' : 'Add item';
  elements['composer-discard'].hidden = editing;
  elements['composer-cancel'].hidden = !editing;
  elements['editing-indicator'].textContent = editing ? 'Changes are not saved until you choose Save changes.' : '';
  elements['composer-source'].value = values.source;
  elements['composer-note'].value = values.note;
  elements['mode-switch'].querySelectorAll('input').forEach((input) => {
    input.disabled = editing;
    input.checked = input.value === values.type;
  });
  if (editing) noteVisible = Boolean(values.note);
  elements['note-row'].hidden = !noteVisible;
  elements['note-toggle'].textContent = noteVisible ? 'Hide note' : 'Add note';
  elements['note-toggle'].setAttribute('aria-expanded', String(noteVisible));
  elements['composer-help'].textContent = editing
    ? 'Save changes commits the item · Escape cancels'
    : 'Enter adds · Shift+Enter makes a new line · Escape cancels';
  setFieldError(elements['composer-source'], elements['composer-error']);
}

function renderAll() {
  renderNapkins();
  renderHeader();
  renderTranscript();
  renderMode();
  if (mode !== 'read') renderComposer();
}

function focusSelectedArticle() {
  const napkin = activeNapkin();
  if (!napkin) {
    elements['new-napkin-button'].focus();
    return;
  }
  const item = activeItem();
  const article = item && elements['transcript'].querySelector(
    `article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`
  );
  (article ?? elements['open-add-button']).focus();
}

function focusNapkinButton(napkinId) {
  const button = elements['napkin-list'].querySelector(
    `[data-napkin-id="${CSS.escape(napkinId)}"]`
  );
  if (button) button.focus();
  else focusSelectedArticle();
}

async function enterEquation(article) {
  let math = article.querySelector('mjx-container');
  // Selection rerenders the transcript. Give the local MathJax promise a
  // short, bounded window to replace its loading marker before reporting an
  // error; never reinterpret an equation as an edit just because rendering
  // is asynchronous.
  for (let attempt = 0; !math && attempt < 100 && article.isConnected; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    math = article.querySelector('mjx-container');
  }
  math ||= article.querySelector('math');
  if (!math) {
    elements['save-status'].textContent = 'Equation is still loading.';
    return false;
  }
  math.focus();
  exploringEquationItemId = article.dataset.itemId;
  elements['save-status'].textContent = 'Equation entered. Use arrow keys to explore it. Escape returns to the item.';
  return true;
}

function leaveEquation(article) {
  exploringEquationItemId = null;
  article.focus();
  elements['save-status'].textContent = 'Equation level';
}

function closeInlineEditor(article) {
  inlineEditor?.remove();
  inlineEditor = null;
  (article?.querySelector('mjx-container') || article?.querySelector('math'))?.focus?.();
}

async function applyMathHistory(itemId, direction) {
  const item = activeNapkin()?.items.find(({ id }) => id === itemId);
  const history = mathHistory.get(itemId);
  if (!item || !history) return;
  const from = direction === 'undo' ? history.undo : history.redo;
  const to = direction === 'undo' ? history.redo : history.undo;
  const entry = from.pop();
  if (!entry) return;
  const current = { document: structuredClone(item.math), focus: item.math?.focus ?? null };
  to.push(current);
  const restored = entry.document;
  state = updateItem(state, itemId, { note: item.note, math: { ...restored, focus: entry.focus } });
  renderAll();
  await saveState().catch(() => {});
  elements['save-status'].textContent = direction === 'undo' ? 'Undid mathematical edit' : 'Redid mathematical edit';
}

async function openInlineNemethEditor(article, startingFocus = null) {
  if (inlineEditor) return;
  const item = activeNapkin()?.items.find(({ id }) => id === article.dataset.itemId);
  if (!item) return;
  let math = article.querySelector('mjx-container, math');
  for (let attempt = 0; !math && attempt < 100 && article.isConnected; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    math = article.querySelector('mjx-container, math');
  }
  if (!math) return;
  let focus;
  try {
    focus = startingFocus ? { target: startingFocus, speech: '', nemeth: '' } : captureExplorerFocus(article);
  } catch {
    elements['save-status'].textContent = 'This focus cannot be edited safely.';
    return;
  }
  const editor = document.createElement('textarea');
  editor.className = 'nemeth-inline-editor';
  editor.rows = 2;
  editor.setAttribute('aria-label', `Nemeth editor for ${focus.speech || 'focused expression'}`);
  // The textarea is only a native Braille-input proxy. It never represents a
  // whole expression and every committed cell is routed through the bounded
  // transition engine below.
  editor.value = '';
  article.append(editor);
  inlineEditor = editor;
  let workingDocument = { formatVersion: 2, mathml: item.math?.mathml ?? item.mathml, focus: focus.target };
  let currentFocus = focus.target;
  let inputState = { pendingCells: [] };
  let didApply = false;
  const history = mathHistory.get(item.id) ?? { undo: [], redo: [] };

  const persistWorkingDocument = () => {
    state = updateItem(state, item.id, { note: item.note, math: workingDocument });
    return saveState({ announce: false }).catch(() => {});
  };

  const consumeBufferedInput = async () => {
    for (const cell of [...editor.value]) {
      const result = await window.omniya.applyMathTransition({ document: workingDocument, focus: currentFocus, inputState, input: { kind: 'nemeth-cell', cell } });
      if (result.status === 'pending') { inputState = result.inputState; continue; }
      if (result.status === 'choice') throw new Error('Choose a meaning with Command-K before committing this sequence.');
      if (result.status !== 'applied') throw new Error(result.announcement);
      history.undo.push({ document: structuredClone(workingDocument), focus: currentFocus });
      history.undo = history.undo.slice(-100);
      history.redo = [];
      mathHistory.set(item.id, history);
      didApply = true;
      workingDocument = result.document;
      currentFocus = result.focus;
      inputState = result.inputState;
      void persistWorkingDocument();
    }
    if (inputState.pendingCells?.length) throw new Error('The Nemeth sequence is incomplete.');
    editor.value = '';
  };

  const announceCurrentFocus = () => {
    const context = currentFocus?.kind === 'node' ? currentFocus.nodeId : currentFocus?.firstNodeId;
    editor.setAttribute('aria-label', `Nemeth editor at ${context || 'focused expression'}`);
  };
  editor.focus();
  if (globalThis.__omniyaBrailleSimulation) {
    const sixKey = createSixKeyInput({ emit: (cell) => {
      const start = editor.selectionStart ?? editor.value.length;
      const end = editor.selectionEnd ?? start;
      editor.setRangeText(cell, start, end, 'end');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }});
    editor.addEventListener('keydown', (event) => sixKey.keydown(event));
    editor.addEventListener('keyup', (event) => sixKey.keyup(event));
  }
  editor.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeInlineEditor(article);
      if (didApply) {
        renderAll();
        const restored = elements['transcript'].querySelector(`article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`);
        if (restored) setTimeout(() => void restoreExplorerFocus(restored, currentFocus), 0);
      }
      return;
    }
    if (event.key === 'Backspace' && editor.value === '' && (editor.selectionStart ?? 0) === 0) {
      event.preventDefault();
      event.stopPropagation();
      try {
        const result = await window.omniya.applyMathTransition({ document: workingDocument, focus: currentFocus, inputState, input: { kind: 'command', operationId: 'delete.focused' } });
        if (result.status !== 'applied') throw new Error(result.announcement);
        history.undo.push({ document: structuredClone(workingDocument), focus: currentFocus });
        history.undo = history.undo.slice(-100);
        history.redo = [];
        mathHistory.set(item.id, history);
        workingDocument = result.document;
        currentFocus = result.focus;
        inputState = result.inputState;
        didApply = true;
        await persistWorkingDocument();
        announceCurrentFocus();
        elements['save-status'].textContent = 'Deleted focused mathematics';
      } catch (error) {
        elements['save-status'].textContent = error.message;
      }
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      try {
        await consumeBufferedInput();
        const next = nextEmptyFocus(workingDocument, currentFocus, event.shiftKey ? -1 : 1);
        if (next) {
          currentFocus = next;
          workingDocument = { ...workingDocument, focus: currentFocus };
          announceCurrentFocus();
          void persistWorkingDocument();
          elements['save-status'].textContent = event.shiftKey ? 'Previous empty mathematical slot' : 'Next empty mathematical slot';
        }
      } catch (error) {
        elements['save-status'].textContent = error.message;
        editor.setAttribute('aria-invalid', 'true');
      }
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      await consumeBufferedInput();
      state = updateItem(state, item.id, { note: item.note, math: workingDocument });
      closeInlineEditor(article);
      renderAll();
      const replacementArticle = elements['transcript'].querySelector(`article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`);
      if (replacementArticle) setTimeout(() => void restoreExplorerFocus(replacementArticle, currentFocus), 0);
      await saveState().catch(() => {});
      elements['save-status'].textContent = 'Nemeth edit committed';
    } catch (error) {
      elements['save-status'].textContent = error.message;
      editor.setAttribute('aria-invalid', 'true');
    }
  });
}

// MathJax may move focus to its short-lived hidden focus element while an
// expression is being explored. Keep Escape reliable even in that case.
document.addEventListener('keydown', (event) => {
  if (!exploringEquationItemId) return;
  const focused = document.activeElement;
  if (!focused?.matches?.('mjx-container, math, mjx-focus') &&
      !focused?.closest?.('mjx-container, math, mjx-focus')) return;
  const article = elements['transcript'].querySelector(
    `article.napkin-article[data-item-id="${CSS.escape(exploringEquationItemId)}"]`
  );
  if (!article) return;
  if (event.key.toLowerCase() === 'e' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openInlineNemethEditor(article);
    return;
  }
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  leaveEquation(article);
}, true);

document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
  if (!exploringEquationItemId) return;
  event.preventDefault();
  void openOperationPalette();
}, true);

document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || inlineEditor) return;
  const item = activeNapkin()?.items.find(({ id }) => id === exploringEquationItemId);
  if (!item) return;
  event.preventDefault();
  void applyMathHistory(item.id, event.shiftKey ? 'redo' : 'undo');
}, true);

function resetDraft() {
  draft = { source: '', note: '', type: 'text' };
  noteVisible = false;
}

function returnToRead({ discardDraft = true } = {}) {
  if (discardDraft) resetDraft();
  mode = 'read';
  editingItemId = null;
  renderAll();
  focusSelectedArticle();
}

function openAddMode() {
  if (!activeNapkin()) return;
  mode = 'add';
  editingItemId = null;
  resetDraft();
  renderAll();
  elements['composer-source'].focus();
}

function openEditMode(itemId) {
  const napkin = activeNapkin();
  if (!napkin) return;
  itemId ??= napkin.selectedItemId;
  if (!itemId) return;
  state = selectItem(state, itemId);
  mode = 'edit';
  editingItemId = itemId;
  renderAll();
  elements['composer-source'].focus();
}

function navigateItems(key) {
  if (mode !== 'read') return false;
  const napkin = activeNapkin();
  if (!napkin) return false;
  if (napkin.items.length === 0) return false;
  const current = napkin.items.findIndex(({ id }) => id === napkin.selectedItemId);
  let next = current;
  if (current === -1) {
    next = key === 'ArrowUp' || key === 'End' ? napkin.items.length - 1 : 0;
  } else if (key === 'ArrowUp') {
    next = Math.max(0, current - 1);
  } else if (key === 'ArrowDown') {
    next = Math.min(napkin.items.length - 1, current + 1);
  } else if (key === 'Home') {
    next = 0;
  } else if (key === 'End') {
    next = napkin.items.length - 1;
  } else {
    return false;
  }
  state = selectItem(state, napkin.items[next].id);
  renderTranscript();
  focusSelectedArticle();
  elements['save-status'].textContent = `Item ${next + 1} of ${napkin.items.length}`;
  saveSelectionSoon();
  return true;
}

function selectedType() {
  return elements['mode-switch'].querySelector('input:checked')?.value === 'equation'
    ? 'equation'
    : 'text';
}

async function submitComposer() {
  if (mode !== 'add' && mode !== 'edit') return;
  if (!activeNapkin()) returnToRead();
  if (!activeNapkin()) return;
  const source = elements['composer-source'].value;
  const note = elements['composer-note'].value;
  const editing = mode === 'edit';
  const type = editing ? activeItem().type : selectedType();
  const guidedCreation = !editing && type === 'equation' && !source.trim();
  draft = { source, note, type };
  setFieldError(elements['composer-source'], elements['composer-error']);

  if (type === 'text' && !source.trim()) {
    setFieldError(elements['composer-source'], elements['composer-error'], 'Enter text or LaTeX first.');
    elements['composer-source'].focus();
    return;
  }

  let math = null;
  if (type === 'equation') {
    try {
      math = source.trim()
        ? await (window.omniya.importMath
          ? window.omniya.importMath(source)
          : window.omniya.latexToMathML(source))
        : createEmptyMathDocument();
    } catch {
      setFieldError(elements['composer-source'], elements['composer-error'],
        'The LaTeX could not be converted. Check its syntax.');
      elements['composer-source'].focus();
      return;
    }
  }

  if (editing) {
    state = updateItem(state, editingItemId, { source, note, math: math ?? activeItem()?.math });
  } else {
    state = addItem(state, type === 'equation' ? { type, note, math } : { type, source, note, mathml: null });
  }
  resetDraft();
  mode = 'read';
  editingItemId = null;
  renderAll();
  focusSelectedArticle();
  elements['save-status'].textContent = editing ? 'Saved item' : 'Added item';
  await saveState().catch(() => {});
  if (guidedCreation) {
    const item = activeItem();
    const article = item && elements['transcript'].querySelector(`article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`);
    if (article) void openInlineNemethEditor(article, item.math.focus);
  }
}

async function deleteFocusedItem(itemId) {
  state = deleteItem(state, itemId);
  renderAll();
  focusSelectedArticle();
  elements['save-status'].textContent = 'Deleted item';
  await saveState().catch(() => {});
}

async function deleteFocusedNapkin(napkinId) {
  if (mode !== 'read') return;
  const napkin = state.napkins.find(({ id }) => id === napkinId);
  if (!napkin) return;
  if (!globalThis.confirm(`Delete napkin “${napkin.name}”? This cannot be undone.`)) return;

  const index = state.napkins.findIndex(({ id }) => id === napkinId);
  const remaining = state.napkins.filter(({ id }) => id !== napkinId);
  const focusId = remaining[index]?.id ?? remaining[index - 1]?.id;
  state = deleteNapkin(state, napkinId);
  renderAll();
  focusNapkinButton(focusId ?? state.activeNapkinId);
  elements['save-status'].textContent = `Deleted ${napkin.name}`;
  await saveState().catch(() => {});
}

elements['new-napkin-button'].addEventListener('click', () => {
  if (mode !== 'read') returnToRead();
  elements['new-napkin-form'].hidden = false;
  elements['napkin-name'].value = '';
  setFieldError(elements['napkin-name'], elements['napkin-name-error']);
  elements['napkin-name'].focus();
});

elements['cancel-new-napkin'].addEventListener('click', () => {
  elements['new-napkin-form'].hidden = true;
  elements['new-napkin-button'].focus();
});

elements['new-napkin-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    state = createNapkin(state, elements['napkin-name'].value);
  } catch (error) {
    setFieldError(elements['napkin-name'], elements['napkin-name-error'], error.message);
    elements['napkin-name'].focus();
    return;
  }
  elements['new-napkin-form'].hidden = true;
  mode = 'read';
  renderAll();
  elements['open-add-button'].focus();
  await saveState().catch(() => {});
});

elements['napkin-list'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-napkin-id]');
  if (!button) return;
  returnToRead();
  state = switchNapkin(state, button.dataset.napkinId);
  renderAll();
  elements['save-status'].textContent = `Opened ${activeNapkin().name}`;
  focusSelectedArticle();
  await saveState().catch(() => {});
});

elements['napkin-list'].addEventListener('keydown', (event) => {
  const button = event.target.closest('[data-napkin-id]');
  if (!button || event.key !== 'Backspace') return;
  event.preventDefault();
  void deleteFocusedNapkin(button.dataset.napkinId);
});

elements['open-add-button'].addEventListener('click', openAddMode);
elements['open-operations-button'].addEventListener('click', () => void openOperationPalette());
elements['close-operation-dialog'].addEventListener('click', () => {
  if (typeof elements['operation-dialog'].close === 'function') elements['operation-dialog'].close();
  else elements['operation-dialog'].hidden = true;
});
elements['composer-back'].addEventListener('click', () => returnToRead());
elements['composer-discard'].addEventListener('click', () => returnToRead());
elements['composer-cancel'].addEventListener('click', () => returnToRead());

elements['note-toggle'].addEventListener('click', () => {
  noteVisible = !noteVisible;
  elements['note-row'].hidden = !noteVisible;
  elements['note-toggle'].textContent = noteVisible ? 'Hide note' : 'Add note';
  elements['note-toggle'].setAttribute('aria-expanded', String(noteVisible));
  if (noteVisible) elements['composer-note'].focus();
});

elements['composer-source'].addEventListener('input', () => {
  draft.source = elements['composer-source'].value;
});
elements['composer-note'].addEventListener('input', () => {
  draft.note = elements['composer-note'].value;
});
elements['mode-switch'].addEventListener('change', () => {
  draft.type = selectedType();
});

elements['composer-source'].addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submitComposer();
  }
});

elements['composer-form'].addEventListener('submit', (event) => {
  event.preventDefault();
  void submitComposer();
});

elements['composer-form'].addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (mode === 'add' || mode === 'edit')) {
    event.preventDefault();
    returnToRead();
  }
});

elements['transcript'].addEventListener('click', (event) => {
  const article = event.target.closest('.napkin-article');
  if (!article) return;
  state = selectItem(state, article.dataset.itemId);
  renderTranscript();
  focusSelectedArticle();
  saveSelectionSoon();
});

elements['transcript'].addEventListener('keydown', (event) => {
  const article = event.target.closest('.napkin-article');
  if (!article) return;

  const math = event.target.closest('mjx-container, math, mjx-focus');
  if (math) {
    if (event.key === 'Escape') {
      event.preventDefault();
      leaveEquation(article);
    }
    if (event.key.toLowerCase() === 'e' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void openInlineNemethEditor(article);
    }
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const item = activeNapkin().items.find(({ id }) => id === article.dataset.itemId);
    if (item?.type === 'equation') {
      void enterEquation(article);
    } else {
      openEditMode(article.dataset.itemId);
    }
    return;
  }
  if (event.key.toLowerCase() === 'e' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    openEditMode(article.dataset.itemId);
    return;
  }
  if (event.key === 'Backspace') {
    event.preventDefault();
    void deleteFocusedItem(article.dataset.itemId);
    return;
  }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  navigateItems(event.key);
});

elements['keyboard-help-button'].addEventListener('click', () => {
  if (typeof elements['keyboard-help'].showModal === 'function') {
    elements['keyboard-help'].showModal();
  } else {
    elements['keyboard-help'].hidden = false;
  }
});
elements['close-keyboard-help'].addEventListener('click', () => {
  if (typeof elements['keyboard-help'].close === 'function') {
    elements['keyboard-help'].close();
  } else {
    elements['keyboard-help'].hidden = true;
  }
});

elements['retry-save'].addEventListener('click', () => void saveState().catch(() => {}));

if (!globalThis.omniya?.loadState) {
  disableInteractiveControls();
  showError('Run this prototype with “npm start”; the Electron preload bridge is required.');
} else {
  try {
    const loaded = await window.omniya.loadState();
    state = loaded.state;
    renderAll();
    if (loaded.warning) showError(loaded.warning);
  } catch {
    showError('The napkins could not be loaded.');
  }
}
elements['app-shell'].setAttribute('aria-busy', 'false');
