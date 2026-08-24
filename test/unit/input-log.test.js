import assert from 'node:assert/strict';
import test from 'node:test';

import { createInputLog, describeCharacter, formatEntry } from '../../src/renderer/input-log.js';

test('the log is bounded, so a long session cannot grow without limit', () => {
  // It holds the author's equation as they type it. Capped in memory, never
  // written anywhere, and only ever leaves the process on an explicit request.
  const log = createInputLog({ limit: 3 });
  for (const key of ['a', 'b', 'c', 'd', 'e']) log.record({ type: 'keydown', key });

  assert.equal(log.size, 3);
  assert.deepEqual(log.entries().map((entry) => entry.key), ['c', 'd', 'e'], 'keeps the most recent');
});

test('entries() hands back a copy, so a reader cannot mutate the log', () => {
  const log = createInputLog();
  log.record({ type: 'keydown', key: 'a' });
  log.entries().push({ type: 'forged' });
  assert.equal(log.size, 1);
});

test('subscribers see each entry, and can stop listening', () => {
  const log = createInputLog();
  const seen = [];
  const unsubscribe = log.subscribe(() => seen.push(log.size));

  log.record({ type: 'keydown', key: 'a' });
  log.record({ type: 'keydown', key: 'b' });
  unsubscribe();
  log.record({ type: 'keydown', key: 'c' });

  assert.deepEqual(seen, [1, 2]);
});

test('characters that could be mistaken for each other are described with their code points', () => {
  // The whole point is telling '#2+#2' from the cells it should have decoded
  // to. Two strings that read alike must not print alike -- and they do not,
  // because the cells carry code points and the ASCII does not.
  assert.equal(describeCharacter('⠼'), '"⠼" U+283C');
  assert.equal(describeCharacter('a'), '"a"', 'printable ASCII is already unambiguous quoted');
  assert.notEqual(describeCharacter('#2'), describeCharacter('⠼⠆'));
  assert.equal(describeCharacter(''), '(none)');
  assert.equal(describeCharacter(undefined), '(none)');
});

test('one non-ASCII character puts the code points back for the whole string', () => {
  // The rule is by content, not by length. A buffer that is mostly ASCII but
  // holds one cell is exactly the confusing case, so it gets spelled out.
  assert.equal(describeCharacter('#2⠆'), '"#2⠆" U+0023 U+0032 U+2806');
  // Unprintables were always the point and still are.
  assert.match(describeCharacter('\u0001'), /U\+0001/);
});

test('a consumed keystroke is called out, because nothing else reports it', () => {
  // "A handler ate your keypress before the field saw it" is invisible from
  // every other vantage point, and is the first thing to rule out when a
  // device's input appears not to arrive. It is how the six-key chord reader
  // was silently swallowing s d f j k l.
  const line = formatEntry({
    type: 'keydown', key: 'k', code: 'KeyK', swallowed: true, table: 'en-us-comp8'
  });
  assert.match(line, /CONSUMED-BY-APP/);
  assert.match(line, /table=en-us-comp8/);

  const clean = formatEntry({ type: 'keydown', key: 'k', code: 'KeyK', table: 'none' });
  assert.doesNotMatch(clean, /CONSUMED/);
});

test('an input entry reports the field contents alongside what was read from them', () => {
  // The other half of the original bug: the field held ASCII while the status
  // line said it had read mathematics. Both are on the line, and the ASCII is
  // still plainly ASCII -- quoted, with no code points, exactly as the cells
  // it should have become are not.
  const line = formatEntry({ type: 'input', table: 'en-us-comp8', value: '#2', state: '2 cells read as 2.' });
  assert.match(line, /field="#2"/);
  assert.doesNotMatch(line, /U\+283C/, 'this is not the cell buffer, and must not read like it');
  assert.match(line, /state=2 cells read as 2\./);
});

test('a commit records its verdict, which is where the log used to go silent', () => {
  // The capture in input-capture.js is gated on the mode panel reading
  // "Equation · Nemeth", so the moment Enter left equation mode the log
  // stopped -- every report ended at the keystroke before the verdict, and the
  // verdict is the whole question when an author says "it refused my
  // equation". Both outcomes are recorded, by app.js, which is the only place
  // that knows them.
  const accepted = formatEntry({
    type: 'commit', verdict: 'accepted', table: 'en-us-comp8', value: '⠼⠆⠬⠼⠆'
  });
  assert.match(accepted, /^commit /);
  assert.match(accepted, /verdict=accepted/);
  assert.match(accepted, /field="⠼⠆⠬⠼⠆"/, 'the exact cells that were submitted');

  const refused = formatEntry({
    type: 'commit',
    verdict: 'refused',
    value: '⠭⠫⠭',
    state: "This Nemeth construct isn't supported yet. Write the expression in LaTeX instead."
  });
  assert.match(refused, /verdict=refused/);
  assert.match(refused, /isn't supported yet/, 'the message the author actually heard');
});

test('a keystroke the app sent to itself is marked as such', () => {
  // The transcript forwards Backspace into #composer-source as a synthetic
  // KeyboardEvent. Without this marker that line reads exactly like a key the
  // person pressed, which is the opposite of what the report is for.
  const sent = formatEntry({ type: 'keydown', key: 'Backspace', code: '', synthetic: true, table: 'none' });
  assert.match(sent, /SENT-BY-APP/);

  const pressed = formatEntry({ type: 'keydown', key: 'Backspace', code: 'Backspace', table: 'none' });
  assert.doesNotMatch(pressed, /SENT-BY-APP/);
});
