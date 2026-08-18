/**
 * Exhaustive dispatch for AST projections.
 *
 * A backend is a table with one handler per node kind. The table is checked
 * against the kind registry when the module is imported, so a backend that
 * forgot a construct fails at startup rather than emitting a wrong answer at
 * runtime. There is no opt-out: a backend that cannot render a kind must say so
 * by throwing NemethUnsupportedError from that entry.
 */

import { KIND_NAMES } from './kinds.js';

export function defineBackend(table, { name = 'backend' } = {}) {
  const missing = KIND_NAMES.filter((kind) => typeof table[kind] !== 'function');
  if (missing.length) {
    throw new Error(`${name} is missing handlers for node kinds: ${missing.join(', ')}`);
  }
  const unknown = Object.keys(table).filter((kind) => !KIND_NAMES.includes(kind));
  if (unknown.length) {
    throw new Error(`${name} defines handlers for unknown node kinds: ${unknown.join(', ')}`);
  }

  const emit = (node) => {
    if (!node || typeof node.kind !== 'string') {
      throw new TypeError(`${name}: emit() requires an AST node, received ${JSON.stringify(node)}`);
    }
    return table[node.kind](node, emit);
  };
  return emit;
}
