import { createSixKeyInput } from './braille-input.js';

/** Deterministic in-process model of a refreshable display plus six-key keyboard. */
export class BrailleDisplaySimulator {
  constructor({ onCells, onRoute } = {}) {
    this.cells = '';
    this.caret = 0;
    this.onCells = onCells;
    this.onRoute = onRoute;
    this.sixKey = createSixKeyInput({ emit: (cell) => this.insert(cell) });
  }

  insert(cells) {
    const value = String(cells);
    this.cells = `${this.cells.slice(0, this.caret)}${value}${this.cells.slice(this.caret)}`;
    this.caret += value.length;
    this.onCells?.(this.cells, this.caret);
  }

  backspace() {
    if (this.caret === 0) return;
    this.cells = `${this.cells.slice(0, this.caret - 1)}${this.cells.slice(this.caret)}`;
    this.caret -= 1;
    this.onCells?.(this.cells, this.caret);
  }

  route(cellIndex) {
    this.caret = Math.max(0, Math.min(this.cells.length, cellIndex));
    this.onRoute?.(this.caret);
  }

  space() { this.insert(' '); }
}
