/**
 * A fix that says it reverses a standing note is held for a person. The hold is a SIGNAL, not a lock
 * (the agent writes the body). This says when the signal can be answered without a person: the
 * reversal rests on the Nemeth Code itself. The owner decided this (2026-10-17): the Code and the
 * contributor are the spec for how Nemeth is read.
 *
 * A "Reverses a standing note" section is NOT held when ALL of these hold:
 *   1. It cites a rule number, next to the word Rule, BANA, Nemeth or section (for example "Rule 14.8.8").
 *   2. At least one cited number is a real rule or heading number in the Code's own text in this repository
 *      (`test/corpus/sources/Nemeth_2022.txt`). A number that is not there does not count.
 *   3. The pull request changes the Nemeth code itself (`src/domain/nemeth/`), so the reversal is about
 *      how the Code is read, not about something else with a Code number pasted next to it.
 * When the Code text cannot be read, or looks too small, nothing is justified: it fails closed.
 * Every other reversal stays held.
 */

import { readFileSync } from 'node:fs';

const SOURCE = new URL('../../test/corpus/sources/Nemeth_2022.txt', import.meta.url);
const MIN_RULES = 200;

/** The rule and heading numbers that start a line of the Code's text, like "14.8.8   Any other symbol...". */
export function ruleNumbers(text) {
  const numbers = new Set();
  for (const line of String(text ?? '').split('\n')) {
    const match = /^\s{0,12}(\d{1,2}(?:\.\d{1,3}){1,4})\s{2,}\S/.exec(line);
    if (match) numbers.add(match[1]);
  }
  return numbers;
}

/** The set of real numbers, or null when the Code text is missing or too small to trust. */
export function loadCodeRules(read = () => readFileSync(SOURCE, 'utf8')) {
  try {
    const numbers = ruleNumbers(read());
    return numbers.size >= MIN_RULES ? numbers : null;
  } catch {
    return null;
  }
}

/** The text under the "Reverses a standing note" heading, up to the next heading. */
export function standingNoteSection(body) {
  const lines = String(body ?? '').split('\n');
  const start = lines.findIndex((line) => /^[ \t]{0,3}#{1,6}[ \t]*reverses a standing note/i.test(line));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^[ \t]{0,3}#{1,6}[ \t]/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** The rule-like numbers a section cites, each next to the word Rule, BANA, Nemeth or section. */
export function citedNumbers(section) {
  const found = new Set();
  const pattern = /(?:\brules?\b|\bbana\b|\bnemeth(?:_2022)?\b|\bsections?\b|§)[^\n\d]{0,25}(\d{1,2}(?:\.\d{1,3}){1,4})(?![\d.]*\d)/gi;
  for (const match of String(section ?? '').matchAll(pattern)) found.add(match[1]);
  return found;
}

/**
 * Is the reversal answered by the Code?
 * @param {{body: string, files: Array<{filename: string, previous_filename?: string}>, codeRules: Set<string>|null}} input
 */
export function justifiedByTheCode({ body, files, codeRules }) {
  if (!(codeRules instanceof Set) || codeRules.size < MIN_RULES) return false;
  const touchesNemeth = (files ?? []).some((f) => String(f.filename ?? '').startsWith('src/domain/nemeth/'));
  if (!touchesNemeth) return false;
  return [...citedNumbers(standingNoteSection(body))].some((number) => codeRules.has(number));
}
