const BRAILLE_SPACE = '\u2800';

export function createUebCellBuffer() {
  return { pending: '' };
}

export function pushUebCell(buffer, cell) {
  if (cell === ' ' || cell === BRAILLE_SPACE) {
    return flushUebBuffer(buffer);
  }
  return { buffer: { pending: buffer.pending + cell }, flush: null };
}

export function flushUebBuffer(buffer) {
  return { buffer: { pending: '' }, flush: buffer.pending };
}
