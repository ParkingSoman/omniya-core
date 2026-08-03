import {
  addItem,
  createNapkin,
  getActiveNapkin,
  selectItem,
  switchNapkin,
  updateItem
} from '../domain/model.js';

const elements = Object.fromEntries([
  'app-shell', 'napkin-list', 'new-napkin-button', 'new-napkin-form', 'napkin-name',
  'napkin-name-error', 'cancel-new-napkin', 'current-napkin-name', 'item-count',
  'save-status', 'transcript', 'transcript-help', 'empty-message', 'composer-form',
  'composer-heading', 'mode-switch', 'note-toggle', 'composer-source', 'note-row',
  'composer-note', 'composer-help', 'composer-error', 'editing-indicator',
  'composer-submit', 'composer-cancel', 'app-error', 'app-error-message', 'retry-save'
].map((id) => [id, document.getElementById(id)]));

let state;
let editingItemId = null;
let noteVisible = false;
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
  const snapshot = structuredClone(state);
  elements['save-status'].textContent = 'Saving…';
  saveChain = saveChain
    .catch(() => {})
    .then(() => window.omniya.saveState(snapshot))
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
  return `${kind} ${index + 1} of ${count}: ${item.source}`;
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
    const row = document.createElement('li');
    row.className = 'item-row';
    row.dataset.itemId = item.id;

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'item-select';
    select.dataset.itemId = item.id;
    select.setAttribute('aria-label', itemSummary(item, index, napkin.items.length));
    if (item.id === napkin.selectedItemId) select.setAttribute('aria-current', 'step');

    const number = document.createElement('span');
    number.className = 'item-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const kind = document.createElement('span');
    kind.className = 'item-kind';
    kind.textContent = item.type === 'equation' ? 'Equation' : 'Text';
    const source = document.createElement('span');
    source.className = 'item-source';
    source.textContent = item.source;
    select.append(number, kind, source);

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

    row.append(select, content);
    if (item.note) {
      const note = document.createElement('p');
      note.className = 'item-note';
      note.textContent = `Note: ${item.note}`;
      row.append(note);
    }
    elements['transcript'].append(row);
  }
}

function renderHeader() {
  const napkin = activeNapkin();
  elements['current-napkin-name'].textContent = napkin.name;
}

function renderComposer() {
  const editing = editingItemId !== null;
  const item = editing ? activeItem() : null;
  elements['composer-heading'].textContent = editing ? 'Edit item' : 'Add to napkin';
  elements['composer-submit'].textContent = editing ? 'Save item' : 'Add item';
  elements['composer-cancel'].hidden = !editing;
  elements['editing-indicator'].textContent = editing ? 'Editing the selected item' : '';
  elements['composer-source'].value = item?.source ?? '';
  elements['composer-note'].value = item?.note ?? '';
  elements['mode-switch'].querySelectorAll('input').forEach((input) => {
    input.disabled = editing;
    input.checked = editing ? input.value === item.type : input.value === 'text';
  });
  noteVisible = editing ? Boolean(item.note) : false;
  elements['note-row'].hidden = !noteVisible;
  elements['note-toggle'].hidden = editing && noteVisible;
  elements['note-toggle'].textContent = noteVisible ? 'Hide note' : 'Add note';
  elements['note-toggle'].setAttribute('aria-expanded', String(noteVisible));
  elements['composer-help'].textContent = editing
    ? 'Save updates the selected item · Escape cancels'
    : 'Enter adds · Shift+Enter makes a new line';
  setFieldError(elements['composer-source'], elements['composer-error']);
}

function renderAll() {
  renderNapkins();
  renderHeader();
  renderTranscript();
  renderComposer();
}

function focusSelectedItem() {
  const item = activeItem();
  const button = item && elements['transcript'].querySelector(`[data-item-id="${CSS.escape(item.id)}"]`);
  (button ?? elements['composer-source']).focus();
}

function startEditing(itemId = activeNapkin().selectedItemId) {
  if (!itemId) return;
  state = selectItem(state, itemId);
  editingItemId = itemId;
  renderTranscript();
  renderComposer();
  elements['composer-source'].focus();
}

function stopEditing() {
  editingItemId = null;
  renderComposer();
  focusSelectedItem();
}

function selectedType() {
  return elements['mode-switch'].querySelector('input:checked')?.value === 'equation'
    ? 'equation'
    : 'text';
}

async function submitComposer() {
  const source = elements['composer-source'].value;
  const note = elements['composer-note'].value;
  const editing = editingItemId !== null;
  const type = editing ? activeItem().type : selectedType();
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
    editingItemId = null;
  } else {
    state = addItem(state, { type, source, note, mathml });
  }
  renderAll();
  focusSelectedItem();
  await saveState().catch(() => {});
}

elements['new-napkin-button'].addEventListener('click', () => {
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
  renderAll();
  elements['composer-source'].focus();
  await saveState().catch(() => {});
});

elements['napkin-list'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-napkin-id]');
  if (!button) return;
  editingItemId = null;
  state = switchNapkin(state, button.dataset.napkinId);
  renderAll();
  elements['save-status'].textContent = `Opened ${activeNapkin().name}`;
  await saveState().catch(() => {});
});

elements['note-toggle'].addEventListener('click', () => {
  noteVisible = !noteVisible;
  elements['note-row'].hidden = !noteVisible;
  elements['note-toggle'].textContent = noteVisible ? 'Hide note' : 'Add note';
  elements['note-toggle'].setAttribute('aria-expanded', String(noteVisible));
  if (noteVisible) elements['composer-note'].focus();
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

elements['composer-cancel'].addEventListener('click', stopEditing);

elements['composer-form'].addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && editingItemId !== null) {
    event.preventDefault();
    stopEditing();
  }
});

elements['transcript'].addEventListener('click', (event) => {
  const button = event.target.closest('.item-select');
  if (!button) return;
  state = selectItem(state, button.dataset.itemId);
  renderTranscript();
  saveSelectionSoon();
});

elements['transcript'].addEventListener('keydown', (event) => {
  const button = event.target.closest('.item-select');
  if (!button) return;
  const napkin = activeNapkin();
  const index = napkin.items.findIndex(({ id }) => id === button.dataset.itemId);
  if (event.key === 'Enter') {
    event.preventDefault();
    startEditing(button.dataset.itemId);
    return;
  }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  let next = index;
  if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
  if (event.key === 'ArrowDown') next = Math.min(napkin.items.length - 1, index + 1);
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = napkin.items.length - 1;
  state = selectItem(state, napkin.items[next].id);
  renderTranscript();
  focusSelectedItem();
  saveSelectionSoon();
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
