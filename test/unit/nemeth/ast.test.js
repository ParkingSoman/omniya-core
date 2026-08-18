import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Fraction,
  Hole,
  Identifier,
  Number,
  Operator,
  Root,
  Sequence,
  format,
  isNode
} from '../../../src/domain/nemeth/ast.js';

test('a constructor returns a frozen plain object shaped { kind, ...fields, src, marks }', () => {
  const node = Number('27');
  assert.deepEqual(Object.keys(node), ['kind', 'value', 'src', 'marks']);
  assert.equal(node.kind, 'Number');
  assert.equal(node.value, '27');
  assert.equal(node.src, null);
  assert.deepEqual(node.marks, {});
  assert.equal(Object.isFrozen(node), true);
});

test('a node survives structuredClone unchanged, so it must not be a class instance', () => {
  const node = Fraction(Number('2'), Identifier('y'), { src: [0, 5] });
  assert.deepEqual(structuredClone(node), JSON.parse(JSON.stringify(node)));
  assert.equal(Object.getPrototypeOf(node), Object.prototype);
});

test('src and marks are recorded from the optional trailing options argument', () => {
  const node = Number('27', { src: [0, 3], marks: { numericIndicator: true } });
  assert.deepEqual(node.src, [0, 3]);
  assert.deepEqual(node.marks, { numericIndicator: true });
  assert.equal(Object.isFrozen(node.marks), true);
});

test('a constructor throws on wrong arity', () => {
  assert.throws(() => Fraction(Number('2')), TypeError);
  assert.throws(() => Number(), TypeError);
});

test('one field too many is refused rather than swallowed as the options argument', () => {
  assert.throws(() => Root(Identifier('x'), null, Identifier('y')), TypeError);
});

test('a constructor throws on a wrong child kind', () => {
  assert.throws(() => Fraction('2', Identifier('y')), TypeError);
  assert.throws(() => Number(Identifier('y')), TypeError);
  assert.throws(() => Sequence([Identifier('x'), 'plus']), TypeError);
});

test('an optional child accepts null but not a non-node', () => {
  assert.equal(Root(Identifier('x'), null).index, null);
  assert.throws(() => Root(Identifier('x'), 2), TypeError);
});

test('Sequence rejects an empty item list', () => {
  assert.throws(() => Sequence([]), TypeError);
});

test('isNode recognises constructed nodes and rejects look-alikes', () => {
  assert.equal(isNode(Hole('radicand')), true);
  assert.equal(isNode({ kind: 'NotAKind' }), false);
  assert.equal(isNode(null), false);
});

test('format prints a tree in constructor form', () => {
  const tree = Sequence([Identifier('x'), Operator('+'), Fraction(Number('2'), Identifier('y'))]);
  assert.equal(
    format(tree),
    "Sequence([ Identifier('x'), Operator('+'), Fraction(Number('2'), Identifier('y')) ])"
  );
});

test('format prints an absent optional child as null', () => {
  assert.equal(format(Root(Identifier('x'), null)), "Root(Identifier('x'), null)");
});
