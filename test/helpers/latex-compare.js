/**
 * LaTeX string comparison for tests and reports.
 *
 * This compares raw LaTeX *text*, not mathematics: two strings that mean the
 * same thing can still differ textually (`x^{2}` vs `x^2`), and two that
 * look almost identical can mean different things (`x^{ab}` vs `x^{a}b`).
 * The normalization here is deliberately narrow -- only transformations
 * proven (by the tests alongside this file) not to collapse a real
 * difference are applied. When in doubt, leave the difference visible: a
 * false "equal" here is worse than a false "different".
 */

// `{x}` and `x` are the same input to a LaTeX/TeX parser in every position --
// a lone token is already a single item, and a one-token group is just that
// same item wrapped in a no-op grouper -- so unwrapping cannot change what
// the string means. This stops at exactly one character on purpose:
// `{ab}` is NOT unwrapped, because `x^{ab}` and `x^{a}b` are different
// mathematics (a two-character superscript vs. a one-character superscript
// followed by a sibling `b`), and the difference lives entirely in whether
// the brace enclosed one token or two.
const SINGLE_CHARACTER_BRACES = /\{([A-Za-z0-9])\}/g;

// A LaTeX control WORD's name is every letter immediately following its
// backslash (TeX scans until the first non-letter). So unwrapping `{a}`
// right after `\frac` would turn `\frac{a}{b}` into `\fraca{b}` -- a
// completely different (and undefined) control sequence, not the same
// argument written more tersely. This only bites when the braced content is
// itself a letter (a digit or symbol always terminates a control word, so
// `\sqrt{2}` -> `\sqrt2` is unaffected). Detected by checking whether the
// text immediately before the opening brace is a backslash followed by zero
// or more letters.
const CONTROL_WORD_BEFORE = /\\[A-Za-z]*$/;

/** Collapse insignificant whitespace and unwrap braces around a single letter or digit. */
export function normalizeLatex(s) {
  if (typeof s !== 'string') throw new TypeError('normalizeLatex expects a string');
  const collapsed = s.trim().replace(/\s+/g, ' ');
  return collapsed.replace(SINGLE_CHARACTER_BRACES, (match, char, offset, whole) => {
    const precededByControlWord = CONTROL_WORD_BEFORE.test(whole.slice(0, offset));
    if (precededByControlWord && /[A-Za-z]/.test(char)) return match;
    return char;
  });
}

/** -> { equal, diff }. `diff` is null when equal, otherwise a human-readable pair. */
export function latexEquivalent(a, b) {
  const na = normalizeLatex(a);
  const nb = normalizeLatex(b);
  if (na === nb) return { equal: true, diff: null };
  return { equal: false, diff: `${JSON.stringify(na)} !== ${JSON.stringify(nb)}` };
}
