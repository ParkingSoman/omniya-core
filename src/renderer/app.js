import {
  addItem,
  createNapkin,
  deleteNapkin,
  deleteItem,
  selectItem,
  switchNapkin,
  updateItem
} from '../domain/model.js';
import { applyNemethSourceIntentToBraille } from './nemeth-braille-projection.js';
import { applyUebBrailleLabel } from './ueb-braille-projection.js';
import { captureExplorerFocus, restoreExplorerFocus } from './math-explorer-bridge.js';
import { createSixKeyInput } from './braille-input.js';
import { createEmptyDraftMathDocument } from '../domain/guided-nemeth/index.js';
import {
  applyNemethCell,
  applyNemethBoundary,
  applyNemethChoice,
  commitNemethLocalCode,
  cancelReplacement,
  setLatexSource,
  setReplacementMethod,
  startReplacementSession,
  submitReplacement,
  undoNemethStep,
  replacementSessionHasDraftMath
} from '../domain/replacement-session.js';
import {
  applyCommandKey,
  createCommandState,
  enterCommand,
  formatStatus,
  gradeForUebBackTranslate
} from '../domain/command-mode.js';
import { createUebCellBuffer, pushUebCell } from '../domain/ueb-cell-buffer.js';
import { isAllowedNemethCellInput } from '../domain/nemeth-cell-input.js';

const elements = Object.fromEntries([
  'app-shell', 'napkin-list', 'new-napkin-button', 'new-napkin-form', 'napkin-name',
  'napkin-name-error', 'cancel-new-napkin', 'current-napkin-name', 'item-count',
  'mode-panel', 'save-status', 'reading-section', 'reading-heading', 'reading-help',
  'empty-message', 'transcript', 'reading-actions', 'open-add-button',
  'keyboard-help-button', 'keyboard-help', 'close-keyboard-help', 'composer-dock',
  'composer-form', 'composer-heading', 'composer-back',
  'mode-switch', 'note-toggle', 'composer-source', 'note-row', 'composer-note',
  'composer-help', 'composer-status', 'composer-error', 'composer-choices', 'editing-indicator', 'composer-submit',
  'composer-discard', 'composer-cancel', 'replacement-dock', 'replacement-heading',
  'replacement-scope', 'replacement-method', 'replacement-input', 'replacement-status', 'replacement-choices',
  'replacement-submit', 'replacement-cancel', 'app-error', 'app-error-message', 'retry-save'
].map((id) => [id, document.getElementById(id)]));

const NOTES_UI_ENABLED = false;

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
let replacementHasContent = false;
let preferredAuthoringMethod = 'nemeth';
let commandState = createCommandState({ itemKind: 'text', contentEmpty: true });
let uebBuffer = createUebCellBuffer();
let uebCellChain = Promise.resolve();
let composerMathInputProcessing = Promise.resolve();
let submittingComposerEquation = false;
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
    // Keep the application-owned MathML node that already carries Omnia
    // source stamps. A second innerHTML clone can drop MathML data attrs in
    // Chromium and would make Braille projection fall back to SRE alone.
    const authoredSourceMath = source.querySelector('math');
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
    // MathJax/SRE remains the independent projection. The guided writer may
    // retain a small, source-linked BANA distinction that MathML alone cannot
    // express, so apply it only to the already-rendered ARIA Braille labels.
    // This is not a serializer and never changes the canonical tree.
    const renderedMath = container.querySelector('math');
    if (renderedMath) {
      // Some literal MathML shapes (for example BANA's dotted/shaded
      // circles) are intentionally represented as <mtext>. MathJax still
      // creates the speech node, but it does not attach an aria-braillelabel
      // attribute to that non-mathematical token. Include every speech node
      // here so the bounded source-intent projection can supply the reviewed
      // local cells instead of making the Electron workflow appear blank.
      container.querySelectorAll('mjx-speech').forEach((node) => {
        const braille = node.getAttribute('aria-braillelabel');
        const projected = applyNemethSourceIntentToBraille(braille, authoredSourceMath || renderedMath);
        if (projected) node.setAttribute('aria-braillelabel', projected);
      });
    }
    const speech = container.querySelector('mjx-speech');
    // Prefer the untouched application-owned MathML source for Nemeth intent
    // projection. MathJax's assistive clone intentionally sanitizes unknown
    // data attributes, which would erase function boundaries and other BANA
    // distinctions needed for exact Braille. The clone remains the fallback
    // for renderers that move the source node.
    const sourceMath = authoredSourceMath || container.querySelector('mjx-assistive-mml math');
    if (speech && sourceMath) {
      const braille = speech.getAttribute('aria-braillelabel');
      speech.setAttribute('aria-braillelabel', applyNemethSourceIntentToBraille(braille, authoredSourceMath || container));
      // SRE can finish replacing the speech node one microtask after
      // `typesetPromise` resolves. Reapply the same source-grounded correction
      // to that final node so undo/redo and relaunch cannot expose a transient
      // generic Braille projection.
      const refreshBrailleProjection = () => {
        const latest = container.querySelector('mjx-speech');
        if (!latest) return;
        const current = latest.getAttribute('aria-braillelabel') || undefined;
        const projected = applyNemethSourceIntentToBraille(
          current, authoredSourceMath || container
        );
        if (projected && projected !== current) latest.setAttribute('aria-braillelabel', projected);
      };
      // SRE may replace the speech node more than once while explorer
      // enrichment settles. Reapply the source-scoped projection at fixed
      // boundaries without retaining an observer (observers on speech churn
      // can re-enter when projection itself writes aria-braillelabel).
      setTimeout(refreshBrailleProjection, 0);
      setTimeout(refreshBrailleProjection, 80);
      setTimeout(refreshBrailleProjection, 250);
      setTimeout(refreshBrailleProjection, 500);
      setTimeout(refreshBrailleProjection, 900);
      setTimeout(refreshBrailleProjection, 1500);
    }
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
      if (typeof window.omniya?.translateUeb === 'function') {
        void applyUebBrailleLabel(
          text,
          item.source,
          'g2',
          (source, grade) => window.omniya.translateUeb(source, grade)
        );
      }
    }

    article.append(descriptor, content);
    if (NOTES_UI_ENABLED && item.note) {
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
    ? 'Up and Down arrows move between items. Enter explores an equation; r replaces, a appends after, p prepends before the focus.'
    : 'Reading remains available above. Ctrl+[ enters Command mode · Escape cancels.';
}

function placementVerb(placement) {
  if (placement === 'append') return 'Appending after';
  if (placement === 'prepend') return 'Prepending before';
  return 'Replacing';
}

function mathPlacementFromKey(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'r') return 'replace';
  if (key === 'a') return 'append';
  if (key === 'p') return 'prepend';
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

  elements['composer-heading'].textContent = mathReplace
    ? (commandState.replaceScopeLabel
      ? `${placementVerb(commandState.placement)}: ${commandState.replaceScopeLabel}`
      : 'Replace focused mathematics')
    : editing
      ? `Editing item ${activeNapkin().items.findIndex(({ id }) => id === editingItemId) + 1}`
      : `Adding to ${activeNapkin().name}`;
  elements['composer-submit'].textContent = mathReplace
    ? (commandState.placement === 'append' ? 'Append' : commandState.placement === 'prepend' ? 'Prepend' : 'Replace')
    : editing ? 'Save changes' : 'Add item';
  elements['composer-discard'].hidden = editing || mathReplace;
  elements['composer-cancel'].hidden = !(editing || mathReplace);
  elements['editing-indicator'].textContent = mathReplace
    ? 'Escape cancels without changing the equation.'
    : editing
      ? 'Changes are not saved until you choose Save changes.'
      : '';
  if (!mathReplace || mode === 'add') {
    elements['composer-source'].value = values.source;
  } else if (!replacementHasContent && !(replacementSession?.nemethState?.prefix) && replacementSession?.method !== 'latex') {
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
    ? 'Nemeth: type cells · LaTeX: type source · Ctrl+[ Command mode · Escape cancels · Replace commits'
    : editing
      ? 'Save changes commits the item · Ctrl+[ enters Command mode · Escape cancels'
      : values.type === 'equation'
        ? 'Nemeth: type cells · LaTeX: type source · Ctrl+[ Command mode · Escape cancels'
        : 'Enter adds · Shift+Enter makes a new line · Ctrl+[ enters Command mode · Escape cancels';
  // Unified composer: Equation keeps #composer-source visible (Nemeth/LaTeX styling only).
  elements['composer-source'].hidden = false;
  elements['composer-source'].required = values.type === 'text' && !mathReplace;
  const equationMethod = values.type === 'equation'
    ? (commandState.itemKind === 'equation' ? commandState.equationMethod : preferredAuthoringMethod)
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
    if (!math) return null;
  }
  // The persisted equation is validated canonical MathML. It is therefore
  // always an exact replacement target, even during the short interval in
  // which MathJax is handing focus between its explorer and the browser. Keep
  // this as the last-resort target for a *missing* explorer snapshot only. A
  // settled descendant that cannot be mapped is still an internal bridge bug
  // and must never be widened silently here.
  const canonicalRootFocus = () => {
    const source = item.math?.mathml
      ? new DOMParser().parseFromString(item.math.mathml, 'application/xml').documentElement
      : null;
    const rootId = source?.getAttribute('data-omniya-id');
    return rootId
      ? { target: { kind: 'node', nodeId: rootId }, speech: 'whole equation', nemeth: '' }
      : null;
  };
  let focus;
  try {
    if (startingFocus) {
      focus = { target: startingFocus, speech: '', nemeth: '' };
    } else if (exploringEquationItemId === article.dataset.itemId) {
      try {
        focus = await captureExplorerFocusWithRetry(article);
      } catch {
        // MathJax can briefly expose neither its visual nor speech focus while
        // handing control back to the browser. The last bridge result, the
        // persisted focus, or the canonical equation root are all exact
        // application-owned targets. This path never publishes an unsafe
        // focus error to the user.
        focus = explorerFocusCache.get(article.dataset.itemId) || canonicalRootFocus();
        if (!focus) focus = canonicalRootFocus();
      }
      explorerFocusCache.set(article.dataset.itemId, focus);
    } else {
      focus = canonicalRootFocus();
    }
  } catch (error) {
    // The source MathML is application-owned and structurally valid. This is
    // an internal diagnostic only; no "focus cannot be edited safely" state is
    // exposed in the editing workflow.
    console.error('MathJax focus bridge could not resolve the active node', error);
    focus = canonicalRootFocus();
  }
  return focus;
}

/** Open the unified composer to replace, append after, or prepend before a focused math node. */
async function openComposerForMathReplace(article, startingFocus = null, isNew = false, placement = 'replace') {
  if (replacementSession) return;
  const item = activeNapkin()?.items.find(({ id }) => id === article.dataset.itemId);
  if (!item) return;
  const focus = await resolveMathReplaceFocus(article, item, startingFocus, isNew);
  if (!focus?.target) {
    console.error('Validated equation has no canonical replacement root');
    elements['save-status'].textContent = 'Equation is unavailable.';
    return;
  }
  exploringEquationItemId = null;
  explorerFocusCache.delete(article.dataset.itemId);
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
  commandState = createCommandState({
    itemKind: 'equation',
    equationMethod: preferredAuthoringMethod,
    contentEmpty: true,
    interaction: 'insert',
    replaceScopeLabel: scopeLabel,
    placement
  });
  // Keep scope metadata for e2es / Task 7 cleanup; product chrome is the composer.
  if (elements['replacement-scope']) {
    elements['replacement-scope'].textContent = focus.speech ? `Selected: ${focus.speech}` : 'Selected mathematical scope';
    elements['replacement-scope'].dataset.targetId = focus.target.kind === 'node'
      ? focus.target.nodeId
      : focus.target.firstNodeId;
  }
  elements['replacement-dock'].hidden = true;
  elements['replacement-method']?.querySelectorAll('input').forEach((input) => {
    input.checked = input.value === preferredAuthoringMethod;
  });
  clearComposerNemethChoices();
  setComposerMathStatus(preferredAuthoringMethod === 'nemeth'
    ? 'Enter Nemeth cells. Complete local codes apply immediately; bounded codes wait for Enter.'
    : `Enter LaTeX for the ${placement === 'append' ? 'appended' : placement === 'prepend' ? 'prepended' : 'replacement'} expression.`);
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

// MathJax may move focus to its short-lived hidden focus element while an
// expression is being explored. Keep Escape reliable even in that case.
document.addEventListener('keydown', (event) => {
  if (!exploringEquationItemId) return;
  const focused = event.target instanceof Element ? event.target : document.activeElement;
  if (!focused?.matches?.('mjx-container, math, mjx-focus, mjx-speech') &&
      !focused?.closest?.('mjx-container, math, mjx-focus, mjx-speech')) return;
  const article = elements['transcript'].querySelector(
    `article.napkin-article[data-item-id="${CSS.escape(exploringEquationItemId)}"]`
  );
  if (!article) return;
  const explorerPlacement = mathPlacementFromKey(event);
  if (explorerPlacement) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openComposerForMathReplace(article, null, false, explorerPlacement);
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

/** True while the replacement dock owns the active math session (subtree E). */
function isDockReplacement() {
  return Boolean(replacementSession && replacementEditor && !elements['replacement-dock']?.hidden);
}

/** True while add-mode equation authoring binds guided Nemeth/LaTeX to #composer-source. */
function isComposerMathAuthoring() {
  return Boolean(replacementSession) && !replacementEditor && (mode === 'add' || mode === 'edit');
}

async function renderComposerDraftPreview() {
  if (!isComposerMathAuthoring() || replacementSession?.method !== 'nemeth') return;
  const itemId = editingItemId;
  if (!itemId) return;
  const article = elements['transcript'].querySelector(
    `article.napkin-article[data-item-id="${CSS.escape(itemId)}"]`
  );
  const item = activeNapkin()?.items.find(({ id }) => id === itemId);
  const content = article?.querySelector('.item-content');
  if (!article || !item || !content) return;
  await renderEquation(content, { ...item, math: replacementSession.draft }, ++transcriptRenderVersion);
  // Keep the composer caret. Restoring explorer focus here steals Backspace
  // from the draft the author is still editing.
  elements['composer-source']?.focus();
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
  if (mode !== 'add') return;
  if ((commandState.itemKind ?? draft.type) !== 'equation') return;
  const empty = createEmptyDraftMathDocument();
  replacementSession = startReplacementSession({
    document: null,
    target: empty.focus,
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

function clearComposerNemethChoices() {
  const box = elements['composer-choices'];
  if (!box) return;
  box.replaceChildren();
  box.hidden = true;
  delete box.dataset.prefix;
}

function renderComposerNemethChoices(choices = [], prefix = '') {
  const box = elements['composer-choices'];
  if (!box) return;
  box.dataset.prefix = prefix;
  box.replaceChildren(...choices.map((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'replacement-choice';
    button.dataset.operationId = choice.operationId;
    button.textContent = choice.label;
    button.title = `BANA ${choice.banaRefs.join(', ')}`;
    return button;
  }));
  box.hidden = choices.length === 0;
}

function returnToRead({ discardDraft = true } = {}) {
  const session = (!replacementEditor && replacementSession) ? replacementSession : null;
  const wasNew = Boolean(session?.isNew);
  const wasMathReplace = Boolean(session && (session.originalDocument || wasNew || commandState.replaceScopeLabel));
  const itemId = editingItemId;
  const restoreTarget = session?.target;
  const restoreExplorer = session?.originalExplorerFocus;
  clearComposerMathSession();
  if (discardDraft) resetDraft();
  if (uebBuffer.pending) announce('Discarded pending UEB cells');
  uebBuffer = createUebCellBuffer();
  if (wasNew && itemId) state = deleteItem(state, itemId);
  mode = 'read';
  editingItemId = null;
  commandState = createCommandState({ itemKind: 'text', contentEmpty: true });
  renderAll();
  syncModePanel(commandState);
  if (wasMathReplace && !wasNew && itemId && restoreTarget) {
    const restored = elements['transcript'].querySelector(
      `article.napkin-article[data-item-id="${CSS.escape(itemId)}"]`
    );
    if (restored) setTimeout(() => void restoreExplorerFocus(restored, restoreTarget, restoreExplorer), 0);
    elements['save-status'].textContent = 'Replacement cancelled';
    return;
  }
  if (wasNew) {
    void saveState().catch(() => {});
    focusSelectedArticle();
    return;
  }
  focusSelectedArticle();
}

function openAddMode() {
  if (!activeNapkin()) return;
  mode = 'add';
  editingItemId = null;
  resetDraft();
  uebBuffer = createUebCellBuffer();
  commandState = createCommandState({
    itemKind: draft.type,
    contentEmpty: true,
    equationMethod: preferredAuthoringMethod
  });
  renderAll();
  applyCommandStateToChrome(commandState);
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
  uebBuffer = createUebCellBuffer();
  const item = napkin.items.find(({ id }) => id === itemId);
  commandState = createCommandState({
    itemKind: item?.type === 'equation' ? 'equation' : 'text',
    contentEmpty: !(item?.source ?? '').trim(),
    equationMethod: preferredAuthoringMethod
  });
  renderAll();
  applyCommandStateToChrome(commandState);
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

function syncModePanel(state = commandState) {
  if (elements['mode-panel']) elements['mode-panel'].textContent = formatStatus(state);
}

function applyCommandStateToChrome(nextState) {
  commandState = nextState;
  if (commandState.itemKind === 'text' || commandState.itemKind === 'equation') {
    elements['mode-switch'].querySelectorAll('input').forEach((input) => {
      input.checked = input.value === commandState.itemKind;
    });
    draft.type = commandState.itemKind;
  }
  if (commandState.itemKind === 'equation') {
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
  if (mode !== 'add' && mode !== 'edit') return false;
  if (commandState.interaction !== 'insert') return false;
  const kind = commandState.itemKind ?? draft.type;
  return kind === 'text';
}

async function appendUebPrint(printText, { trailingSpace = false } = {}) {
  const area = elements['composer-source'];
  if (!area) return;
  const next = `${area.value}${printText ?? ''}${trailingSpace ? ' ' : ''}`;
  area.value = next;
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

async function handleComposerUebCell(cell) {
  if (!composerIsTextInsert()) return;
  if (cell === '⠿' && uebBuffer.pending === '') {
    commandState = enterCommand(commandState);
    syncModePanel(commandState);
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
    return;
  }
  const src = elements['composer-source']?.value ?? '';
  commandState = { ...commandState, contentEmpty: src.trim().length === 0 };
}

function replacementDraftIsEmpty() {
  if (!replacementSession) return true;
  if (replacementHasContent) return false;
  if (replacementSession.method === 'latex') {
    return !String(replacementSession.latexSource ?? '').trim();
  }
  const prefix = replacementSession.nemethState?.prefix ?? '';
  if (prefix) return false;
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
        ? 'Enter Nemeth cells. Complete local codes apply immediately; bounded codes wait for Enter.'
        : 'Enter LaTeX for the replacement expression.';
    } else {
      setFieldError(elements['composer-source'], elements['composer-error']);
      setComposerMathStatus(method === 'nemeth'
        ? 'Enter Nemeth cells. Complete local codes apply immediately; bounded codes wait for Enter.'
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
    tHelp.firstChild.textContent = 't';
    tHelp.append(` — ${commandState.itemKind === 'text' ? 'toggle UEB grade / G1 passage' : 'make Text (UEB)'}`);
    const eHelp = document.createElement('p');
    eHelp.append(document.createElement('kbd'));
    eHelp.firstChild.textContent = 'x';
    eHelp.append(` — ${commandState.itemKind === 'equation' && commandState.contentEmpty ? 'cycle Nemeth/LaTeX' : 'make Equation (Nemeth)'}`);
    const sHelp = document.createElement('p');
    sHelp.append(document.createElement('kbd'));
    sHelp.firstChild.textContent = 's';
    sHelp.append(' — focus authoring mode panel');
    const shortcuts = document.createElement('p');
    shortcuts.append(document.createElement('kbd'));
    shortcuts.children[0].textContent = 'Ctrl+[';
    shortcuts.append(' enters Command mode · ');
    shortcuts.append(document.createElement('kbd'));
    shortcuts.children[1].textContent = 'Escape';
    shortcuts.append(' cancels · ');
    shortcuts.append(document.createElement('kbd'));
    shortcuts.children[2].textContent = 'n';
    shortcuts.append(' submit · ');
    shortcuts.append(document.createElement('kbd'));
    shortcuts.children[3].textContent = 'i';
    shortcuts.append(' insert');
    el.append(status, tHelp, eHelp, sHelp, shortcuts);
  }
  if (typeof box.showModal === 'function') box.showModal();
  else box.hidden = false;
}

function handleComposerCommandKey(event) {
  const inDock = isDockReplacement();
  if (!inDock && mode !== 'add' && mode !== 'edit') return false;

  if ((event.ctrlKey || event.metaKey) && event.key === '[') {
    event.preventDefault();
    event.stopPropagation();
    if (commandState.interaction === 'insert') {
      syncCommandContentEmpty();
      commandState = enterCommand(commandState);
      syncModePanel(commandState);
    }
    return true;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (inDock) {
      void cancelReplacementEditor(findReplacementArticle());
      return true;
    }
    returnToRead();
    return true;
  }

  if (commandState.interaction !== 'command') return false;
  const key = event.key;
  const commandKeys = new Set(['i', 't', 'x', 's', 'n', '?', 'Enter', 'e']);
  if (!commandKeys.has(key)) return false;
  event.preventDefault();
  event.stopPropagation();
  // While replacing an equation in the dock / subtree path, Text umbrella must
  // not flip chrome to Text.
  if (inDock && key === 't') {
    if (elements['mode-panel']) {
      elements['mode-panel'].textContent = "Can't switch to Text while replacing an equation.";
    }
    return true;
  }
  syncCommandContentEmpty();
  const result = applyCommandKey(commandState, key);
  commandState = result.state;
  if (result.action === 'help') openContextualHelp();
  if (result.action === 'submit') {
    if (inDock) {
      void replacementEditor?._replacementSubmitHandler?.();
      return true;
    }
    void submitComposer();
    return true;
  }
  if (result.action === 'set-type' || result.action === 'set-method' || result.action === 'set-grade') {
    applyCommandStateToChrome(commandState);
    if (result.action === 'set-type') {
      if (commandState.itemKind === 'equation') ensureComposerMathSession();
      else clearComposerMathSession();
    }
    if (result.action === 'set-method' && replacementSession) {
      applyReplacementMethodFromCommand(commandState.equationMethod);
    }
    if (!inDock && (mode === 'add' || mode === 'edit')) renderComposer();
  } else if (key === 'i' || key === 'Enter' || result.action === 'focus-status' || result.action === 'help') {
    syncModePanel(commandState);
  } else if (elements['mode-panel'] && result.announcement) {
    // Refusal / unknown / locked status — show on mode panel, not save-status
    elements['mode-panel'].textContent = result.announcement;
  }
  if (result.action === 'focus-status') {
    elements['mode-panel']?.focus();
  } else if (
    (key === 'i' || key === 'Enter') &&
    inDock
  ) {
    elements['replacement-input']?.focus();
  } else if ((key === 'i' || key === 'Enter') && (mode === 'add' || mode === 'edit')) {
    elements['composer-source']?.focus();
  }
  return true;
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
      if (replacementSession.method === 'nemeth' && replacementSession.nemethState?.prefix) {
        const local = commitNemethLocalCode(replacementSession);
        replacementSession = local.session;
        if (local.status === 'applied') {
          replacementHasContent = true;
          elements['composer-source'].value = '';
          draft.source = '';
          clearComposerNemethChoices();
          setComposerMathStatus(`Local code committed: ${local.announcement}`);
          // Atomic / bounded local codes: Enter commits the construction only;
          // the next Enter / n in Command mode submits the equation. Release the submit
          // guard before draft preview so a follow-up Enter is not dropped.
          if (local.localCommitPolicy !== 'immediate' && !allowAtomicSubmit) {
            submittingComposerEquation = false;
            await renderComposerDraftPreview();
            elements['composer-source'].focus();
            return;
          }
          await renderComposerDraftPreview();
        } else if (local.status === 'choice') {
          setComposerMathStatus(local.announcement);
          renderComposerNemethChoices(local.choices, local.inputState?.prefix ?? replacementSession.nemethState?.prefix ?? '');
          elements['composer-source'].focus();
          return;
        } else {
          setFieldError(elements['composer-source'], elements['composer-error'], local.announcement);
          elements['composer-source'].setAttribute('aria-invalid', 'true');
          elements['composer-source'].focus();
          return;
        }
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
        }
      });
      if (replacementSession.originalDocument && item) {
        const history = mathHistory.get(item.id) ?? { undo: [], redo: [] };
        history.undo.push({ document: structuredClone(item.math), focus: item.math?.focus ?? null });
        history.undo = history.undo.slice(-100);
        history.redo = [];
        mathHistory.set(item.id, history);
        state = updateItem(state, item.id, { note: item.note, math: result.document });
        clearComposerMathSession();
        resetDraft();
        mode = 'read';
        editingItemId = null;
        commandState = createCommandState({ itemKind: 'text', contentEmpty: true });
        renderAll();
        syncModePanel(commandState);
        const replacementArticle = elements['transcript'].querySelector(
          `article.napkin-article[data-item-id="${CSS.escape(item.id)}"]`
        );
        if (replacementArticle) setTimeout(() => void restoreExplorerFocus(replacementArticle, result.focus), 0);
        else focusSelectedArticle();
        elements['save-status'].textContent = 'Replacement committed';
        await saveState().catch(() => {});
      } else {
        state = addItem(state, { type: 'equation', note, math: result.document });
        clearComposerMathSession();
        resetDraft();
        mode = 'read';
        editingItemId = null;
        commandState = createCommandState({ itemKind: 'text', contentEmpty: true });
        renderAll();
        syncModePanel(commandState);
        focusSelectedArticle();
        elements['save-status'].textContent = 'Added item';
        await saveState().catch(() => {});
      }
    } catch (error) {
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
  mode = 'read';
  editingItemId = null;
  commandState = createCommandState({ itemKind: 'text', contentEmpty: true });
  renderAll();
  syncModePanel(commandState);
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
        ? 'Enter Nemeth cells. Complete local codes apply immediately; bounded codes wait for Enter.'
        : 'Enter LaTeX for the replacement expression.';
    } else {
      setFieldError(elements['composer-source'], elements['composer-error']);
      setComposerMathStatus(selected === 'nemeth'
        ? 'Enter Nemeth cells. Complete local codes apply immediately; bounded codes wait for Enter.'
        : 'Enter LaTeX for the equation.');
    }
    applyCommandStateToChrome({
      ...commandState,
      itemKind: 'equation',
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

async function consumeComposerNemethCell(cell) {
  if (!isComposerMathAuthoring()) return;
  const editor = elements['composer-source'];
  const result = (cell === ' ' || cell === '⠀')
    ? applyNemethBoundary(replacementSession, 'space')
    : applyNemethCell(replacementSession, cell);
  replacementSession = result.session;
  if (result.status === 'applied') {
    replacementHasContent = true;
    editor.value = '';
    draft.source = '';
    clearComposerNemethChoices();
    setComposerMathStatus(`Draft updated: ${result.announcement}`);
    editor.removeAttribute('aria-invalid');
    setFieldError(editor, elements['composer-error']);
    await renderComposerDraftPreview();
    editor.focus();
  } else if (result.status === 'pending' || result.status === 'choice') {
    const prefix = replacementSession.nemethState?.prefix || '';
    editor.value = prefix;
    draft.source = prefix;
    editor.setSelectionRange(prefix.length, prefix.length);
    setComposerMathStatus(result.announcement);
    editor.removeAttribute('aria-invalid');
    setFieldError(editor, elements['composer-error']);
    if (result.status === 'choice') {
      renderComposerNemethChoices(
        result.choices,
        result.inputState?.prefix ?? replacementSession.nemethState?.prefix ?? ''
      );
    }
    else clearComposerNemethChoices();
  } else {
    editor.value = replacementSession.nemethState?.prefix || '';
    draft.source = editor.value;
    clearComposerNemethChoices();
    setFieldError(editor, elements['composer-error'], result.announcement);
    editor.setAttribute('aria-invalid', 'true');
  }
  syncCommandContentEmpty();
}

async function chooseComposerNemethOperation(event) {
  const button = event.target.closest?.('.replacement-choice');
  if (!button || !isComposerMathAuthoring()) return;
  const previousDraftMathML = replacementSession.draft.mathml;
  const previousInputState = structuredClone(replacementSession.nemethState);
  const result = applyNemethChoice(replacementSession, button.dataset.operationId);
  replacementSession = result.session;
  const committedChoice = result.status === 'applied' ||
    (result.status === 'pending' && (
      result.document?.mathml !== previousDraftMathML ||
      JSON.stringify(result.inputState) !== JSON.stringify(previousInputState)
    ));
  if (!committedChoice) {
    setComposerMathStatus(result.announcement);
    return;
  }
  clearComposerNemethChoices();
  const editor = elements['composer-source'];
  if (result.status === 'applied') replacementHasContent = true;
  editor.value = result.status === 'pending' ? (replacementSession.nemethState.prefix || '') : '';
  draft.source = editor.value;
  if (result.status === 'choice') {
    renderComposerNemethChoices(
      result.choices,
      result.inputState?.prefix ?? replacementSession.nemethState?.prefix ?? ''
    );
  }
  setComposerMathStatus(`Draft updated: ${result.announcement}`);
  syncCommandContentEmpty();
  await renderComposerDraftPreview();
  editor.focus();
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
  const knownPrefix = replacementSession.nemethState?.prefix || '';
  const visible = editor.value;
  const suffix = knownPrefix && visible.startsWith(knownPrefix)
    ? visible.slice(knownPrefix.length)
    : visible;
  const cells = [...suffix];
  composerMathInputProcessing = composerMathInputProcessing.then(async () => {
    for (const cell of cells) await consumeComposerNemethCell(cell);
    if (!cells.length && replacementSession?.nemethState?.prefix) {
      const prefix = replacementSession.nemethState.prefix;
      editor.value = prefix;
      draft.source = prefix;
      editor.setSelectionRange(prefix.length, prefix.length);
    }
  }).catch((error) => {
    console.error('Nemeth composer input failed', error);
  });
  await composerMathInputProcessing;
}

elements['composer-source'].addEventListener('input', () => {
  if (isComposerMathAuthoring()) {
    void handleComposerMathInput();
    return;
  }
  draft.source = elements['composer-source'].value;
  syncCommandContentEmpty();
});
elements['mode-switch'].addEventListener('change', () => {
  draft.type = selectedType();
  applyCommandStateToChrome({
    ...commandState,
    itemKind: draft.type,
    equationMethod: draft.type === 'equation' ? preferredAuthoringMethod : commandState.equationMethod,
    contentEmpty: draft.type === 'equation' ? true : !(elements['composer-source']?.value ?? '').trim()
  });
  if (draft.type === 'equation') {
    draft.source = '';
    elements['composer-source'].value = '';
    ensureComposerMathSession();
  } else {
    clearComposerMathSession();
  }
  if (mode === 'add' || mode === 'edit') renderComposer();
});

elements['composer-source'].addEventListener('keydown', (event) => {
  if (commandState.interaction === 'command') return;

  if (isComposerMathAuthoring() && replacementSession?.method === 'nemeth') {
    if (
      event.key.length === 1 &&
      !event.metaKey && !event.ctrlKey && !event.altKey
    ) {
      if (!isAllowedNemethCellInput(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        elements['composer-source'].setAttribute('aria-invalid', 'true');
        setFieldError(
          elements['composer-source'],
          elements['composer-error'],
          'Nemeth mode accepts braille cells only. Switch to LaTeX with x in Command mode while the draft is empty, or enter cells.'
        );
        return;
      }
      elements['composer-source'].removeAttribute('aria-invalid');
      setFieldError(elements['composer-source'], elements['composer-error']);
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      composerMathInputProcessing = composerMathInputProcessing.catch(() => {}).then(async () => {
        if (!isComposerMathAuthoring()) return;
        const result = undoNemethStep(replacementSession);
        replacementSession = result.session;
        const prefix = result.session.nemethState?.prefix || '';
        elements['composer-source'].value = prefix;
        draft.source = prefix;
        elements['composer-source'].setSelectionRange(prefix.length, prefix.length);
        clearComposerNemethChoices();
        setComposerMathStatus(result.announcement);
        elements['composer-source'].toggleAttribute('aria-invalid', result.status === 'rejected');
        if (result.status === 'undone') {
          replacementHasContent = replacementSessionHasDraftMath(replacementSession) || Boolean(prefix);
          await renderComposerDraftPreview();
        }
        syncCommandContentEmpty();
        elements['composer-source'].focus();
      });
      return;
    }
  }

  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submitComposer();
  }
});

elements['composer-choices']?.addEventListener('click', (event) => {
  void chooseComposerNemethOperation(event);
});

{
  // Composer UEB six-key is scoped to text Insert. Nemeth equation Insert gets
  // its own six-key emitter into #composer-source (same pattern as the dock).
  const composerUebSixKey = createSixKeyInput({
    emit: (cell) => {
      uebCellChain = uebCellChain.then(() => handleComposerUebCell(cell)).catch(() => {});
    }
  });
  const composerNemethSixKey = createSixKeyInput({
    emit: (cell) => {
      const editor = elements['composer-source'];
      const start = editor.selectionStart ?? editor.value.length;
      const end = editor.selectionEnd ?? start;
      editor.setRangeText(cell, start, end, 'end');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  elements['composer-source'].addEventListener('keydown', (event) => {
    if (!globalThis.__omniyaBrailleSimulation) return;
    if (commandState.interaction === 'command') return;
    if (isComposerMathAuthoring() && replacementSession?.method === 'nemeth') {
      composerNemethSixKey.keydown(event);
      return;
    }
    if (!composerIsTextInsert()) return;
    if (event.key === ' ' && uebBuffer.pending) {
      event.preventDefault();
      uebCellChain = uebCellChain.then(() => handleComposerUebCell(' ')).catch(() => {});
      return;
    }
    composerUebSixKey.keydown(event);
  });
  elements['composer-source'].addEventListener('keyup', (event) => {
    if (!globalThis.__omniyaBrailleSimulation) return;
    if (isComposerMathAuthoring() && replacementSession?.method === 'nemeth') {
      composerNemethSixKey.keyup(event);
      return;
    }
    if (!composerIsTextInsert()) return;
    composerUebSixKey.keyup(event);
  });
  elements['composer-source'].addEventListener('blur', () => {
    composerUebSixKey.blur();
    composerNemethSixKey.blur();
  });
}

elements['composer-form'].addEventListener('submit', (event) => {
  event.preventDefault();
  void submitComposer({ allowAtomicSubmit: true });
});

// Command-mode keys must keep working when focus leaves the composer/replacement
// field (e.g. s in Command mode → #mode-panel). Replacement textarea has its own
// keyHandler; skip it here to avoid double-handling.
document.addEventListener('keydown', (event) => {
  const inReplacement = Boolean(replacementSession) && !elements['replacement-dock']?.hidden;
  if (mode !== 'add' && mode !== 'edit' && !inReplacement) return;
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
  state = selectItem(state, article.dataset.itemId);
  renderTranscript();
  focusSelectedArticle();
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

// Test-only hook: open composer math-replace on a new empty equation (subtree e2es).
// Product submit never calls this — new equations commit from #composer-source.
globalThis.__omniyaTesting = {
  async openNewEquationDock() {
    if (!activeNapkin()) return;
    if (mode === 'add' || mode === 'edit') {
      clearComposerMathSession();
      resetDraft();
      mode = 'read';
      editingItemId = null;
      commandState = createCommandState({ itemKind: 'text', contentEmpty: true });
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
