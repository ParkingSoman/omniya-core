import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUebCellBuffer,
  pushUebCell,
  flushUebBuffer,
  isBrailleInsertEquationCell
} from '../../src/domain/ueb-cell-buffer.js';

test('accumulates cells until space or braille space', () => {
  let b = createUebCellBuffer();
  b = pushUebCell(b, '⠓').buffer;
  b = pushUebCell(b, '⠊').buffer;
  assert.equal(b.pending, '⠓⠊');
  const r = pushUebCell(b, ' '); // or '⠀'
  assert.equal(r.flush, '⠓⠊');
  assert.equal(r.buffer.pending, '');
});

test('explicit flush returns pending without requiring space', () => {
  let b = createUebCellBuffer();
  b = pushUebCell(b, '⠯').buffer;
  const r = flushUebBuffer(b);
  assert.equal(r.flush, '⠯');
  assert.equal(r.buffer.pending, '');
});

test('braille space flushes the same way as ASCII space', () => {
  let b = createUebCellBuffer();
  b = pushUebCell(b, '⠓').buffer;
  b = pushUebCell(b, '⠊').buffer;
  const r = pushUebCell(b, '\u2800');
  assert.equal(r.flush, '⠓⠊');
  assert.equal(r.buffer.pending, '');
});

test('empty pending plus full cell is insert-equation', () => {
  const b = createUebCellBuffer();
  assert.equal(isBrailleInsertEquationCell(b, '\u283F'), true);
});

test('pending cells plus full cell is not insert-equation', () => {
  let b = createUebCellBuffer();
  b = pushUebCell(b, '⠓').buffer;
  assert.equal(isBrailleInsertEquationCell(b, '\u283F'), false);
});

test('space is not insert-equation', () => {
  const b = createUebCellBuffer();
  assert.equal(isBrailleInsertEquationCell(b, ' '), false);
});
