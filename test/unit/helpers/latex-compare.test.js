import assert from 'node:assert/strict';
import test from 'node:test';

import { latexEquivalent, normalizeLatex } from '../../helpers/latex-compare.js';

test('normalizeLatex trims leading and trailing whitespace', () => {
  assert.equal(normalizeLatex('  x+y  '), 'x+y');
});

test('normalizeLatex collapses runs of internal whitespace to a single space', () => {
  assert.equal(normalizeLatex('x   +\t\ty'), 'x + y');
});

test('normalizeLatex unwraps braces around a single letter or digit', () => {
  assert.equal(normalizeLatex('x^{2}'), 'x^2');
  assert.equal(normalizeLatex('{a}+{b}'), 'a+b');
});

test('normalizeLatex does NOT unwrap braces around two or more characters -- proves the rule does not mask a real difference', () => {
  // x^{ab} (superscript "ab") and x^{a}b (superscript "a", then a sibling "b")
  // are different mathematics. If the brace-unwrap rule were broadened past
  // a single character it would collapse this distinction.
  assert.equal(normalizeLatex('x^{ab}'), 'x^{ab}');
  assert.notEqual(normalizeLatex('x^{ab}'), normalizeLatex('x^{a}b'));
});

test('normalizeLatex does NOT unwrap braces around a backslash command', () => {
  // "{\alpha}" is one *token* to TeX, but this rule only recognizes a
  // single literal letter or digit -- it does not parse command names, so
  // it conservatively leaves multi-character groups (including commands)
  // alone rather than guessing where a command name ends.
  assert.equal(normalizeLatex('{\\alpha}'), '{\\alpha}');
});

test('normalizeLatex does NOT unwrap a single-letter argument immediately after a control word -- proves the rule does not corrupt a macro name', () => {
  // A LaTeX control word's name is every letter immediately following its
  // backslash. Unwrapping `{a}` right after `\frac` would rewrite
  // `\frac{a}{b}` into `\fraca{b}` -- a different, undefined control
  // sequence, not the same math written more tersely. The SECOND group
  // (`{b}`, preceded by `}` rather than a control word) is still safe to
  // unwrap -- `\frac{a}b` is valid, equivalent TeX -- so only the group
  // directly touching the command name is protected. This was caught by
  // this very test failing during development: an earlier version of the
  // rule unwrapped both groups and turned `\frac{a}{b}` into `\fracab`.
  assert.equal(normalizeLatex('\\frac{a}{b}'), '\\frac{a}b');
});

test('normalizeLatex DOES unwrap a single-digit argument after a control word, since a digit cannot extend a control word name', () => {
  // Unlike a letter, a digit always terminates a TeX control word, so
  // `\sqrt{2}` -> `\sqrt2` cannot be misread as part of the command name.
  assert.equal(normalizeLatex('\\sqrt{2}'), '\\sqrt2');
});

test('normalizeLatex still unwraps a single-letter argument that is NOT preceded by a control word', () => {
  assert.equal(normalizeLatex('x^{a}+{b}'), 'x^a+b');
});

test('normalizeLatex throws on non-string input rather than silently coercing', () => {
  assert.throws(() => normalizeLatex(undefined), TypeError);
});

test('latexEquivalent treats whitespace-only differences as equal', () => {
  const result = latexEquivalent('x + y', 'x   +   y');
  assert.equal(result.equal, true);
  assert.equal(result.diff, null);
});

test('latexEquivalent treats single-character brace differences as equal', () => {
  const result = latexEquivalent('x^{2}', 'x^2');
  assert.equal(result.equal, true);
});

test('latexEquivalent distinguishes genuinely different content after normalization', () => {
  const result = latexEquivalent('x^{2}', 'x^{3}');
  assert.equal(result.equal, false);
  assert.match(result.diff, /x\^3/);
});

test('latexEquivalent distinguishes a two-character superscript from a one-character superscript plus a sibling', () => {
  const result = latexEquivalent('x^{ab}', 'x^{a}b');
  assert.equal(result.equal, false);
});

test('latexEquivalent diff surfaces both normalized strings', () => {
  const result = latexEquivalent('\\frac{a}{b}', '\\frac{a}{c}');
  assert.equal(result.equal, false);
  assert.match(result.diff, /\\\\frac\{a\}b/);
  assert.match(result.diff, /\\\\frac\{a\}c/);
});
