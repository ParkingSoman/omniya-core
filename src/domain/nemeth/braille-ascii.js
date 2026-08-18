// Convert between Braille-ASCII characters and Unicode braille cells (U+2800–U+28FF)
// This module is a pure encoding utility with no Nemeth semantics.

// The 64-character Braille-ASCII table (verified against BANA Nemeth 2022)
// Maps each ASCII character to its dot numbers as a string (e.g., '2346' means dots 2, 3, 4, 6)
// Space maps to empty string (U+2800 = no dots)
const BRAILLE_ASCII_TABLE = {
  ' ': '',
  '!': '2346',
  '"': '5',
  '#': '3456',
  '$': '1246',
  '%': '146',
  '&': '12346',
  "'": '3',
  '(': '12356',
  ')': '23456',
  '*': '16',
  '+': '346',
  ',': '6',
  '-': '36',
  '.': '46',
  '/': '34',
  '0': '356',
  '1': '2',
  '2': '23',
  '3': '25',
  '4': '256',
  '5': '26',
  '6': '235',
  '7': '2356',
  '8': '236',
  '9': '35',
  ':': '156',
  ';': '56',
  '<': '126',
  '=': '123456',
  '>': '345',
  '?': '1456',
  '@': '4',
  'A': '1',
  'B': '12',
  'C': '14',
  'D': '145',
  'E': '15',
  'F': '124',
  'G': '1245',
  'H': '125',
  'I': '24',
  'J': '245',
  'K': '13',
  'L': '123',
  'M': '134',
  'N': '1345',
  'O': '135',
  'P': '1234',
  'Q': '12345',
  'R': '1235',
  'S': '234',
  'T': '2345',
  'U': '136',
  'V': '1236',
  'W': '2456',
  'X': '1346',
  'Y': '13456',
  'Z': '1356',
  '[': '246',
  '\\': '1256',
  ']': '12456',
  '^': '45',
  '_': '456'
};

// Build reverse lookup table: Unicode braille cell -> ASCII character
// We precompute the codepoint values for each character
const CELLS_TO_ASCII_MAP = new Map();

for (const [ascii, dotsStr] of Object.entries(BRAILLE_ASCII_TABLE)) {
  const codepoint = dotsStringToCodepoint(dotsStr);
  CELLS_TO_ASCII_MAP.set(codepoint, ascii);
}

/**
 * Convert dot numbers (as a string like '2346') to a Unicode braille codepoint value
 * Uses the formula: 0x2800 + sum(1 << (dot - 1)) for each dot
 */
function dotsStringToCodepoint(dotsStr) {
  if (dotsStr === '') {
    return 0x2800; // No dots = U+2800
  }

  let value = 0;
  for (const dotChar of dotsStr) {
    const dot = parseInt(dotChar, 10);
    value += 1 << (dot - 1);
  }
  return 0x2800 + value;
}

/**
 * Convert a Braille-ASCII string to Unicode braille cells
 * Case-insensitive input (both 'a' and 'A' are valid and map to the same cell)
 * Throws RangeError if an unmapped character is encountered
 */
export function asciiToCells(s) {
  let result = '';

  for (let i = 0; i < s.length; i++) {
    const char = s[i].toUpperCase();

    if (!(char in BRAILLE_ASCII_TABLE)) {
      throw new RangeError(`Unmapped character '${s[i]}' at index ${i}`);
    }

    const dotsStr = BRAILLE_ASCII_TABLE[char];
    const codepoint = dotsStringToCodepoint(dotsStr);
    result += String.fromCodePoint(codepoint);
  }

  return result;
}

/**
 * Convert Unicode braille cells to Braille-ASCII (uppercase)
 * Only accepts 6-dot cells (U+2800–U+283F)
 * Throws RangeError if:
 * - A codepoint is outside U+2800–U+283F
 * - An 8-dot cell (U+2840–U+28FF) is provided
 */
export function cellsToAscii(s) {
  let result = '';

  for (let i = 0; i < s.length; i++) {
    const codepoint = s.codePointAt(i);

    // Check bounds: must be in range U+2800–U+283F (6-dot cells only)
    if (codepoint < 0x2800 || codepoint > 0x283F) {
      const char = String.fromCodePoint(codepoint);
      throw new RangeError(`Codepoint U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} (${char}) is outside valid range U+2800–U+283F at index ${i}`);
    }

    if (!CELLS_TO_ASCII_MAP.has(codepoint)) {
      // This shouldn't happen if the table is complete, but be defensive
      const char = String.fromCodePoint(codepoint);
      throw new RangeError(`Unmapped braille cell U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} (${char}) at index ${i}`);
    }

    result += CELLS_TO_ASCII_MAP.get(codepoint);
  }

  return result;
}
