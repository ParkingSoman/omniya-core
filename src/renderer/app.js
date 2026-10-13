import {
  createNapkin,
  deleteNapkin,
  switchNapkin,
  withDoc
} from '../domain/model.js';
import { docPlainText, docSnippet, docWithTitle, emptyDoc, nameFromDoc } from '../domain/document.js';
import { captureExplorerFocus, restoreExplorerFocus } from './math-explorer-bridge.js';
import { attachInputCapture } from './input-capture.js';
import { createInputLog } from './input-log.js';
import { attachRoving } from './roving.js';
import { formatInputDiagnostics } from './input-diagnostics.js';
import {
  cancelReplacement,
  setLatexSource,
  setNemethSource,
  setReplacementMethod,
  startReplacementSession,
  submitReplacement,
  previewDraftMathML,
  replacementSessionHasDraftMath
} from '../domain/replacement-session.js';
import {
  createAuthoringState,
  enterEquationSurface,
  formatStatus
} from '../domain/authoring-state.js';
import { classifyNemethInput, nemethStatusMessage } from '../domain/nemeth-input.js';
import { clearMathWithin, createNapkinEditor, renderMathInto, waitForSpeechLabel } from './editor/editor.bundle.js';

// The napkin body is one document, edited like a word processor: type, undo,
// redo, select. Equations are inline atoms in that document. Writing or
// replacing an equation uses the equation dock below it, which takes Nemeth
// cells or LaTeX. Reading an equation by parts uses MathJax's explorer inside
// the equation. See docs/word-editor.md.
//
// Nemeth authoring is a BATCH parse: the dock field accumulates braille cells,
// `classifyNemethInput` reads the whole buffer on every keystroke for a live
// status, and submit runs the same cells through `parseNemeth` inside
// `submitReplacement`. There is no incremental engine and no disambiguation
// prompt -- the parser resolves ambiguity from context (see
// docs/nemeth-v2/INTERFACES.md section 9). Nemeth- and LaTeX-authored
// equations go through one converter, so identical mathematics reads
// identically however it was typed.

const elements = Object.fromEntries([
  'app-shell', 'announcer', 'napkin-list', 'new-napkin-button', 'no-note-title', 'note-date', 'note-search', 'note-search-status',
  'mode-panel', 'save-status', 'document-section', 'empty-message', 'editor-host',
  'undo-button', 'redo-button', 'insert-equation-button', 'insert-equation-key', 
  'delete-button', 'skip-to-note', 'status-hint',
  'find-bar', 'find-input', 'find-count', 'find-previous', 'find-next', 'find-close', 'find-button',
  'export-button', 'export-dialog', 'export-heading', 'export-html', 'export-latex', 'export-text', 'export-print', 'close-export',
  'keyboard-help-button', 'keyboard-help', 'close-keyboard-help', 'copy-diagnostics', 'app-build-identity',
  'composer-dock', 'composer-form', 'composer-heading', 'composer-source',
  'composer-help', 'composer-status', 'composer-error', 'editing-indicator', 'composer-submit',
  'composer-cancel', 'replacement-scope', 'replacement-method',
  'equation-preview-box', 'equation-preview', 'equation-preview-text',
  'app-error', 'app-error-message', 'retry-save',
  'update-banner', 'update-banner-text', 'update-banner-action', 'update-banner-dismiss'
].map((id) => [id, document.getElementById(id)]));

const IS_MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');
// Word's own key for inserting an equation: Alt+= on Windows, Control+= on Mac.
const EQUATION_KEY = IS_MAC ? 'Control+=' : 'Alt+=';
// The heading above the page already names the note, so the text box does not repeat it.
const NOTE_TEXT_LABEL = 'Note text';

let state;
let editor = null;
// The napkin whose document is loaded in the editor. Edits are committed to it,
// not to whichever napkin happens to be active a moment later.
let editorNapkinId = null;
let pendingDoc = null;
let docTimer;
let saveChain = Promise.resolve();
let lastEquationSelected = false;
/** `{ pos }` while an equation is being read by parts with MathJax's explorer. */
let exploring = null;
/**
 * The equation dock's session: `{ kind: 'new' | 'edit', pos, placement }`, or
 * null. `replacementSession` below is the domain object it drives.
 */
let mathSession = null;
let replacementSession = null;
let replacementHasContent = false;
let preferredAuthoringMethod = 'nemeth';
// How the Nemeth field reads input. Always 'auto': `resolveBrailleInputTable`
// works out cells-versus-computer-braille by measurement, which is sound because
// the two occupy disjoint code point ranges. There is no user setting.
const NEMETH_INPUT_MODE = 'auto';
// The reading the last classification settled on, kept only so the diagnostics
// report can say which one it was. Nothing branches on it.
let lastResolvedInputTable = 'none';
let commandState = createAuthoringState({ surface: 'text', contentEmpty: true });
let composerMathInputProcessing = Promise.resolve();
let submittingEquation = false;

function activeNapkin() {
  return state.napkins.find(({ id }) => id === state.activeNapkinId) ?? null;
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

/**
 * Show a message in the status readout and say it through the live region.
 * Cleared first, so the same message twice in a row is spoken twice.
 */
function announce(message) {
  elements['save-status'].textContent = message;
  elements['announcer'].textContent = '';
  setTimeout(() => { elements['announcer'].textContent = message; }, 50);
}

// ---- Saving ---------------------------------------------------------------

function saveState({ announce: say = true } = {}) {
  const stateToSave = structuredClone(state);
  if (say) elements['save-status'].textContent = 'Saving…';
  saveChain = saveChain
    .catch(() => {})
    .then(() => window.omniya.saveState(stateToSave))
    .then(() => {
      clearAppError();
      if (say) elements['save-status'].textContent = 'Saved';
    })
    .catch(() => {
      if (say) elements['save-status'].textContent = 'Not saved';
      showError('The napkins could not be saved locally.', { retry: true });
      throw new Error('Save failed');
    });
  return saveChain;
}

/** Move the editor's latest document into `state`. The editor is the source of truth until then. */
function commitPendingDoc() {
  clearTimeout(docTimer);
  if (!pendingDoc || !editorNapkinId) return false;
  const doc = pendingDoc;
  const id = editorNapkinId;
  pendingDoc = null;
  state = {
    ...state,
    napkins: state.napkins.map((napkin) => (napkin.id === id ? withDoc(napkin, doc) : napkin))
  };
  return true;
}

function onEditorChange(doc) {
  pendingDoc = doc;
  showLiveRow(doc);
  clearTimeout(docTimer);
  docTimer = setTimeout(() => {
    if (commitPendingDoc()) void saveState({ announce: false }).catch(() => {});
  }, 250);
  if (!elements['find-bar'].hidden && editor) renderFindCount(editor.findState());
}

/** The notes list follows the title and the first line as they are typed. */
function showLiveRow(doc) {
  const row = elements['napkin-list'].querySelector(`[data-napkin-id="${CSS.escape(editorNapkinId ?? '')}"]`);
  if (!row) return;
  const name = nameFromDoc(doc);
  row.setAttribute('aria-label', name);
  row.querySelector('.note-name').textContent = name;
  row.querySelector('.note-snippet').textContent = docSnippet(doc);
  row.querySelector('.note-when').textContent = shortWhen(new Date().toISOString());
}

/** Save now. For switching napkins, closing, and tests. */
async function flushDocument() {
  commitPendingDoc();
  await saveState({ announce: false }).catch(() => {});
}

// ---- Napkin rail ----------------------------------------------------------

/** Today shows the time, any other day the short date, as in the Apple Notes list. */
function shortWhen(iso) {
  const when = iso ? new Date(iso) : null;
  if (!when || Number.isNaN(when.valueOf())) return '';
  return when.toDateString() === new Date().toDateString()
    ? when.toLocaleTimeString([], { timeStyle: 'short' })
    : when.toLocaleDateString([], { dateStyle: 'short' });
}

// Each of these is one Tab stop, so the way to the note is the same length however
// many notes there are. Arrow keys move inside them.
attachRoving(document.getElementById('toolbar'), {
  items: 'button', keys: ['ArrowLeft', 'ArrowRight'], wrap: true
});
const noteListStop = attachRoving(elements['napkin-list'], {
  items: '[data-napkin-id]',
  keys: ['ArrowUp', 'ArrowDown'],
  // Before any note has been used, the stop is the open one.
  fallback: (buttons) => buttons.find((button) => button.getAttribute('aria-current') === 'page')
});

/** Show only the notes whose name or first lines match what is typed in the search box. */
function applyNoteFilter() {
  const query = elements['note-search'].value.trim().toLowerCase();
  let shown = 0;
  for (const button of elements['napkin-list'].querySelectorAll('[data-napkin-id]')) {
    const napkin = state.napkins.find(({ id }) => id === button.dataset.napkinId);
    const text = `${napkin?.name ?? ''} ${docPlainText(napkin?.doc)}`.toLowerCase();
    const match = !query || text.includes(query);
    button.hidden = !match;
    if (match) shown += 1;
  }
  elements['note-search-status'].textContent = query ? `${shown} ${shown === 1 ? 'note' : 'notes'} found` : '';
  noteListStop.refresh();
}

elements['note-search'].addEventListener('input', applyNoteFilter);
elements['note-search'].addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && elements['note-search'].value) {
    event.preventDefault();
    elements['note-search'].value = '';
    applyNoteFilter();
  }
});

function renderNapkins() {
  elements['napkin-list'].replaceChildren();
  for (const napkin of state.napkins) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.napkinId = napkin.id;
    // The name, and under it the first line of the note, as Apple Notes lists them.
    // The button is named by the name alone, so a screen reader does not read both.
    button.setAttribute('aria-label', napkin.name);
    const name = document.createElement('span');
    name.className = 'note-name';
    name.textContent = napkin.name;
    // Under the name, as Apple Notes shows it: when the note changed, then its first line.
    const line = document.createElement('span');
    line.className = 'note-line';
    line.setAttribute('aria-hidden', 'true');
    const when = document.createElement('span');
    when.className = 'note-when';
    when.textContent = shortWhen(napkin.updatedAt);
    const snippet = document.createElement('span');
    snippet.className = 'note-snippet';
    snippet.textContent = docSnippet(napkin.doc);
    line.append(when, snippet);
    button.append(name, line);
    if (napkin.id === state.activeNapkinId) button.setAttribute('aria-current', 'page');
    elements['napkin-list'].append(button);
  }
  applyNoteFilter();
}

function renderHeader() {
  const napkin = activeNapkin();
  elements['no-note-title'].hidden = Boolean(napkin);
  renderDate(napkin);
}

/** The day and time the note last changed, small and grey above the title, as in Apple Notes. */
function renderDate(napkin) {
  const when = napkin?.updatedAt ? new Date(napkin.updatedAt) : null;
  elements['note-date'].textContent = when && !Number.isNaN(when.valueOf())
    ? when.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })
    : '';
}

function renderAll() {
  renderNapkins();
  renderHeader();
  loadEditor();
  syncModePanel();
}

/**
 * Programmatic focus, refused while the napkin form owns the author.
 *
 * Every route the app has to move focus goes through here. The naming form is
 * the one place in this app where a stolen focus is both silent and
 * unrecoverable for someone who cannot see the screen: their typing lands in a
 * field they did not open, the name field stays empty, and the form goes on
 * asking for a name with nothing anywhere to say why. So the form is treated as
 * owning the author's attention while it is up, and nothing outside it may take
 * focus away. This deliberately does NOT trap focus -- Tab, Shift+Tab and
 * clicking still go wherever the person sends them. Only the app's own
 * unrequested focus moves are refused.
 */
function moveFocusTo(element) {
  if (!element) return false;
  element.focus();
  return true;
}

function focusEditor() {
  if (!activeNapkin() || !editor) {
    moveFocusTo(elements['new-napkin-button']);
    return;
  }
  editor.focus();
}

function focusNapkinButton(napkinId) {
  const button = elements['napkin-list'].querySelector(`[data-napkin-id="${CSS.escape(napkinId)}"]`);
  if (button) moveFocusTo(button);
  else focusEditor();
}

// ---- The editor -----------------------------------------------------------

function loadEditor() {
  const napkin = activeNapkin();
  elements['empty-message'].hidden = Boolean(napkin);
  elements['editor-host'].hidden = !napkin;
  if (!napkin) {
    editor?.destroy();
    editor = null;
    editorNapkinId = null;
    return;
  }
  if (!editor) {
    editor = createNapkinEditor({
      host: elements['editor-host'],
      doc: docWithTitle(napkin.doc, napkin.name),
      label: NOTE_TEXT_LABEL,
      placeholder: `Start writing. Press ${EQUATION_KEY} to add an equation.`,
      equationField: elements['composer-dock'],
      handlers: {
        onChange: onEditorChange,
        onStateChange: updateToolbar,
        onInsertEquation: () => applyEquationInsert(preferredAuthoringMethod),
        onEnterMath: (pos) => { void enterExplorer(pos); },
      }
    });
  } else if (editorNapkinId === napkin.id) {
    // Same napkin (a rename, say): keep the document, the caret and the undo
    // history exactly as they are.
    return;
  } else {
    editor.setDoc(docWithTitle(napkin.doc, napkin.name));
    if (!elements['find-bar'].hidden) runFind();
  }
  editorNapkinId = napkin.id;
  pendingDoc = null;
}


function syncModePanel() {
  if (elements['mode-panel']) elements['mode-panel'].textContent = formatStatus(commandState);
  updateToolbar();
}

// ---- Reading an equation by parts (MathJax explorer) -----------------------

async function captureExplorerFocusWithRetry(container) {
  let lastError;
  // Explorer focus is asynchronous when MathJax hands control back from a
  // screen reader. Give the bridge enough time to observe the same current
  // node that MathJax itself will use; never broaden a settled focus to the
  // equation root as a recovery strategy.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return captureExplorerFocus(container);
    } catch (error) {
      lastError = error;
      if (/not a MathML element/i.test(error?.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError ?? new Error('MathJax explorer focus was not available');
}

async function enterExplorer(pos) {
  const view = editor?.mathView(pos);
  if (!view) return false;
  if (exploring?.pos === pos) return true;
  // Claim the equation NOW. Getting MathJax's explorer going takes a moment, and
  // a key pressed in that gap (r, a, o, Escape, Backspace) must still reach the
  // explorer's handler below. If it fell through to the editor, a typed letter
  // would replace the selected equation. `pending` makes the handler skip its
  // "is this a text field?" guard until focus has really moved into the equation.
  const claim = { pos, pending: true, entering: null };
  exploring = claim;
  const cancelled = () => exploring !== claim;
  claim.entering = (async () => {
    await view.ready;
    // A container is not an explorer. MathJax starts the speech explorer when
    // <mjx-container> takes focus, and it can only do that once it has attached
    // <mjx-speech> underneath. Focusing it before then leaves arrow keys doing
    // nothing at all, and r, a and o addressing the whole equation instead of the
    // part the author believed they were on -- silently. Bounded, and it falls
    // through rather than refusing: an equation that renders without a speech
    // proxy must still be focusable.
    let container = null;
    for (let attempt = 0; attempt < 100 && !cancelled(); attempt += 1) {
      container = view.dom.querySelector('mjx-container');
      if (container?.querySelector('mjx-speech')) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (cancelled()) return false;
    if (!container) {
      exploring = null;
      announce('Equation is still loading.');
      return false;
    }
    view.setExploring(true);
    claim.pending = false;
    moveFocusTo(container);
    announce('Equation entered. Use arrow keys to explore it. Escape returns to the document.');
    return true;
  })();
  return claim.entering;
}

/**
 * Put the explorer back on a part of the equation at `pos`: after a replacement
 * is committed (the equation was redrawn) or cancelled. The dock had focus, and
 * hiding it leaves focus on <body>, so the container is focused first, the same
 * way `enterExplorer` does, once MathJax has attached its speech element.
 */
async function resumeExplorer(pos, target, explorerFocus = null) {
  const view = editor?.mathView(pos);
  if (!view) return;
  await view.ready;
  let container = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    container = view.dom.querySelector('mjx-container');
    if (container?.querySelector('mjx-speech')) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!exploring || exploring.pos !== pos) return;
  if (container) moveFocusTo(container);
  await restoreExplorerFocus(view.dom, target, explorerFocus);
}

/** Stop reading by parts. `refocus` puts the caret back on the equation in the document. */
function leaveExplorer({ refocus = true } = {}) {
  if (!exploring) return;
  const { pos } = exploring;
  exploring = null;
  editor?.mathView(pos)?.setExploring(false);
  if (refocus && editor) {
    try { editor.selectMath(pos); } catch { /* the equation is gone; the caret stays where it is */ }
    editor.focus();
  }
}

// Focus left the equation some other way, such as a click. The equation is
// then no longer being read, and its image name must come back.
document.addEventListener('focusin', (event) => {
  if (!exploring || !(event.target instanceof Element)) return;
  if (event.target.closest('.math-node, #composer-dock')) return;
  leaveExplorer({ refocus: false });
});

/**
 * MathJax's reading tree has stops that are not parts of the equation: the
 * invisible multiplication sign between 2 and y, an invisible function sign.
 * They have no spoken name and nothing behind them to edit, so landing on one
 * is a dead stop (and r, a, o refuse there). After an arrow key lands on one,
 * take the same step once more. Done on key release, when MathJax has moved.
 */
const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

function currentExplorerSpeech() {
  const view = exploring && editor?.mathView(exploring.pos);
  const holder = view?.holder;
  if (!holder) return undefined;
  const item = globalThis.MathJax?.startup?.document?.getMathItemsWithin?.(holder)?.[0];
  const current = item?.explorers?.speech?.current;
  if (!current) return undefined;
  return (current.getAttribute?.('data-semantic-speech-none') ?? '').trim();
}

document.addEventListener('keyup', (event) => {
  if (!exploring || exploring.pending || mathSession) return;
  if (!ARROW_KEYS.includes(event.key) || event.repeat || event.__omniyaSkip) return;
  const speech = currentExplorerSpeech();
  if (speech !== '') return; // undefined: no explorer yet. Non-empty: a real part.
  const target = document.activeElement;
  if (!(target instanceof Element) || !target.closest('.math-node')) return;
  const init = {
    key: event.key,
    code: event.code,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    bubbles: true,
    cancelable: true
  };
  const again = new KeyboardEvent('keydown', init);
  again.__omniyaSkip = true;
  target.dispatchEvent(again);
}, true);

function placementFromKey(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'r') return 'replace';
  if (key === 'a') return 'append';
  if (key === 'o') return 'prepend';
  return null;
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
  return Boolean(element.closest('input, textarea, select, #napkin-rail, dialog'));
}

// MathJax swallows unmapped keys (r) on the explorer node, so these are taken
// in the capture phase, before it can.
document.addEventListener('keydown', (event) => {
  if (!exploring) return;
  const focused = event.target instanceof Element ? event.target : document.activeElement;
  if (focused instanceof Element && focused.closest('#composer-dock')) return;
  if (!exploring.pending && typingIntoAField(focused)) return;
  const placement = placementFromKey(event);
  if (placement) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void startEquationEdit(placement);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    leaveExplorer();
    announce('Back in the document');
    return;
  }
  // Backspace deletes the equation being read. Word treats an equation as an
  // object; the document's undo brings it back.
  if (event.key === 'Backspace') {
    event.preventDefault();
    event.stopImmediatePropagation();
    const { pos } = exploring;
    leaveExplorer({ refocus: false });
    editor.deleteMath(pos);
    announce('Equation deleted. Undo puts it back.');
    return;
  }
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.stopImmediatePropagation();
    leaveExplorer({ refocus: false });
    if (event.shiftKey) editor.redo(); else editor.undo();
    editor.focus();
    announce(event.shiftKey ? 'Redid the last change' : 'Undid the last change');
  }
}, true);

// ---- The equation dock ----------------------------------------------------

function placementVerb(placement) {
  if (placement === 'append') return 'Appending after';
  if (placement === 'prepend') return 'Prepending before';
  return 'Replacing';
}

function setComposerMathStatus(message) {
  elements['composer-status'].textContent = message ?? '';
}

function setMethodRadios(method) {
  elements['replacement-method']?.querySelectorAll('input').forEach((input) => {
    input.checked = input.value === method;
  });
}

function styleField(method) {
  elements['composer-source'].className = method === 'nemeth' ? 'nemeth-inline-editor' : 'latex-inline-editor';
}

function methodPrompt(method) {
  return method === 'nemeth'
    ? 'Enter Nemeth cells. Enter reads the whole expression.'
    : 'Enter LaTeX for the equation.';
}

function replacementDraftIsEmpty() {
  if (!replacementSession) return true;
  if (replacementHasContent) return false;
  if (replacementSession.method === 'latex') {
    return !String(replacementSession.latexSource ?? '').trim();
  }
  if (String(replacementSession.nemethSource ?? '').trim()) return false;
  if (replacementSessionHasDraftMath(replacementSession)) return false;
  return !(elements['composer-source']?.value ?? '').trim();
}

// ---- Equation preview -----------------------------------------------------

// While the person types, the draft is drawn under the field, and its spoken form
// is kept in a hidden line the field points at. Someone typing LaTeX can then hear
// what it means before inserting it. It is not announced as it changes: a braille
// typist already hears a line per keystroke, and this would talk over it.
let previewTimer;
let previewRun = 0;
elements['equation-preview-box'].inert = true;

function clearPreview() {
  clearTimeout(previewTimer);
  previewRun += 1;
  clearMathWithin(elements['equation-preview']);
  elements['equation-preview'].replaceChildren();
  elements['equation-preview-box'].hidden = true;
  elements['equation-preview-text'].textContent = '';
}

function schedulePreview() {
  clearTimeout(previewTimer);
  if (replacementDraftIsEmpty()) {
    clearPreview();
    return;
  }
  previewTimer = setTimeout(() => void updatePreview(), 350);
}

async function updatePreview() {
  const run = ++previewRun;
  const session = replacementSession;
  if (!session) return;
  const stale = () => run !== previewRun;
  let mathml;
  try {
    mathml = await previewDraftMathML(session, {
      convertLatexToMathML: async (latex) => {
        const converted = await window.omniya.latexToMathML(latex);
        return converted?.mathml ?? converted;
      },
      brailleInputTable: NEMETH_INPUT_MODE
    });
  } catch {
    // An unfinished draft is the normal state while typing. Show nothing yet.
    if (!stale()) {
      elements['equation-preview-box'].hidden = true;
      elements['equation-preview-text'].textContent = '';
    }
    return;
  }
  if (stale()) return;
  clearMathWithin(elements['equation-preview']);
  const drawn = await renderMathInto(elements['equation-preview'], mathml, { isStale: stale });
  if (stale() || !drawn) return;
  elements['equation-preview-box'].hidden = false;
  const label = await waitForSpeechLabel(elements['equation-preview'], { timeoutMs: 4000, isStale: stale });
  if (!stale()) elements['equation-preview-text'].textContent = label ? `Reads as: ${label}` : '';
}

function syncCommandContentEmpty() {
  commandState = { ...commandState, contentEmpty: replacementDraftIsEmpty() };
  // Repaint, don't just record. #mode-panel is the state readout a braille
  // reader queries when they want to know where they are, so a stale one is not
  // cosmetic.
  syncModePanel();  schedulePreview();
}

function openDock({ heading, submit, indicator, scope }) {
  elements['composer-heading'].textContent = heading;
  elements['composer-submit'].textContent = submit;
  elements['editing-indicator'].textContent = indicator;
  elements['replacement-scope'].textContent = scope;
  elements['composer-dock'].hidden = false;
  // The field sits in the line: after the caret for a new equation, right after
  // the equation being edited otherwise.
  const editing = mathSession?.kind === 'edit' ? editor.mathNode(mathSession.pos) : null;
  editor.showEquationField(editing ? mathSession.pos + editing.nodeSize : null);
  elements['composer-source'].value = '';
  setFieldError(elements['composer-source'], elements['composer-error']);
  styleField(replacementSession.method);
  setMethodRadios(replacementSession.method);
  setComposerMathStatus(methodPrompt(replacementSession.method));
  syncModePanel();
  moveFocusTo(elements['composer-source']);
}

function closeDock() {
  mathSession = null;
  replacementSession = null;
  replacementHasContent = false;
  composerMathInputProcessing = Promise.resolve();
  commandState = createAuthoringState({ surface: 'text', contentEmpty: true, uebGrade: commandState.uebGrade });
  elements['composer-dock'].hidden = true;
  editor?.hideEquationField();
  elements['composer-source'].value = '';
  elements['replacement-scope'].textContent = '';
  setComposerMathStatus('');
  setFieldError(elements['composer-source'], elements['composer-error']);
  clearPreview();
  syncModePanel();
}

/** Insert-equation chord, menu item, or Ctrl+E / Ctrl+L inside the dock. */
function applyEquationInsert(method) {
  if (!activeNapkin() || !editor) return;
  if (mathSession) {
    // An empty dock may change method. One with content may not, because that
    // would drop what was typed.
    if (replacementDraftIsEmpty()) applyReplacementMethod(method);
    return;
  }
  startEquation(method);
}

function startEquation(method) {
  preferredAuthoringMethod = method;
  leaveExplorer({ refocus: false });
  mathSession = { kind: 'new', pos: null, placement: 'insert' };
  replacementSession = startReplacementSession({
    document: null,
    // A brand-new equation has no original document to place into, so this
    // target only needs to satisfy startReplacementSession's shape check.
    target: { kind: 'node', nodeId: `omniya-${globalThis.crypto.randomUUID()}` },
    method
  });
  replacementSession.isNew = true;
  replacementHasContent = false;
  commandState = enterEquationSurface(createAuthoringState({ surface: 'text', contentEmpty: true }), method).state;
  openDock({ heading: 'Equation', submit: 'Insert', indicator: '', scope: '' });
}

/** r, a, or o on an equation being read: replace the focused part, or insert beside it. */
async function startEquationEdit(placement) {
  if (!exploring || mathSession || !editor) return;
  // r can arrive while the explorer is still starting. Let it finish first.
  const claim = exploring;
  if (claim.pending) await claim.entering;
  if (exploring !== claim) return;
  const { pos } = exploring;
  const view = editor.mathView(pos);
  const node = editor.mathNode(pos);
  if (!view || !node) return;
  let focus;
  try {
    focus = await captureExplorerFocusWithRetry(view.dom);
  } catch {
    announce('Nothing here to edit. Move to a number, letter or sign, then try again.');
    return;
  }
  if (!focus?.target) return;
  // On a spot that is not part of the equation (the invisible "times" between two
  // brackets) there is nothing to replace or to put something before. Whatever the
  // key, what is typed goes in after the part just before the spot.
  const how = focus.gap ? 'append' : placement;
  mathSession = { kind: 'edit', pos, placement: how };
  replacementSession = startReplacementSession({
    document: { formatVersion: 2, mathml: node.attrs.mathml, focus: null },
    target: focus.target,
    explorerFocus: focus,
    method: preferredAuthoringMethod,
    placement: how
  });
  replacementSession.isNew = false;
  replacementHasContent = false;
  const scopeLabel = focus.speech || 'selection';
  commandState = createAuthoringState({
    surface: 'equation',
    equationMethod: preferredAuthoringMethod,
    contentEmpty: true,
    replaceScopeLabel: scopeLabel,
    placement: how
  });
  openDock({
    heading: focus.gap ? `Inserting at: ${scopeLabel}` : `${placementVerb(how)}: ${scopeLabel}`,
    submit: how === 'replace' ? 'Replace' : 'Insert',
    indicator: 'Escape cancels without changing the equation.',
    scope: focus.speech ? `Selected: ${focus.speech}` : 'Selected mathematical scope'
  });
}

function applyReplacementMethod(method) {
  if (!replacementSession) return;
  try {
    replacementSession = setReplacementMethod(replacementSession, method);
    preferredAuthoringMethod = method;
    commandState = { ...commandState, equationMethod: method };
    elements['composer-source'].value = '';
    styleField(method);
    setMethodRadios(method);
    setFieldError(elements['composer-source'], elements['composer-error']);
    setComposerMathStatus(methodPrompt(method));
    syncCommandContentEmpty();
  } catch (error) {
    setMethodRadios(replacementSession.method);
    setFieldError(elements['composer-source'], elements['composer-error'], error.message);
  }
}

elements['replacement-method'].addEventListener('change', () => {
  if (!replacementSession) return;
  applyReplacementMethod(elements['replacement-method'].querySelector('input:checked')?.value);
});

/** Close the dock without changing anything. */
function cancelEquation() {
  if (!mathSession) return;
  // An Enter-triggered commit is still awaiting its MathML conversion. Tearing
  // the session down now would orphan that in-flight commit: it would resume
  // with no session, throw, and silently discard already-converted input.
  // Swallow Escape until the commit settles instead.
  if (submittingEquation) return;
  const session = mathSession;
  const replacement = replacementSession;
  if (replacement) cancelReplacement(replacement);
  closeDock();
  if (session.kind === 'edit' && exploring) {
    if (replacement?.target) void resumeExplorer(session.pos, replacement.target, replacement.originalExplorerFocus);
    announce('Replacement cancelled');
    return;
  }
  focusEditor();
  announce('Equation cancelled');
}

async function handleComposerMathInput() {
  if (!replacementSession) return;
  const field = elements['composer-source'];
  if (replacementSession.method === 'latex') {
    replacementSession = setLatexSource(replacementSession, field.value);
    syncCommandContentEmpty();
    return;
  }
  // Nemeth. The field IS the cell accumulator: braille cells go in exactly as
  // typed and the whole buffer is re-read on every keystroke. It is NOT routed
  // through `pushUebCell` -- that buffer flushes on U+2800 because in UEB a
  // space ends a word, whereas in Nemeth the same cell is a token (Rule 20/21
  // comparison spacing). Feeding Nemeth through it would truncate every
  // expression at its first space.
  //
  // The status never says "unsupported" -- see src/domain/nemeth-input.js for
  // why that is not knowable mid-buffer. Only submit says it, and by then it is
  // true. So an unfinished expression does NOT put the field into the error
  // state: not-yet-complete is the normal condition while typing.
  let classification;
  try {
    classification = classifyNemethInput(field.value, { brailleInputTable: NEMETH_INPUT_MODE });
    lastResolvedInputTable = classification.inputTable ?? 'none';
  } catch (error) {
    // classifyNemethInput rethrows anything that is not a refusal, because that
    // would be a parser bug rather than an unsupported construct. Surface it
    // instead of leaving the author typing into a field that stopped reading.
    setFieldError(field, elements['composer-error'], `Nemeth reader failed: ${error.message}`);
    setComposerMathStatus(`Nemeth reader failed: ${error.message}`);
    return;
  }

  if (classification.rejected.length) {
    // QWERTY stays gated. Strip the characters that are not cells and keep the
    // ones that are, and say so, because a silent drop is unreadable to a
    // screen reader.
    const message = nemethStatusMessage(classification);
    field.value = classification.cells;
    setFieldError(field, elements['composer-error'], message);
    setComposerMathStatus(message);
    replacementSession = setNemethSource(replacementSession, classification.cells);
    syncCommandContentEmpty();
    return;
  }

  // Keep the DECODED cells, not the characters that produced them. With an
  // input table on, a braille keyboard sends computer-braille ASCII and
  // `classification.cells` is what it means. Decoding is one cell per character,
  // so caret offsets survive unchanged -- but restore them explicitly, and skip
  // the write when nothing decoded, so an untouched field never churns its
  // value under a screen reader.
  if (classification.cells !== field.value) {
    const start = field.selectionStart;
    const end = field.selectionEnd;
    field.value = classification.cells;
    if (start !== null && end !== null) field.setSelectionRange(start, end);
  }
  replacementSession = setNemethSource(replacementSession, classification.cells);
  setFieldError(field, elements['composer-error']);
  setComposerMathStatus(nemethStatusMessage(classification));
  syncCommandContentEmpty();
}

/**
 * Put the commit verdict into the same log the keystrokes went into.
 *
 * `input-capture.js` observes the field from the DOM. Accepted-or-refused is
 * only knowable here, so it is recorded here. Nemeth only: this report is the
 * braille input path, and a LaTeX commit in it is noise for the person reading
 * it back with a screen reader. In memory, capped, and it leaves the process
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

async function submitEquation() {
  if (!mathSession || !replacementSession || !editor) return;
  if (submittingEquation) return;
  submittingEquation = true;
  const field = elements['composer-source'];
  setFieldError(field, elements['composer-error']);
  // Snapshot before anything can clear the field: this is the exact buffer the
  // verdict recorded below applies to.
  const submittedBuffer = field.value;
  try {
    await composerMathInputProcessing;
    if (replacementSession.method === 'latex') {
      replacementSession = setLatexSource(replacementSession, field.value);
    } else {
      // Commit whatever is in the field, unconditionally. The live status is
      // only ever a progress report; this is the moment the parser's verdict
      // becomes authoritative, and submitReplacement either yields LaTeX or
      // throws NemethUnsupportedError, whose message is the single
      // product-approved sentence.
      replacementSession = setNemethSource(replacementSession, field.value);
    }
    if (replacementDraftIsEmpty()) {
      const emptyMessage = mathSession.kind === 'edit'
        ? 'Replacement draft is empty or incomplete.'
        : 'Enter Nemeth or LaTeX';
      setFieldError(field, elements['composer-error'], emptyMessage);
      setComposerMathStatus(emptyMessage);
      moveFocusTo(field);
      return;
    }
    const result = await submitReplacement(replacementSession, {
      convertLatexToMathML: async (latex) => {
        const converted = await window.omniya.latexToMathML(latex);
        return converted?.mathml ?? converted;
      },
      // Must be the same table the field classified with, or submit disagrees
      // with the status line the author just heard.
      brailleInputTable: NEMETH_INPUT_MODE
    });
    recordNemethCommit('accepted', submittedBuffer);
    const session = mathSession;
    const method = replacementSession.method;
    if (session.kind === 'edit') {
      // The edit was written back as one LaTeX expression and read again, so that
      // expression is the equation's source now. If it could not be rebuilt, no
      // source is kept, because what was typed is only a part of the equation.
      const existing = editor.mathNode(session.pos);
      editor.updateMath(session.pos, {
        mathml: result.document.mathml,
        source: result.latex ?? '',
        sourceKind: result.latex ? 'latex' : (existing?.attrs.sourceKind ?? method)
      });
      const focus = result.focus;
      closeDock();
      announce('Replacement committed');
      if (focus) await resumeExplorer(session.pos, focus);
    } else {
      editor.insertMath({ mathml: result.document.mathml, source: submittedBuffer, sourceKind: method });
      closeDock();
      announce('Equation inserted');
    }
  } catch (error) {
    // `userMessage` is the single product sentence for every refusal except the
    // few whose call site could name what is missing in plain words -- see
    // `src/domain/nemeth/errors.js`. A non-Nemeth error has none, so it falls
    // back to its own message.
    const shown = error.userMessage ?? error.message;
    recordNemethCommit('refused', submittedBuffer, shown);
    setFieldError(field, elements['composer-error'], shown);
    setComposerMathStatus(shown);
    field.setAttribute('aria-invalid', 'true');
    moveFocusTo(field);
  } finally {
    submittingEquation = false;
  }
}

elements['composer-source'].addEventListener('input', () => { void handleComposerMathInput(); });

elements['composer-source'].addEventListener('keydown', (event) => {
  const chord = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (chord && !event.altKey && (key === 'e' || key === 'l')) {
    event.preventDefault();
    event.stopPropagation();
    applyEquationInsert(key === 'l' ? 'latex' : 'nemeth');
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    cancelEquation();
    return;
  }
  // Nemeth cells and Backspace go straight into the field; it is an ordinary
  // text buffer that happens to hold braille, so the platform's own editing is
  // the editing model, and it is the one a screen reader already knows how to
  // narrate.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submitEquation();
  }
});

elements['composer-form'].addEventListener('submit', (event) => {
  event.preventDefault();
  void submitEquation();
});
elements['composer-cancel'].addEventListener('click', () => cancelEquation());

// ---- Toolbar --------------------------------------------------------------

// The buttons are plain, labelled and in the tab order. A button that has
// nothing to do is marked aria-disabled, not disabled: a disabled button that
// has focus drops focus to the page, and a person pressing Undo until it runs
// out must not lose their place.
function setActionEnabled(button, enabled) {
  button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function updateToolbar(history = editor?.historyState?.() ?? { canUndo: false, canRedo: false }) {
  if (history.equationSelected !== undefined) lastEquationSelected = history.equationSelected;
  elements['status-hint'].textContent = lastEquationSelected && !mathSession && !exploring
    ? 'Equation selected. Enter reads it by parts. Backspace deletes it.'
    : '';
  const hasNote = Boolean(activeNapkin()) && Boolean(editor);
  const idle = hasNote && !mathSession;
  setActionEnabled(elements['undo-button'], idle && history.canUndo);
  setActionEnabled(elements['redo-button'], idle && history.canRedo);
  setActionEnabled(elements['insert-equation-button'], hasNote);
  setActionEnabled(elements['find-button'], hasNote);
  setActionEnabled(elements['export-button'], Boolean(activeNapkin()));
  setActionEnabled(elements['delete-button'], Boolean(activeNapkin()));
}


function onToolbarClick(id, action) {
  elements[id].addEventListener('click', () => {
    if (elements[id].getAttribute('aria-disabled') === 'true') return;
    action();
  });
}

elements['insert-equation-key'].textContent = EQUATION_KEY;

// Tooltips for the icon-only toolbar: what it does, and its key on this computer.
const MOD = IS_MAC ? 'Cmd' : 'Ctrl';
const TOOLTIPS = {
  'undo-button': `Undo (${MOD}+Z)`,
  'redo-button': `Redo (${IS_MAC ? 'Cmd+Shift+Z' : 'Ctrl+Y'})`,
  'insert-equation-button': `Insert equation (${EQUATION_KEY})`,
  'find-button': `Find in note (${MOD}+F)`,
  'delete-button': 'Delete note',
  'export-button': 'Export or print',
  'keyboard-help-button': 'Keyboard shortcuts',
  'new-napkin-button': `New note (${MOD}+N)`
};
for (const [id, text] of Object.entries(TOOLTIPS)) elements[id].title = text;
document.documentElement.dataset.platform = IS_MAC ? 'mac' : 'win';
elements['skip-to-note'].addEventListener('click', () => focusEditor());

// Double-click an equation to read it by parts, as Enter does. The first click
// of the pair has already selected it.
elements['editor-host'].addEventListener('dblclick', (event) => {
  const target = event.target instanceof Element ? event.target.closest('.math-node') : null;
  if (!target || !editor) return;
  // Normally the first click has selected it. If it did not, select the one under the pointer.
  let selected = editor.selectedMath();
  if (!selected) {
    try { editor.selectMath(editor.view.posAtDOM(target, 0)); } catch { return; }
    selected = editor.selectedMath();
  }
  if (selected) void enterExplorer(selected.pos);
});
onToolbarClick('undo-button', () => performHistory('undo'));
onToolbarClick('redo-button', () => performHistory('redo'));
onToolbarClick('insert-equation-button', () => applyEquationInsert(preferredAuthoringMethod));
onToolbarClick('find-button', () => openFind());
onToolbarClick('export-button', () => openExport());
onToolbarClick('delete-button', () => { void deleteFocusedNapkin(state.activeNapkinId); });

// ---- Find in note ---------------------------------------------------------

function renderFindCount(found) {
  elements['find-count'].textContent = !found.query
    ? ''
    : found.count === 0 ? 'No matches' : `${found.index + 1} of ${found.count}`;
}

function runFind() {
  if (editor) renderFindCount(editor.setFind(elements['find-input'].value));
}

function openFind() {
  if (!editor) return;
  if (mathSession) {
    announce('Finish or cancel the equation first.');
    return;
  }
  leaveExplorer({ refocus: false });
  const selected = editor.selectedText();
  elements['find-bar'].hidden = false;
  if (selected) elements['find-input'].value = selected;
  moveFocusTo(elements['find-input']);
  elements['find-input'].select();
  runFind();
}

function stepFind(delta) {
  if (elements['find-bar'].hidden) {
    openFind();
    return;
  }
  if (editor) renderFindCount(editor.findStep(delta));
}

/** Close the bar. The current match stays selected, so the caret is where the search ended. */
function closeFind() {
  if (elements['find-bar'].hidden) return;
  elements['find-bar'].hidden = true;
  elements['find-count'].textContent = '';
  editor?.clearFind();
  focusEditor();
}

elements['find-input'].addEventListener('input', runFind);
elements['find-input'].addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    stepFind(event.shiftKey ? -1 : 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeFind();
  }
});
elements['find-previous'].addEventListener('click', () => stepFind(-1));
elements['find-next'].addEventListener('click', () => stepFind(1));
elements['find-close'].addEventListener('click', closeFind);

// The page also takes Ctrl/Cmd+F itself, for platforms and tests where the menu's
// accelerator does not reach it.
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    openFind();
  }
}, true);

// ---- Export and print -----------------------------------------------------

function openExport() {
  if (!activeNapkin()) return;
  commitPendingDoc();
  const box = elements['export-dialog'];
  if (typeof box.showModal === 'function') box.showModal();
  else box.hidden = false;
  box.scrollTop = 0;
  elements['export-heading'].focus();
}

function closeExport() {
  const box = elements['export-dialog'];
  if (box.open && typeof box.close === 'function') box.close();
  elements['export-button'].focus();
}

async function exportAs(format) {
  commitPendingDoc();
  const napkin = activeNapkin();
  if (!napkin) return;
  closeExport();
  try {
    const result = await window.omniya.exportNote({ format, name: napkin.name, doc: napkin.doc });
    announce(result.saved ? `Exported as ${result.fileName}` : 'Export cancelled');
  } catch {
    announce('The note could not be exported.');
  }
}

async function printNote() {
  if (!activeNapkin()) return;
  commitPendingDoc();
  leaveExplorer({ refocus: false });
  closeExport();
  try {
    await window.omniya.printNote();
  } catch {
    announce('The note could not be printed.');
  }
}

elements['export-html'].addEventListener('click', () => void exportAs('html'));
elements['export-latex'].addEventListener('click', () => void exportAs('latex'));
elements['export-text'].addEventListener('click', () => void exportAs('text'));
elements['export-print'].addEventListener('click', () => void printNote());
elements['close-export'].addEventListener('click', closeExport);

// ---- Napkin rail handlers -------------------------------------------------

async function deleteFocusedNapkin(napkinId) {
  if (mathSession) return;
  // A title typed a moment ago is not saved to the note until the pending edit is
  // committed, and the question must name the note as it is now.
  commitPendingDoc();
  const napkin = state.napkins.find(({ id }) => id === napkinId);
  if (!napkin) return;
  if (!globalThis.confirm(`Delete the note “${napkin.name}”? This cannot be undone.`)) return;

  leaveExplorer({ refocus: false });
  const index = state.napkins.findIndex(({ id }) => id === napkinId);
  const remaining = state.napkins.filter(({ id }) => id !== napkinId);
  const focusId = remaining[index]?.id ?? remaining[index - 1]?.id;
  state = deleteNapkin(state, napkinId);
  renderAll();
  focusNapkinButton(focusId ?? state.activeNapkinId);
  elements['save-status'].textContent = `Deleted ${napkin.name}`;
  await saveState().catch(() => {});
}

/** Put the caret in the note's title with the name selected, ready to type over. */
function focusTitle() {
  editor?.focusTitle();
}

elements['new-napkin-button'].addEventListener('click', async () => {
  cancelEquation();
  commitPendingDoc();
  leaveExplorer({ refocus: false });
  state = createNapkin(state, 'Untitled note');
  renderAll();
  focusTitle();
  elements['save-status'].textContent = 'New note';
  await saveState().catch(() => {});
});

elements['napkin-list'].addEventListener('click', async (event) => {
  const button = event.target.closest('[data-napkin-id]');
  if (!button) return;
  cancelEquation();
  if (mathSession) return;
  commitPendingDoc();
  leaveExplorer({ refocus: false });
  state = switchNapkin(state, button.dataset.napkinId);
  renderAll();
  elements['save-status'].textContent = `Opened ${activeNapkin().name}`;
  focusEditor();
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
    // Rename is typing in the title. Open the note and put the caret there.
    button.click();
    queueMicrotask(() => setTimeout(focusTitle, 0));
  }
});

// ---- Diagnostics, help, menu, updates -------------------------------------

// Input capture: silent, in-memory, capped. Feeds the diagnostics dump; renders
// nothing on its own.
const inputLog = createInputLog();
attachInputCapture({ document, log: inputLog, readTable: () => lastResolvedInputTable });

/**
 * The single dev-tools switch: `npm run start:dev`, unpackaged builds only.
 * See `createWindow` in src/main.js for the three conditions behind it. The
 * visible inspector lives in a directory excluded from packaged builds, so this
 * import resolves to nothing in a shipped app. Dynamic and catch-swallowed for
 * exactly that reason.
 */
if (window.omniya?.appInfo?.devTools) {
  import('./dev/index.js')
    .then((mod) => mod.enableDevTools({ document, log: inputLog }))
    .catch(() => {});
}

/**
 * Copy the braille-input report to the clipboard, then say so.
 *
 * Only ever runs from the Help menu -- a person asking for it. Clipboard, not a
 * file and not the network: the app has no telemetry and this must not become
 * the exception.
 */
async function copyInputDiagnostics() {
  try {
    const report = formatInputDiagnostics({
      appInfo: window.omniya?.appInfo,
      brailleInputTable: NEMETH_INPUT_MODE,
      resolvedTable: lastResolvedInputTable,
      entries: inputLog.entries(),
      dropped: inputLog.dropped
    });
    // The main process copies when it can. The page's own clipboard is the
    // fallback, not the first choice: it needs focus and permission.
    if (window.omniya?.copyText) await window.omniya.copyText(report);
    else await navigator.clipboard.writeText(report);
    announce('Braille input diagnostics copied. Paste them into your report.');
  } catch {
    // Any failure, including building the report, must be heard. Silence reads
    // as success, and someone pastes an empty message.
    announce('Could not copy the diagnostics to the clipboard.');
  }
}

elements['copy-diagnostics'].addEventListener('click', () => void copyInputDiagnostics());

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

/**
 * Edit > Undo and Edit > Redo (and the toolbar buttons). In a text field the
 * browser's own history is the right one. Anywhere else it is the document's,
 * which covers typing and equations together.
 */
function performHistory(direction) {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    document.execCommand(direction);
    return;
  }
  if (!editor) return;
  if (mathSession) return;
  leaveExplorer({ refocus: false });
  const done = direction === 'undo' ? editor.undo() : editor.redo();
  editor.focus();
  if (done) announce(direction === 'undo' ? 'Undid the last change' : 'Redid the last change');
  else announce(direction === 'undo' ? 'Nothing to undo' : 'Nothing to redo');
}

function openContextualHelp() {
  const box = elements['keyboard-help'];
  if (typeof box.showModal === 'function') box.showModal();
  else box.hidden = false;
  // Start at the top, on the title. The only other focusable item is Close, at
  // the bottom, and the browser would otherwise scroll the dialog down to it.
  box.scrollTop = 0;
  box.querySelector('#keyboard-help-heading')?.focus();
}

elements['keyboard-help-button'].addEventListener('click', openContextualHelp);
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
    applyEquationInsert(payload.method === 'latex' ? 'latex' : (payload.method === 'nemeth' ? 'nemeth' : preferredAuthoringMethod));
    return;
  }
  if (payload.action === 'find') { openFind(); return; }
  if (payload.action === 'find-next') { stepFind(1); return; }
  if (payload.action === 'find-previous') { stepFind(-1); return; }
  if (payload.action === 'export') { openExport(); return; }
  if (payload.action === 'print') { void printNote(); return; }
  if (payload.action === 'new-note') {
    elements['new-napkin-button'].click();
    return;
  }
  if (payload.action === 'undo' || payload.action === 'redo') {
    performHistory(payload.action);
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

// The last edits must reach disk when the window closes.
window.addEventListener('pagehide', () => {
  if (commitPendingDoc()) void saveState({ announce: false }).catch(() => {});
});

// ---- Start ----------------------------------------------------------------

if (!globalThis.omniya?.loadState) {
  disableInteractiveControls();
  showError('Run this prototype with “npm start”; the Electron preload bridge is required.');
} else {
  try {
    const loaded = await window.omniya.loadState();
    state = loaded.state;
    renderAll();
    elements['save-status'].textContent = 'Saved';
    if (activeNapkin()) focusEditor();
    if (loaded.warning) showError(loaded.warning);
  } catch {
    showError('The napkins could not be loaded.');
  }
  try {
    await window.omniya.loadSettings?.();
  } catch {
    // Settings are a low-stakes preference; fall back to the defaults already
    // in place rather than surfacing an error for this.
  }
}
elements['app-shell'].setAttribute('aria-busy', 'false');

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
  /** The editor, for tests that need its state. */
  get editor() { return editor; },
  /** Commit the editor's document and wait for it to reach disk. */
  flush: flushDocument,
  /** A copy of the saved-state object as the app holds it right now. */
  state() { commitPendingDoc(); return structuredClone(state); },
  emptyDoc
};
