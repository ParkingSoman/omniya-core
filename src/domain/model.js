import { DEFAULT_NOTE_NAME, docWithTitle, emptyDoc, nameFromDoc, validateDoc } from './document.js';

// v3: a napkin body is one document (see document.js), not a list of items.
export const SCHEMA_VERSION = 3;
export const MATH_SCHEMA_VERSION = 2;

function defaultIdFactory() {
  return globalThis.crypto.randomUUID();
}

function requiredTrimmed(value, message) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(message);
  }
  return value.trim();
}

export function createInitialState({ idFactory = defaultIdFactory } = {}) {
  const napkinId = idFactory();
  return {
    schemaVersion: SCHEMA_VERSION,
    activeNapkinId: napkinId,
    napkins: [{
      id: napkinId,
      name: DEFAULT_NOTE_NAME,
      doc: emptyDoc()
    }]
  };
}

export function validateState(value) {
  const issues = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, issues: ['State must be an object'] };
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(value.napkins)) {
    issues.push('State napkins must be an array');
    return { ok: false, issues };
  }

  const napkinIds = new Set();

  for (const napkin of value.napkins) {
    if (!napkin || typeof napkin !== 'object' || Array.isArray(napkin)) {
      issues.push('Every napkin must be an object');
      continue;
    }
    if (typeof napkin.id !== 'string' || napkin.id === '') {
      issues.push('Every napkin must have a string id');
    } else if (napkinIds.has(napkin.id)) {
      issues.push(`Duplicate napkin id: ${napkin.id}`);
    } else {
      napkinIds.add(napkin.id);
    }
    if (typeof napkin.name !== 'string' || napkin.name.trim() === '') {
      issues.push(`Napkin ${napkin.id ?? '(unknown)'} requires a name`);
    }
    for (const issue of validateDoc(napkin.doc)) {
      issues.push(`Napkin ${napkin.id ?? '(unknown)'}: ${issue}`);
    }
  }

  if (value.napkins.length === 0 && value.activeNapkinId === null) {
    return { ok: issues.length === 0, issues };
  }
  if (typeof value.activeNapkinId !== 'string' || !napkinIds.has(value.activeNapkinId)) {
    issues.push('activeNapkinId must reference an existing napkin');
  }

  return { ok: issues.length === 0, issues };
}

export function assertValidState(state) {
  const validation = validateState(state);
  if (!validation.ok) {
    throw new TypeError(`Invalid application state: ${validation.issues.join('; ')}`);
  }
  return state;
}

export function getActiveNapkin(state) {
  assertValidState(state);
  const napkin = state.napkins.find(({ id }) => id === state.activeNapkinId);
  if (!napkin) throw new RangeError('Active napkin not found');
  return napkin;
}

export function createNapkin(state, name, { idFactory = defaultIdFactory } = {}) {
  assertValidState(state);
  const normalizedName = requiredTrimmed(name, 'Note name is required');
  const id = idFactory();
  return {
    ...state,
    activeNapkinId: id,
    napkins: [...state.napkins, { id, name: normalizedName, doc: docWithTitle(emptyDoc(), normalizedName), updatedAt: new Date().toISOString() }]
  };
}

export function renameNapkin(state, napkinId, name) {
  assertValidState(state);
  const normalizedName = requiredTrimmed(name, 'Note name is required');
  if (!state.napkins.some(({ id }) => id === napkinId)) {
    throw new RangeError('Napkin not found');
  }
  return {
    ...state,
    napkins: state.napkins.map((napkin) => (
      napkin.id === napkinId
        ? { ...napkin, name: normalizedName, doc: docWithTitle(napkin.doc, normalizedName, { replace: true }) }
        : napkin
    ))
  };
}

export function switchNapkin(state, napkinId) {
  assertValidState(state);
  if (!state.napkins.some(({ id }) => id === napkinId)) {
    throw new RangeError('Napkin not found');
  }
  return { ...state, activeNapkinId: napkinId };
}

export function deleteNapkin(state, napkinId) {
  assertValidState(state);
  if (!state.napkins.some(({ id }) => id === napkinId)) {
    throw new RangeError('Napkin not found');
  }
  const index = state.napkins.findIndex(({ id }) => id === napkinId);
  const napkins = state.napkins.filter(({ id }) => id !== napkinId);
  const activeNapkinId = state.activeNapkinId === napkinId
    ? (napkins[index]?.id ?? napkins[index - 1]?.id ?? null)
    : state.activeNapkinId;

  return { ...state, activeNapkinId, napkins };
}

/**
 * A napkin with a new body. Its name follows the title, when the body has one.
 * A body without a title leaves the name alone.
 */
export function withDoc(napkin, doc) {
  const hasTitle = doc?.content?.[0]?.type === 'title';
  return { ...napkin, ...(hasTitle ? { name: nameFromDoc(doc) } : {}), doc, updatedAt: new Date().toISOString() };
}

/** Replace the body of a napkin. The doc is checked, so a bad doc never reaches disk. */
export function setNapkinDoc(state, napkinId, doc) {
  assertValidState(state);
  if (!state.napkins.some(({ id }) => id === napkinId)) {
    throw new RangeError('Napkin not found');
  }
  const issues = validateDoc(doc);
  if (issues.length > 0) throw new TypeError(`Invalid document: ${issues.join('; ')}`);
  return {
    ...state,
    napkins: state.napkins.map((napkin) => (
      napkin.id === napkinId ? withDoc(napkin, doc) : napkin
    ))
  };
}
