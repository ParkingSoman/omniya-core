/**
 * Standalone Nemeth mathematical-passage compiler. The tables are declarative
 * and deliberately kept independent of the renderer so they can be audited
 * against BANA 2022 and reused by display, editing, and export paths.
 */
export const BANA_2022_URL = 'https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf';
export const BANA_NEMETH_PAGE_URL = 'https://www.brailleauthority.org/nemeth-code';
export const BANA_2022_ERRATA_URL = 'https://www.brailleauthority.org/sites/default/files/2026-08/Errata%20Nemeth%20Code%202022%20Approved%2010-2025.pdf';

/**
 * Every entry below is tied to a BANA rule. The PDF's Rule 6 (Alphabets),
 * Rule 19 (Grouping), Rule 20 (Operations), and Rule 21 (Comparisons) are
 * normative; these are not generic “Braille math” guesses. See the detailed
 * section/page links in docs/nemeth-traceability.md.
 */
export const UNICODE = new Map([
  ['⠁','a'],['⠃','b'],['⠉','c'],['⠙','d'],['⠑','e'],['⠋','f'],['⠛','g'],['⠓','h'],['⠊','i'],['⠚','j'],['⠅','k'],['⠇','l'],['⠍','m'],['⠝','n'],['⠕','o'],['⠏','p'],['⠟','q'],['⠗','r'],['⠎','s'],['⠞','t'],['⠥','u'],['⠧','v'],['⠺','w'],['⠭','x'],['⠽','y'],['⠵','z'],
  ['⠬','+'],['⠤','-'],['⠐','\\cdot'],['⠨','<'],['⠰','>'],['⠶','('],['⠷','('],['⠦',')'],['⠾',')'],['⠌','/'],['⠲','.'],['⠼','#'],['⠔','*'],['⠿',';'],['⠒',':'],['⠂',','],['⠈','`'],['⠘','^'],['⠸','|'],['⠈','`'],['⠨','<'],['⠰','>']
]);
const ASCII = new Map([...Object.entries({
  a:'⠁',b:'⠃',c:'⠉',d:'⠙',e:'⠑',f:'⠋',g:'⠛',h:'⠓',i:'⠊',j:'⠚',k:'⠅',l:'⠇',m:'⠍',n:'⠝',o:'⠕',p:'⠏',q:'⠟',r:'⠗',s:'⠎',t:'⠞',u:'⠥',v:'⠧',w:'⠺',x:'⠭',y:'⠽',z:'⠵'
}), ...[['+','⠬'],['-','⠤'],['/','⠌'],['(', '⠶'],[')', '⠦'],['#','⠼'],['*','⠔'],['<','⠨'],['>','⠰'],['.','⠲'],[',','⠂'],[':','⠒'],[';','⠿'],[' ',' ']]]);

/**
 * Per-cell audit trail. No cell is accepted by UNICODE without an entry here.
 * The status is intentionally explicit: `verified` means the cell identity is
 * grounded in the cited BANA rule, while `placeholder` means the current
 * lexer accepts it only as scaffolding and must not be advertised as a
 * conforming Nemeth translation.
 */
const LETTER_RULE = { rules: ['6.3', '6.4'], source: `${BANA_2022_URL}#page=85`, status: 'verified' };
const TOKEN_RULES = {
  '⠬': { latex: '+', rules: ['20.1'], source: `${BANA_2022_URL}#page=279`, status: 'placeholder' },
  '⠤': { latex: '-', rules: ['20.6'], source: `${BANA_2022_URL}#page=279`, status: 'placeholder' },
  '⠐': { latex: '\\cdot', rules: ['20.3'], source: `${BANA_2022_URL}#page=279`, status: 'placeholder' },
  '⠨': { latex: '<', rules: ['21.7'], source: `${BANA_2022_URL}#page=298`, status: 'placeholder' },
  '⠰': { latex: '>', rules: ['21.13'], source: `${BANA_2022_URL}#page=298`, status: 'placeholder' },
  '⠶': { latex: '(', rules: ['19.1'], source: `${BANA_2022_URL}#page=252`, status: 'placeholder' },
  '⠷': { latex: '(', rules: ['19.1'], source: `${BANA_2022_URL}#page=252`, status: 'placeholder' },
  '⠦': { latex: ')', rules: ['19.1'], source: `${BANA_2022_URL}#page=252`, status: 'placeholder' },
  '⠾': { latex: ')', rules: ['19.1'], source: `${BANA_2022_URL}#page=252`, status: 'placeholder' },
  '⠌': { latex: '/', rules: ['20.8'], source: `${BANA_2022_URL}#page=289`, status: 'placeholder' },
  '⠲': { latex: '.', rules: ['8.1'], source: `${BANA_2022_URL}#page=111`, status: 'placeholder' },
  '⠼': { latex: '#', rules: ['3.1'], source: `${BANA_2022_URL}#page=27`, status: 'placeholder' },
  '⠔': { latex: '*', rules: ['20.2'], source: `${BANA_2022_URL}#page=279`, status: 'placeholder' },
  '⠿': { latex: ';', rules: ['8.5'], source: `${BANA_2022_URL}#page=111`, status: 'placeholder' },
  '⠒': { latex: ':', rules: ['8.5'], source: `${BANA_2022_URL}#page=111`, status: 'placeholder' },
  '⠂': { latex: ',', rules: ['8.1'], source: `${BANA_2022_URL}#page=111`, status: 'placeholder' },
  '⠈': { latex: '`', rules: ['24.1'], source: `${BANA_2022_URL}#page=362`, status: 'placeholder' },
  '⠘': { latex: '^', rules: ['14.3'], source: `${BANA_2022_URL}#page=170`, status: 'placeholder' },
  '⠸': { latex: '|', rules: ['19.9'], source: `${BANA_2022_URL}#page=252`, status: 'placeholder' }
};
export const TOKEN_TRACEABILITY = Object.freeze(Object.fromEntries([
  ...[...UNICODE.entries()].filter(([cell]) => !TOKEN_RULES[cell]).map(([cell, latex]) => [cell, { latex, ...LETTER_RULE }]),
  ...Object.entries(TOKEN_RULES)
]));

export const TRACEABILITY_MANIFEST = Object.freeze([
  { rule: 1, title: 'Basic Principles', sections: ['1.2', '1.3', '1.4'], status: 'policy', implemented: ['math-passage-scope', 'literal-rule-interpretation'], source: `${BANA_2022_URL}#page=18` },
  { rule: 2, title: 'Nemeth Braille Indicators', sections: ['2.1', '2.2', '2.3'], status: 'partial', implemented: ['delimiter-input-normalization'], source: `${BANA_2022_URL}#page=22` },
  { rule: 3, title: 'Numeric Signs and Symbols', sections: ['3.1', '3.2', '3.3'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=27` },
  { rule: 4, title: 'Code Switching', sections: ['4.2', '4.4', '4.6'], status: 'out-of-scope', implemented: [], source: `${BANA_2022_URL}#page=52` },
  { rule: 5, title: 'Capitalization', sections: ['5.1', '5.3'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=83` },
  { rule: 6, title: 'Alphabets', sections: ['6.1', '6.3', '6.4'], status: 'partial', implemented: ['basic-latin-cell-table'], source: `${BANA_2022_URL}#page=85` },
  { rule: 7, title: 'Typeforms', sections: ['7.1', '7.2'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=102` },
  { rule: 8, title: 'Punctuation Signs and Symbols', sections: ['8.1', '8.2', '8.5', '8.6'], status: 'partial', implemented: ['cell-normalization-only'], source: `${BANA_2022_URL}#page=111` },
  { rule: 9, title: 'Reference Signs, Symbols, and Icons', sections: ['9.1', '9.2'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=127` },
  { rule: 10, title: 'Abbreviations', sections: ['10.1', '10.6'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=131` },
  { rule: 11, title: 'Omissions', sections: ['11.1'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=142` },
  { rule: 12, title: 'Cancellation', sections: ['12.1'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=150` },
  { rule: 13, title: 'Fractions', sections: ['13.1', '13.2', '13.5', '13.7'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=154` },
  { rule: 14, title: 'Superscripts and Subscripts', sections: ['14.3', '14.4', '14.8'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=170` },
  { rule: 15, title: 'Modifiers', sections: ['15.1', '15.13', '15.16'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=194` },
  { rule: 16, title: 'Radicals', sections: ['16.1', '16.2', '16.3'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=215` },
  { rule: 17, title: 'Shapes', sections: ['17.1', '17.5'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=222` },
  { rule: 18, title: 'Function Names and Their Abbreviated Forms', sections: ['18.1', '18.4', '18.5'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=242` },
  { rule: 19, title: 'Signs and Symbols of Grouping', sections: ['19.1', '19.5', '19.9'], status: 'partial', implemented: ['round-delimiter-stack'], source: `${BANA_2022_URL}#page=252` },
  { rule: 20, title: 'Signs and Symbols of Operation', sections: ['20.1', '20.7', '20.8'], status: 'partial', implemented: ['plus', 'minus', 'slash', 'multiplication-placeholder'], source: `${BANA_2022_URL}#page=279` },
  { rule: 21, title: 'Signs and Symbols of Comparison', sections: ['21.1', '21.7', '21.13'], status: 'partial', implemented: ['less-than', 'greater-than'], source: `${BANA_2022_URL}#page=298` },
  { rule: 22, title: 'Arrows', sections: ['22.1', '22.3', '22.4'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=318` },
  { rule: 23, title: 'Miscellaneous Signs and Symbols', sections: ['23.7', '23.11', '23.17'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=332` },
  { rule: 24, title: 'Multipurpose Indicator', sections: ['24.1'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=362` },
  { rule: 25, title: 'Spatial Arrangements', sections: ['25.1', '25.8', '25.9'], status: 'not-implemented', implemented: [], source: `${BANA_2022_URL}#page=365` },
  { rule: 26, title: 'Format', sections: ['26.1', '26.4', '26.6'], status: 'out-of-scope', implemented: [], source: `${BANA_2022_URL}#page=398` }
]);

/** Direct source citation for each token family currently accepted. */
export const SYMBOL_TRACEABILITY = Object.freeze({
  latinLetters: { rules: ['6.3', '6.4'], source: `${BANA_2022_URL}#page=85`, note: 'Cell shapes are the standard English alphabet cells; indicator/context rules are not yet implemented.' },
  plusMinus: { rules: ['20.1', '20.6'], source: `${BANA_2022_URL}#page=279`, note: 'The compiler accepts the cells as operator tokens; spacing and compound-sign rules remain pending.' },
  comparison: { rules: ['21.7', '21.13'], source: `${BANA_2022_URL}#page=298`, note: 'Only the basic less-than/greater-than cells are currently tokenized.' },
  slash: { rules: ['20.8', '13.1'], source: `${BANA_2022_URL}#page=289`, note: 'Slash is a token only; fraction indicators and fraction grammar are not implemented.' },
  grouping: { rules: ['19.1', '19.5'], source: `${BANA_2022_URL}#page=252`, note: 'The delimiter stack is an editor recovery mechanism, not a claim of complete grouping-symbol coverage.' },
  whitespace: { rules: ['4.6', '8.1', '19.9', '20.1'], source: `${BANA_2022_URL}#page=52`, note: 'The current parser discards blanks; this is explicitly non-conformant for context-sensitive spacing.' },
  incrementalRecovery: { rules: ['1.3.1'], source: `${BANA_2022_URL}#page=19`, note: 'EOF delimiter recovery is an application editing policy, never a transcription rule; strict mode remains normative.' }
});

export const NEMETH_CONFORMANCE = Object.freeze({ standard: 'BANA Nemeth Braille Code for Mathematics and Science Notation 2022', status: 'not-conformant', reason: 'The manifest intentionally exposes unimplemented rule families; do not advertise complete Nemeth support until every applicable row is strict/incremental/source-map tested.', source: BANA_NEMETH_PAGE_URL, errata: BANA_2022_ERRATA_URL });

export function normalizeCells(input) {
  if (Array.isArray(input)) return input.flatMap((v) => normalizeCells(String(v)));
  if (typeof input !== 'string') throw new TypeError('Nemeth input must be text or cells');
  const result = [];
  for (const char of input) {
    if (char === '\n' || char === '\r' || char === '\t') { result.push(' '); continue; }
    const code = char.codePointAt(0);
    if (code >= 0x2800 && code <= 0x28ff) { result.push(String.fromCodePoint(0x2800 + (code - 0x2800 & 0x3f))); continue; }
    if (ASCII.has(char)) result.push(ASCII.get(char));
    else if (UNICODE.has(char)) result.push(char);
    else if (char === ' ') result.push(' ');
    else throw new TypeError(`Unsupported Braille input: ${char}`);
  }
  return result;
}

function diagnostic(message, startCell, expected) { return { code: 'NEMETH_SYNTAX', message, startCell, endCell: startCell, expected }; }

export function parseNemeth(input, { mode = 'strict' } = {}) {
  let cells;
  try { cells = normalizeCells(input); } catch (error) { return { ok: false, error: diagnostic(error.message, 0, ['Braille cell']) }; }
  const ast = { type: 'sequence', children: [] };
  const sourceMap = [];
  const warnings = [];
  const stack = [];
  let latex = '';
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell === ' ') continue;
    if (cell === '⠶' || cell === '⠷') { stack.push(i); latex += '\\left('; ast.children.push({ type: 'group-start', source: [i, i] }); continue; }
    if (cell === '⠦' || cell === '⠾') { if (!stack.length) return { ok: false, error: diagnostic('Unexpected closing delimiter', i, ['open delimiter']) }; stack.pop(); latex += '\\right)'; ast.children.push({ type: 'group-end', source: [i, i] }); continue; }
    const mapped = UNICODE.get(cell);
    if (!mapped) return { ok: false, error: diagnostic('Unknown Nemeth cell', i, ['mathematical symbol']) };
    if (mapped === ';') return { ok: false, error: diagnostic('Punctuation is not valid in this mathematical position', i, ['operand', 'operator']) };
    latex += mapped;
    const nodeId = `nemeth-${i}`;
    ast.children.push({ type: mapped === '+' || mapped === '-' ? 'operator' : 'atom', value: mapped, source: [i, i] });
    sourceMap.push({ nodeId, startCell: i, endCell: i });
  }
  if (stack.length) {
    if (mode === 'strict') return { ok: false, error: diagnostic('Missing closing delimiter', stack.at(-1), [')']) };
    while (stack.length) { stack.pop(); latex += '\\right)'; }
    warnings.push({ code: 'NEMETH_RECOVERY', message: 'Inserted missing closing delimiter at end of input', startCell: cells.length, endCell: cells.length, expected: [')'] });
  }
  return { ok: true, latex, ast, warnings, sourceMap };
}
