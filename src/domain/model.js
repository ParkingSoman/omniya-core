import { canonicalizeMathML } from './math-tree.js';

export const SCHEMA_VERSION = 2;
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

function normalizeNote(note) {
  if (typeof note !== 'string') {
    throw new TypeError('Item note must be a string');
  }
  return note;
}

function normalizeItem(item, id) {
  if (!item || (item.type !== 'text' && item.type !== 'equation')) {
    throw new TypeError('Item type must be text or equation');
  }

  const note = normalizeNote(item.note);

  if (item.type === 'text') {
    const source = requiredTrimmed(item.source, 'Item source is required');
    if (item.mathml !== null && item.mathml !== undefined) throw new TypeError('Text items cannot contain MathML');
    return { id, type: 'text', source, note, mathml: null };
  }

  const legacyMathML = item.math?.mathml ?? item.mathml;
  if (typeof legacyMathML !== 'string' || !legacyMathML.trim().startsWith('<math')) {
    throw new TypeError('Equation items require MathML');
  }
  const mathml = canonicalizeMathML(legacyMathML);
  return {
    id,
    type: 'equation',
    note,
    math: {
      formatVersion: MATH_SCHEMA_VERSION,
      mathml,
      focus: item.math?.focus ?? null
    }
  };
}

export function createInitialState({ idFactory = defaultIdFactory } = {}) {
  const napkinId = idFactory();
  return {
    schemaVersion: SCHEMA_VERSION,
    activeNapkinId: napkinId,
    napkins: [{
      id: napkinId,
      name: 'Untitled Napkin',
      selectedItemId: null,
      items: []
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
  const itemIds = new Set();

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
    if (!Array.isArray(napkin.items)) {
      issues.push(`Napkin ${napkin.id ?? '(unknown)'} items must be an array`);
      continue;
    }

    const napkinItemIds = new Set();
    for (const item of napkin.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        issues.push('Every item must be an object');
        continue;
      }
      if (typeof item.id !== 'string' || item.id === '') {
        issues.push('Every item must have a string id');
      } else {
        if (itemIds.has(item.id)) issues.push(`Duplicate item id: ${item.id}`);
        itemIds.add(item.id);
        napkinItemIds.add(item.id);
      }
      if (item.type !== 'text' && item.type !== 'equation') {
        issues.push(`Item ${item.id ?? '(unknown)'} type must be text or equation`);
      }
      if (item.type === 'text' && (typeof item.source !== 'string' || item.source.trim() === '')) {
        issues.push(`Item ${item.id ?? '(unknown)'} source is required`);
      }
      if (typeof item.note !== 'string') {
        issues.push(`Item ${item.id ?? '(unknown)'} note must be a string`);
      }
      if (item.type === 'text' && item.mathml !== null && item.mathml !== undefined) issues.push('Text items cannot contain MathML');
      if (item.type === 'equation' && (!item.math || item.math.formatVersion !== MATH_SCHEMA_VERSION || typeof item.math.mathml !== 'string' || !item.math.mathml.trim().startsWith('<math'))) issues.push('Equation items require math.formatVersion 2 MathML');
    }

    if (napkin.selectedItemId !== null &&
        (typeof napkin.selectedItemId !== 'string' || !napkinItemIds.has(napkin.selectedItemId))) {
      issues.push(`Napkin ${napkin.id ?? '(unknown)'} selectedItemId is invalid`);
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
  const normalizedName = requiredTrimmed(name, 'Napkin name is required');
  const id = idFactory();
  return {
    ...state,
    activeNapkinId: id,
    napkins: [...state.napkins, {
      id,
      name: normalizedName,
      selectedItemId: null,
      items: []
    }]
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

export function insertItemAt(state, index, input, { idFactory = defaultIdFactory } = {}) {
  assertValidState(state);
  const activeNapkin = getActiveNapkin(state);
  if (!Number.isInteger(index) || index < 0 || index > activeNapkin.items.length) {
    throw new RangeError('Item index is out of range');
  }
  const item = normalizeItem(input, idFactory());
  return {
    ...state,
    napkins: state.napkins.map((napkin) => napkin.id === state.activeNapkinId
      ? {
          ...napkin,
          selectedItemId: item.id,
          items: [...napkin.items.slice(0, index), item, ...napkin.items.slice(index)]
        }
      : napkin)
  };
}

export function addItem(state, input, { idFactory = defaultIdFactory } = {}) {
  return insertItemAt(state, getActiveNapkin(state).items.length, input, { idFactory });
}

function persistTextSlice(source, note, id) {
  if (typeof source !== 'string' || source.trim() === '') return null;
  return { ...normalizeItem({ type: 'text', source, note, mathml: null }, id), source };
}

export function splitTextItem(state, itemId, offset, { idFactory = defaultIdFactory } = {}) {
  assertValidState(state);
  const activeNapkin = getActiveNapkin(state);
  const index = activeNapkin.items.findIndex(({ id }) => id === itemId);
  if (index === -1) throw new RangeError('Item not found');
  const existing = activeNapkin.items[index];
  if (existing.type !== 'text') throw new TypeError('Item is not a text item');
  if (!Number.isInteger(offset) || offset < 0 || offset > existing.source.length) {
    throw new RangeError('Split offset is out of range');
  }

  const leftItem = persistTextSlice(existing.source.slice(0, offset), existing.note, existing.id);
  const rightSource = existing.source.slice(offset);
  if (!leftItem && rightSource.trim() === '') {
    throw new TypeError('Item source is required');
  }
  if (!leftItem) {
    return { state, leftId: null, rightId: existing.id };
  }
  if (rightSource.trim() === '') {
    return { state, leftId: existing.id, rightId: null };
  }
  const rightItem = persistTextSlice(rightSource, existing.note, idFactory());

  return {
    state: {
      ...state,
      napkins: state.napkins.map((napkin) => napkin.id === state.activeNapkinId
        ? {
            ...napkin,
            selectedItemId: leftItem.id,
            items: [
              ...napkin.items.slice(0, index),
              leftItem,
              rightItem,
              ...napkin.items.slice(index + 1)
            ]
          }
        : napkin)
    },
    leftId: leftItem.id,
    rightId: rightItem.id
  };
}

export function updateItem(state, itemId, changes) {
  assertValidState(state);
  const activeNapkin = getActiveNapkin(state);
  const existing = activeNapkin.items.find(({ id }) => id === itemId);
  if (!existing) throw new RangeError('Item not found');

  const updated = normalizeItem({
    ...existing,
    source: changes.source,
    note: changes.note,
    math: changes.math ?? (changes.mathml ? undefined : existing.math),
    mathml: changes.mathml
  }, existing.id);

  return {
    ...state,
    napkins: state.napkins.map((napkin) => napkin.id === state.activeNapkinId
      ? {
          ...napkin,
          selectedItemId: updated.id,
          items: napkin.items.map((item) => item.id === updated.id ? updated : item)
        }
      : napkin)
  };
}

export function deleteItem(state, itemId) {
  assertValidState(state);
  const activeNapkin = getActiveNapkin(state);
  const index = activeNapkin.items.findIndex(({ id }) => id === itemId);
  if (index === -1) throw new RangeError('Item not found');

  const items = activeNapkin.items.filter(({ id }) => id !== itemId);
  const selectedItemId = activeNapkin.selectedItemId === itemId
    ? (items[index]?.id ?? items[index - 1]?.id ?? null)
    : activeNapkin.selectedItemId;

  return {
    ...state,
    napkins: state.napkins.map((napkin) => napkin.id === state.activeNapkinId
      ? { ...napkin, items, selectedItemId }
      : napkin)
  };
}

export function selectItem(state, itemId) {
  assertValidState(state);
  const activeNapkin = getActiveNapkin(state);
  if (!activeNapkin.items.some(({ id }) => id === itemId)) {
    throw new RangeError('Item not found');
  }
  return {
    ...state,
    napkins: state.napkins.map((napkin) => napkin.id === state.activeNapkinId
      ? { ...napkin, selectedItemId: itemId }
      : napkin)
  };
}
