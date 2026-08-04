import {
  addItem,
  createNapkin,
  deleteItem,
  getActiveNapkin,
  selectItem,
  switchNapkin,
  updateItem
} from '../domain/model.js';

const elements = Object.fromEntries([
  'app-shell', 'napkin-list', 'new-napkin-button', 'new-napkin-form', 'napkin-name',
  'napkin-name-error', 'cancel-new-napkin', 'current-napkin-name', 'item-count',
  'save-status', 'reading-section', 'mode-label', 'reading-heading', 'reading-help',
  'empty-message', 'transcript', 'reading-actions', 'open-add-button',
  'keyboard-help-button', 'keyboard-help', 'close-keyboard-help', 'composer-dock',
  'composer-form', 'composer-mode-label', 'composer-heading', 'composer-back',
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

function activeNapkin() {
  return getActiveNapkin(state);
}

function activeItem() {
  const napkin = activeNapkin();
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

function saveState() {
  const stateToSave = structuredClone(state);
  elements['save-status'].textContent = 'Saving…';
  saveChain = saveChain
    .catch(() => {})
    .then(() => window.omniya.saveState(stateToSave))
    .then(() => {
      clearAppError();
      elements['save-status'].textContent = 'Saved';
    })
    .catch(() => {
      elements['save-status'].textContent = 'Not saved';
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
  return `${kind} item ${index + 1} of ${count}: ${item.source}`;
}

function appendMathML(container, mathml) {
  const xml = new DOMParser().parseFromString(mathml, 'application/xml');
  const root = xml.documentElement;
  if (root.localName !== 'math' || root.namespaceURI !== 'http://www.w3.org/1998/Math/MathML' ||
      xml.querySelector('parsererror')) {
    throw new Error('Invalid MathML');
  }
  container.replaceChildren(document.importNode(root, true));
}

function renderTranscript() {
  const napkin = activeNapkin();
  elements['transcript'].replaceChildren();
  elements['empty-message'].hidden = napkin.items.length > 0;
  elements['item-count'].textContent = `${napkin.items.length} ${napkin.items.length === 1 ? 'item' : 'items'}`;

  for (const [index, item] of napkin.items.entries()) {
    const article = document.createElement('article');
    article.className = 'napkin-article';
    article.tabIndex = item.id === napkin.selectedItemId ? 0 : -1;
    article.dataset.itemId = item.id;
    article.setAttribute('aria-posinset', String(index + 1));
    article.setAttribute('aria-setsize', String(napkin.items.length));

    const heading = document.createElement('h4');
    heading.className = 'article-heading';
    heading.id = `item-heading-${item.id}`;
    heading.setAttribute('aria-label', itemSummary(item, index, napkin.items.length));

    const number = document.createElement('span');
    number.className = 'item-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const kind = document.createElement('span');
    kind.className = 'item-kind';
    kind.textContent = item.type === 'equation' ? 'Equation' : 'Text';
    const source = document.createElement('span');
    source.className = 'item-source';
    source.textContent = item.source;
    heading.append(number, kind, source);

    const summary = document.createElement('p');
    summary.className = 'sr-only';
    summary.id = `item-summary-${item.id}`;
    summary.textContent = `Source: ${item.source}${item.note ? `. Note: ${item.note}` : ''}`;
    article.setAttribute('aria-labelledby', heading.id);
    article.setAttribute('aria-describedby', summary.id);

    const content = document.createElement('div');
    content.className = 'item-content';
    if (item.type === 'equation') {
      appendMathML(content, item.mathml);
    } else {
      const text = document.createElement('p');
      text.className = 'item-text';
      text.textContent = item.source;
      content.append(text);
    }

    article.append(heading, summary, content);
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
  elements['current-napkin-name'].textContent = activeNapkin().name;
}

function renderMode() {
  const reading = mode === 'read';
  elements['reading-actions'].hidden = !reading;
  elements['composer-dock'].hidden = reading;
  elements['reading-help'].textContent = reading
    ? 'Arrow keys move between items. Enter edits the focused item.'
    : 'Reading remains available above. Escape returns without saving.';
}

function renderComposer() {
  const editing = mode === 'edit';
  const item = editing ? activeItem() : null;
  const values = editing
    ? { source: item?.source ?? '', note: item?.note ?? '', type: item?.type ?? 'text' }
    : draft;

  elements['composer-mode-label'].textContent = editing ? 'EDITING' : 'ADDING';
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
  const item = activeItem();
  const article = item && elements['transcript'].querySelector(
    `article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`
  );
  (article ?? elements['open-add-button']).focus();
}

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
  mode = 'add';
  editingItemId = null;
  resetDraft();
  renderAll();
  elements['composer-source'].focus();
}

function openEditMode(itemId = activeNapkin().selectedItemId) {
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
  const source = elements['composer-source'].value;
  const note = elements['composer-note'].value;
  const editing = mode === 'edit';
  const type = editing ? activeItem().type : selectedType();
  draft = { source, note, type };
  setFieldError(elements['composer-source'], elements['composer-error']);

  if (!source.trim()) {
    setFieldError(elements['composer-source'], elements['composer-error'], 'Enter text or LaTeX first.');
    elements['composer-source'].focus();
    return;
  }

  let mathml = null;
  if (type === 'equation') {
    try {
      mathml = (await window.omniya.latexToMathML(source)).mathml;
    } catch {
      setFieldError(elements['composer-source'], elements['composer-error'],
        'The LaTeX could not be converted. Check its syntax.');
      elements['composer-source'].focus();
      return;
    }
  }

  if (editing) {
    state = updateItem(state, editingItemId, { source, note, mathml });
  } else {
    state = addItem(state, { type, source, note, mathml });
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

elements['open-add-button'].addEventListener('click', openAddMode);
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
  if (event.key === 'Enter') {
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
