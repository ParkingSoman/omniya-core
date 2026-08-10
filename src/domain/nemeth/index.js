/**
 * Standalone Nemeth mathematical-passage compiler. The tables are declarative
 * and deliberately kept independent of the renderer so they can be audited
 * against BANA 2022 and reused by display, editing, and export paths.
 */
const UNICODE = new Map([
  ['⠁','a'],['⠃','b'],['⠉','c'],['⠙','d'],['⠑','e'],['⠋','f'],['⠛','g'],['⠓','h'],['⠊','i'],['⠚','j'],['⠅','k'],['⠇','l'],['⠍','m'],['⠝','n'],['⠕','o'],['⠏','p'],['⠟','q'],['⠗','r'],['⠎','s'],['⠞','t'],['⠥','u'],['⠧','v'],['⠺','w'],['⠭','x'],['⠽','y'],['⠵','z'],
  ['⠬','+'],['⠤','-'],['⠐','\\cdot'],['⠨','<'],['⠰','>'],['⠶','('],['⠷','('],['⠦',')'],['⠾',')'],['⠌','/'],['⠲','.'],['⠼','#'],['⠔','*'],['⠿',';'],['⠒',':'],['⠂',','],['⠈','`'],['⠘','^'],['⠸','|'],['⠈','`'],['⠨','<'],['⠰','>']
]);
const ASCII = new Map([...Object.entries({
  a:'⠁',b:'⠃',c:'⠉',d:'⠙',e:'⠑',f:'⠋',g:'⠛',h:'⠓',i:'⠊',j:'⠚',k:'⠅',l:'⠇',m:'⠍',n:'⠝',o:'⠕',p:'⠏',q:'⠟',r:'⠗',s:'⠎',t:'⠞',u:'⠥',v:'⠧',w:'⠺',x:'⠭',y:'⠽',z:'⠵'
}), ...[['+','⠬'],['-','⠤'],['/','⠌'],['(', '⠶'],[')', '⠦'],['#','⠼'],['*','⠔'],['<','⠨'],['>','⠰'],['.','⠲'],[',','⠂'],[':','⠒'],[';','⠿'],[' ',' ']]]);

export const TRACEABILITY_MANIFEST = Object.freeze(Array.from({ length: 26 }, (_, i) => ({ section: `BANA-2022-${i + 1}`, tokens: [], productions: [], printer: [], tests: [] })));

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
