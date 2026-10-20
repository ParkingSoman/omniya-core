import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

// Issue #40: a capital Greek kappa was spoken "Kappa", which a speech
// synthesizer pronounces exactly like the lowercase letter, so a listener
// could not tell the two apart. The speech engine's own "say caps" preference
// speaks "cap Kappa". The renderer's MathJax config picks the preference, so
// this test feeds the engine whatever that config asks for.
const require = createRequire(import.meta.url);
const sre = require('speech-rule-engine');

await import('../../src/renderer/mathjax-config.js');
const { locale, domain, style } = globalThis.MathJax.options.sre;

const math = (body) => `<math xmlns="http://www.w3.org/1998/Math/MathML">${body}</math>`;

async function speak(mathml) {
  await sre.setupEngine({ locale, domain, style });
  await sre.engineReady();
  return sre.toSpeech(mathml);
}

test('a capital Greek letter is spoken with "cap" before it', async () => {
  assert.equal(await speak(math('<mi>Κ</mi>')), 'cap Kappa');
});

test('a capital and a lowercase Greek letter are spoken differently', async () => {
  assert.equal(await speak(math('<mi>κ</mi>')), 'kappa');
  assert.notEqual(await speak(math('<mi>Κ</mi>')), await speak(math('<mi>κ</mi>')));
});
