// English (U.S.) 8-dot computer braille (liblouis `en-us-comp8`), for decoding
// keyboard input from a connected braille keyboard/display whose driver is
// configured to send this specific input table instead of raw Unicode
// braille cells. See docs/nemeth-v2/HANDOFF.md "Input path" for why this
// exists, and why using it is an explicit, opt-in choice rather than the
// default.
//
// This is a DIFFERENT table from braille-ascii.js, deliberately not reused:
// braille-ascii.js is 6-dot only and case-folds ('a' and 'A' both decode to
// the same cell) because it exists as a corpus/transcription aid, not a live
// keyboard decoder. Real 8-dot computer braille preserves case by adding
// dot 7 to the lowercase pattern, and this table does the same, so 'x' and
// 'X' remain distinguishable.
//
// Every entry below is transcribed directly from liblouis's actual table
// definitions (verified character-by-character, not assumed):
//   https://github.com/liblouis/liblouis/blob/master/tables/latinLetterDef8Dots.uti
//   https://github.com/liblouis/liblouis/blob/master/tables/loweredDigits6Dots.uti
//   https://github.com/liblouis/liblouis/blob/master/tables/en-us-comp8.ctb
// The space bar is intentionally not listed here: nemeth-input.js already
// maps a literal space to the blank cell (U+2800) independent of any table,
// and both source tables agree a blank cell is what a computer-braille
// device sends for its own space key. `en-us-comp8.ctb` also defines a dot
// pattern for U+25CF (BLACK CIRCLE) that collides with `*`'s dots (both are
// dots 1,6) -- but that entry is marked `noback`, meaning a real device's
// own dots-to-character step never produces BLACK CIRCLE for that chord, so
// it is omitted here rather than introducing an ambiguous decode.
const EN_US_COMP8_TABLE = {
  // Lowercase letters.
  a: '1', b: '12', c: '14', d: '145', e: '15', f: '124', g: '1245',
  h: '125', i: '24', j: '245', k: '13', l: '123', m: '134', n: '1345',
  o: '135', p: '1234', q: '12345', r: '1235', s: '234', t: '2345',
  u: '136', v: '1236', w: '2456', x: '1346', y: '13456', z: '1356',
  // Uppercase letters: lowercase dots plus dot 7 (the capital indicator).
  A: '17', B: '127', C: '147', D: '1457', E: '157', F: '1247', G: '12457',
  H: '1257', I: '247', J: '2457', K: '137', L: '1237', M: '1347', N: '13457',
  O: '1357', P: '12347', Q: '123457', R: '12357', S: '2347', T: '23457',
  U: '1367', V: '12367', W: '24567', X: '13467', Y: '134567', Z: '13567',
  // Digits (the "lowered" 6-dot digit patterns computer braille uses).
  '0': '356', '1': '2', '2': '23', '3': '25', '4': '256', '5': '26',
  '6': '235', '7': '2356', '8': '236', '9': '35',
  // Punctuation and symbols.
  ',': '6', ';': '56', ':': '156', '.': '46', '!': '2346', '"': '5',
  "'": '3', '(': '12356', ')': '23456', '-': '36', '_': '456', '<': '126',
  '=': '123456', '>': '345', '%': '146', '+': '346', '~': '45', '`': '4',
  '&': '12346', $: '1246', '?': '1456', '{': '246', '[': '2467',
  '}': '12456', ']': '124567', '^': '457', '@': '47', '#': '3456',
  '\\': '12567', '|': '1256', '/': '34', '*': '16'
};

function dotsStringToCodepoint(dotsStr) {
  let value = 0;
  for (const dotChar of dotsStr) {
    const dot = parseInt(dotChar, 10);
    value += 1 << (dot - 1);
  }
  return 0x2800 + value;
}

const DECODE_MAP = new Map(
  Object.entries(EN_US_COMP8_TABLE).map(([character, dots]) => [character, String.fromCodePoint(dotsStringToCodepoint(dots))])
);

/**
 * Decode one character of English (U.S.) 8-dot computer braille text -- as
 * produced by a braille keyboard/display driver in that input mode -- into
 * the raw Unicode braille cell (U+2800-U+28FF) it was chorded from.
 *
 * @returns {string|null} the braille cell, or null if `character` has no
 *   entry in this table (callers should treat that the same as any other
 *   non-braille character rather than guessing).
 */
export function decodeEnUsComp8(character) {
  return DECODE_MAP.get(character) ?? null;
}
