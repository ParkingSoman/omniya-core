import assert from 'node:assert/strict';
import test from 'node:test';
import { createSixKeyInput } from '../../src/renderer/braille-input.js';

test('six-key chords emit once regardless of key order', () => {
  const cells = [];
  const input = createSixKeyInput({ emit: (cell) => cells.push(cell) });
  for (const key of ['f', 's', 'd']) input.keydown({ key, preventDefault() {} });
  for (const key of ['d', 'f', 's']) input.keyup({ key, preventDefault() {} });
  assert.deepEqual(cells, ['⠇']);
});
