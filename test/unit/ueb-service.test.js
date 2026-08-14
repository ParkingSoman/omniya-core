import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { translateUeb, backTranslateUeb, resolveLouTranslate } from '../../src/main/ueb-service.js';

const bin = resolveLouTranslate();
const hasLouis = Boolean(bin && (bin === 'lou_translate' || fs.existsSync(bin)));

test('resolveLouTranslate finds CLI or returns null', () => {
  const p = resolveLouTranslate();
  assert.ok(p === null || String(p).includes('lou_translate'));
});

test('g2 roundtrip hello world', { skip: !hasLouis }, async () => {
  const brl = await translateUeb('hello world', 'g2');
  assert.match(brl, /⠓/);
  const print = await backTranslateUeb(brl, 'g2');
  assert.equal(print.toLowerCase(), 'hello world');
});

test('g1 roundtrip The quick brown fox', { skip: !hasLouis }, async () => {
  const text = 'The quick brown fox';
  const brl = await translateUeb(text, 'g1');
  const print = await backTranslateUeb(brl, 'g1');
  assert.equal(print, text);
});
