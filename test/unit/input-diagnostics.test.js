import assert from 'node:assert/strict';
import test from 'node:test';

import { formatInputDiagnostics } from '../../src/renderer/input-diagnostics.js';

const appInfo = { version: '0.1.0-alpha.12+5386fc6', platform: 'win32', arch: 'x64' };

test('the report answers the questions that cost three rounds of email', () => {
  // Which build, which table, what the field actually held, and whether a
  // keystroke was claimed before the field saw it.
  const report = formatInputDiagnostics({
    appInfo,
    brailleInputTable: 'en-us-comp8',
    entries: [
      { type: 'keydown', key: 'k', code: 'KeyK', swallowed: true, table: 'en-us-comp8' },
      { type: 'input', table: 'en-us-comp8', value: '#2', state: '2 cells read as 2.' }
    ]
  });

  assert.match(report, /0\.1\.0-alpha\.12\+5386fc6/, 'names the exact build, commit included');
  assert.match(report, /win32-x64/);
  assert.match(report, /Braille input table: en-us-comp8/);
  assert.match(report, /CONSUMED-BY-APP/, 'a keystroke the app consumed is visible');
  // Printable ASCII prints quoted; the cells it should have decoded to print
  // with their code points, and that contrast is the fact this report exists
  // to carry.
  assert.match(report, /field="#2"/, 'and what the field really held');
});

test('an automatic table reports the reading it settled on, not just "auto"', () => {
  // "auto" alone would leave the maintainer asking the same question again.
  const report = formatInputDiagnostics({
    appInfo, brailleInputTable: 'auto', resolvedTable: 'en-us-comp8', entries: []
  });
  assert.match(report, /Braille input table: auto \(read as en-us-comp8\)/);
});

test('running from source is said plainly rather than shown as undefined', () => {
  const report = formatInputDiagnostics({ appInfo: undefined, brailleInputTable: 'auto' });
  assert.match(report, /Build: running from source/);
  assert.doesNotMatch(report, /undefined/);
});

test('the report holds the whole session, and says how much it is disclosing', () => {
  // A keystroke log of this field IS the author's equation, so the report says
  // so in its own body -- a blind contributor can read what they are sending
  // before they send it, which is why this is plain text and not JSON.
  const entries = Array.from({ length: 60 }, (_, index) => ({ type: 'keydown', key: String(index) }));
  const report = formatInputDiagnostics({ appInfo, brailleInputTable: 'none', entries });

  const keydownLines = report.split('\n').filter((line) => line.startsWith('keydown'));
  assert.equal(keydownLines.length, 60, 'the whole session, not a tail of it');
  assert.match(keydownLines.at(0), /key="0"/, 'starting from the first keystroke after launch');
  assert.match(keydownLines.at(-1), /key="59"/);
  assert.match(report, /everything the writing fields received since the app started/);
  assert.match(report, /includes the mathematics you were typing/);
  assert.match(report, /Nothing here was saved/);
});

test('a trimmed log says so, so a partial report is never read as a whole one', () => {
  // The log holds the session, but it still has a ceiling. Silence about
  // hitting it would put the report back where it was: looking complete while
  // missing the part that explains the bug.
  const entries = Array.from({ length: 5 }, (_, index) => ({ type: 'keydown', key: String(index) }));
  const report = formatInputDiagnostics({ appInfo, brailleInputTable: 'none', entries, dropped: 118 });

  assert.match(report, /Below are the last 5 lines/);
  assert.match(report, /118 earlier lines are not shown/);
  assert.doesNotMatch(report, /since the app started/);
});

test('the mode is printed where it changes, not on every line', () => {
  // "Was the app in equation mode when I typed this" is what a stateful bug
  // turns on, and the capture no longer gates on it -- it records it. Repeating
  // it per line would triple the length of something a person reads aloud.
  const report = formatInputDiagnostics({
    appInfo,
    brailleInputTable: 'auto',
    resolvedTable: 'en-us-comp8',
    entries: [
      { type: 'keydown', key: 'a', mode: 'Text · UEB G2' },
      { type: 'keydown', key: 'b', mode: 'Text · UEB G2' },
      { type: 'keydown', key: '#', mode: 'Equation · Nemeth · empty' },
      { type: 'commit', verdict: 'refused', mode: 'Equation · Nemeth · editing' }
    ]
  });

  const modeLines = report.split('\n').filter((line) => line.startsWith('-- mode:'));
  assert.deepEqual(modeLines, [
    '-- mode: Text · UEB G2',
    '-- mode: Equation · Nemeth · empty',
    '-- mode: Equation · Nemeth · editing'
  ], 'one line per change, none for the run in between');
});

test('an empty log reports itself rather than looking broken', () => {
  const report = formatInputDiagnostics({ appInfo, brailleInputTable: 'auto', entries: [] });
  assert.match(report, /\(no input recorded yet\)/);
});

test('the report names which field each run of keystrokes went into', () => {
  // The fact two alpha reports could not carry. "The name I typed wasn't
  // showing up" and "the keystrokes are in the equation field" are the same
  // sentence, and only this line joins them.
  const report = formatInputDiagnostics({
    appInfo,
    brailleInputTable: 'auto',
    entries: [
      { type: 'keydown', key: 'A', where: 'napkin-name', mode: 'Text', value: '' },
      { type: 'keydown', key: 'l', where: 'composer-source', mode: 'Text', value: '' },
      { type: 'keydown', key: 'g', where: 'composer-source', mode: 'Text', value: 'l' }
    ]
  });
  assert.match(report, /-- typing into: napkin-name/);
  assert.match(report, /-- typing into: composer-source/);
  // Printed on change only, like the mode line -- a report someone reads aloud
  // cannot afford it on every entry.
  assert.equal(report.match(/-- typing into: composer-source/g).length, 1);
});

test('a session that read a table says so, even if it ended holding raw cells', () => {
  // resolveBrailleInputTable answers 'none' to "these are already cells", and
  // the header used to print that as the reading for the whole session. Two
  // alpha reports said "read as none" for sessions that had decoded
  // en-us-comp8 perfectly, and the diagnosis went the wrong way both times.
  const report = formatInputDiagnostics({
    appInfo,
    brailleInputTable: 'auto',
    resolvedTable: 'none',
    entries: [
      { type: 'input', table: 'en-us-comp8', value: '\u283c\u2806', mode: 'Equation' },
      { type: 'input', table: 'none', value: '\u283c', mode: 'Equation' }
    ]
  });
  assert.match(report, /Braille input table: auto \(read as en-us-comp8\)/);
});

test('a session where nothing reached a field says that, rather than blaming a table', () => {
  const report = formatInputDiagnostics({
    appInfo,
    brailleInputTable: 'auto',
    resolvedTable: 'none',
    entries: [{ type: 'keydown', key: 'Backspace', where: 'composer-source', table: 'none', value: '' }]
  });
  assert.match(report, /nothing has reached a writing field yet/);
  assert.doesNotMatch(report, /read as none/);
});

test('input that no table explains is still reported as exactly that', () => {
  const report = formatInputDiagnostics({
    appInfo,
    brailleInputTable: 'auto',
    resolvedTable: 'none',
    entries: [{ type: 'input', table: 'none', value: '', mode: 'Equation' }]
  });
  assert.match(report, /matched no known table/);
});
