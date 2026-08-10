import assert from 'node:assert/strict';
import test from 'node:test';
import { BrailleDisplaySimulator } from '../../src/renderer/braille-display-simulator.js';

test('display simulation preserves cells, routing, deletion, and six-key chords', () => {
  const updates = [];
  const display = new BrailleDisplaySimulator({ onCells: (cells, caret) => updates.push([cells, caret]) });
  display.insert('⠭');
  display.route(0);
  display.sixKey.keydown({ key: 'f', preventDefault() {} });
  display.sixKey.keydown({ key: 's', preventDefault() {} });
  display.sixKey.keydown({ key: 'd', preventDefault() {} });
  display.sixKey.keyup({ key: 'f', preventDefault() {} });
  display.sixKey.keyup({ key: 's', preventDefault() {} });
  display.sixKey.keyup({ key: 'd', preventDefault() {} });
  assert.equal(display.cells, '⠇⠭');
  display.backspace();
  assert.equal(display.cells, '⠭');
  assert.deepEqual(updates.at(-1), ['⠭', 0]);
});
