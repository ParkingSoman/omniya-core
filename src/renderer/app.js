import {
  addItem,
  createNapkin,
  getActiveNapkin,
  selectItem,
  switchNapkin,
  updateItem
} from '../domain/model.js';

const elements = Object.fromEntries([
  'app', 'napkin-select', 'new-napkin-button', 'new-napkin-form', 'napkin-name',
  'napkin-name-error', 'cancel-new-napkin', 'composer-form', 'composer-source',
  'composer-note', 'composer-error', 'empty-message', 'item-list', 'selected-view',
  'no-selection', 'selected-content', 'selected-type', 'selected-source',
  'selected-note', 'selected-math', 'edit-item-button', 'edit-form', 'edit-type',
  'edit-source', 'edit-note', 'edit-error', 'cancel-edit', 'save-status',
  'app-error', 'app-error-message', 'retry-save'
].map((id) => [id, document.getElementById(id)]));

let state;
let selectionSaveTimer;
let saveChain = Promise.resolve();

function activeItem() {
  const napkin = getActiveNapkin(state);
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
      elements['save-status'].textContent = 'Saved.';
    })
    .catch(() => {
      elements['save-status'].textContent = 'Not saved.';
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
  elements['napkin-select'].replaceChildren();
  for (const napkin of state.napkins) {
    const option = document.createElement('option');
    option.value = napkin.id;
    option.textContent = napkin.name;
    option.selected = napkin.id === state.activeNapkinId;
    elements['napkin-select'].append(option);
  }
}

function itemLabel(item, index, count) {
  const note = item.note ? ` Note: ${item.note}` : ' No note.';
  return `Item ${index + 1} of ${count}, ${item.type}: ${item.source}.${note}`;
}

function renderItems() {
  const napkin = getActiveNapkin(state);
  elements['item-list'].replaceChildren();
  elements['empty-message'].hidden = napkin.items.length > 0;

  for (const [index, item] of napkin.items.entries()) {
    const option = document.createElement('div');
    option.id = `option-${item.id}`;
    option.dataset.itemId = item.id;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(item.id === napkin.selectedItemId));
    option.setAttribute('aria-label', itemLabel(item, index, napkin.items.length));
    option.textContent = `${index + 1}. ${item.type}: ${item.source}`;
    elements['item-list'].append(option);
  }

  if (napkin.selectedItemId) {
    elements['item-list'].setAttribute('aria-activedescendant', `option-${napkin.selectedItemId}`);
  } else {
    elements['item-list'].removeAttribute('aria-activedescendant');
  }
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

function renderSelected() {
  const item = activeItem();
  elements['edit-form'].hidden = true;
  elements['selected-view'].hidden = false;
  elements['no-selection'].hidden = Boolean(item);
  elements['selected-content'].hidden = !item;
  elements['selected-math'].replaceChildren();
  if (!item) return;

  elements['selected-type'].textContent = item.type;
  elements['selected-source'].textContent = item.source;
  elements['selected-note'].textContent = item.note || 'No note';
  if (item.type === 'equation') appendMathML(elements['selected-math'], item.mathml);
}

function renderAll() {
  renderNapkins();
  renderItems();
  renderSelected();
}

function announceSelection() {
  const napkin = getActiveNapkin(state);
  const item = activeItem();
  if (!item) return;
  const index = napkin.items.findIndex(({ id }) => id === item.id);
  elements['save-status'].textContent = itemLabel(item, index, napkin.items.length);
}

function openEditor() {
  const item = activeItem();
  if (!item) return;
  elements['selected-view'].hidden = true;
  elements['edit-form'].hidden = false;
  elements['edit-type'].textContent = `Editing ${item.type} item`;
  elements['edit-source'].value = item.source;
  elements['edit-note'].value = item.note;
  setFieldError(elements['edit-source'], elements['edit-error']);
  elements['edit-source'].focus();
}

function closeEditor() {
  renderSelected();
  elements['item-list'].focus();
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

elements['napkin-select'].addEventListener('change', async () => {
  state = switchNapkin(state, elements['napkin-select'].value);
  renderItems();
  renderSelected();
  elements['save-status'].textContent = `Opened ${getActiveNapkin(state).name}.`;
  await saveState().catch(() => {});
});

elements['composer-form'].addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    elements['composer-form'].requestSubmit();
  }
});

elements['composer-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const type = new FormData(elements['composer-form']).get('item-type');
  const source = elements['composer-source'].value;
  setFieldError(elements['composer-source'], elements['composer-error']);

  try {
    const mathml = type === 'equation'
      ? (await window.omniya.latexToMathML(source)).mathml
      : null;
    state = addItem(state, { type, source, note: elements['composer-note'].value, mathml });
  } catch {
    setFieldError(elements['composer-source'], elements['composer-error'],
      type === 'equation'
        ? 'The LaTeX could not be converted. Check its syntax.'
        : 'Item content is required.');
    elements['composer-source'].focus();
    return;
  }

  elements['composer-source'].value = '';
  elements['composer-note'].value = '';
  renderItems();
  renderSelected();
  elements['item-list'].focus();
  await saveState().catch(() => {});
});

elements['item-list'].addEventListener('click', (event) => {
  const option = event.target.closest('[role="option"]');
  if (!option) return;
  state = selectItem(state, option.dataset.itemId);
  renderItems();
  renderSelected();
  elements['item-list'].focus();
  announceSelection();
  saveSelectionSoon();
});

elements['item-list'].addEventListener('keydown', (event) => {
  const napkin = getActiveNapkin(state);
  if (event.key === 'Enter') {
    event.preventDefault();
    openEditor();
    return;
  }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || napkin.items.length === 0) return;

  event.preventDefault();
  let index = Math.max(0, napkin.items.findIndex(({ id }) => id === napkin.selectedItemId));
  if (event.key === 'ArrowUp') index = Math.max(0, index - 1);
  if (event.key === 'ArrowDown') index = Math.min(napkin.items.length - 1, index + 1);
  if (event.key === 'Home') index = 0;
  if (event.key === 'End') index = napkin.items.length - 1;
  state = selectItem(state, napkin.items[index].id);
  renderItems();
  renderSelected();
  announceSelection();
  saveSelectionSoon();
});

elements['edit-item-button'].addEventListener('click', openEditor);
elements['cancel-edit'].addEventListener('click', closeEditor);
elements['edit-form'].addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeEditor();
  }
});

elements['edit-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const item = activeItem();
  if (!item) return;
  setFieldError(elements['edit-source'], elements['edit-error']);

  try {
    const mathml = item.type === 'equation'
      ? (await window.omniya.latexToMathML(elements['edit-source'].value)).mathml
      : null;
    state = updateItem(state, item.id, {
      source: elements['edit-source'].value,
      note: elements['edit-note'].value,
      mathml
    });
  } catch {
    setFieldError(elements['edit-source'], elements['edit-error'],
      item.type === 'equation'
        ? 'The LaTeX could not be converted. Check its syntax.'
        : 'Item content is required.');
    elements['edit-source'].focus();
    return;
  }

  renderItems();
  closeEditor();
  elements['save-status'].textContent = 'Item updated.';
  await saveState().catch(() => {});
});

elements['retry-save'].addEventListener('click', () => void saveState().catch(() => {}));

try {
  const loaded = await window.omniya.loadState();
  state = loaded.state;
  renderAll();
  if (loaded.warning) showError(loaded.warning);
} catch {
  showError('The napkins could not be loaded.');
}
elements.app.setAttribute('aria-busy', 'false');
