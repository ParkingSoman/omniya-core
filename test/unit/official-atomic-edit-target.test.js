import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Mirrors the official corpus harness predicate: prefer mi/mn leaves so a
 * focused `⠽` replacement stays one node; mo operators and SRE speech-atomic
 * function mrows are allowed when no identifier exists. Empty mspaces and
 * invisible-times operators are never edit targets.
 */
function isOfficialAtomicCanonicalTarget(target, { allowOperator = true } = {}) {
  if (!target?.nodeName || !target.text) return false;
  const name = String(target.nodeName).replace(/^mjx-/, '');
  if (/^m[in]$/.test(name)) return true;
  if (allowOperator && name === 'mo' && target.text.trim() && !/^[\u2062\u2063\u2064]$/.test(target.text)) {
    return true;
  }
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
    nodeName: 'mjx-mo', text: '|', semanticType: 'fence'
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

test('official atomic edit targets can require identifiers over operators', () => {
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mo', text: '|', semanticType: 'fence'
  }, { allowOperator: false }), false);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mi', text: 'x', semanticType: 'identifier'
  }, { allowOperator: false }), true);
});

test('official atomic edit targets reject empty spaces and non-function rows', () => {
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mjx-mspace', text: '', childElements: 0
  }), false);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mjx-mo', text: '\u2062', semanticType: 'operator'
  }), false);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'mjx-mrow', text: 'x→0', semanticType: 'relseq', childElements: 3
  }), false);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: 'munder', text: 'limx→0', semanticType: 'limlower'
  }), false);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: '', text: '', semanticType: 'fenced', childElements: -1
  }), false);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: '', text: '', semanticType: 'infixop', childElements: -1
  }), false);
  assert.equal(isOfficialAtomicCanonicalTarget({
    nodeName: '', text: '', semanticType: 'appl', childElements: -1
  }), false);
});
