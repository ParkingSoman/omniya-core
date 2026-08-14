import assert from 'node:assert/strict';
import test from 'node:test';
import { applyUebBrailleLabel } from '../../src/renderer/ueb-braille-projection.js';

function fakeElement() {
  const attrs = new Map();
  return {
    setAttribute(name, value) { attrs.set(name, value); },
    removeAttribute(name) { attrs.delete(name); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; }
  };
}

test('applyUebBrailleLabel sets aria-braillelabel from string translate result', async () => {
  const el = fakeElement();
  await applyUebBrailleLabel(el, 'hi', 'g2', async () => '⠓⠊');
  assert.equal(el.getAttribute('aria-braillelabel'), '⠓⠊');
});

test('applyUebBrailleLabel accepts { braille } IPC-shaped results', async () => {
  const el = fakeElement();
  await applyUebBrailleLabel(el, 'hi', 'g2', async () => ({ braille: '⠓⠊' }));
  assert.equal(el.getAttribute('aria-braillelabel'), '⠓⠊');
});

test('applyUebBrailleLabel clears attribute when translate fails', async () => {
  const el = fakeElement();
  el.setAttribute('aria-braillelabel', 'stale');
  await applyUebBrailleLabel(el, 'hi', 'g2', async () => {
    throw new Error('no tables');
  });
  assert.equal(el.getAttribute('aria-braillelabel'), null);
});

test('applyUebBrailleLabel no-ops when element is missing', async () => {
  await applyUebBrailleLabel(null, 'hi', 'g2', async () => {
    throw new Error('should not be called');
  });
});
