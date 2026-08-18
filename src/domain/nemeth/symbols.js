/**
 * Longest-match symbol table, built once from `symbols.json`.
 *
 * `symbols.json` is data only. Every row carries a `banaRef` into BANA's Nemeth
 * 2022 (test/corpus/sources/Nemeth_2022.txt), or `null` where the Code does not
 * define the symbol -- the English alphabet is the case that matters here, since
 * the Code says outright that "The English alphabet letters are not specified in
 * this Code". A null ref is honest; an invented one is not.
 *
 * Matching is longest-first because Nemeth symbols share prefixes: the cells of a
 * compound symbol must never be read as two shorter symbols. `matchAt` is pure,
 * which lets the lexer look ahead a whole token for free.
 */

import rows from './symbols.json' with { type: 'json' };

const newNode = () => ({ row: null, children: new Map() });
const root = newNode();

for (const row of rows) {
  let node = root;
  for (const cell of row.cells) {
    if (!node.children.has(cell)) node.children.set(cell, newNode());
    node = node.children.get(cell);
  }
  if (node.row) throw new Error(`symbols.json defines "${row.cells}" more than once`);
  node.row = Object.freeze(row);
}

/**
 * Longest symbol starting at `index`, or null when no symbol starts there.
 * Returns the matched row's fields plus `len`, the number of cells consumed.
 */
export function matchAt(cells, index) {
  let node = root;
  let best = null;
  for (let i = index; i < cells.length; i += 1) {
    node = node.children.get(cells[i]);
    if (!node) break;
    if (node.row) best = Object.freeze({ ...node.row, len: i - index + 1 });
  }
  return best;
}

