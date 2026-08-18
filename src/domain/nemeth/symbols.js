/**
 * Longest-match symbol table, built once from `symbols.json`.
 *
 * `symbols.json` is data only. Every row carries a `banaRef` into BANA's Nemeth
 * 2022 (test/corpus/sources/Nemeth_2022.txt), or `null` where the Code does not
 * define the symbol -- as it says of the English alphabet, "not specified in
 * this Code". A null ref is honest; an invented one is not.
 *
 * Matching is longest-first because Nemeth symbols share prefixes: the cells of
 * a compound symbol must never be read as two shorter ones. `matchAt` is pure,
 * which lets the lexer look ahead a whole token for free, and returns the
 * matched row's fields plus `len`, the cells consumed -- or null.
 */

import rows from './symbols.json' with { type: 'json' };

const newNode = () => ({ row: null, children: new Map() });

// Exported so the duplicate guard and longest match are testable on other rows.
export function buildTrie(symbolRows) {
  const root = newNode();
  for (const row of symbolRows) {
    let node = root;
    for (const cell of row.cells) {
      if (!node.children.has(cell)) node.children.set(cell, newNode());
      node = node.children.get(cell);
    }
    if (node.row) throw new Error(`symbol table defines "${row.cells}" more than once`);
    node.row = Object.freeze(row);
  }
  return root;
}

const DEFAULT_TRIE = buildTrie(rows);

export function matchAt(cells, index, trie = DEFAULT_TRIE) {
  let node = trie;
  let best = null;
  for (let i = index; i < cells.length; i += 1) {
    node = node.children.get(cells[i]);
    if (!node) break;
    if (node.row) best = Object.freeze({ ...node.row, len: i - index + 1 });
  }
  return best;
}

