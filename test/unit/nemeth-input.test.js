import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyNemethInput, nemethStatusMessage, resolveBrailleInputTable, toNemethCells } from '../../src/domain/nemeth-input.js';
import { NemethUnsupportedError, parseNemeth } from '../../src/domain/nemeth/index.js';
import { asciiToCells } from '../../src/domain/nemeth/braille-ascii.js';
import { createUebCellBuffer, pushUebCell } from '../../src/domain/ueb-cell-buffer.js';

const BLANK = '⠀';

/**
 * Transcription aid ONLY. Braille ASCII is how the corpus and the BANA book
 * spell cells, so writing test inputs that way keeps them readable in a diff --
 * but every value handed to the module under test is real Unicode cells. The
 * composer itself does not accept the ASCII spelling; see the QWERTY-gate test.
 */
const cells = (ascii) => asciiToCells(ascii);

// ---------------------------------------------------------------------------
// toNemethCells: what counts as a cell
// ---------------------------------------------------------------------------

test('Unicode braille passes through unchanged', () => {
  const input = cells('?a/b#');
  assert.deepEqual(toNemethCells(input), { cells: input, rejected: [] });
});

test('the space bar becomes the blank CELL, because a dot chord cannot produce it', () => {
  // The blank is a Nemeth token (Rule 20/21 comparison spacing), and the same
  // ' ' <-> U+2800 equivalence is already built into pushUebCell.
  const result = toNemethCells(`${cells('x')} ${cells('y')}`);
  assert.equal(result.cells, `${cells('x')}${BLANK}${cells('y')}`);
  assert.deepEqual(result.rejected, []);
});

test('QWERTY characters are rejected, not read as their Braille ASCII cells', () => {
  // Standing product decision -- commit 8bc05ae, "gate Nemeth QWERTY", and
  // test/e2e/ueb-text-command-mode.test.js. braille-ascii.js *could* map 'a' to
  // the letter cell; doing so here would silently reinterpret prose as
  // mathematics, so this module deliberately does not call it.
  const result = toNemethCells('a');
  assert.equal(result.cells, '');
  assert.deepEqual(result.rejected, [{ index: 0, character: 'a' }]);
  assert.notEqual(result.cells, asciiToCells('a'), 'must not decode QWERTY to cells');
});

// ---------------------------------------------------------------------------
// The opt-in computer-braille decode (off by default)
// ---------------------------------------------------------------------------

test('with no table given, ASCII that a computer braille keyboard would send is still rejected', () => {
  // Same guarantee as the QWERTY test above, restated for the new parameter's
  // default: omitting brailleInputTable must behave exactly as before this
  // option existed.
  assert.deepEqual(toNemethCells('2'), { cells: '', rejected: [{ index: 0, character: '2' }] });
  assert.deepEqual(toNemethCells('2', 'none'), { cells: '', rejected: [{ index: 0, character: '2' }] });
});

test('with en-us-comp8 selected, computer-braille ASCII decodes instead of rejecting', () => {
  // '#' is the numeric indicator (dots 3456) in both this table and Nemeth
  // grammar -- Nemeth requires it before a digit run regardless of input
  // method, so it is not special-cased here, just typed like any other cell.
  const result = toNemethCells('#2+#2', 'en-us-comp8');
  assert.deepEqual(result.rejected, []);
  assert.equal(result.cells.length, 5);
  const classification = classifyNemethInput('#2+#2', { brailleInputTable: 'en-us-comp8' });
  assert.equal(classification.state, 'complete');
  assert.equal(classification.latex, '2+2');
});

test('en-us-comp8 decoding preserves case, unlike Braille ASCII', () => {
  const lower = toNemethCells('x', 'en-us-comp8').cells;
  const upper = toNemethCells('X', 'en-us-comp8').cells;
  assert.notEqual(lower, upper);
});

test('en-us-comp8 still rejects characters it has no entry for', () => {
  const result = toNemethCells('2€', 'en-us-comp8');
  assert.deepEqual(result.rejected, [{ index: 1, character: '€' }]);
});

test('an unknown table name behaves as if no table were given', () => {
  assert.deepEqual(toNemethCells('2', 'not-a-real-table'), { cells: '', rejected: [{ index: 0, character: '2' }] });
});

test('every rejected character is reported, and the cells around them are kept', () => {
  // Reporting all of them (rather than stopping at the first) is what lets the
  // composer strip exactly the offending characters instead of clearing the
  // field and throwing away work the author did correctly.
  const result = toNemethCells(`q${cells('x')}\n${cells('y')}~`);
  assert.equal(result.cells, `${cells('x')}${cells('y')}`);
  assert.deepEqual(result.rejected.map(({ character }) => character), ['q', '\n', '~']);
  assert.deepEqual(result.rejected.map(({ index }) => index), [0, 2, 4]);
});

// ---------------------------------------------------------------------------
// Blocker: the blank cell is a TOKEN in Nemeth, a terminator in UEB.
// ---------------------------------------------------------------------------

test('a blank cell inside an expression is carried through, not treated as a boundary', () => {
  // 'x .k y' = x = y. BANA Rule 21.13: "A space must be left on either side of
  // a comparison symbol", so the blanks are load-bearing, not whitespace.
  const classification = classifyNemethInput(cells('x .k y'));
  assert.equal(classification.state, 'complete');
  assert.equal(classification.latex, 'x=y');
  assert.equal(classification.cellCount, 6);
  assert.equal(classification.cells.split(BLANK).length - 1, 2, 'both blanks survive');
});

test('routing the same cells through the UEB cell buffer would truncate at the first blank', () => {
  // The regression this whole input path exists to avoid. `pushUebCell` is
  // correct for UEB, where a space ends a word; it is the wrong tool for
  // Nemeth, and this pins the difference rather than leaving it as a comment.
  const input = cells('x .k y');
  let buffer = createUebCellBuffer();
  let firstFlush = null;
  for (const cell of input) {
    const result = pushUebCell(buffer, cell);
    buffer = result.buffer;
    if (result.flush !== null && firstFlush === null) firstFlush = result.flush;
  }
  assert.equal(firstFlush, cells('x'), 'the UEB buffer flushes at the first blank, keeping only "x"');
  assert.notEqual(firstFlush, input);
  // Whereas the Nemeth path parses all six cells as one expression.
  assert.equal(parseNemeth(input).latex, 'x=y');
});

// ---------------------------------------------------------------------------
// The five live states
// ---------------------------------------------------------------------------

test('an empty field is empty, not a refusal', () => {
  assert.equal(classifyNemethInput('').state, 'empty');
  assert.equal(classifyNemethInput(null).state, 'empty');
});

test('a buffer that parses is complete and carries its LaTeX', () => {
  const classification = classifyNemethInput(cells('?a/b#'));
  assert.equal(classification.state, 'complete');
  assert.equal(classification.latex, '\\frac{a}{b}');
  assert.equal(classification.readCells, 5);
});

test('a buffer whose prefix parses reports where reading stopped', () => {
  // 'x+' -- the operator has no right operand yet.
  const classification = classifyNemethInput(cells('x+'));
  assert.equal(classification.state, 'partial');
  assert.equal(classification.latex, 'x');
  assert.equal(classification.readCells, 1);
  assert.equal(classification.cellCount, 2);
});

test('a buffer with no readable prefix is unreadable, and says nothing about support', () => {
  // An unfinished fraction: no prefix of '?a/b' parses, because a fraction is
  // only an expression once it is closed.
  const classification = classifyNemethInput(cells('?a/b'));
  assert.equal(classification.state, 'unreadable');
  assert.equal(classification.readCells, 0);
});

test('a non-cell character makes the whole classification not-braille', () => {
  const classification = classifyNemethInput(`${cells('x')}a`);
  assert.equal(classification.state, 'not-braille');
  assert.equal(classification.cells, cells('x'), 'the valid cells are still offered to the caller');
});

// ---------------------------------------------------------------------------
// The evidence the design rests on
// ---------------------------------------------------------------------------

test('refusal offsets are NOT end-of-input markers, so they cannot classify "still typing"', () => {
  // This is why the live status reports measured facts instead of predicting.
  // If a future change makes offsets end-anchored, this test fails and the
  // cheaper offset-based classifier becomes available -- that is the point.
  for (const [ascii, expectedOffset] of [['x+', 1], ['?a/b', 3], ['x .k ', 4]]) {
    const input = cells(ascii);
    assert.throws(
      () => parseNemeth(input),
      (error) => {
        assert.ok(error instanceof NemethUnsupportedError);
        assert.equal(error.offset, expectedOffset, `${ascii}: offset`);
        assert.ok(error.offset < input.length, `${ascii}: offset is not at end of input`);
        return true;
      }
    );
  }
});

test('classifyNemethInput rethrows anything that is not a refusal', () => {
  // Swallowing a parser bug behind an ordinary-looking "not complete yet" is
  // the failure this guard prevents. Fuzzing 200,000 random cell strings drawn
  // from the symbol table produced zero non-refusal throws, so the branch is
  // unreachable through the real parser and is pinned through the seam.
  assert.throws(
    () => classifyNemethInput(cells('x'), { parse: () => { throw new RangeError('parser bug'); } }),
    /parser bug/
  );
  // A refusal from the same seam is absorbed, which is what makes the guard a
  // discriminator rather than a blanket rethrow.
  assert.equal(
    classifyNemethInput(cells('x'), {
      parse: () => { throw new NemethUnsupportedError({ detail: 'x' }); }
    }).state,
    'unreadable'
  );
});

test('the prefix scan is bounded, so a pathological paste cannot stall the composer', () => {
  let calls = 0;
  const classification = classifyNemethInput(cells('x').repeat(1000), {
    parse: () => { calls += 1; throw new NemethUnsupportedError({ detail: 'never parses' }); }
  });
  assert.equal(classification.state, 'unreadable');
  assert.equal(classification.cellCount, 1000);
  assert.ok(calls <= 257, `expected the scan to stop at the limit, got ${calls} parses`);
});

// ---------------------------------------------------------------------------
// Status messages: heard, not read
// ---------------------------------------------------------------------------

test('no live status ever claims a construct is unsupported', () => {
  // The dangerous lie is the other direction -- presenting a genuinely
  // unsupported construct as merely incomplete -- but the honest answer to
  // both is to make no claim until submit, where the parser is authoritative.
  for (const input of ['', cells('x'), cells('x+'), cells('?a/b'), 'zz', cells('x .k y')]) {
    const message = nemethStatusMessage(classifyNemethInput(input));
    assert.doesNotMatch(message, /unsupported|not supported|unavailable/i, `input: ${JSON.stringify(input)}`);
    assert.ok(message.length > 0);
  }
});

test('the status states the LaTeX it read rather than a bare approval', () => {
  // BANA Rule 14.6 makes `x1` a subscript with nothing in the cells saying so,
  // so the reading is genuinely surprising. "Looks good" would be true and
  // useless; naming the reading lets an author who cannot see the field catch
  // a base the parser took differently than they meant.
  assert.equal(classifyNemethInput(cells('x1')).state, 'complete');
  assert.equal(classifyNemethInput(cells('x1')).latex, 'x_{1}');
  assert.match(nemethStatusMessage(classifyNemethInput(cells('x1'))), /read as x_\{1\}\./);
});

test('a trailing level indicator is partial, not a complete `x`', () => {
  // This case previously reported `complete` with latex `x`: resolveLevels
  // dropped the dangling indicator, so committing mid-superscript silently
  // produced a confidently wrong answer where a refusal was available. The
  // root cause is fixed in levels.js; this pins the behaviour at the layer the
  // composer actually consumes, since that is where the wrong answer reached a
  // user. A trailing BASELINE indicator stays complete -- it asserts a return
  // to the baseline, not that anything follows.
  assert.equal(classifyNemethInput(cells('x^')).state, 'partial');
  assert.equal(classifyNemethInput(cells('x;')).state, 'partial');
  assert.equal(classifyNemethInput(cells('x"')).state, 'complete');
});

test('the rejection status says "braille cells only" and names the character', () => {
  // The wording is pinned because test/e2e/ueb-text-command-mode.test.js asserts
  // the composer error matches /braille cells only|LaTeX|x in Command mode/i.
  const message = nemethStatusMessage(classifyNemethInput('a'));
  assert.match(message, /braille cells only/i);
  assert.match(message, /"a"/);
  assert.match(message, /LaTeX/);
});

test('the status counts cells, and gets the singular right', () => {
  assert.match(nemethStatusMessage(classifyNemethInput(cells('x'))), /^1 cell read as x\./);
  assert.match(nemethStatusMessage(classifyNemethInput(cells('?a/b#'))), /^5 cells read as /);
});

test('nemethStatusMessage refuses an unknown state instead of returning undefined', () => {
  assert.throws(() => nemethStatusMessage({ state: 'invented', cellCount: 0 }), /Unknown Nemeth input state/);
});


// ---------------------------------------------------------------------------
// resolveBrailleInputTable: 'auto', and why detection is safe here

test('auto resolves raw cells and computer braille apart, and refuses what it cannot explain', () => {
  // The property the whole feature rests on: cells (U+2800-U+28FF) and the
  // ASCII a computer-braille keyboard sends are DISJOINT, so this is a
  // measurement, not a guess between two plausible readings.
  assert.equal(resolveBrailleInputTable(cells('?a/b#'), 'auto'), 'none');
  assert.equal(resolveBrailleInputTable('#2+#2', 'auto'), 'en-us-comp8');
  // Nothing typed yet: nothing to detect, so the cells-only reading stands.
  assert.equal(resolveBrailleInputTable('', 'auto'), 'none');
  // A blank is accepted in either mode and so must not decide the mode.
  assert.equal(resolveBrailleInputTable('   ', 'auto'), 'none');
  // Undecodable input resolves to 'none' so it REFUSES with the usual message
  // rather than half-decoding into a plausible wrong answer.
  assert.equal(resolveBrailleInputTable('\u00e9\u00e8', 'auto'), 'none');
});

test('an explicit pin always wins over detection', () => {
  // The escape hatch: someone whose device auto-detects wrongly must be able to
  // say so and be believed, in both directions.
  assert.equal(resolveBrailleInputTable('#2+#2', 'none'), 'none');
  assert.equal(resolveBrailleInputTable(cells('?a/b#'), 'en-us-comp8'), 'en-us-comp8');
  assert.equal(resolveBrailleInputTable('#2+#2', undefined), undefined);
});

test('auto decodes a computer-braille buffer end to end and names the reading', () => {
  // The contributor's case: '#2+#2 .k #4' is 2+2=4 in 8-dot computer braille.
  const classification = classifyNemethInput('#2+#2 .k #4', { brailleInputTable: 'auto' });
  assert.equal(classification.state, 'complete');
  assert.equal(classification.latex, '2+2=4');
  assert.equal(classification.inputTable, 'en-us-comp8');
  // Said out loud, because a wrong auto-detection must be noticeable by ear.
  assert.match(nemethStatusMessage(classification), /read as computer braille/i);
});

test('auto leaves a raw-cell buffer alone and does not announce a mode', () => {
  const classification = classifyNemethInput(cells('?a/b#'), { brailleInputTable: 'auto' });
  assert.equal(classification.state, 'complete');
  assert.equal(classification.inputTable, 'none');
  assert.doesNotMatch(nemethStatusMessage(classification), /computer braille/i);
});

test('auto DOES accept prose as letters, and says so out loud', () => {
  // Recorded because it is the real cost of defaulting to 'auto', not an
  // oversight. en-us-comp8 spans printable ASCII, so 'hello' decodes to five
  // cells that legitimately mean the letters h e l l o in Nemeth -- there is no
  // measurement that separates "prose typed by mistake" from "a braille device
  // spelling a variable sequence", because the cells are identical.
  //
  // 8bc05ae's concern was that reversing the gate "would SILENTLY reinterpret
  // someone's prose as mathematics". Silence is the part this keeps closed: the
  // status line names both the reading and the mode, so the author hears
  // "read as hello, read as computer braille" rather than nothing. The field is
  // also only reachable after Ctrl+E, which is an explicit statement that what
  // follows is an equation.
  const classification = classifyNemethInput('hello', { brailleInputTable: 'auto' });
  assert.equal(classification.state, 'complete');
  assert.equal(classification.latex, 'hello');
  assert.match(nemethStatusMessage(classification), /read as hello/i);
  assert.match(nemethStatusMessage(classification), /computer braille/i);
});

test('an explicit none pin still rejects prose outright, as 8bc05ae specified', () => {
  // The old behaviour remains available verbatim for anyone who wants it.
  const classification = classifyNemethInput('hello', { brailleInputTable: 'none' });
  assert.equal(classification.state, 'not-braille');
  assert.match(nemethStatusMessage(classification), /braille cells only/i);
});

test('a lone chord letter is the one case auto cannot call, and it errs toward chording', () => {
  // Known, accepted limit. 'f' alone is either the letter f from a
  // computer-braille keyboard or dot 1 from someone chording, and nothing in
  // the character distinguishes them. It resolves to the table, so the composer
  // treats a NON-EMPTY buffer as device input; an EMPTY field resolves to
  // 'none', which is what keeps chording available to start with. The escape
  // hatch for a device whose first keystroke is one of these six is the
  // explicit pin above.
  assert.equal(resolveBrailleInputTable('f', 'auto'), 'en-us-comp8');
  assert.equal(resolveBrailleInputTable('', 'auto'), 'none');
});
