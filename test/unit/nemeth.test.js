import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNemeth, normalizeCells } from '../../src/domain/nemeth/index.js';

test('normalizes Unicode and Braille ASCII input', () => {
  assert.deepEqual(normalizeCells('⠭⠬⠽'), ['⠭', '⠬', '⠽']);
  assert.deepEqual(normalizeCells('x+ y'), ['⠭', '⠬', ' ', '⠽']);
});

test('parses arithmetic Nemeth into deterministic LaTeX and source map', () => {
  const result = parseNemeth('⠭⠬⠽', { mode: 'strict' });
  assert.equal(result.ok, true);
  assert.equal(result.latex, 'x+y');
  assert.equal(result.sourceMap.length, 3);
});

test('incremental mode recovers only missing closing delimiters', () => {
  const result = parseNemeth('⠷⠭⠬⠽', { mode: 'incremental' });
  assert.equal(result.ok, true);
  assert.match(result.latex, /\\left\(/);
  assert.ok(result.warnings.length > 0);
});

test('strict mode reports malformed cells without throwing', () => {
  const result = parseNemeth('⠭⠿', { mode: 'strict' });
  assert.equal(result.ok, false);
  assert.equal(result.error.startCell, 1);
});
