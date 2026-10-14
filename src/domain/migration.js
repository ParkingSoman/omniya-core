import { canonicalizeMathML } from './math-tree.js';
import { itemsToDoc } from './document.js';

export const CURRENT_SCHEMA_VERSION = 3;

export function createEquationDocument({ mathml, latex, cursor = null }) {
  const canonical = canonicalizeMathML(mathml);
  return { formatVersion: 2, mathml: canonical, focus: cursor };
}

// v1 -> v2: an equation item carried bare MathML. v2 wraps it in a math document.
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

/**
 * Bring any saved state up to the current schema.
 *
 * v1/v2 -> v3: a napkin held a list of items. It now holds one document. Each
 * item becomes paragraphs (see `itemsToDoc`). The note field is gone, and its
 * text is kept as a paragraph, so nothing the person wrote is lost. Selection
 * and item ids are dropped, because a document has neither.
 */
export function migrateState(state) {
  if (!state || typeof state !== 'object') throw new TypeError('State must be an object');
  if (state.schemaVersion === CURRENT_SCHEMA_VERSION) return { ...state, warnings: [] };
  const warnings = [];
  const napkins = (state.napkins ?? []).map((napkin) => {
    const items = (napkin.items ?? []).map((item) => {
      const result = migrateEquationItem(item);
      if (result.warning) warnings.push(result.warning);
      return result.item;
    });
    return { id: napkin.id, name: napkin.name, doc: itemsToDoc(items) };
  });
  return { ...state, schemaVersion: CURRENT_SCHEMA_VERSION, napkins, warnings };
}
