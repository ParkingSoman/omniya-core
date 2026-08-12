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
import { createEmptyDraftMathDocument } from '../domain/guided-nemeth/index.js';
import {
  applyNemethCell,
  applyNemethChoice,
  commitNemethLocalCode,
  cancelReplacement,
  setLatexSource,
  setReplacementMethod,
  startReplacementSession,
  submitReplacement
} from '../domain/replacement-session.js';

const elements = Object.fromEntries([
  'app-shell', 'napkin-list', 'new-napkin-button', 'new-napkin-form', 'napkin-name',
  'napkin-name-error', 'cancel-new-napkin', 'current-napkin-name', 'item-count',
  'save-status', 'reading-section', 'reading-heading', 'reading-help',
  'empty-message', 'transcript', 'reading-actions', 'open-add-button',
  'keyboard-help-button', 'keyboard-help', 'close-keyboard-help', 'composer-dock',
  'composer-form', 'composer-heading', 'composer-back',
  'mode-switch', 'note-toggle', 'composer-source', 'note-row', 'composer-note',
  'composer-help', 'composer-error', 'editing-indicator', 'composer-submit',
  'composer-discard', 'composer-cancel', 'replacement-dock', 'replacement-heading',
  'replacement-scope', 'replacement-method', 'replacement-input', 'replacement-status', 'replacement-choices',
  'replacement-submit', 'replacement-cancel', 'app-error', 'app-error-message', 'retry-save'
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
let replacementSession = null;
let replacementEditor = null;
let preferredAuthoringMethod = 'nemeth';
const mathHistory = new Map();
// MathJax changes the visual and speech nodes in a short asynchronous handoff
// after an arrow key. Keep the last successfully resolved *exact* address so
// E remains reliable during that handoff. This is a runtime cache only; the
// persisted cursor is still the canonical MathFocus on the equation item.
const explorerFocusCache = new Map();

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
    // MathJax's assistive clone sanitizes unknown data attributes. Keep a
    // runtime-only identity token on the source element so the bridge can
    // recover the application node from any semantic focus, including virtual
    // SRE groupings. This never enters persisted MathML.
    for (const node of source.querySelectorAll('[data-omniya-id]')) {
      node.id = `omniya-source-${node.getAttribute('data-omniya-id')}`;
    }
    container.replaceChildren(source);
    await globalThis.MathJax.typesetPromise([container]);
    stampCanonicalIds(container);
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

async function captureExplorerFocusWithRetry(article) {
  let lastError;
  // Explorer focus is asynchronous when MathJax hands control back from a
  // screen reader. Give the bridge enough time to observe the same current
  // node that MathJax itself will use; never broaden a settled focus to the
  // equation root as a recovery strategy.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return captureExplorerFocus(article);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError ?? new Error('MathJax explorer focus was not available');
}

function stampCanonicalIds(container) {
  const sourceMath = container.querySelector('mjx-assistive-mml math');
  const visualMath = container.querySelector('mjx-math');
  if (!sourceMath || !visualMath) return;
  // MathJax can add wrappers and glyph nodes, so positional stamping is not
  // safe for duplicate or nested expressions. The assistive MathML source and
  // visual tree share semantic IDs; use that identity bridge only.
  const visualBySemantic = new Map(
    [...visualMath.querySelectorAll('[data-semantic-id]')]
      .map((node) => [node.getAttribute('data-semantic-id'), node])
  );
  for (const sourceNode of [sourceMath, ...sourceMath.querySelectorAll('[data-omniya-id], [id^="omniya-source-"]')]) {
    const id = sourceNode.getAttribute('data-omniya-id') || sourceNode.id?.replace(/^omniya-source-/, '');
    const semanticId = sourceNode.getAttribute('data-semantic-id');
    if (!id || !semanticId) continue;
    const visualNode = visualBySemantic.get(semanticId);
    if (visualNode) visualNode.setAttribute('data-omniya-id', id);
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
  elements['reading-help'].textContent = reading
    ? 'Up and Down arrows move between items. Enter explores an equation; E replaces the exact focus.'
    : 'Reading remains available above. Escape returns without saving.';
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
    : values.type === 'equation'
      ? 'Enter creates an empty equation and opens the replacement writer · Escape cancels'
      : 'Enter adds · Shift+Enter makes a new line · Escape cancels';
  elements['composer-source'].hidden = !editing && values.type === 'equation';
  elements['composer-source'].required = editing || values.type !== 'equation';
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
  explorerFocusCache.delete(exploringEquationItemId);
  elements['save-status'].textContent = 'Equation entered. Use arrow keys to explore it. Escape returns to the item.';
  void cacheExplorerFocus(article);
  return true;
}

function leaveEquation(article) {
  if (article?.dataset.itemId) explorerFocusCache.delete(article.dataset.itemId);
  exploringEquationItemId = null;
  article.focus();
  elements['save-status'].textContent = 'Equation level';
}

async function cacheExplorerFocus(article) {
  if (!article?.isConnected || exploringEquationItemId !== article.dataset.itemId) return null;
  try {
    const focus = await captureExplorerFocusWithRetry(article);
    if (exploringEquationItemId === article.dataset.itemId) explorerFocusCache.set(article.dataset.itemId, focus);
    return focus;
  } catch {
    // A later navigation event or the E handler will retry. Never publish a
    // user-facing "unsafe" state for this transient DOM handoff.
    return null;
  }
}

function closeReplacementEditor() {
  replacementEditor?.removeEventListener('input', replacementEditor._replacementInputHandler);
  replacementEditor?.removeEventListener('keydown', replacementEditor._replacementKeyHandler);
  if (replacementEditor?._replacementChoiceHandler) {
    elements['replacement-choices'].removeEventListener('click', replacementEditor._replacementChoiceHandler);
  }
  replacementEditor = null;
  replacementSession = null;
  elements['replacement-choices'].replaceChildren();
  elements['replacement-choices'].hidden = true;
  elements['replacement-dock'].hidden = true;
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

async function cancelReplacementEditor(article) {
  if (!replacementSession) return;
  const session = replacementSession;
  cancelReplacement(session);
  const wasNew = Boolean(session.isNew);
  const itemId = article?.dataset.itemId;
  closeReplacementEditor();
  if (wasNew && itemId) state = deleteItem(state, itemId);
  renderAll();
  if (wasNew) {
    await saveState().catch(() => {});
    focusSelectedArticle();
    return;
  }
  const restored = itemId
    ? elements['transcript'].querySelector(`article.napkin-article[data-item-id="${CSS.escape(itemId)}"]`)
    : null;
  if (restored && session.target) setTimeout(() => void restoreExplorerFocus(restored, session.target, session.originalExplorerFocus), 0);
  elements['save-status'].textContent = 'Replacement cancelled';
}

async function openReplacementEditor(article, startingFocus = null, isNew = false) {
  if (replacementSession) return;
  const item = activeNapkin()?.items.find(({ id }) => id === article.dataset.itemId);
  if (!item) return;
  let math = article.querySelector('mjx-container, math');
  if (!isNew) {
    for (let attempt = 0; !math && attempt < 100 && article.isConnected; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      math = article.querySelector('mjx-container, math');
    }
    if (!math) return;
  }
  let focus;
  try {
    if (startingFocus) {
      focus = { target: startingFocus, speech: '', nemeth: '' };
    } else if (exploringEquationItemId === article.dataset.itemId) {
      try {
        focus = await captureExplorerFocusWithRetry(article);
      } catch (error) {
        // MathJax can briefly expose neither its visual nor speech focus while
        // handing control back to the browser. The last bridge result, the
        // persisted focus, or the canonical equation root are all exact
        // application-owned targets. This path never publishes an unsafe
        // focus error to the user.
        const root = item.math && new DOMParser().parseFromString(item.math.mathml, 'application/xml').documentElement;
        const rootId = root?.getAttribute('data-omniya-id');
        focus = explorerFocusCache.get(article.dataset.itemId)
          || (rootId ? { target: { kind: 'node', nodeId: rootId }, speech: 'whole equation', nemeth: '' } : null);
        if (!focus) throw error;
      }
      explorerFocusCache.set(article.dataset.itemId, focus);
    } else {
      const root = item.math && new DOMParser().parseFromString(item.math.mathml, 'application/xml').documentElement;
      const rootId = root?.getAttribute('data-omniya-id');
      focus = { target: { kind: 'node', nodeId: rootId }, speech: 'whole equation', nemeth: '' };
    }
  } catch (error) {
    // The source MathML is application-owned and structurally valid. This is
    // an internal diagnostic only; no "focus cannot be edited safely" state is
    // exposed in the editing workflow.
    console.error('MathJax focus bridge could not resolve the active node', error);
    return;
  }
  replacementSession = startReplacementSession({
    document: item.math,
    target: focus.target,
    explorerFocus: focus,
    method: preferredAuthoringMethod
  });
  replacementSession.isNew = isNew;
  explorerFocusCache.delete(article.dataset.itemId);
  const editor = elements['replacement-input'];
  replacementEditor = editor;
  editor.className = preferredAuthoringMethod === 'nemeth' ? 'nemeth-inline-editor' : 'latex-inline-editor';
  editor.value = '';
  elements['replacement-dock'].hidden = false;
  elements['replacement-scope'].textContent = focus.speech ? `Selected: ${focus.speech}` : 'Selected mathematical scope';
  elements['replacement-scope'].dataset.targetId = focus.target.kind === 'node'
    ? focus.target.nodeId
    : focus.target.firstNodeId;
  elements['replacement-status'].textContent = preferredAuthoringMethod === 'nemeth'
    ? 'Enter Nemeth cells. Complete local codes apply immediately; bounded codes wait for Enter.'
    : 'Enter LaTeX for the replacement expression.';
  elements['replacement-method'].querySelectorAll('input').forEach((input) => { input.checked = input.value === preferredAuthoringMethod; });
  elements['replacement-choices'].replaceChildren();
  elements['replacement-choices'].hidden = true;
  let inputProcessing = Promise.resolve();

  const renderDraftPreview = async () => {
    if (!replacementSession || replacementSession.method !== 'nemeth') return;
    const content = article.querySelector('.item-content');
    if (!content) return;
    await renderEquation(content, { ...item, math: replacementSession.draft }, ++transcriptRenderVersion);
    if (replacementSession?.draftFocus) setTimeout(() => void restoreExplorerFocus(article, replacementSession.draftFocus), 0);
  };

  const consumeCell = async (cell) => {
    if (!replacementSession) return;
    const result = applyNemethCell(replacementSession, cell);
    replacementSession = result.session;
    if (result.status === 'applied') {
      editor.value = '';
      elements['replacement-status'].textContent = `Draft updated: ${result.announcement}`;
      await renderDraftPreview();
    } else if (result.status === 'pending') {
      // This is the bounded local-code buffer, never a passage buffer. Keep
      // the prefix visible so a user can review or correct an arrow, paired
      // operator, or other registered atomic construction before Enter.
      editor.value = replacementSession.nemethState.prefix;
      editor.setSelectionRange(editor.value.length, editor.value.length);
      elements['replacement-status'].textContent = result.announcement;
    } else if (result.status === 'choice') {
      editor.value = replacementSession.nemethState.prefix;
      editor.setSelectionRange(editor.value.length, editor.value.length);
      elements['replacement-status'].textContent = result.announcement;
      elements['replacement-choices'].replaceChildren(...result.choices.map((choice) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'replacement-choice';
        button.dataset.operationId = choice.operationId;
        button.textContent = choice.label;
        button.title = `BANA ${choice.banaRefs.join(', ')}`;
        return button;
      }));
      elements['replacement-choices'].hidden = false;
    } else {
      // Invalid local input must remain available for correction. The
      // canonical draft has not changed, and the visible value is still only
      // the current bounded code (not an accumulated expression).
      editor.value = replacementSession.nemethState.prefix || cell;
      editor.setSelectionRange(editor.value.length, editor.value.length);
      elements['replacement-status'].textContent = result.announcement;
      editor.setAttribute('aria-invalid', 'true');
    }
  };
  const chooseOperation = async (event) => {
    const button = event.target.closest?.('.replacement-choice');
    if (!button || !replacementSession) return;
    const result = applyNemethChoice(replacementSession, button.dataset.operationId);
    replacementSession = result.session;
    if (result.status !== 'applied') {
      elements['replacement-status'].textContent = result.announcement;
      return;
    }
    elements['replacement-choices'].replaceChildren();
    elements['replacement-choices'].hidden = true;
    elements['replacement-status'].textContent = `Draft updated: ${result.announcement}`;
    await renderDraftPreview();
    editor.focus();
  };
  editor._replacementChoiceHandler = chooseOperation;
  elements['replacement-choices'].addEventListener('click', chooseOperation);

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
  const inputHandler = async () => {
    if (!replacementSession) return;
    if (replacementSession.method === 'latex') {
      replacementSession = setLatexSource(replacementSession, editor.value);
      return;
    }
    const cells = [...editor.value];
    editor.value = '';
    inputProcessing = inputProcessing.then(async () => {
      for (const cell of cells) await consumeCell(cell);
    });
    await inputProcessing;
  };
  const keyHandler = async (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      await cancelReplacementEditor(article);
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      await inputProcessing;
      if (replacementSession.method === 'nemeth' && replacementSession.nemethState.prefix) {
        const local = commitNemethLocalCode(replacementSession);
        replacementSession = local.session;
        if (local.status === 'applied') {
          elements['replacement-status'].textContent = `Local code committed: ${local.announcement}`;
          editor.value = '';
          await renderDraftPreview();
          // A held short code is still an immediate operation.  Enter is its
          // disambiguator, so after committing it the same Enter may submit a
          // now-complete draft.  Atomic constructions intentionally stop here:
          // their Enter commits only that bounded local construction and the
          // next Enter submits the replacement.
          if (local.localCommitPolicy !== 'immediate') {
            editor.focus();
            return;
          }
        } else if (local.status === 'choice') {
          elements['replacement-status'].textContent = local.announcement;
          elements['replacement-choices'].replaceChildren(...local.choices.map((choice) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'replacement-choice';
            button.dataset.operationId = choice.operationId;
            button.textContent = choice.label;
            button.title = `BANA ${choice.banaRefs.join(', ')}`;
            return button;
          }));
          elements['replacement-choices'].hidden = false;
          return;
        } else {
          elements['replacement-status'].textContent = local.announcement;
          editor.setAttribute('aria-invalid', 'true');
          return;
        }
      }
      const result = await submitReplacement(replacementSession, {
        convertLatexToMathML: async (source) => {
          const converted = await window.omniya.latexToMathML(source);
          return converted?.mathml ?? converted;
        }
      });
      if (replacementSession.originalDocument) {
        const history = mathHistory.get(item.id) ?? { undo: [], redo: [] };
        history.undo.push({ document: structuredClone(item.math), focus: item.math.focus });
        history.undo = history.undo.slice(-100);
        history.redo = [];
        mathHistory.set(item.id, history);
        state = updateItem(state, item.id, { note: item.note, math: result.document });
      } else {
        state = addItem(state, { type: 'equation', note: '', math: result.document });
      }
      closeReplacementEditor();
      renderAll();
      const replacementArticle = elements['transcript'].querySelector(`article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`);
      if (replacementArticle) setTimeout(() => void restoreExplorerFocus(replacementArticle, result.focus), 0);
      await saveState().catch(() => {});
      elements['save-status'].textContent = 'Replacement committed';
    } catch (error) {
      elements['replacement-status'].textContent = error.message;
      editor.setAttribute('aria-invalid', 'true');
    }
  };
  editor._replacementInputHandler = inputHandler;
  editor._replacementKeyHandler = keyHandler;
  editor.addEventListener('input', inputHandler);
  editor.addEventListener('keydown', keyHandler);
  editor.focus();
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
    void openReplacementEditor(article);
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    // A navigation key changes the exact scope. Do not let the cache from the
    // previous node survive a move; refresh it after MathJax settles.
    explorerFocusCache.delete(article.dataset.itemId);
    setTimeout(() => void cacheExplorerFocus(article), 0);
  }
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  leaveEquation(article);
}, true);

document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || replacementSession) return;
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
  draft = { source, note, type };
  setFieldError(elements['composer-source'], elements['composer-error']);

  if (!editing && type === 'equation') {
    state = addItem(state, { type: 'equation', note, math: createEmptyDraftMathDocument() });
    const item = activeItem();
    resetDraft();
    mode = 'read';
    renderAll();
    await saveState().catch(() => {});
    const article = item && elements['transcript'].querySelector(`article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`);
    if (article) void openReplacementEditor(article, item.math.focus, true);
    return;
  }

  if (type === 'text' && !source.trim()) {
    setFieldError(elements['composer-source'], elements['composer-error'], 'Enter text or LaTeX first.');
    elements['composer-source'].focus();
    return;
  }

  if (editing) {
    state = updateItem(state, editingItemId, { source, note });
  } else {
    state = addItem(state, { type, source, note, mathml: null });
  }
  resetDraft();
  mode = 'read';
  editingItemId = null;
  renderAll();
  focusSelectedArticle();
  elements['save-status'].textContent = editing ? 'Saved item' : 'Added item';
  await saveState().catch(() => {});
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
elements['replacement-submit'].addEventListener('click', () => {
  replacementEditor?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
elements['replacement-cancel'].addEventListener('click', () => {
  const article = replacementSession && elements['transcript'].querySelector(`article.napkin-article[data-item-id="${CSS.escape(activeItem()?.id ?? '')}"]`);
  void cancelReplacementEditor(article);
});
elements['replacement-method'].addEventListener('change', () => {
  if (!replacementSession) return;
  const selected = elements['replacement-method'].querySelector('input:checked')?.value;
  try {
    replacementSession = setReplacementMethod(replacementSession, selected);
    preferredAuthoringMethod = selected;
    replacementEditor.className = selected === 'nemeth' ? 'nemeth-inline-editor' : 'latex-inline-editor';
    replacementEditor.value = '';
    elements['replacement-status'].textContent = selected === 'nemeth'
      ? 'Enter Nemeth cells. Complete local codes apply immediately; bounded codes wait for Enter.'
      : 'Enter LaTeX for the replacement expression.';
  } catch (error) {
    elements['replacement-method'].querySelectorAll('input').forEach((input) => { input.checked = input.value === replacementSession.method; });
    elements['replacement-status'].textContent = error.message;
  }
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
  if (mode === 'add' || mode === 'edit') renderComposer();
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
      void openReplacementEditor(article);
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
    if (activeNapkin()?.items.find(({ id }) => id === article.dataset.itemId)?.type === 'equation') void openReplacementEditor(article);
    else openEditMode(article.dataset.itemId);
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
