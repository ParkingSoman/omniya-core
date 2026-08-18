import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BigOperator,
  Fenced,
  Fraction,
  FunctionCall,
  Hole,
  Identifier,
  Number,
  Operator,
  Root,
  Sequence,
  SubSuperscript,
  Subscript,
  Superscript,
  Text
} from '../../../src/domain/nemeth/ast.js';
import { defineBackend } from '../../../src/domain/nemeth/backend.js';
import { NemethUnsupportedError } from '../../../src/domain/nemeth/errors.js';
import { KIND_NAMES } from '../../../src/domain/nemeth/kinds.js';
import { toLatex } from '../../../src/domain/nemeth/latex.js';

test('leaves render as themselves', () => {
  assert.equal(toLatex(Number('27')), '27');
  assert.equal(toLatex(Identifier('x')), 'x');
  assert.equal(toLatex(Operator('+')), '+');
});

test('a Sequence is juxtaposition, so its items are concatenated with nothing between them', () => {
  assert.equal(toLatex(Sequence([Identifier('a'), Operator('+'), Identifier('b')])), 'a+b');
});

test('a Fraction renders as \\frac', () => {
  assert.equal(toLatex(Fraction(Number('2'), Identifier('y'))), '\\frac{2}{y}');
});

test('a Root renders with or without its index', () => {
  assert.equal(toLatex(Root(Identifier('x'), null)), '\\sqrt{x}');
  assert.equal(toLatex(Root(Identifier('x'), Number('2'))), '\\sqrt[2]{x}');
});

test('scripts render with braces so nesting survives', () => {
  assert.equal(
    toLatex(Superscript(Identifier('n'), Superscript(Identifier('x'), Identifier('y')))),
    'n^{x^{y}}'
  );
  assert.equal(toLatex(Subscript(Identifier('x'), Number('2'))), 'x_{2}');
  assert.equal(
    toLatex(SubSuperscript(Identifier('x'), Identifier('a'), Identifier('n'))),
    'x_{a}^{n}'
  );
});

test('a Fenced node renders between the delimiters it carries', () => {
  assert.equal(toLatex(Fenced('(', Identifier('x'), ')')), '(x)');
});

test('kinds this backend has no evidence for throw instead of guessing', () => {
  assert.throws(() => toLatex(Text('hello')), NemethUnsupportedError);
  assert.throws(() => toLatex(Hole('radicand')), NemethUnsupportedError);
  assert.throws(() => toLatex(FunctionCall('sin', Identifier('x'))), NemethUnsupportedError);
  assert.throws(
    () => toLatex(BigOperator('sum', null, null, Identifier('x'))),
    NemethUnsupportedError
  );
});

test('defineBackend refuses a table that is missing a node kind', () => {
  assert.throws(
    () => defineBackend({ Number: (node) => node.value }, { name: 'throwaway' }),
    /throwaway is missing handlers for node kinds/u
  );
});

test('defineBackend refuses a table that handles a kind the registry does not have', () => {
  const complete = Object.fromEntries(KIND_NAMES.map((kind) => [kind, () => kind]));
  assert.throws(
    () => defineBackend({ ...complete, NotAKind: () => '' }, { name: 'throwaway' }),
    /throwaway defines handlers for unknown node kinds: NotAKind/u
  );
});
