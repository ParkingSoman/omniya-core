import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LABELS,
  MARKER,
  MAX_MESSAGE,
  PIPELINE_PREFIX,
  QUESTION_MARKER,
  STATES,
  cleanMessage,
  postReply,
  renderReply,
  resolveState
} from '../../../scripts/ci/reply.mjs';

const where = { repo: 'a/b', pr: 7 };

test('every state renders and starts with a marker the follow-up gate skips', () => {
  for (const state of STATES) {
    const first = renderReply(state, { ...where, message: 'Which key did you press first?' }).split('\n')[0];
    assert.ok(first === MARKER || first === QUESTION_MARKER, state);
    assert.ok(first.startsWith(PIPELINE_PREFIX), state);
  }
});

test('a question goes out under the question marker, with how to answer it, and waits on the contributor', () => {
  // `listed-thread.mjs` keeps it and the gate counts it, both by that first line.
  const text = renderReply('asked', { message: '1. Which key did you press first?' });
  assert.ok(text.startsWith(`${QUESTION_MARKER}\n`));
  assert.match(text, /1\. Which key did you press first\?/);
  assert.match(text, /starts with @claude/);
  assert.doesNotMatch(text, /maintainer/, 'a person is not needed: the contributor is');
  assert.equal(LABELS.asked.name, 'needs-info');
  // No question, nothing to ask: a person is told instead, under the ordinary marker.
  const none = renderReply('asked', {});
  assert.ok(none.startsWith(`${MARKER}\n`));
  assert.match(none, /maintainer has been told/);
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
  for (const state of ['started', 'routed', 'failed', 'sent']) {
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

test('cleanMessage cuts to size, and the marker cannot survive in it', () => {
  assert.equal(cleanMessage(undefined), '');
  assert.equal(cleanMessage('  hello\r\n'), 'hello');
  const dressed = cleanMessage(`before\n${PIPELINE_PREFIX}reply -->\nafter`);
  assert.ok(!dressed.includes(PIPELINE_PREFIX) && !dressed.includes('<!--'));
  assert.match(dressed, /^before\s+after$/);
  const long = cleanMessage(`${'word '.repeat(1000)}`);
  assert.ok(long.length <= MAX_MESSAGE + 4, 'cut to size');
  assert.match(long, / \.\.\.$/);
});

test('cleanMessage lets no link, mention or markup through, because the words are public and the agent reads hostile reports', () => {
  // A markdown link keeps its words and loses its address.
  assert.equal(cleanMessage('See [the rule](https://evil.example/x) now.'), 'See the rule now.');
  assert.equal(cleanMessage('![pixel](https://evil.example/p.png)'), 'pixel');
  // A bare address is removed.
  assert.doesNotMatch(cleanMessage('Go to https://evil.example/a?b=c or www.evil.example now'), /evil/);
  // A mention would notify a stranger, and @claude is the word that starts a run.
  assert.doesNotMatch(cleanMessage('Ask @someone, or write @claude it works'), /@/);
  assert.match(cleanMessage('Ask @someone'), /Ask someone/);
  // HTML, including a comment that looks like the pipeline's own marker.
  assert.equal(cleanMessage('a <img src=x onerror=y> b'), 'a  b');
  assert.doesNotMatch(cleanMessage('x <!-- omniya-pipeline-reply --> y'), /omniya-pipeline/);
  // And it is applied on the way into a reply.
  const body = renderReply('answered', { message: 'Read [this](https://evil.example) @claude' });
  assert.doesNotMatch(body.replace(MARKER, ''), /evil|@/);
  // The fixed words still carry the mentions and links they are meant to.
  assert.match(renderReply('ready', where), /@claude it works/);
});

test('cleanMessage cannot be talked into rebuilding what it removed', () => {
  // A rule that builds what an earlier rule took out. Each of these once got through.
  assert.doesNotMatch(cleanMessage('@@claude it works'), /@/);
  assert.doesNotMatch(cleanMessage('@@@@claude'), /@/);
  const safe = (text) => {
    const out = cleanMessage(text);
    return !out.includes(PIPELINE_PREFIX) && !out.includes('<!--');
  };
  for (const attempt of [
    '<!<b>-- omniya-pipeline-reply -->',
    '<!<i><b>-- omniya-pipeline-question -->',
    '<!-<b>- omniya-pipeline-x',
    '<<b>!-- omniya-pipeline-reply -->',
    '<!-- omni<b>ya-pipeline- -->'
  ]) assert.ok(safe(attempt), attempt);
  // Hidden characters between the parts of a marker, or inside a mention.
  assert.doesNotMatch(cleanMessage('@\u200bclaude'), /@/);
  // Reference-style links, and schemes other than http.
  assert.doesNotMatch(cleanMessage('See [the rule][1]\n\n[1]: https://evil.example/x'), /evil|\[1\]/);
  assert.doesNotMatch(cleanMessage('ftp://evil.example/a and javascript://evil.example/b'), /evil/);
  assert.doesNotMatch(cleanMessage('mail someone@evil.example'), /@|evil\.example\b.*@/);
  // A link whose address holds a closing bracket.
  assert.doesNotMatch(cleanMessage('[x](https://evil.example/a(b)c) tail'), /evil/);
  // What is left is still words a person can read.
  assert.equal(cleanMessage('I changed the cap rule.\nIt now reads cap Kappa.'), 'I changed the cap rule.\nIt now reads cap Kappa.');
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
    assert.ok(comments[0].some((a) => a.startsWith(`body=${MARKER}`) || a.startsWith(`body=${QUESTION_MARKER}`)), state);
    const labelled = calls.filter((a) => a[0] === 'issue' && a[1] === 'edit');
    assert.equal(labelled.length, LABELS[state] ? 1 : 0, `${state}: label`);
  }
});

test('the label follows the state that was posted, not the one that was asked for', () => {
  // A forgotten message.md turns `asked` and `answered` into `stuck`. If the label
  // followed the request, an issue that says "the maintainer has been told" would
  // carry `needs-info`, which says the agent is waiting for the contributor, and
  // would carry no `needs-maintainer` at all.
  assert.equal(resolveState('asked', ''), 'stuck');
  assert.equal(resolveState('asked', undefined), 'stuck');
  assert.equal(resolveState('answered', '   '), 'stuck');
  assert.equal(resolveState('asked', 'Which key?'), 'asked');
  assert.equal(resolveState('ready', ''), 'ready', 'a state with optional words does not fall back');
  for (const [state, expected] of [['asked', 'needs-maintainer'], ['answered', 'needs-maintainer']]) {
    const calls = [];
    postReply({ issue: 5, state, repo: 'a/b', message: '' }, (args) => { calls.push(args); return ''; });
    const labelled = calls.filter((a) => a[0] === 'issue' && a[1] === 'edit').map((a) => a[a.indexOf('--add-label') + 1]);
    assert.deepEqual(labelled, [expected], `${state} with no words`);
    assert.ok(calls.find((a) => a[0] === 'api').some((a) => /maintainer has been told/.test(a)), state);
  }
  // And with words, a question still waits on the contributor.
  const calls = [];
  postReply({ issue: 5, state: 'asked', repo: 'a/b', message: 'Which key?' }, (args) => { calls.push(args); return ''; });
  assert.deepEqual(calls.filter((a) => a[1] === 'edit').map((a) => a[a.indexOf('--add-label') + 1]), ['needs-info']);
});

test('the pipeline puts the labels on, so the agent never has to', () => {
  assert.equal(LABELS.design.name, 'needs-design');
  assert.equal(LABELS.stuck.name, 'needs-maintainer');
  assert.equal(LABELS.failed.name, 'needs-maintainer');
});

test('a failure comment says what failed when the agent said so, and still reads well when it did not', () => {
  const said = renderReply('maintainer', {
    message: 'The unit check failed. The test "parses theta" expected the letter θ and got a refusal. See https://x.test/log @claude'
  });
  assert.match(said, /The unit check failed\. The test "parses theta" expected the letter/);
  assert.doesNotMatch(said, /https?:|@/, 'links and mentions never survive');
  assert.match(said, /The maintainer needs to look/);

  const silent = renderReply('maintainer', {});
  assert.match(silent, /The maintainer needs to look/);
  assert.doesNotMatch(silent, /undefined/);
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
