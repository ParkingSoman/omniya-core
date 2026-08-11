/**
 * External Nemeth accuracy fixtures.
 *
 * Expected cells are independently recorded from the BANA Nemeth Code 2022
 * examples and checked against the October 2025 errata where applicable. The
 * SRE value is an independent projection check, not the normative source.
 * Normative source: https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf
 * Errata: https://www.brailleauthority.org/sites/default/files/2026-08/Errata%20Nemeth%20Code%202022%20Approved%2010-2025.pdf
 */

export const WHOLE_EXPRESSION_FIXTURES = [
  {
    id: 'arithmetic-equality',
    latex: 'a+b=3',
    banaRef: 'Rules 20.1, 21.1; operation/comparison spacing examples',
    expected: '⠁⠬⠃⠀⠨⠅⠀⠼⠒'
  },
  {
    id: 'simple-fraction-with-compound-terms',
    latex: '\\frac{a+b}{c-d}',
    banaRef: 'Rule 13.2, Example 13-3; Rule 20.1',
    expected: '⠹⠁⠬⠃⠌⠉⠤⠙⠼'
  },
  {
    id: 'square-root-with-script',
    latex: '\\sqrt{x^2+1}',
    banaRef: 'Rule 16.1, Example 16-3; Rule 14.4',
    expected: '⠜⠭⠘⠆⠐⠬⠂⠻'
  },
  {
    id: 'nested-fraction-power',
    latex: '\\left(\\frac{x}{y}\\right)^2',
    banaRef: 'Rules 13.2 and 14.4; grouped expression',
    expected: '⠷⠹⠭⠌⠽⠼⠾⠘⠆'
  },
  {
    id: 'subscript-superscript',
    latex: 'F_i^2',
    banaRef: 'Rule 14.4, Examples 14-9 through 14-12',
    expected: '⠠⠋⠰⠊⠘⠆'
  },
  {
    id: 'integral-with-limits',
    latex: '\\int_a^n f(x)\\,dx',
    banaRef: 'Rules 14.3, 20, and 23.11; integral and level indicators',
    expected: '⠮⠰⠁⠘⠝⠐⠋⠷⠭⠾⠙⠭'
  },
  {
    id: 'sum-with-limits',
    latex: '\\sum_{i=1}^n x^i',
    banaRef: 'Rules 14.3, 20, and 23.11; summation with limits',
    expected: '⠐⠨⠠⠎⠩⠊⠀⠨⠅⠀⠼⠂⠣⠝⠻⠭⠘⠊'
  },
  {
    id: 'set-and-logic',
    latex: 'x\\in\\mathbb{R}\\land x\\ge 0',
    banaRef: 'Rules 20, 21, and 23; set/logic/comparison symbols',
    expected: '⠭⠀⠈⠑⠀⠈⠰⠠⠗⠈⠩⠭⠀⠨⠂⠱⠀⠼⠴'
  }
];

export const SUBEXPRESSION_FIXTURES = [
  { id: 'fraction-numerator', whole: 'simple-fraction-with-compound-terms', part: 'numerator', expected: '⠁⠬⠃', banaRef: 'Rule 13.2, Example 13-3' },
  { id: 'fraction-denominator', whole: 'simple-fraction-with-compound-terms', part: 'denominator', expected: '⠉⠤⠙', banaRef: 'Rule 13.2, Example 13-3' },
  { id: 'radical-whole', whole: 'square-root-with-script', part: 'radical', expected: '⠜⠭⠘⠆⠐⠬⠂⠻', banaRef: 'Rule 16.1, Example 16-3' },
  { id: 'radical-script', whole: 'square-root-with-script', part: 'exponent', expected: '⠼⠆', banaRef: 'Rule 14.4, Example 14-3; isolated numeric subexpression includes its number sign' },
  { id: 'scripted-symbol', whole: 'subscript-superscript', part: 'whole', expected: '⠠⠋⠰⠊⠘⠆', banaRef: 'Rule 14.4' }
];

export function fixtureById(id) {
  const fixture = WHOLE_EXPRESSION_FIXTURES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown Nemeth fixture: ${id}`);
  return fixture;
}
