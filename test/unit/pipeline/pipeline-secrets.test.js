import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { dump, load as loadYaml } from 'js-yaml';

const DIR = '.github/workflows/';
const SECRETS = ['CLAUDE_CODE_OAUTH_TOKEN', 'PIPELINE_APP_PRIVATE_KEY'];
const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
const parsed = files.map((f) => ({ f, text: readFileSync(DIR + f, 'utf8'), wf: loadYaml(readFileSync(DIR + f, 'utf8')) }));
const jobsOf = ({ wf }) => Object.entries(wf.jobs ?? {});
const mentions = (job) => SECRETS.filter((s) => dump(job).includes(`secrets.${s}`));

test('a job that reads a pipeline secret declares environment `pipeline`', () => {
  let seen = 0;
  for (const p of parsed) {
    for (const [name, job] of jobsOf(p)) {
      if (mentions(job).length === 0) continue;
      seen += 1;
      assert.equal(job.environment, 'pipeline', `${p.f} job ${name} reads a pipeline secret`);
      assert.equal(job.uses, undefined, `${p.f} job ${name}: a job that calls a workflow cannot hold an environment`);
    }
  }
  assert.ok(seen >= 2, 'the agent job and the hand-off job read them');
});

test('no job that calls a workflow passes a pipeline secret, and no workflow declares them', () => {
  for (const p of parsed) {
    for (const [name, job] of jobsOf(p)) {
      if (!job.uses) continue;
      const passed = job.secrets === 'inherit' ? ['inherit'] : Object.entries(job.secrets ?? {}).filter(([k, v]) => SECRETS.includes(k) || SECRETS.some((s) => String(v).includes(s)));
      assert.deepEqual(passed, [], `${p.f} job ${name} passes secrets down`);
    }
    const on = p.wf.on ?? p.wf[true] ?? {};
    for (const s of SECRETS) {
      assert.equal(on.workflow_call?.secrets?.[s], undefined, `${p.f} declares ${s} as a workflow_call secret`);
    }
  }
});

test('only the agent job and the hand-off job mention the two secrets', () => {
  const allowed = new Set(['pipeline-agent.yml:agent', 'pipeline-followup.yml:handoff']);
  for (const p of parsed) {
    const withMention = jobsOf(p).filter(([, job]) => SECRETS.some((s) => dump(job).includes(s))).map(([n]) => `${p.f}:${n}`);
    for (const id of withMention) assert.ok(allowed.has(id), `${id} mentions a pipeline secret`);
    const outside = SECRETS.some((s) => p.text.replace(/^\s*#.*$/gm, '').includes(s)) && withMention.length === 0;
    assert.equal(outside, false, `${p.f} mentions a pipeline secret outside a job`);
  }
});

test('only the hand-off job asks the App for commit statuses', () => {
  for (const p of parsed) {
    for (const [name, job] of jobsOf(p)) {
      const hit = dump(job).includes('permission-statuses');
      assert.equal(hit, p.f === 'pipeline-followup.yml' && name === 'handoff', `${p.f}:${name}`);
    }
  }
});
