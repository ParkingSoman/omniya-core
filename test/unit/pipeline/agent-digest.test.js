import test from 'node:test';
import assert from 'node:assert/strict';

import { digest, scrub } from '../../../scripts/ci/agent-digest.mjs';

const run = [
  { type: 'system', subtype: 'init', env: { TOKEN: 'ghp_abcdefghijklmnop1234' } },
  { type: 'assistant', message: { content: [
    { type: 'text', text: 'I will read [the file](https://evil.example/x) and ping @claude.' },
    { type: 'tool_use', name: 'Read', input: { file_path: 'src/domain/nemeth/symbols.json' } },
    { type: 'tool_use', name: 'Bash', input: { command: 'echo $CLAUDE_CODE_OAUTH_TOKEN sk-ant-oat01-SECRETSECRETSECRET' } },
  ] } },
  { type: 'user', message: { content: [{ type: 'tool_result', content: 'ghp_SHOULDNEVERAPPEAR12345' }] } },
  { type: 'result', subtype: 'success', num_turns: 24, result: 'Done. Key sk-ant-api03-ABCDEFGHIJKLMNOP' },
];

test('keeps the agent words and tool names', () => {
  const out = digest(run, { word: 'stopped', hadMessage: false });
  assert.match(out, /said: I will read the file and ping claude\./);
  assert.match(out, /tool: Read `src\/domain\/nemeth\/symbols\.json`/);
  assert.match(out, /tool: Bash/);
  assert.match(out, /Turns: 24/);
  assert.match(out, /message\.md: not written/);
});

test('drops tool results, commands, links, mentions and init data', () => {
  const out = digest(run, {});
  for (const bad of ['SHOULDNEVERAPPEAR', 'CLAUDE_CODE_OAUTH_TOKEN', 'SECRETSECRET', 'evil.example', '@claude', 'ghp_', 'sk-ant']) {
    assert.ok(!out.includes(bad), `leaked ${bad}`);
  }
});

test('scrub removes credential shapes', () => {
  for (const s of ['ghp_abcdefghij123456', 'github_pat_abcdefghij123456', 'sk-ant-abcdefghij', 'Bearer abcdefghijklmnop', 'a'.repeat(40)]) {
    assert.match(scrub(`x ${s} y`), /removed/);
  }
  assert.equal(scrub('plain words'), 'plain words');
});

test('bad input gives a line, not an error', () => {
  assert.match(digest(null), /no agent steps/);
  assert.match(digest({}), /no agent steps/);
});

test('scrub cuts out the exact secret values it is given, whatever their shape', () => {
  assert.equal(scrub('the value is hunter2hunter2 ok', ['hunter2hunter2']), 'the value is [secret removed] ok');
  assert.equal(scrub('short abc ok', ['abc']), 'short abc ok');
});
