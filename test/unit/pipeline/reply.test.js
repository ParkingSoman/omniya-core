import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LABELS,
  MARKER,
  MAX_MESSAGE,
  PIPELINE_PREFIX,
  STATES,
  cleanMessage,
  postReply,
  renderReply
} from '../../../scripts/ci/reply.mjs';

const where = { repo: 'a/b', pr: 7 };

test('every state renders and starts with the marker', () => {
  for (const state of STATES) {
    assert.ok(renderReply(state, where).startsWith(MARKER), state);
  }
});

test('the marker carries the prefix the follow-up gate skips, so no reply can start a run', () => {
  // Every reply tells the contributor to write @claude or sits beside one that does.
  assert.ok(MARKER.startsWith(PIPELINE_PREFIX));
  const gate = readFileSync(new URL('../../../.github/workflows/pipeline-followup.yml', import.meta.url), 'utf8');
  assert.ok(gate.includes(`'${PIPELINE_PREFIX}'`), 'the gate must test for the same prefix');
});

test('only the ready and revised states have download links, for pull request 7', () => {
  for (const state of STATES) {
    const text = renderReply(state, where);
    if (state === 'ready' || state === 'revised') {
      assert.match(text, /\[Download for Mac, Apple Silicon\]\(https:\/\/github\.com\/a\/b\/releases\/download\/pr-7\/Omniya-Core-mac-arm64\.zip\)/, state);
      assert.match(text, /\[Download for Windows\]\(https:\/\/github\.com\/a\/b\/releases\/download\/pr-7\/Omniya-Core-Setup-x64\.exe\)/, state);
      assert.match(text, /@claude it works/, state);
    } else {
      assert.doesNotMatch(text, /releases\/download/, `${state} must not offer a build that is not checked`);
    }
  }
});

test('a state with links refuses a pull request number that is not digits', () => {
  assert.throws(() => renderReply('ready', { repo: 'a/b', pr: '7/../x' }), /digits/);
  assert.throws(() => renderReply('revised', { repo: 'a/b' }), /digits/);
});

test('an unknown state is refused', () => {
  assert.throws(() => renderReply('done'), /unknown state/);
  // The old edited-status states are gone.
  for (const gone of ['working', 'revising']) assert.throws(() => renderReply(gone), /unknown state/, gone);
});

test('the agent message comes first, then "a build is ready", then the links, then what to write', () => {
  // Read aloud, the sentence that says there is a build has to come before the
  // list of links it introduces.
  const text = renderReply('ready', { ...where, message: 'You said X was wrong. I changed Y.' });
  const at = (s) => text.indexOf(s);
  assert.ok(at('You said X was wrong') > 0);
  assert.ok(at('You said X was wrong') < at('A test build is ready'));
  assert.ok(at('A test build is ready') < at('[Download for Mac'));
  assert.ok(at('[Download for Windows') < at('If it works, write @claude it works.'));
});

test('a state that ignores the agent message does not print it', () => {
  for (const state of ['started', 'routed', 'maintainer', 'failed', 'sent']) {
    assert.doesNotMatch(renderReply(state, { ...where, message: 'LEAKED WORDS' }), /LEAKED WORDS/, state);
  }
});

test('an answer with no words falls back, so silence is never the reply', () => {
  const text = renderReply('answered', { ...where, message: '   ' });
  assert.match(text, /could not finish/);
  assert.match(text, /maintainer has been told/);
  assert.match(renderReply('answered', { ...where, message: 'The cap word comes first.' }), /^<!--.*-->\nThe cap word comes first\.\n$/);
});

test('design and stuck use plain defaults when the agent wrote nothing', () => {
  assert.match(renderReply('design'), /request for something new/);
  assert.match(renderReply('stuck'), /could not finish/);
});

test('one reply never says the same sentence twice', () => {
  for (const state of STATES) {
    const body = renderReply(state, { ...where, message: 'I changed the letter rule.' }).replace(MARKER, '');
    const sentences = body.replace(/\(https[^)]*\)/g, '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    assert.equal(new Set(sentences).size, sentences.length, `${state} repeats a sentence`);
  }
});

test('no fixed words talk about checks, logs, pull requests, files or branches', () => {
  // The reader is not a programmer and reads with a screen reader. A technical
  // word here is a word they have to ask someone about.
  for (const state of STATES) {
    const text = renderReply(state, where).replace(MARKER, '').replace(/\(https[^)]*\)/g, '');
    assert.doesNotMatch(text, /pull request|branch|\blog\b|workflow|\.yml|\.js\b|\bPR\b/i, state);
  }
});

test('cleanMessage cuts to size and drops a line that carries the marker prefix', () => {
  assert.equal(cleanMessage(undefined), '');
  assert.equal(cleanMessage('  hello\r\n'), 'hello');
  const dressed = cleanMessage(`before\n${PIPELINE_PREFIX}reply -->\nafter`);
  assert.equal(dressed, 'before\nafter');
  const long = cleanMessage(`${'word '.repeat(1000)}`);
  assert.ok(long.length <= MAX_MESSAGE + 4, 'cut to size');
  assert.match(long, / \.\.\.$/);
});

test('postReply posts exactly one comment, never edits, and labels only where the state calls for it', () => {
  for (const state of STATES) {
    const calls = [];
    const result = postReply({ issue: 22, state, ...where, message: 'x' }, (args) => {
      calls.push(args);
      return '';
    });
    const comments = calls.filter((a) => a[0] === 'api');
    assert.equal(comments.length, 1, `${state}: one comment`);
    assert.equal(result.posted, 1);
    assert.ok(!calls.some((a) => a.includes('PATCH') || a.includes('-X')), `${state}: no edit`);
    assert.match(comments[0][1], /^repos\/a\/b\/issues\/22\/comments$/, state);
    assert.ok(comments[0].some((a) => a.startsWith(`body=${MARKER}`)), state);
    const labelled = calls.filter((a) => a[0] === 'issue' && a[1] === 'edit');
    assert.equal(labelled.length, LABELS[state] ? 1 : 0, `${state}: label`);
  }
});

test('the pipeline puts the labels on, so the agent never has to', () => {
  assert.equal(LABELS.design.name, 'needs-design');
  assert.equal(LABELS.stuck.name, 'needs-maintainer');
  assert.equal(LABELS.failed.name, 'needs-maintainer');
});

test('postReply refuses an issue number that is not digits', () => {
  assert.throws(() => postReply({ issue: '22; rm', state: 'started', repo: 'a/b' }, () => ''), /digits/);
});

test('no pipeline workflow edits a status comment or posts a notice any more', () => {
  const dir = new URL('../../../.github/workflows/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.startsWith('pipeline-'))) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(text, /status-comment\.mjs/, file);
    assert.doesNotMatch(text, /omniya-pipeline-(status|notice)/, file);
  }
});
