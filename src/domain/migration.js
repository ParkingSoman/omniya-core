import { canonicalizeMathML } from './math-tree.js';

export const CURRENT_SCHEMA_VERSION = 2;

export function createEquationDocument({ mathml, latex, cursor = null }) {
  const canonical = canonicalizeMathML(mathml);
  return { formatVersion: 1, mathml: canonical, latex: String(latex ?? '').trim(), cursor };
}

export function migrateEquationItem(item) {
  if (!item || item.type !== 'equation') return { item, warning: null };
  if (item.math?.formatVersion === 1 && typeof item.math.mathml === 'string') return { item, warning: null };
  try {
    const mathml = canonicalizeMathML(item.mathml);
    return {
      item: { id: item.id, type: 'equation', note: item.note ?? '', math: { formatVersion: 1, mathml, latex: String(item.source ?? '').trim(), cursor: null } },
      warning: null
    };
  } catch (error) {
    return { item: { ...item, legacy: true }, warning: { itemId: item.id, message: `Equation could not be migrated: ${error.message}` } };
  }
}

export function migrateState(state) {
  if (!state || typeof state !== 'object') throw new TypeError('State must be an object');
  if (state.schemaVersion >= CURRENT_SCHEMA_VERSION) return { ...state, schemaVersion: CURRENT_SCHEMA_VERSION, warnings: [] };
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
