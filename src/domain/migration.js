import { canonicalizeMathML } from './math-tree.js';

export const CURRENT_SCHEMA_VERSION = 2;

export function createEquationDocument({ mathml, latex, cursor = null }) {
  const canonical = canonicalizeMathML(mathml);
  return { formatVersion: 2, mathml: canonical, focus: cursor };
}

export function migrateEquationItem(item) {
  if (!item || item.type !== 'equation') return { item, warning: null };
  if (item.math?.formatVersion === 2 && typeof item.math.mathml === 'string') return { item, warning: null };
  try {
    const mathml = canonicalizeMathML(item.math?.mathml ?? item.mathml);
    return {
      item: { id: item.id, type: 'equation', note: item.note ?? '', math: { formatVersion: 2, mathml, focus: null } },
      warning: null
    };
  } catch (error) {
    return { item: { ...item, legacy: true }, warning: { itemId: item.id, message: `Equation could not be migrated: ${error.message}` } };
  }
}

export function migrateState(state) {
  if (!state || typeof state !== 'object') throw new TypeError('State must be an object');
  const warnings = [];
  const napkins = (state.napkins ?? []).map((napkin) => ({
    ...napkin,
    items: (napkin.items ?? []).map((item) => {
      const result = migrateEquationItem(item);
      if (result.warning) warnings.push(result.warning);
      return result.item;
    })
  }));
  return { ...state, schemaVersion: CURRENT_SCHEMA_VERSION, napkins, warnings };
}
