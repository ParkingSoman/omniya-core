import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Mirrors the official corpus harness predicate: a focused MathJax speech
 * node is an atomic edit target when it is a token leaf or an SRE
 * speech-atomic function mrow (lim/sin/…), never an empty mspace.
 */
function isOfficialAtomicCanonicalTarget(target) {
  if (!target?.nodeName || !target.text) return false;
  const name = String(target.nodeName).replace(/^mjx-/, '');
  if (/^m[ino]$/.test(name)) return true;
  if (name === 'mrow' && (
    target.semanticType === 'function'
    || /limit function|simple function/i.test(target.semanticRole || '')
    || target.intent === 'function-name'
  )) return true;
  return false;
}

test('official atomic edit targets accept token leaves and function mrows', () => {
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mi', text: 'x', semanticType: 'identifier'
  }), true);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mjx-mn', text: '59', semanticType: 'number'
  }), true);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mjx-mrow',
    text: 'lim',
    childElements: 3,
    semanticType: 'function',
    semanticRole: 'limit function'
  }), true);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mrow',
    text: 'sin',
    intent: 'function-name',
    childElements: 1
  }), true);
});

test('official atomic edit targets reject empty spaces and non-function rows', () => {
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mjx-mspace', text: '', childElements: 0
  }), false);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mjx-mrow', text: 'x→0', semanticType: 'relseq', childElements: 3
  }), false);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'munder', text: 'limx→0', semanticType: 'limlower'
  }), false);
});
