import {
  addItem,
  createNapkin,
  deleteNapkin,
  deleteItem,
  insertItemAt,
  renameNapkin,
  selectItem,
  splitTextItem,
  switchNapkin,
  updateItem
} from '../domain/model.js';
import { applyUebBrailleLabel } from './ueb-braille-projection.js';
import { captureExplorerFocus, restoreExplorerFocus } from './math-explorer-bridge.js';
import { attachInputCapture } from './input-capture.js';
import { createInputLog } from './input-log.js';
import { formatInputDiagnostics } from './input-diagnostics.js';
import {
  cancelReplacement,
  setLatexSource,
  setNemethSource,
  setReplacementMethod,
  startReplacementSession,
  submitReplacement,
  replacementSessionHasDraftMath
} from '../domain/replacement-session.js';
import {
  createAuthoringState,
  enterEquationSurface,
  enterTextSurface,
  equationInsertIntent,
  formatStatus,
  gradeForUebBackTranslate,
  toggleUebGrade
} from '../domain/authoring-state.js';
import { createUebCellBuffer, isBrailleInsertEquationCell, pushUebCell } from '../domain/ueb-cell-buffer.js';
import { classifyNemethInput, nemethStatusMessage } from '../domain/nemeth-input.js';

// Nemeth authoring is a BATCH parse: the composer field accumulates braille
// cells, `classifyNemethInput` reads the whole buffer on every keystroke for a
// live status, and submit runs the same cells through `parseNemeth` inside
// `materializeDraft`. There is no incremental engine, no undo stack and no
// disambiguation prompt -- the parser resolves ambiguity from context (see
// docs/nemeth-v2/INTERFACES.md section 9).
//
// Two things that are deliberately NOT here, both replaced rather than
// restored by that design:
//
//  * The old source-intent Braille projection. The old incremental engine
//    stamped `data-omniya-nemeth-intent` attributes and used them to overwrite
//    SRE's aria-braillelabel. Nothing writes those attributes now, and nothing
//    should: Nemeth-authored and LaTeX-authored expressions go through one
//    converter precisely so that identical mathematics reads identically, and
//    a projection keyed on how the author typed would reintroduce exactly the
//    divergence that design prevents. SRE's projection stands alone.
//  * The `#composer-choices` disambiguation box, for the same reason -- the
//    old engine asked the author which reading it should take; this one never
//    does.

function createEmptyDraftMathDocument() {
  return { formatVersion: 2, mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"></math>', focus: null };
}

const elements = Object.fromEntries([
  'app-shell', 'napkin-list', 'new-napkin-button', 'new-napkin-form', 'new-napkin-submit', 'napkin-name',
  'napkin-name-error', 'cancel-new-napkin', 'current-napkin-name', 'item-count',
  'mode-panel', 'save-status', 'reading-section', 'reading-heading', 'reading-help',
  'empty-message', 'transcript', 'reading-actions',
  'keyboard-help-button', 'keyboard-help', 'close-keyboard-help', 'app-build-identity',
  'composer-dock',
  'composer-form', 'composer-heading', 'composer-back',
  'mode-switch', 'note-toggle', 'composer-source', 'note-row', 'composer-note',
  'composer-help', 'composer-status', 'composer-error', 'composer-choices', 'editing-indicator', 'composer-submit',
  'composer-discard', 'composer-cancel', 'replacement-dock', 'replacement-heading',
  'replacement-scope', 'replacement-method', 'replacement-input', 'replacement-status', 'replacement-choices',
  'replacement-submit', 'replacement-cancel', 'app-error', 'app-error-message', 'retry-save',
  'update-banner', 'update-banner-text', 'update-banner-action', 'update-banner-dismiss'
].map((id) => [id, document.getElementById(id)]));

const NOTES_UI_ENABLED = false;

let state;
let mode = 'read';
let editingItemId = null;
let liveTextItemId = null;
let noteVisible = false;
let draft = { source: '', note: '', type: 'text' };
let selectionSaveTimer;
let saveChain = Promise.resolve();
let transcriptRenderVersion = 0;
let mathJaxReady;
let exploringEquationItemId = null;
let renamingNapkinId = null;
let replacementSession = null;
let replacementEditor = null;
let replacementHasContent = false;
let preferredAuthoringMethod = 'nemeth';
// Opt-in, persisted (settings-storage.js) computer-braille decode table for
// the Nemeth composer field. 'none' matches this app's pre-existing
// cells-only behavior exactly; see nemeth-input.js's brailleInputTable option.
// How the Nemeth field reads input. Always 'auto' now: `resolveBrailleInputTable`
// works out cells-versus-computer-braille by measurement, which is sound because
// the two occupy disjoint code point ranges. There is no user setting, and there
// is nothing to set -- the picker this replaced asked a question ("which input
// table is your device using?") that a person could not reliably answer and the
// app can.
const NEMETH_INPUT_MODE = 'auto';
// The reading the last classification settled on, kept only so the diagnostics
// report can say which one it was. Nothing branches on it.
let lastResolvedInputTable = 'none';
let commandState = createAuthoringState({ surface: 'text', contentEmpty: true });
let uebBuffer = createUebCellBuffer();
let uebCellChain = Promise.resolve();
let composerMathInputProcessing = Promise.resolve();
let submittingComposerEquation = false;
let equationCaretSnapshot = null;
let clearedLiveTextIndex = null;
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
    if (persistedMathML) {
      // Prefer XML parsing so MathML data-* source stamps (script-comma,
      // nemeth-cells, intents) are not dropped by HTML innerHTML rules.
      const parsed = new DOMParser().parseFromString(persistedMathML, 'application/xml');
      const mathRoot = parsed.documentElement;
      if (mathRoot && mathRoot.localName === 'math' && !parsed.querySelector('parsererror')) {
        source.appendChild(document.importNode(mathRoot, true));
      } else {
        source.innerHTML = persistedMathML;
      }
    } else source.textContent = `\\[${item.source}\\]`;
    // MathJax's assistive clone sanitizes unknown data attributes. Keep a
    // runtime-only identity token on the source element so the bridge can
    // recover the application node from any semantic focus, including virtual
    // SRE groupings. This never enters persisted MathML.
    const intentById = new Map([...source.querySelectorAll('[data-omniya-id][data-omniya-nemeth-intent]')]
      .map((node) => [node.getAttribute('data-omniya-id'), node.getAttribute('data-omniya-nemeth-intent')]));
    const scriptCommaIds = new Set([...source.querySelectorAll('[data-omniya-id][data-omniya-script-comma="true"]')]
      .map((node) => node.getAttribute('data-omniya-id')));
    for (const node of source.querySelectorAll('[data-omniya-id]')) {
      node.id = `omniya-source-${node.getAttribute('data-omniya-id')}`;
    }
    container.replaceChildren(source);
    await globalThis.MathJax.typesetPromise([container]);
    stampCanonicalIds(container);
    // MathJax sanitizes application attributes on its assistive clone. Copy
    // the small set of source-intent markers onto the matching runtime nodes
    // by stable ID so Braille projection can remain exact without a parser.
    for (const [nodeId, intent] of intentById) {
      container.querySelector(`#omniya-source-${CSS.escape(nodeId)}`)?.setAttribute('data-omniya-nemeth-intent', intent);
    }
    for (const nodeId of scriptCommaIds) {
      container.querySelector(`#omniya-source-${CSS.escape(nodeId)}`)?.setAttribute('data-omniya-script-comma', 'true');
    }
    // MathJax/SRE is the ONLY Braille projection. The old incremental Nemeth
    // engine post-processed `aria-braillelabel` here from its own source-intent
    // attributes; the batch parser keeps no such side channel, and reinstating
    // one keyed on the authoring method would make identical mathematics read
    // differently in Braille depending on how it was typed. Removed rather than
    // restored -- see the note at the top of this file.
    if (version !== transcriptRenderVersion || !container.isConnected) return;
    container.removeAttribute('aria-busy');
    // Only restore explorer focus if that equation is still being explored.
    // A selected equation with saved math.focus must not auto-enter explorer
    // after ArrowDown, or a late restore will steal focus back from Escape.
    if (item.math?.focus && exploringEquationItemId === item.id) {
      const itemId = item.id;
      setTimeout(() => {
        if (exploringEquationItemId !== itemId || !container.isConnected) return;
        void restoreExplorerFocus(articleForContainer(container), item.math.focus);
      }, 0);
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
      if (/not a MathML element/i.test(error?.message)) throw error;
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

function clearTranscriptMath() {
  const host = elements['transcript'];
  const mj = globalThis.MathJax;
  if (!host || !mj) return;
  try {
    if (typeof mj.typesetClear === 'function') {
      mj.typesetClear([host]);
      return;
    }
    const doc = mj.startup?.document;
    if (typeof doc?.clearMathItemsWithin === 'function') {
      doc.clearMathItemsWithin([host]);
      return;
    }
    const items = typeof doc?.getMathItemsWithin === 'function' ? [...doc.getMathItemsWithin(host)] : [];
    for (const item of items) {
      if (typeof doc?.removeMath === 'function') doc.removeMath(item);
      else item.Clear?.();
    }
  } catch (error) {
    console.warn('[omniya] MathJax typesetClear failed', error);
  }
}

function updateItemCount() {
  const napkin = activeNapkin();
  const count = napkin?.items.length ?? 0;
  elements['item-count'].textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
}

function syncEmptyMessage() {
  const napkin = activeNapkin();
  if (!napkin) {
    elements['empty-message'].textContent = 'No napkin selected. Create one with New napkin.';
    elements['empty-message'].hidden = false;
    return;
  }
  elements['empty-message'].textContent = 'No items yet. Start typing.';
  elements['empty-message'].hidden = napkin.items.length > 0;
}

function refreshArticleSetSizes() {
  const articles = [...elements['transcript'].querySelectorAll('article.napkin-article')];
  articles.forEach((article, index) => {
    article.setAttribute('aria-posinset', String(index + 1));
    article.setAttribute('aria-setsize', String(articles.length));
  });
}

function applyUebLabel(textNode, source) {
  if (typeof window.omniya?.translateUeb !== 'function') return;
  void applyUebBrailleLabel(
    textNode,
    source,
    'g2',
    (value, grade) => window.omniya.translateUeb(value, grade)
  );
}

function buildTranscriptArticle(item, index, count, version) {
  const napkin = activeNapkin();
  const article = document.createElement('article');
  article.className = 'napkin-article';
  article.tabIndex = item.id === napkin?.selectedItemId ? 0 : -1;
  article.dataset.itemId = item.id;
  article.setAttribute('aria-posinset', String(index + 1));
  article.setAttribute('aria-setsize', String(count));

  const descriptor = document.createElement('span');
  descriptor.className = 'sr-only';
  descriptor.id = `item-description-${item.id}`;
  descriptor.textContent = itemSummary(item, index, count) +
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
    applyUebLabel(text, item.source);
  }

  article.append(descriptor, content);
  if (NOTES_UI_ENABLED && item.note) {
    const note = document.createElement('p');
    note.className = 'item-note';
    note.textContent = `Note: ${item.note}`;
    article.append(note);
  }
  return article;
}

function appendOrUpdateLiveTextArticle(item) {
  const napkin = activeNapkin();
  if (!napkin) return;
  const index = napkin.items.findIndex(({ id }) => id === item.id);
  let article = elements['transcript'].querySelector(
    `article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`
  );
  if (!article) {
    article = buildTranscriptArticle(item, index, napkin.items.length, transcriptRenderVersion);
    const siblings = elements['transcript'].querySelectorAll('article.napkin-article');
    elements['transcript'].insertBefore(article, siblings[index] ?? null);
  } else {
    const text = article.querySelector('.item-text');
    if (text) {
      text.textContent = item.source;
      applyUebLabel(text, item.source);
    }
  }
  syncEmptyMessage();
  updateItemCount();
  refreshArticleSetSizes();
}

function removeLiveTextArticle(itemId) {
  elements['transcript'].querySelector(
    `article.napkin-article[data-item-id="${CSS.escape(itemId)}"]`
  )?.remove();
  syncEmptyMessage();
  updateItemCount();
  refreshArticleSetSizes();
}

function renderTranscript() {
  const version = ++transcriptRenderVersion;
  clearTranscriptMath();
  const napkin = activeNapkin();
  elements['transcript'].replaceChildren();
  if (!napkin) {
    syncEmptyMessage();
    updateItemCount();
    return;
  }
  syncEmptyMessage();
  updateItemCount();
  for (const [index, item] of napkin.items.entries()) {
    elements['transcript'].append(buildTranscriptArticle(item, index, napkin.items.length, version));
  }
}

function renderHeader() {
  const napkin = activeNapkin();
  elements['current-napkin-name'].textContent = napkin?.name ?? 'No napkin selected';
}

function renderMode() {
  const napkin = activeNapkin();
  elements['reading-actions'].hidden = !napkin;
  elements['composer-dock'].hidden = !napkin;
  elements['reading-help'].textContent = napkin
    ? 'Up and Down arrows move between items. Enter explores an equation; r replaces, a inserts after, o inserts before the focus.'
    : 'Create a napkin to start writing.';
}

function placementVerb(placement) {
  if (placement === 'append') return 'Appending after';
  if (placement === 'prepend') return 'Prepending before';
  return 'Replacing';
}

/**
 * True where a bare letter is the author's text, not an application shortcut.
 *
 * Deliberately wider than "is an input": the napkin rail and any open dialog
 * own their own keys too, and a single-letter accelerator that fires inside
 * someone's half-typed napkin name is indistinguishable, to them, from the
 * keystroke being lost.
 */
function typingIntoAField(element) {
  if (!(element instanceof Element)) return false;
  if (element.isContentEditable) return true;
  return Boolean(element.closest('input, textarea, select, #new-napkin-form, #napkin-rail, dialog'));
}

function mathPlacementFromKey(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'r') return 'replace';
  if (key === 'a') return 'append';
  if (key === 'o') return 'prepend';
  return null;
}

function isMathReplaceAuthoring() {
  return Boolean(
    replacementSession
    && !replacementEditor
    && mode === 'edit'
    && (commandState.replaceScopeLabel || replacementSession.originalDocument || replacementSession.isNew)
  );
}

function renderComposer() {
  const editing = mode === 'edit';
  const mathReplace = isMathReplaceAuthoring();
  const item = editing ? activeItem() : null;
  const values = editing
    ? {
      source: mathReplace ? (elements['composer-source']?.value ?? draft.source ?? '') : (item?.source ?? ''),
      note: item?.note ?? '',
      type: mathReplace ? 'equation' : (item?.type ?? 'text')
    }
    : draft;

  const documentText = Boolean(activeNapkin()) && !mathReplace && values.type === 'text';
  elements['composer-heading'].textContent = mathReplace
    ? (commandState.replaceScopeLabel
      ? `${placementVerb(commandState.placement)}: ${commandState.replaceScopeLabel}`
      : 'Replace focused mathematics')
    : documentText
      ? 'Write'
      : editing
        ? `Editing item ${activeNapkin().items.findIndex(({ id }) => id === editingItemId) + 1}`
        : 'Equation';
  elements['composer-submit'].textContent = mathReplace
    ? (commandState.placement === 'replace' ? 'Replace' : 'Insert')
    : editing ? 'Save changes' : 'Insert equation';
  elements['composer-submit'].hidden = documentText;
  elements['composer-back'].hidden = true;
  elements['composer-discard'].hidden = true;
  elements['composer-cancel'].hidden = !(editing || mathReplace);
  elements['editing-indicator'].textContent = mathReplace
    ? 'Escape cancels without changing the equation.'
    : '';
  if (!mathReplace || mode === 'add') {
    elements['composer-source'].value = values.source;
  } else if (!replacementHasContent && !replacementSession?.nemethSource && replacementSession?.method !== 'latex') {
    elements['composer-source'].value = '';
  }
  elements['composer-note'].value = values.note;
  elements['mode-switch'].querySelectorAll('input').forEach((input) => {
    input.disabled = editing || mathReplace;
    input.checked = input.value === values.type;
  });
  if (!NOTES_UI_ENABLED) {
    elements['note-toggle'].hidden = true;
    elements['note-row'].hidden = true;
  } else {
    if (editing) noteVisible = Boolean(values.note);
    elements['note-row'].hidden = !noteVisible;
    elements['note-toggle'].textContent = noteVisible ? 'Hide note' : 'Add note';
    elements['note-toggle'].setAttribute('aria-expanded', String(noteVisible));
  }
  const sourceLabel = elements['composer-source']?.labels?.[0]
    || document.querySelector('label[for="composer-source"]');
  if (sourceLabel) sourceLabel.textContent = mathReplace ? 'Replacement input' : 'Content';
  elements['composer-help'].textContent = mathReplace
    ? 'Nemeth: type cells · LaTeX: type source · Escape cancels · Replace commits'
    : values.type === 'equation'
      ? 'Nemeth: type cells · LaTeX: type source · Enter inserts and stays in equation mode · Escape returns to text · Ctrl+E / Ctrl+L choose method while empty'
      : 'Enter starts a new paragraph; Shift+Enter adds a line break within one. Ctrl+E inserts Nemeth; Ctrl+L inserts LaTeX.';
  // Unified composer: Equation keeps #composer-source visible (Nemeth/LaTeX styling only).
  elements['composer-source'].hidden = false;
  elements['composer-source'].required = false;
  const equationMethod = values.type === 'equation'
    ? (commandState.surface === 'equation' ? commandState.equationMethod : preferredAuthoringMethod)
    : null;
  elements['composer-source'].className = equationMethod === 'nemeth'
    ? 'nemeth-inline-editor'
    : equationMethod === 'latex'
      ? 'latex-inline-editor'
      : '';
  if (values.type !== 'equation') {
    clearComposerNemethChoices();
    setComposerMathStatus('');
  }
  setFieldError(elements['composer-source'], elements['composer-error']);
}

function renderAll() {
  renderNapkins();
  renderHeader();
  renderTranscript();
  renderMode();
  if (activeNapkin()) renderComposer();
}

function scrollArticleIntoView(itemId) {
  const article = itemId && elements['transcript'].querySelector(
    `article.napkin-article[data-item-id="${CSS.escape(itemId)}"]`
  );
  article?.scrollIntoView({ block: 'nearest' });
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
  (article ?? elements['composer-source']).focus();
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

function clearExploringEquation() {
  exploringEquationItemId = null;
}

function leaveEquation(article) {
  clearExploringEquation();
  article?.focus();
  elements['save-status'].textContent = 'Equation level';
}

function articleForMathEditKey(focused) {
  const focusedArticle = focused instanceof Element
    ? focused.closest('article.napkin-article')
    : null;
  const exploringArticle = exploringEquationItemId
    ? elements['transcript'].querySelector(
      `article.napkin-article[data-item-id="${CSS.escape(exploringEquationItemId)}"]`
    )
    : null;
  if (focusedArticle && exploringArticle
      && focusedArticle.dataset.itemId !== exploringArticle.dataset.itemId) {
    exploringEquationItemId = focusedArticle.dataset.itemId;
    return focusedArticle;
  }
  return focusedArticle || exploringArticle;
}

function closeReplacementEditor() {
  replacementEditor?.removeEventListener('input', replacementEditor._replacementInputHandler);
  replacementEditor?.removeEventListener('keydown', replacementEditor._replacementKeyHandler);
  if (replacementEditor?._replacementChoiceHandler) {
    elements['replacement-choices'].removeEventListener('click', replacementEditor._replacementChoiceHandler);
  }
  replacementEditor = null;
  replacementSession = null;
  replacementHasContent = false;
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
  // Composer-bound math replace: Escape / Cancel share returnToRead.
  if (!replacementEditor) {
    returnToRead({ discardDraft: true });
    return;
  }
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

async function resolveMathReplaceFocus(article, item, startingFocus = null, isNew = false) {
  let math = article.querySelector('mjx-container, math');
  if (!isNew) {
    for (let attempt = 0; !math && attempt < 100 && article.isConnected; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      math = article.querySelector('mjx-container, math');
    }
    if (!math) {
      elements['save-status'].textContent = 'Equation is unavailable.';
      return null;
    }
  }
  if (startingFocus) return { target: startingFocus, speech: '', nemeth: '' };
  try {
    return await captureExplorerFocusWithRetry(article);
  } catch {
    elements['save-status'].textContent = 'This focus cannot be replaced.';
    return null;
  }
}

/** Open the unified composer to replace the focused MathML slot. */
async function openComposerForMathReplace(article, startingFocus = null, isNew = false, placement = 'replace') {
  // An untouched new-equation draft yields; anything with content still wins.
  //
  // Equation mode is sticky after a commit, so an empty session is now almost
  // always sitting open when the author moves to an equation in the transcript
  // and presses r / a / o. Without this, `if (replacementSession) return` below
  // silently swallowed all three -- the sticky mode would have cost the author
  // the mathematics-editing keys, which is a far worse trade than the Ctrl+E it
  // saves. Only the empty, brand-new, not-a-replacement case is discarded here;
  // openEditMode already does exactly this for the text path.
  if (replacementSession && !replacementEditor
      && replacementSession.isNew && !replacementSession.originalDocument
      && replacementDraftIsEmpty()) {
    clearComposerMathSession();
    equationCaretSnapshot = null;
  }
  if (replacementSession) return;
  const item = activeNapkin()?.items.find(({ id }) => id === article.dataset.itemId);
  if (!item) return;
  const focus = await resolveMathReplaceFocus(article, item, startingFocus, isNew);
  if (!focus?.target) return;
  exploringEquationItemId = null;
  state = selectItem(state, article.dataset.itemId);
  mode = 'edit';
  editingItemId = article.dataset.itemId;
  draft = { source: '', note: item.note ?? '', type: 'equation' };
  uebBuffer = createUebCellBuffer();
  replacementSession = startReplacementSession({
    document: item.math,
    target: focus.target,
    explorerFocus: focus,
    method: preferredAuthoringMethod,
    placement
  });
  replacementSession.isNew = isNew;
  replacementEditor = null;
  replacementHasContent = false;
  composerMathInputProcessing = Promise.resolve();
  const scopeLabel = focus.speech || 'selection';
  commandState = createAuthoringState({
    surface: 'equation',
    equationMethod: preferredAuthoringMethod,
    contentEmpty: true,
    replaceScopeLabel: scopeLabel,
    placement
  });
  if (elements['replacement-scope']) {
    elements['replacement-scope'].textContent = focus.speech ? `Selected: ${focus.speech}` : 'Selected mathematical scope';
    elements['replacement-scope'].dataset.targetId = focus.target.kind === 'node'
      ? focus.target.nodeId
      : focus.target.firstNodeId;
    delete elements['replacement-scope'].dataset.widened;
    delete elements['replacement-scope'].dataset.fallbackReason;
  }
  elements['replacement-dock'].hidden = true;
  elements['replacement-method']?.querySelectorAll('input').forEach((input) => {
    input.checked = input.value === preferredAuthoringMethod;
  });
  clearComposerNemethChoices();
  setComposerMathStatus(preferredAuthoringMethod === 'nemeth'
    ? 'Enter Nemeth cells. Enter reads the whole expression.'
    : 'Enter LaTeX for the replacement expression.');
  renderAll();
  applyCommandStateToChrome(commandState);
  elements['composer-source'].value = '';
  elements['composer-source'].className = preferredAuthoringMethod === 'nemeth'
    ? 'nemeth-inline-editor'
    : 'latex-inline-editor';
  elements['composer-source'].focus();
}

/** @deprecated Product path uses openComposerForMathReplace; kept as alias for safety. */
async function openReplacementEditor(article, startingFocus = null, isNew = false) {
  await openComposerForMathReplace(article, startingFocus, isNew);
}

// MathJax swallows unmapped keys (r) on the explorer node. Handle them in
// capture, but always on the article that currently has focus — a stale
// exploringEquationItemId from an earlier equation must not win.
document.addEventListener('keydown', (event) => {
  const focused = event.target instanceof Element ? event.target : document.activeElement;
  if (focused instanceof Element
      && focused.closest('#composer-source, #replacement-input, #composer-note, #composer-dock')) return;
  const article = articleForMathEditKey(focused);
  if (!article) return;
  // r / a / o are shortcuts, but only where a letter is not text. This handler
  // reaches beyond the transcript on purpose -- MathJax's explorer can hand
  // focus off to <body> mid-navigation, and `articleForMathEditKey` falls back
  // to the equation last explored so the keys survive that (see "r still
  // replaces after explorer navigation moves focus off the math node"). The
  // fallback has no expiry, though: `exploringEquationItemId` outlives the
  // focus that set it, so the same reach also claimed letters typed into an
  // ordinary field. An alpha contributor could not name a new napkin after
  // exploring an equation -- the first a, o or r of the name was swallowed
  // here, focus moved to #composer-source, and the rest of the name landed in
  // a field they had not opened, so the form kept telling them to name the
  // napkin while their typing went somewhere they could not hear.
  //
  // The exclusion list extends the one on the command-key listener further
  // down, which already had to learn this about the napkin rail and dialogs.
  const explorerPlacement = typingIntoAField(focused) ? null : mathPlacementFromKey(event);
  if (explorerPlacement) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openComposerForMathReplace(article, null, false, explorerPlacement);
    return;
  }
  const inMath = focused instanceof Element && focused.closest('mjx-container, math, mjx-focus, mjx-speech');
  if (!inMath && focused !== article) return;
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

/** True while the replacement dock owns the active math session (subtree E). */
function isDockReplacement() {
  return Boolean(replacementSession && replacementEditor && !elements['replacement-dock']?.hidden);
}

/** True while add-mode equation authoring binds guided Nemeth/LaTeX to #composer-source. */
/**
 * The single dev-tools switch: `npm run start:dev`, unpackaged builds only.
 * See `createWindow` in src/main.js for the three conditions behind it.
 */
function devToolsEnabled() {
  return Boolean(window.omniya?.appInfo?.devTools);
}

function isComposerMathAuthoring() {
  return Boolean(replacementSession) && !replacementEditor && (mode === 'add' || mode === 'edit');
}

function clearComposerMathSession() {
  if (replacementEditor) return;
  if (!replacementSession) return;
  cancelReplacement(replacementSession);
  replacementSession = null;
  replacementHasContent = false;
  composerMathInputProcessing = Promise.resolve();
  clearComposerNemethChoices();
  setComposerMathStatus('');
}

function ensureComposerMathSession() {
  if (replacementEditor) return;
  if (replacementSession) return;
  if ((commandState.surface ?? draft.type) !== 'equation') return;
  replacementSession = startReplacementSession({
    document: null,
    // A brand-new equation draft has no original document to place into, so
    // this target only needs to satisfy startReplacementSession's shape
    // check: submitReplacement takes the "no originalDocument" branch and
    // never reads it for placement. createEmptyDraftMathDocument()'s
    // `focus` is null (there is no real draft to focus while Nemeth input
    // is unavailable), so it cannot supply this.
    target: { kind: 'node', nodeId: `omniya-${globalThis.crypto.randomUUID()}` },
    method: commandState.equationMethod || preferredAuthoringMethod
  });
  replacementSession.isNew = true;
  replacementHasContent = false;
  clearComposerNemethChoices();
  setComposerMathStatus('');
}

function setComposerMathStatus(message) {
  if (!elements['composer-status']) return;
  elements['composer-status'].textContent = message ?? '';
}

/**
 * Put the commit verdict into the same log the keystrokes went into.
 *
 * `input-capture.js` observes the field from the DOM and gates every entry on
 * #mode-panel still reading "Equation · Nemeth". Enter is the keystroke that
 * ends that condition, so the capture fell silent exactly one line before the
 * answer: an alpha tester's report of "it told me the equation wasn't valid"
 * arrived with a log whose last line was the Enter, and nothing about what
 * happened next. Accepted-or-refused is only knowable here, so it is recorded
 * here, deliberately outside that gate.
 *
 * Nemeth only. This report is the braille input path; a LaTeX commit in it is
 * noise for the person reading it back with a screen reader. Same privacy
 * posture as every other entry -- in memory, capped, and it leaves the process
 * only when someone asks for the dump.
 */
function recordNemethCommit(verdict, value, message) {
  if (replacementSession?.method !== 'nemeth') return;
  inputLog.record({
    type: 'commit',
    verdict,
    mode: elements['mode-panel']?.textContent?.trim() || 'unknown',
    table: lastResolvedInputTable,
    value,
    state: message
  });
}

/**
 * What the author hears after Enter commits an equation and the composer stays
 * in equation mode. Names the insert, the mode that persisted, and the way out
 * -- Escape, which has always been the way out of an unfinished equation.
 */
function equationCommittedStatus(method) {
  const name = method === 'latex' ? 'LaTeX' : 'Nemeth';
  return `Equation added. Still in ${name} — type the next equation, or Escape for text.`;
}

/**
 * Hide `#composer-choices`.
 *
 * The batch parser never asks the author to disambiguate -- ambiguous cells are
 * resolved from context (INTERFACES.md section 9: "The old engine asked the
 * user - we never do"), so nothing renders choices into this box and nothing
 * will. It is kept only so a document authored before the rewrite cannot leave
 * a stale, unclickable button row on screen.
 */
function clearComposerNemethChoices() {
  const box = elements['composer-choices'];
  if (!box) return;
  box.replaceChildren();
  box.hidden = true;
  delete box.dataset.prefix;
}

function isDocumentTextSurface() {
  return Boolean(activeNapkin())
    && !isMathReplaceAuthoring()
    && !isComposerMathAuthoring()
    && (commandState.surface ?? draft.type) === 'text';
}

function persistLiveTextFromComposer() {
  if (!isDocumentTextSurface()) return;
  if (liveTextItemId && !activeNapkin()?.items.some(({ id }) => id === liveTextItemId)) {
    liveTextItemId = null;
    editingItemId = null;
  }
  const source = elements['composer-source'].value;
  const note = elements['composer-note']?.value ?? '';
  if (!source.trim() && liveTextItemId) {
    const index = activeNapkin()?.items.findIndex(({ id }) => id === liveTextItemId) ?? -1;
    if (index >= 0) clearedLiveTextIndex = index;
    state = deleteItem(state, liveTextItemId);
    removeLiveTextArticle(liveTextItemId);
    liveTextItemId = null;
    editingItemId = null;
    saveSelectionSoon();
    return;
  }
  if (source.trim() && !liveTextItemId) {
    const insertAt = clearedLiveTextIndex != null
      ? Math.min(clearedLiveTextIndex, activeNapkin()?.items.length ?? 0)
      : activeNapkin()?.items.length ?? 0;
    clearedLiveTextIndex = null;
    state = insertItemAt(state, insertAt, { type: 'text', source, note });
    liveTextItemId = activeItem()?.id ?? null;
    editingItemId = liveTextItemId;
    const item = activeNapkin()?.items.find(({ id }) => id === liveTextItemId);
    if (item) appendOrUpdateLiveTextArticle(item);
    scrollArticleIntoView(liveTextItemId);
    saveSelectionSoon();
    return;
  }
  if (source.trim() && liveTextItemId) {
    clearedLiveTextIndex = null;
    state = updateItem(state, liveTextItemId, { source, note });
    const item = activeNapkin()?.items.find(({ id }) => id === liveTextItemId);
    if (item) appendOrUpdateLiveTextArticle(item);
    saveSelectionSoon();
  }
}

function snapshotEquationCaret() {
  const source = elements['composer-source']?.value ?? '';
  const note = elements['composer-note']?.value ?? '';
  const caretOffset = elements['composer-source']?.selectionStart;
  const itemId = liveTextItemId && activeNapkin()?.items.some(({ id }) => id === liveTextItemId)
    ? liveTextItemId
    : null;
  return {
    itemId,
    offset: Number.isInteger(caretOffset) ? caretOffset : source.length,
    source,
    note,
    holeIndex: itemId ? null : clearedLiveTextIndex
  };
}

function restoreEquationCaretSnapshot() {
  const snap = equationCaretSnapshot;
  equationCaretSnapshot = null;
  if (!snap) return;
  const napkin = activeNapkin();
  const item = snap.itemId ? napkin?.items.find(({ id }) => id === snap.itemId) : null;
  if (item?.type === 'text') {
    openEditMode(item.id);
    if (elements['composer-source']) {
      elements['composer-source'].value = snap.source;
      draft.source = snap.source;
      draft.note = snap.note;
      const offset = Math.min(snap.source.length, Math.max(0, snap.offset));
      elements['composer-source'].setSelectionRange(offset, offset);
    }
    return;
  }
  if (elements['composer-source']) elements['composer-source'].value = snap.source ?? '';
  draft = { source: snap.source ?? '', note: snap.note ?? '', type: 'text' };
  liveTextItemId = null;
  editingItemId = null;
  clearedLiveTextIndex = snap.holeIndex ?? clearedLiveTextIndex;
  commandState = createAuthoringState({
    surface: 'text',
    contentEmpty: !(snap.source ?? '').trim()
  });
  applyCommandStateToChrome(commandState);
  renderComposer();
  elements['composer-source']?.focus();
}

function commitEquationAtSnapshot(note, math) {
  const snap = equationCaretSnapshot;
  equationCaretSnapshot = null;
  let insertAt = activeNapkin()?.items.length ?? 0;
  let rightId = null;
  if (snap?.itemId) {
    const item = activeNapkin()?.items.find(({ id }) => id === snap.itemId);
    if (item?.type === 'text') {
      const offset = Math.min(item.source.length, Math.max(0, snap.offset));
      const split = splitTextItem(state, snap.itemId, offset);
      state = split.state;
      rightId = split.rightId;
      const items = activeNapkin().items;
      insertAt = split.leftId == null
        ? items.findIndex(({ id }) => id === split.rightId)
        : items.findIndex(({ id }) => id === split.leftId) + 1;
    }
  } else if (snap?.holeIndex != null) {
    insertAt = Math.min(snap.holeIndex, activeNapkin().items.length);
  }
  clearedLiveTextIndex = null;
  state = insertItemAt(state, insertAt, { type: 'equation', note, math });
  return rightId;
}

function applyEquationInsert(method) {
  const intent = equationInsertIntent(commandState, { replacing: isMathReplaceAuthoring() });
  if (intent === 'start') {
    startEquationAtCaret(method);
    return;
  }
  if (intent === 'switch-method') {
    const entered = enterEquationSurface(commandState, method);
    applyCommandStateToChrome(entered.state);
    applyReplacementMethodFromCommand(entered.state.equationMethod);
  }
}

function startEquationAtCaret(method) {
  if (!activeNapkin()) return;
  if (commandState.replaceScopeLabel || isMathReplaceAuthoring()) return;
  equationCaretSnapshot = snapshotEquationCaret();
  liveTextItemId = null;
  editingItemId = null;
  if (elements['composer-source']) elements['composer-source'].value = '';
  draft = { source: '', note: '', type: 'equation' };
  commandState = { ...commandState, contentEmpty: true };
  const entered = enterEquationSurface(commandState, method);
  commandState = entered.state;
  mode = 'add';
  ensureComposerMathSession();
  applyCommandStateToChrome(commandState);
  renderComposer();
  elements['composer-source'].focus();
}

function enterDocumentTextAuthoring({ focus = true, preserveComposer = false } = {}) {
  mode = 'read';
  editingItemId = liveTextItemId;
  if (!preserveComposer) {
    liveTextItemId = null;
    editingItemId = null;
    resetDraft();
    uebBuffer = createUebCellBuffer();
    if (elements['composer-source']) elements['composer-source'].value = '';
  }
  commandState = createAuthoringState({
    surface: 'text',
    contentEmpty: !(elements['composer-source']?.value ?? '').trim()
  });
  renderMode();
  if (activeNapkin()) {
    renderComposer();
    applyCommandStateToChrome(commandState);
    if (focus) elements['composer-source'].focus();
  } else if (focus) {
    elements['new-napkin-button'].focus();
  }
}
function startNewTextItem() {
  if (!isDocumentTextSurface()) return;
  const el = elements['composer-source'];
  const source = el?.value ?? '';
  if (!source.trim()) return;
  const caret = Number.isInteger(el?.selectionStart) ? el.selectionStart : source.length;

  let followId = null;
  if (liveTextItemId) {
    const split = splitTextItem(state, liveTextItemId, caret);
    state = split.state;
    followId = split.rightId;
  }
  liveTextItemId = null;
  editingItemId = null;
  clearedLiveTextIndex = null;
  renderAll();
  enterDocumentTextAuthoring({ focus: true });
  if (followId && activeNapkin()?.items.some(({ id }) => id === followId)) {
    openEditMode(followId);
    elements['composer-source']?.setSelectionRange(0, 0);
  }
  void saveState().catch(() => {});
}

function returnToRead({ discardDraft = true } = {}) {
  const session = (!replacementEditor && replacementSession) ? replacementSession : null;
  const wasNew = Boolean(session?.isNew);
  const wasMathReplace = Boolean(session && (session.originalDocument || wasNew || commandState.replaceScopeLabel));
  const itemId = editingItemId;
  clearComposerMathSession();
  if (discardDraft) resetDraft();
  if (uebBuffer.pending) announce('Discarded pending UEB cells');
  uebBuffer = createUebCellBuffer();
  if (wasNew && itemId) state = deleteItem(state, itemId);
  liveTextItemId = null;
  editingItemId = null;
  if (wasNew) void saveState().catch(() => {});
  if (wasMathReplace && !wasNew) {
    renderAll();
    enterDocumentTextAuthoring({ focus: true });
    elements['save-status'].textContent = 'Replacement cancelled';
    return;
  }
  renderAll();
  enterDocumentTextAuthoring({ focus: Boolean(activeNapkin()) });
  if (wasNew) restoreEquationCaretSnapshot();
}

function openEditMode(itemId) {
  const napkin = activeNapkin();
  if (!napkin) return;
  itemId ??= napkin.selectedItemId;
  if (!itemId) return;
  const item = napkin.items.find(({ id }) => id === itemId);
  if (item?.type !== 'text') return;
  if (isComposerMathAuthoring() && replacementSession?.isNew) {
    clearComposerMathSession();
    equationCaretSnapshot = null;
  }
  state = selectItem(state, itemId);
  liveTextItemId = itemId;
  editingItemId = itemId;
  mode = 'read';
  clearedLiveTextIndex = null;
  uebBuffer = createUebCellBuffer();
  draft = { source: item.source, note: item.note ?? '', type: 'text' };
  commandState = createAuthoringState({
    surface: 'text',
    contentEmpty: !(item.source ?? '').trim()
  });
  renderTranscript();
  renderMode();
  if (elements['composer-source']) elements['composer-source'].value = item.source;
  renderComposer();
  applyCommandStateToChrome(commandState);
  elements['composer-source'].focus();
  scrollArticleIntoView(itemId);
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
  const nextId = napkin.items[next].id;
  if (exploringEquationItemId && exploringEquationItemId !== nextId) clearExploringEquation();
  state = selectItem(state, nextId);
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

function syncModePanel(state = commandState) {
  if (elements['mode-panel']) elements['mode-panel'].textContent = formatStatus(state);
}

function applyCommandStateToChrome(nextState) {
  commandState = nextState;
  if (commandState.surface === 'text' || commandState.surface === 'equation') {
    elements['mode-switch'].querySelectorAll('input').forEach((input) => {
      input.checked = input.value === commandState.surface;
    });
    draft.type = commandState.surface;
  }
  if (commandState.surface === 'equation') {
    preferredAuthoringMethod = commandState.equationMethod;
    elements['replacement-method']?.querySelectorAll('input').forEach((input) => {
      input.checked = input.value === commandState.equationMethod;
    });
  }
  syncModePanel(commandState);
}

function announce(message) {
  elements['save-status'].textContent = message;
}

function composerIsTextInsert() {
  return isDocumentTextSurface();
}

async function appendUebPrint(printText, { trailingSpace = false } = {}) {
  const area = elements['composer-source'];
  if (!area) return;
  const next = `${area.value}${printText ?? ''}${trailingSpace ? ' ' : ''}`;
  area.value = next;
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * UNREACHABLE, and was already unreachable before six-key chording was removed.
 *
 * Its only two callers sat behind `globalThis.__omniyaBrailleSimulation`, a flag
 * that was never set anywhere in `src/`, `test/` or `scripts/`. So in every
 * shipped build this never ran -- and with it, neither did the ⠿-starts-a-Nemeth
 * -equation shortcut (`isBrailleInsertEquationCell`, below) that README and
 * HUMAN-TESTING have been telling braille contributors to use.
 *
 * Kept rather than deleted because it is the only implementation of that
 * promised feature, and the docs are being corrected instead of the code
 * quietly disappearing. To revive it, ⠿ has to be noticed where a real display
 * actually delivers it -- as a character arriving in the text surface's `input`
 * handler -- not through a chord emitter, which is how it came to depend on a
 * simulation flag in the first place.
 */
async function handleComposerUebCell(cell) {
  if (!composerIsTextInsert()) return;
  if (isBrailleInsertEquationCell(uebBuffer, cell)) {
    startEquationAtCaret('nemeth');
    return;
  }
  const result = pushUebCell(uebBuffer, cell);
  uebBuffer = result.buffer;
  if (!result.flush) {
    announce(`UEB cells: ${uebBuffer.pending}`);
    return;
  }
  const grade = gradeForUebBackTranslate(commandState);
  const trailingSpace = cell === ' ' || cell === '\u2800';
  try {
    const translated = await window.omniya.backTranslateUeb(result.flush, grade);
    const text = typeof translated === 'string' ? translated : translated?.text;
    await appendUebPrint(text ?? '', { trailingSpace });
    announce(`UEB word: ${text ?? ''}`);
  } catch (err) {
    announce(`UEB translate failed: ${err.message}`);
  }
}

function syncCommandContentEmpty() {
  if (replacementSession) {
    commandState = { ...commandState, contentEmpty: replacementDraftIsEmpty() };
    syncModePanel(commandState);
    return;
  }
  const src = elements['composer-source']?.value ?? '';
  commandState = { ...commandState, contentEmpty: src.trim().length === 0 };
  // Repaint, don't just record. `commandState.contentEmpty` was already being
  // kept accurate here, but nothing re-rendered #mode-panel afterwards, so the
  // panel went on reading "Equation · Nemeth · empty" with a complete
  // expression in the field. That panel is the state readout a braille reader
  // queries when they want to know where they are, so a stale one is not
  // cosmetic. syncModePanel rather than applyCommandStateToChrome: this runs on
  // every keystroke and only the text needs to change -- re-checking the
  // mode-switch radios mid-word would churn the accessibility tree for nothing.
  syncModePanel(commandState);
}

function replacementDraftIsEmpty() {
  if (!replacementSession) return true;
  if (replacementHasContent) return false;
  if (replacementSession.method === 'latex') {
    return !String(replacementSession.latexSource ?? '').trim();
  }
  if (String(replacementSession.nemethSource ?? '').trim()) return false;
  if (replacementSessionHasDraftMath(replacementSession)) return false;
  const field = replacementEditor ?? (isComposerMathAuthoring() ? elements['composer-source'] : null);
  return !(field?.value ?? '').trim();
}

function findReplacementArticle() {
  const itemId = activeItem()?.id;
  if (!itemId) return null;
  return elements['transcript'].querySelector(`article.napkin-article[data-item-id="${CSS.escape(itemId)}"]`);
}

function applyReplacementMethodFromCommand(method) {
  if (!replacementSession) return;
  try {
    replacementSession = setReplacementMethod(replacementSession, method);
    preferredAuthoringMethod = method;
    const field = replacementEditor ?? (isComposerMathAuthoring() ? elements['composer-source'] : null);
    if (field) {
      field.className = method === 'nemeth' ? 'nemeth-inline-editor' : 'latex-inline-editor';
      field.value = '';
      draft.source = '';
    }
    clearComposerNemethChoices();
    if (replacementEditor) {
      elements['replacement-status'].textContent = method === 'nemeth'
        ? 'Enter Nemeth cells. Enter reads the whole expression.'
        : 'Enter LaTeX for the replacement expression.';
    } else {
      setFieldError(elements['composer-source'], elements['composer-error']);
      setComposerMathStatus(method === 'nemeth'
        ? 'Enter Nemeth cells. Enter reads the whole expression.'
        : 'Enter LaTeX for the equation.');
    }
  } catch (error) {
    elements['replacement-method']?.querySelectorAll('input').forEach((input) => {
      input.checked = input.value === replacementSession.method;
    });
    if (replacementEditor) {
      elements['replacement-status'].textContent = error.message;
    } else {
      setFieldError(elements['composer-source'], elements['composer-error'], error.message);
    }
  }
}

function openContextualHelp() {
  const box = elements['keyboard-help'];
  const el = box.querySelector('[data-command-help]');
  if (el) {
    el.replaceChildren();
    const status = document.createElement('p');
    status.textContent = formatStatus(commandState);
    const tHelp = document.createElement('p');
    tHelp.append(document.createElement('kbd'));
    tHelp.firstChild.textContent = 'Ctrl+T';
    tHelp.append(` — ${commandState.surface === 'text' ? 'toggle UEB grade / G1 passage' : 'ignored while authoring an equation'}`);
    const eHelp = document.createElement('p');
    eHelp.append(document.createElement('kbd'));
    eHelp.firstChild.textContent = 'Ctrl+E';
    eHelp.append(' — insert Nemeth equation at the caret');
    const lHelp = document.createElement('p');
    lHelp.append(document.createElement('kbd'));
    lHelp.firstChild.textContent = 'Ctrl+L';
    lHelp.append(' — insert LaTeX equation at the caret');
    const sHelp = document.createElement('p');
    sHelp.append(document.createElement('kbd'));
    sHelp.firstChild.textContent = 'Escape';
    sHelp.append(' — discard an unfinished equation and return to text');
    const shortcuts = document.createElement('p');
    shortcuts.append(document.createElement('kbd'));
    shortcuts.append(document.createElement('kbd'));
    shortcuts.children[0].textContent = 'Ctrl+T';
    shortcuts.append(' toggles UEB grade on text · ');
    shortcuts.children[1].textContent = 'Enter';
    shortcuts.append(' commits an equation and stays in equation mode — Escape returns to text');
    const brailleHelp = document.createElement('p');
    brailleHelp.append(document.createElement('kbd'));
    brailleHelp.firstChild.textContent = '⠿';
    brailleHelp.append(' — with no pending UEB cells, full cell inserts Nemeth (same as Ctrl+E). The UEB word “for” also uses ⠿ at the start of a word; use Ctrl+E or Insert → Equation (Nemeth) if that collides.');
    const menuHelp = document.createElement('p');
    menuHelp.textContent = 'Insert, Format, and Help menus (Alt on Windows; menu bar on Mac) run the same actions.';
    el.append(status, tHelp, eHelp, lHelp, sHelp, shortcuts, brailleHelp, menuHelp);
  }
  if (typeof box.showModal === 'function') box.showModal();
  else box.hidden = false;
}


function handleComposerCommandKey(event) {
  const inDock = isDockReplacement();
  const chord = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (chord && (key === 'e' || key === 'l' || key === 't')) {
    event.preventDefault();
    event.stopPropagation();
    if (key === 't') {
      // UEB grade has no meaning while authoring an equation (new or a
      // replacement) -- unlike Ctrl+E/Ctrl+L, which equationInsertIntent
      // already allows to switch method during a still-empty replacement.
      if (commandState.replaceScopeLabel || isMathReplaceAuthoring() || !isDocumentTextSurface()) return true;
      const toggled = toggleUebGrade(commandState);
      applyCommandStateToChrome(toggled.state);
      announce(toggled.announcement);
      return true;
    }
    applyEquationInsert(key === 'l' ? 'latex' : 'nemeth');
    return true;
  }

  if (event.key === 'Escape' && isDocumentTextSurface()) {
    event.preventDefault();
    event.stopPropagation();
    focusSelectedArticle();
    return true;
  }

  if (!inDock && mode !== 'add' && mode !== 'edit') return false;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (inDock) {
      void cancelReplacementEditor(findReplacementArticle());
      return true;
    }
    // An Enter-triggered commit is still awaiting its MathML conversion.
    // Tearing down replacementSession now (via returnToRead) would orphan
    // that in-flight commit: it resumes with a null session, throws, and the
    // equation never reaches state -- silently discarding already-converted
    // input. Swallow Escape until the commit settles instead.
    if (submittingComposerEquation) return true;
    if (isComposerMathAuthoring() || isMathReplaceAuthoring()) {
      returnToRead();
      return true;
    }
    return false;
  }

  return false;
}

async function submitComposer({ allowAtomicSubmit = false } = {}) {
  if (mode !== 'add' && mode !== 'edit') return;
  if (!activeNapkin()) returnToRead();
  if (!activeNapkin()) return;
  const source = elements['composer-source'].value;
  const note = elements['composer-note'].value;
  const editing = mode === 'edit';
  const type = editing ? (activeItem()?.type ?? selectedType()) : selectedType();
  draft = { source, note, type };
  setFieldError(elements['composer-source'], elements['composer-error']);

  const mathSessionActive = Boolean(replacementSession) && !replacementEditor
    && (( !editing && type === 'equation') || (editing && (type === 'equation' || commandState.replaceScopeLabel || replacementSession.isNew)));
  if (mathSessionActive) {
    if (submittingComposerEquation) return;
    submittingComposerEquation = true;
    // Snapshot before anything can clear the field: this is the exact buffer
    // the verdict recorded below applies to.
    const submittedBuffer = elements['composer-source'].value;
    try {
      if (!editing) ensureComposerMathSession();
      if (!replacementSession || replacementEditor) {
        setFieldError(elements['composer-source'], elements['composer-error'], 'Enter Nemeth or LaTeX');
        elements['composer-source'].focus();
        return;
      }
      await composerMathInputProcessing;
      if (replacementSession.method === 'latex') {
        replacementSession = setLatexSource(replacementSession, elements['composer-source'].value);
        draft.source = elements['composer-source'].value;
      }
      if (replacementSession.method === 'nemeth') {
        // Commit whatever is in the field, unconditionally. The live status is
        // only ever a progress report; this is the moment the parser's verdict
        // becomes authoritative, and submitReplacement -> materializeDraft ->
        // parseNemeth either yields LaTeX or throws NemethUnsupportedError,
        // whose message is the single product-approved sentence.
        replacementSession = setNemethSource(replacementSession, elements['composer-source'].value);
        draft.source = elements['composer-source'].value;
      }
      if (replacementDraftIsEmpty()) {
        const emptyMessage = editing || commandState.replaceScopeLabel
          ? 'Replacement draft is empty or incomplete.'
          : 'Enter Nemeth or LaTeX';
        setFieldError(elements['composer-source'], elements['composer-error'], emptyMessage);
        setComposerMathStatus(emptyMessage);
        elements['composer-source'].focus();
        return;
      }
      const itemId = editingItemId ?? activeItem()?.id;
      const item = activeNapkin()?.items.find(({ id }) => id === itemId);
      const result = await submitReplacement(replacementSession, {
        convertLatexToMathML: async (latex) => {
          const converted = await window.omniya.latexToMathML(latex);
          return converted?.mathml ?? converted;
        },
        // The session normally already holds decoded cells, so this is the
        // backstop for a buffer assembled some other way -- it must be the same
        // table the composer classified with, or submit disagrees with the
        // status line the author just heard.
        brailleInputTable: NEMETH_INPUT_MODE
      });
      recordNemethCommit('accepted', submittedBuffer);
      if (replacementSession.originalDocument && item) {
        const history = mathHistory.get(item.id) ?? { undo: [], redo: [] };
        history.undo.push({ document: structuredClone(item.math), focus: item.math?.focus ?? null });
        history.undo = history.undo.slice(-100);
        history.redo = [];
        mathHistory.set(item.id, history);
        state = updateItem(state, item.id, { note: item.note, math: result.document });
        clearComposerMathSession();
        resetDraft();
        liveTextItemId = null;
        editingItemId = null;
        renderAll();
        enterDocumentTextAuthoring({ focus: false });
        const replacementArticle = elements['transcript'].querySelector(
          `article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`
        );
        if (replacementArticle) setTimeout(() => void restoreExplorerFocus(replacementArticle, result.focus), 0);
        else focusSelectedArticle();
        elements['save-status'].textContent = 'Replacement committed';
        await saveState().catch(() => {});
      } else {
        // Captured before clearComposerMathSession() drops the session: the
        // composer re-opens in the method that just committed, below.
        const committedMethod = replacementSession.method;
        const followId = commitEquationAtSnapshot(note, result.document);
        clearComposerMathSession();
        resetDraft();
        liveTextItemId = null;
        editingItemId = null;
        renderAll();
        enterDocumentTextAuthoring({ focus: true });
        if (followId && activeNapkin()?.items.some(({ id }) => id === followId)) {
          openEditMode(followId);
          elements['composer-source']?.setSelectionRange(0, 0);
        }
        elements['save-status'].textContent = 'Added item';
        // Equation mode is sticky: an author writing mathematics is usually
        // writing more than one expression, and dropping to text after every
        // Enter charged them a Ctrl+E per equation. Reported directly by an
        // alpha tester (2026-08-23): "I expected the equation editor to still
        // be up ... it would be nice if it stayed in equation mode until I
        // told it to go to the text entry mode."
        //
        // This deliberately runs AFTER the enterDocumentTextAuthoring/
        // openEditMode pair above rather than replacing it. That pair is what
        // puts the caret at offset 0 of the text item split off to the right of
        // the new equation, so the snapshot startEquationAtCaret takes here
        // lands the NEXT equation immediately after this one instead of at the
        // end of the napkin. openEditMode also tears down a live isNew session,
        // so re-entering before it would be undone.
        startEquationAtCaret(committedMethod);
        // #composer-status is the field's aria-describedby live region, and
        // with focus never leaving the field it is now the only channel that
        // can tell a screen-reader user the equation landed. Say the mode too:
        // "still in Nemeth" is the whole point of the change, and silence about
        // it is how a sticky mode becomes a trap.
        setComposerMathStatus(equationCommittedStatus(committedMethod));
        await saveState().catch(() => {});
      }
    } catch (error) {
      recordNemethCommit('refused', submittedBuffer, error.message);
      setFieldError(elements['composer-source'], elements['composer-error'], error.message);
      setComposerMathStatus(error.message);
      elements['composer-source'].setAttribute('aria-invalid', 'true');
      elements['composer-source'].focus();
    } finally {
      submittingComposerEquation = false;
    }
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
  liveTextItemId = null;
  editingItemId = null;
  renderAll();
  enterDocumentTextAuthoring({ focus: true });
  elements['save-status'].textContent = editing ? 'Saved item' : 'Added item';
  await saveState().catch(() => {});
}

async function deleteFocusedItem(itemId) {
  // The id of a deleted item is not a place anyone can still be reading.
  if (exploringEquationItemId === itemId) clearExploringEquation();
  if (liveTextItemId === itemId) {
    liveTextItemId = null;
    editingItemId = null;
    if (elements['composer-source']) elements['composer-source'].value = '';
    draft.source = '';
  }
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

  const deletingActive = state.activeNapkinId === napkinId;
  const index = state.napkins.findIndex(({ id }) => id === napkinId);
  const remaining = state.napkins.filter(({ id }) => id !== napkinId);
  const focusId = remaining[index]?.id ?? remaining[index - 1]?.id;
  state = deleteNapkin(state, napkinId);
  if (deletingActive) {
    liveTextItemId = null;
    editingItemId = null;
  }
  renderAll();
  if (deletingActive) enterDocumentTextAuthoring({ focus: false });
  focusNapkinButton(focusId ?? state.activeNapkinId);
  elements['save-status'].textContent = `Deleted ${napkin.name}`;
  await saveState().catch(() => {});
}

function renameFocusedNapkin(napkinId) {
  if (mode !== 'read') return;
  const napkin = state.napkins.find(({ id }) => id === napkinId);
  if (!napkin) return;
  renamingNapkinId = napkinId;
  elements['new-napkin-form'].hidden = false;
  elements['new-napkin-submit'].textContent = 'Rename napkin';
  elements['napkin-name'].value = napkin.name;
  setFieldError(elements['napkin-name'], elements['napkin-name-error']);
  elements['napkin-name'].focus();
  elements['napkin-name'].select();
}

elements['new-napkin-button'].addEventListener('click', () => {
  if (mode !== 'read') returnToRead();
  renamingNapkinId = null;
  elements['new-napkin-form'].hidden = false;
  elements['new-napkin-submit'].textContent = 'Create napkin';
  elements['napkin-name'].value = '';
  setFieldError(elements['napkin-name'], elements['napkin-name-error']);
  elements['napkin-name'].focus();
});

elements['cancel-new-napkin'].addEventListener('click', () => {
  elements['new-napkin-form'].hidden = true;
  const napkinId = renamingNapkinId;
  renamingNapkinId = null;
  if (napkinId) focusNapkinButton(napkinId);
  else elements['new-napkin-button'].focus();
});

elements['new-napkin-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const napkinId = renamingNapkinId;
  try {
    state = napkinId
      ? renameNapkin(state, napkinId, elements['napkin-name'].value)
      : createNapkin(state, elements['napkin-name'].value);
  } catch (error) {
    setFieldError(elements['napkin-name'], elements['napkin-name-error'], error.message);
    elements['napkin-name'].focus();
    return;
  }
  elements['new-napkin-form'].hidden = true;
  renamingNapkinId = null;
  renderAll();
  if (napkinId) {
    focusNapkinButton(napkinId);
    elements['save-status'].textContent = `Renamed to ${state.napkins.find(({ id }) => id === napkinId)?.name ?? ''}`;
  } else {
    enterDocumentTextAuthoring({ focus: true });
  }
  await saveState().catch(() => {});
});

elements['napkin-list'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-napkin-id]');
  if (!button) return;
  if (isComposerMathAuthoring() || isMathReplaceAuthoring()) returnToRead();
  liveTextItemId = null;
  editingItemId = null;
  equationCaretSnapshot = null;
  clearedLiveTextIndex = null;
  state = switchNapkin(state, button.dataset.napkinId);
  renderAll();
  elements['save-status'].textContent = `Opened ${activeNapkin().name}`;
  enterDocumentTextAuthoring({ focus: true });
  await saveState().catch(() => {});
});

elements['napkin-list'].addEventListener('keydown', (event) => {
  const button = event.target.closest('[data-napkin-id]');
  if (!button) return;
  if (event.key === 'Backspace') {
    event.preventDefault();
    void deleteFocusedNapkin(button.dataset.napkinId);
    return;
  }
  // Ctrl+U (Cmd+U on Mac) rather than F2. F2 is the desktop convention, but it
  // is a poor fit for the people using this: a braille display's keyboard often
  // has no function-key row at all, and reaching one on a laptop can mean a
  // second Fn chord. Ctrl+U is unclaimed here -- there is no accelerator for it
  // in the application menu, and `role: 'editMenu'` does not define one.
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'u') {
    event.preventDefault();
    renameFocusedNapkin(button.dataset.napkinId);
  }
});

elements['replacement-submit'].addEventListener('click', () => {
  void replacementEditor?._replacementSubmitHandler?.({ allowAtomicSubmit: true });
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
    const field = replacementEditor ?? (isComposerMathAuthoring() ? elements['composer-source'] : null);
    if (field) {
      field.className = selected === 'nemeth' ? 'nemeth-inline-editor' : 'latex-inline-editor';
      field.value = '';
      draft.source = '';
    }
    if (replacementEditor) {
      elements['replacement-status'].textContent = selected === 'nemeth'
        ? 'Enter Nemeth cells. Enter reads the whole expression.'
        : 'Enter LaTeX for the replacement expression.';
    } else {
      setFieldError(elements['composer-source'], elements['composer-error']);
      setComposerMathStatus(selected === 'nemeth'
        ? 'Enter Nemeth cells. Enter reads the whole expression.'
        : 'Enter LaTeX for the equation.');
    }
    applyCommandStateToChrome({
      ...commandState,
      surface: 'equation',
      equationMethod: selected,
      contentEmpty: true
    });
    if (isComposerMathAuthoring()) {
      clearComposerNemethChoices();
      renderComposer();
    }
  } catch (error) {
    elements['replacement-method'].querySelectorAll('input').forEach((input) => { input.checked = input.value === replacementSession.method; });
    if (replacementEditor) {
      elements['replacement-status'].textContent = error.message;
    } else {
      setFieldError(elements['composer-source'], elements['composer-error'], error.message);
    }
  }
});
elements['composer-back'].addEventListener('click', () => returnToRead());
elements['composer-discard'].addEventListener('click', () => returnToRead());
elements['composer-cancel'].addEventListener('click', () => returnToRead());

if (NOTES_UI_ENABLED) {
  elements['note-toggle'].addEventListener('click', () => {
    noteVisible = !noteVisible;
    elements['note-row'].hidden = !noteVisible;
    elements['note-toggle'].textContent = noteVisible ? 'Hide note' : 'Add note';
    elements['note-toggle'].setAttribute('aria-expanded', String(noteVisible));
    if (noteVisible) elements['composer-note'].focus();
  });

  elements['composer-note'].addEventListener('input', () => {
    draft.note = elements['composer-note'].value;
  });
} else {
  elements['note-toggle'].hidden = true;
  elements['note-row'].hidden = true;
}

async function handleComposerMathInput() {
  if (!isComposerMathAuthoring()) return;
  const editor = elements['composer-source'];
  if (replacementSession.method === 'latex') {
    replacementSession = setLatexSource(replacementSession, editor.value);
    draft.source = editor.value;
    syncCommandContentEmpty();
    return;
  }
  // Nemeth. The field IS the cell accumulator: braille cells go in exactly as
  // typed and the whole buffer is re-read on every keystroke. It is NOT routed
  // through `pushUebCell` -- that buffer flushes on U+2800 because in UEB a space ends
  // a word, whereas in Nemeth the same cell is a token (Rule 20/21 comparison
  // spacing, present in 263 of the 613 corpus cases). Feeding Nemeth through it
  // would truncate every expression at its first space.
  //
  // Re-parsing the whole buffer per keystroke is affordable: a 23-cell buffer
  // costs ~0.13 ms to classify and a 120-cell one ~2.7 ms, both including the
  // prefix scan. Parse-on-commit was the alternative and was rejected: an
  // author who cannot see the field has no other channel telling them whether
  // the cells are landing, and with 389 of 613 corpus constructs legitimately
  // out of scope, saving all feedback for Enter means finding out at the end of
  // a long expression with no clue where it stopped being understood.
  //
  // The status never says "unsupported" -- see src/domain/nemeth-input.js for
  // why that is not knowable mid-buffer. Only submit says it, and by then it is
  // true. So an unfinished expression does NOT put the field into the error
  // state: not-yet-complete is the normal condition while typing, not a mistake.
  let classification;
  try {
    classification = classifyNemethInput(editor.value, { brailleInputTable: NEMETH_INPUT_MODE });
    lastResolvedInputTable = classification.inputTable ?? 'none';
  } catch (error) {
    // classifyNemethInput rethrows anything that is not a refusal, because that
    // would be a parser bug rather than an unsupported construct. Surface it
    // instead of leaving the author typing into a field that stopped reading.
    setFieldError(editor, elements['composer-error'], `Nemeth reader failed: ${error.message}`);
    setComposerMathStatus(`Nemeth reader failed: ${error.message}`);
    return;
  }

  if (classification.rejected.length) {
    // QWERTY stays gated (commit 8bc05ae). Strip the characters that are not
    // cells and keep the ones that are -- the old engine cleared the whole
    // field, which threw away work the author had already done correctly -- and
    // say so, because a silent drop is unreadable to a screen reader.
    const message = nemethStatusMessage(classification);
    editor.value = classification.cells;
    draft.source = classification.cells;
    setFieldError(editor, elements['composer-error'], message);
    setComposerMathStatus(message);
    replacementSession = setNemethSource(replacementSession, classification.cells);
    syncCommandContentEmpty();
    return;
  }

  // Keep the DECODED cells, not the characters that produced them. With an
  // input table on, a braille keyboard sends computer-braille ASCII and
  // `classification.cells` is what it means; storing `editor.value` instead
  // left the field holding '#2+#2' while the status line read it back as
  // "2+2". A braille author arrowing the field then heard ordinary characters,
  // and submit re-read the same ASCII and refused it.
  //
  // Decoding is one cell per character, so caret offsets survive unchanged --
  // but restore them explicitly rather than relying on that, and skip the write
  // entirely when nothing decoded (the raw-cell and no-table paths), so an
  // untouched field never churns its value under a screen reader.
  if (classification.cells !== editor.value) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = classification.cells;
    if (start !== null && end !== null) editor.setSelectionRange(start, end);
  }
  draft.source = classification.cells;
  replacementSession = setNemethSource(replacementSession, classification.cells);
  setFieldError(editor, elements['composer-error']);
  setComposerMathStatus(nemethStatusMessage(classification));
  syncCommandContentEmpty();
}

elements['composer-source'].addEventListener('input', () => {
  if (isComposerMathAuthoring()) {
    void handleComposerMathInput();
    return;
  }
  draft.source = elements['composer-source'].value;
  syncCommandContentEmpty();
  persistLiveTextFromComposer();
});
elements['mode-switch'].addEventListener('change', () => {
  draft.type = selectedType();
  if (draft.type === 'equation') {
    applyEquationInsert(preferredAuthoringMethod);
    return;
  }
  if (equationCaretSnapshot && replacementSession?.isNew) {
    returnToRead();
    return;
  }
  clearComposerMathSession();
  liveTextItemId = null;
  enterDocumentTextAuthoring({ focus: true });
});

elements['composer-source'].addEventListener('keydown', (event) => {
  // Nemeth cells and Backspace go straight into the field; it is an ordinary
  // text buffer that happens to hold braille. The old engine intercepted every
  // keystroke because it applied cells incrementally and kept its own undo
  // stack; the batch parser has neither, so the textarea's native editing
  // (Backspace, arrows, selection, paste, the platform's own undo) is the
  // editing model, and it is the one a screen reader already knows how to
  // narrate.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    if (isDocumentTextSurface()) {
      event.preventDefault();
      startNewTextItem();
      return;
    }
    event.preventDefault();
    void submitComposer();
  }
});

// `#composer-choices` has no click listener because it has no buttons. It held
// the old engine's local-code disambiguation prompts; the batch parser resolves
// ambiguity from context and never asks (INTERFACES.md section 9), so nothing
// renders into the box. This is the permanent state, not a gap.

// Six-key chording is gone, deliberately.
//
// It let a plain keyboard act as a Perkins keyboard: f d s / j k l as dots
// 1 2 3 / 4 5 6. `1fc6f86` added it because without it a keyboard could not
// enter Nemeth at all -- but that is no longer true. Input detection means the
// computer-braille spelling typed on any keyboard reaches the parser: `?a/b#`
// is the fraction, `#2+#2 .k #4` is 2+2=4. That is both easier than holding
// three keys and available to everyone, so chording had no remaining job.
//
// Removing it also removes the only real ambiguity in this input path. Those
// six letters are ordinary characters in computer braille -- `f(x)` starts with
// one -- and while chording existed, a keystroke of `f` was either dot 1 or the
// letter f with nothing in the event to tell them apart. Every workaround for
// that was a setting someone had to know to set. Deleting the feature deletes
// the question.


elements['composer-form'].addEventListener('submit', (event) => {
  event.preventDefault();
  void submitComposer({ allowAtomicSubmit: true });
});

// Command-mode keys must keep working when focus leaves the composer/replacement
// field (e.g. s in Command mode → #mode-panel). Replacement textarea has its own
// keyHandler; skip it here to avoid double-handling.
document.addEventListener('keydown', (event) => {
  const inReplacement = Boolean(replacementSession) && !elements['replacement-dock']?.hidden;
  const napkinAuthoring = Boolean(activeNapkin()) && (mode === 'read' || mode === 'add' || mode === 'edit' || inReplacement);
  if (!napkinAuthoring) return;
  if (exploringEquationItemId) return;
  if (elements['keyboard-help']?.open) return;
  if (event.target?.closest?.('#new-napkin-form, #napkin-rail, dialog')) return;
  if (inReplacement && event.target?.id === 'replacement-input') return;
  if (!inReplacement && event.target?.closest?.('#replacement-dock')) return;
  handleComposerCommandKey(event);
}, true);

elements['transcript'].addEventListener('click', (event) => {
  const article = event.target.closest('.napkin-article');
  if (!article) return;
  if (exploringEquationItemId && exploringEquationItemId !== article.dataset.itemId) {
    clearExploringEquation();
  }
  state = selectItem(state, article.dataset.itemId);
  const item = activeNapkin()?.items.find(({ id }) => id === article.dataset.itemId);
  renderTranscript();
  if (item?.type === 'text') {
    openEditMode(article.dataset.itemId);
  } else {
    focusSelectedArticle();
  }
  saveSelectionSoon();
});

elements['transcript'].addEventListener('keydown', (event) => {
  const article = event.target.closest('.napkin-article');
  if (!article) return;

  const math = event.target.closest('mjx-container, math, mjx-focus, mjx-speech');
  if (math) {
    if (event.key === 'Escape') {
      event.preventDefault();
      leaveEquation(article);
    }
    // Backspace deletes the focused item -- README: "Press Backspace on a
    // focused item to delete it". Exploring an equation must not take that
    // away, and it did: the explorer puts focus on <mjx-container> INSIDE the
    // article, so the key entered this `math` branch and returned from it
    // without ever reaching the delete below. An alpha contributor reported
    // exactly that -- equations they had written could not be deleted,
    // "including pressing backspace and control z" -- and had no way to tell
    // that the key was being handled at all.
    //
    // Ordered before the draft forwarding because both can be true at once:
    // the composer stays up in equation mode after a commit (5f8ab9c), so
    // `isComposerMathAuthoring()` is still set while the author reads back the
    // equation they just committed. That sent Backspace to an empty composer
    // field, where it did nothing. `exploringEquationItemId` is the one flag
    // that says this math is a committed item being read, not a live draft:
    // openComposerForMathReplace clears it when the composer takes the math
    // over.
    if (event.key === 'Backspace' && exploringEquationItemId === article.dataset.itemId) {
      event.preventDefault();
      event.stopPropagation();
      void deleteFocusedItem(article.dataset.itemId);
      return;
    }
    if (event.key === 'Backspace' && isComposerMathAuthoring()) {
      event.preventDefault();
      event.stopPropagation();
      elements['composer-source'].dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      return;
    }
    const mathPlacement = mathPlacementFromKey(event);
    if (mathPlacement) {
      event.preventDefault();
      void openComposerForMathReplace(article, null, false, mathPlacement);
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
  const itemPlacement = mathPlacementFromKey(event);
  if (itemPlacement) {
    event.preventDefault();
    if (activeNapkin()?.items.find(({ id }) => id === article.dataset.itemId)?.type === 'equation') {
      void openComposerForMathReplace(article, null, false, itemPlacement);
    } else if (itemPlacement === 'replace') {
      openEditMode(article.dataset.itemId);
    }
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

// Input capture: silent, in-memory, capped. Attached last so its bubble-phase
// listeners run after the composer's and can see `defaultPrevented` -- the one
// signal that says a keystroke was claimed as a braille dot before the field
// saw it. Feeds the diagnostics dump; renders nothing on its own.
const inputLog = createInputLog();
attachInputCapture({ document, log: inputLog, readTable: () => lastResolvedInputTable });

// The visible inspector is dev-only and lives in a directory excluded from
// packaged builds, so this import resolves to nothing in a shipped app. Dynamic
// and catch-swallowed for exactly that reason.
if (devToolsEnabled()) {
  import('./dev/index.js')
    .then((mod) => mod.enableDevTools({ document, log: inputLog }))
    .catch(() => {});
}

/**
 * Copy the braille-input report to the clipboard, then say so.
 *
 * Only ever runs from the Help menu -- a person asking for it. Clipboard, not a
 * file and not the network: the app has no telemetry and this must not become
 * the exception. Announced through the same status region the rest of the app
 * uses, so a screen-reader user hears that it worked.
 */
async function copyInputDiagnostics() {
  const report = formatInputDiagnostics({
    appInfo: window.omniya?.appInfo,
    brailleInputTable: NEMETH_INPUT_MODE,
    resolvedTable: lastResolvedInputTable,
    entries: inputLog.entries(),
    dropped: inputLog.dropped
  });
  try {
    await navigator.clipboard.writeText(report);
    announce('Braille input diagnostics copied. Paste them into your report.');
  } catch {
    // A clipboard permission failure must not look like success, or someone
    // pastes an empty message and the round trip is wasted.
    announce('Could not copy the diagnostics to the clipboard.');
  }
}

// Real text in the accessibility tree, not a title attribute: the whole point
// is that a tester can read their build back to a maintainer over email.
{
  const info = window.omniya?.appInfo;
  const target = elements['app-build-identity'];
  if (target) {
    target.textContent = info?.version
      ? `${info.version} (${info.platform}-${info.arch})`
      : 'running from source';
  }
}

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

window.omniya?.onMenuCommand?.((payload) => {
  if (!payload?.action) return;
  if (payload.action === 'insert-equation') {
    applyEquationInsert(payload.method === 'latex' ? 'latex' : 'nemeth');
    return;
  }
  if (payload.action === 'toggle-ueb-grade') {
    if (!isDocumentTextSurface()) return;
    if (commandState.replaceScopeLabel || isMathReplaceAuthoring()) return;
    const toggled = toggleUebGrade(commandState);
    applyCommandStateToChrome(toggled.state);
    announce(toggled.announcement);
    return;
  }
  if (payload.action === 'keyboard-help') {
    openContextualHelp();
    return;
  }
  if (payload.action === 'copy-input-diagnostics') {
    void copyInputDiagnostics();
  }
});

function showUpdateBanner(notice) {
  // Two kinds of news through one banner: a build is waiting, or updates have
  // stopped arriving at all. The second is the one nobody could see before --
  // a failed check only reached a console that a packaged app does not have,
  // so a tester on a stale build had no way to find out.
  elements['update-banner-text'].textContent = notice?.kind === 'stalled'
    ? 'Automatic updates are not reaching this computer. '
      + 'This build may be out of date; use the button to check the release page.'
    : `A newer testing build (${notice?.latestVersion}) is available.`;
  elements['update-banner'].hidden = false;
}

elements['update-banner-dismiss'].addEventListener('click', () => {
  elements['update-banner'].hidden = true;
});
elements['update-banner-action'].addEventListener('click', () => {
  window.omniya.openReleasePage?.();
});
globalThis.omniya?.onUpdateNotice?.(showUpdateBanner);

if (!globalThis.omniya?.loadState) {
  disableInteractiveControls();
  showError('Run this prototype with “npm start”; the Electron preload bridge is required.');
} else {
  try {
    const loaded = await window.omniya.loadState();
    state = loaded.state;
    renderAll();
    if (activeNapkin()) enterDocumentTextAuthoring({ focus: true });
    if (loaded.warning) showError(loaded.warning);
  } catch {
    showError('The napkins could not be loaded.');
  }
  try {
    const loadedSettings = await window.omniya.loadSettings?.();
  } catch {
    // Settings are a low-stakes preference; fall back to the 'none' default
    // already in place rather than surfacing an error for this.
  }
}
elements['app-shell'].setAttribute('aria-busy', 'false');

// Test-only hook: open composer math-replace on a new empty equation (subtree e2es).
// Product submit never calls this — new equations commit from #composer-source.
globalThis.__omniyaTesting = {
  // The report the Help menu copies, without driving a native clipboard from a
  // headless test. Same call, same live state; only the clipboard write differs.
  inputDiagnostics() {
    return formatInputDiagnostics({
      appInfo: window.omniya?.appInfo,
      brailleInputTable: NEMETH_INPUT_MODE,
      resolvedTable: lastResolvedInputTable,
      entries: inputLog.entries(),
      dropped: inputLog.dropped
    });
  },
  async openNewEquationDock() {
    if (!activeNapkin()) return;
    if (mode === 'add' || mode === 'edit') {
      clearComposerMathSession();
      resetDraft();
      mode = 'read';
      editingItemId = null;
      commandState = createAuthoringState({ surface: 'text', contentEmpty: true });
    }
    if (replacementSession) return;
    state = addItem(state, { type: 'equation', note: '', math: createEmptyDraftMathDocument() });
    const item = activeItem();
    renderAll();
    syncModePanel(commandState);
    await saveState().catch(() => {});
    const article = item && elements['transcript'].querySelector(
      `article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`
    );
    if (article) await openComposerForMathReplace(article, item.math.focus, true);
  }
};
