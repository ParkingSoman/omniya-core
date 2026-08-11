/**
 * Ported independent cases from MathCAT's public Nemeth suite.
 *
 * Source repository (MIT): https://github.com/daisy/MathCAT/tree/main/tests/braille/Nemeth
 * These cases are used as an outside regression corpus. BANA remains the
 * normative authority, and any deliberate divergence must be documented.
 */

export const MATHCAT_FIXTURES = [
  {
    id: 'aata-004-quadratic',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_004',
    latex: 'ax^2+bx+c=0',
    expected: '⠁⠭⠘⠆⠐⠬⠃⠭⠬⠉⠀⠨⠅⠀⠼⠴'
  },
  {
    id: 'aata-006-indexed-root',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_006',
    latex: 'g(x)=\\sqrt[3]{x}',
    expected: '⠛⠷⠭⠾⠀⠨⠅⠀⠣⠒⠜⠭⠻'
  },
  {
    id: 'aata-009-fraction-function',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_009',
    latex: 'f(p/q)=\\frac{p+1}{p-2}',
    expected: '⠋⠷⠏⠸⠌⠟⠾⠀⠨⠅⠀⠹⠏⠬⠂⠌⠏⠤⠆⠼'
  },
  {
    id: 'aata-014-nested-radicals',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_014',
    latex: '\\sqrt{2+\\sqrt{3}}',
    expected: '⠜⠆⠬⠨⠜⠒⠨⠻⠻'
  }
];
