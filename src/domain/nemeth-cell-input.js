import { normalizeCellInput } from './guided-nemeth/index.js';

/** True iff key is one cell the guided Nemeth pipeline accepts. */
export function isAllowedNemethCellInput(key) {
  if (typeof key !== 'string' || key.length === 0) return false;
  // Printable keydown events are one character; ignore named keys callers filter separately.
  if (key.length !== 1) return false;
  try {
    normalizeCellInput(key);
    return true;
  } catch {
    return false;
  }
}
