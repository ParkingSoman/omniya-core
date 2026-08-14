import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedNemethCellInput } from '../../src/domain/nemeth-cell-input.js';

test('allows unicode braille and ASCII braille cells', () => {
  assert.equal(isAllowedNemethCellInput('⠁'), true);
  assert.equal(isAllowedNemethCellInput('#'), true); // number prefix in ASCII braille map
  assert.equal(isAllowedNemethCellInput('1'), true);
  assert.equal(isAllowedNemethCellInput('A'), true); // ASCII braille letter cell
  assert.equal(isAllowedNemethCellInput(' '), true);
});

test('rejects lowercase latin and other non-cells', () => {
  assert.equal(isAllowedNemethCellInput('a'), false);
  assert.equal(isAllowedNemethCellInput('z'), false);
  assert.equal(isAllowedNemethCellInput('€'), false);
  assert.equal(isAllowedNemethCellInput(''), false);
});
