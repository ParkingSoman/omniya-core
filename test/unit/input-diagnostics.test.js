import assert from 'node:assert/strict';
import test from 'node:test';

import { formatInputDiagnostics, MAX_REPORTED_ENTRIES } from '../../src/renderer/input-diagnostics.js';

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
  assert.match(report, /field="#2" U\+0023 U\+0032/, 'and what the field really held');
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

test('the report is capped, and says how much it is disclosing', () => {
  // A keystroke log of this field IS the author's equation, so the report says
  // so in its own body -- a blind contributor can read what they are sending
  // before they send it, which is why this is plain text and not JSON.
  const entries = Array.from({ length: 60 }, (_, index) => ({ type: 'keydown', key: String(index) }));
  const report = formatInputDiagnostics({ appInfo, brailleInputTable: 'none', entries });

  const keydownLines = report.split('\n').filter((line) => line.startsWith('keydown'));
  assert.equal(keydownLines.length, MAX_REPORTED_ENTRIES);
  assert.match(keydownLines.at(-1), /key="59"/, 'keeps the most recent, which is where the fault is');
  assert.match(report, /includes the mathematics you were typing/);
  assert.match(report, /Nothing here was saved/);
});

test('an empty log reports itself rather than looking broken', () => {
  const report = formatInputDiagnostics({ appInfo, brailleInputTable: 'auto', entries: [] });
  assert.match(report, /\(no input recorded yet\)/);
});
