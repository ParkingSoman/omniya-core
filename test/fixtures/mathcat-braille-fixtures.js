/**
 * Ported independent cases from MathCAT's public Nemeth suite.
 *
 * Source repository (MIT): https://github.com/daisy/MathCAT/tree/main/tests/braille/Nemeth
 * These cases are used as an outside regression corpus. BANA remains the
 * normative authority, and any deliberate divergence must be documented.
 */

export const MATHCAT_FIXTURES = [
  {
    id: 'aata-002-absolute-conjugate-power',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_002',
    latex: '|\\widetilde{X}|=2^4=16',
    expected: '⠳⠐⠠⠭⠣⠈⠱⠻⠳⠀⠨⠅⠀⠼⠆⠘⠲⠀⠨⠅⠀⠼⠂⠖'
  },
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
    id: 'aata-007-multiscript-inverse',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_007',
    latex: 'T_A^{-1}=T_{A^{-1}}',
    expected: '⠠⠞⠰⠠⠁⠘⠤⠂⠀⠨⠅⠀⠠⠞⠰⠠⠁⠰⠘⠤⠂'
  },
  {
    id: 'aata-008-union-with-limits',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_008',
    latex: '\\bigcup_{k}X_k=X',
    expected: '⠐⠨⠬⠩⠅⠻⠠⠭⠰⠅⠀⠨⠅⠀⠠⠭'
  },
  {
    id: 'aata-009-fraction-function',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_009',
    latex: 'f(p/q)=\\frac{p+1}{p-2}',
    expected: '⠋⠷⠏⠸⠌⠟⠾⠀⠨⠅⠀⠹⠏⠬⠂⠌⠏⠤⠆⠼'
  },
  {
    id: 'aata-011-conjugate-equation',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_011',
    latex: '\\bar z=a-bi',
    expected: '⠵⠱⠀⠨⠅⠀⠁⠤⠃⠊'
  },
  {
    id: 'aata-014-nested-radicals',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_014',
    latex: '\\sqrt{2+\\sqrt{3}}',
    expected: '⠜⠆⠬⠨⠜⠒⠨⠻⠻'
  },
  {
    id: 'aata-015-indexed-radical-in-radical',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_015',
    latex: '\\sqrt{\\sqrt[3]{2}-i}',
    expected: '⠜⠨⠣⠒⠜⠆⠨⠻⠤⠊⠻'
  },
  {
    id: 'aata-019-factorial-number',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_019',
    latex: '300!',
    expected: '⠼⠒⠴⠴⠯'
  },
  {
    id: 'aata-020-associative-union',
    sourceFile: 'tests/braille/Nemeth/AataNemeth.rs::test_020',
    latex: 'A\\cup(B\\cup C)=(A\\cup B)\\cup C',
    expected: '⠠⠁⠨⠬⠷⠠⠃⠨⠬⠠⠉⠾⠀⠨⠅⠀⠷⠠⠁⠨⠬⠠⠃⠾⠨⠬⠠⠉'
  }
];
