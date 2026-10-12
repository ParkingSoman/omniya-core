import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

import { PAIRED_FILES } from '../../../scripts/ci/pipeline-drift.mjs';
import { kindFromLabels } from '../../../scripts/ci/issue-kind.mjs';

const DIR = '.github/ISSUE_TEMPLATE';
const forms = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.yml') && f !== 'config.yml')
    .map((f) => [f, loadYaml(readFileSync(`${DIR}/${f}`, 'utf8'))])
);

const EXPECT = {
  'bug-report.yml': { label: 'bug', kind: 'bug' },
  'nemeth-feature.yml': { label: 'nemeth', kind: 'nemeth' },
  'design.yml': { label: 'design', kind: 'routed' },
  'other.yml': { label: 'other', kind: 'routed' }
};

test('there are exactly four forms, and each puts the one label that routes it', () => {
  assert.deepEqual(Object.keys(forms).sort(), Object.keys(EXPECT).sort());
  for (const [file, { label, kind }] of Object.entries(EXPECT)) {
    assert.deepEqual(forms[file].labels, [label], file);
    assert.equal(kindFromLabels(forms[file].labels), kind, `${file} must reach the agent, or a person, as intended`);
  }
});

test('blank issues are off, so every report has a type', () => {
  const config = loadYaml(readFileSync(`${DIR}/config.yml`, 'utf8'));
  assert.equal(config.blank_issues_enabled, false);
});

test('every form lives on main too, and the drift check knows it', () => {
  // GitHub reads an issue form from the default branch only. A form that is only
  // on `testing` never appears, and nobody is told.
  const paired = PAIRED_FILES.map(([local]) => local);
  for (const file of [...Object.keys(forms), 'config.yml']) {
    assert.ok(paired.includes(`${DIR}/${file}`), `${file} is not in PAIRED_FILES`);
  }
});

test('every field has a real label and description, because placeholders are not reliably announced', () => {
  for (const [file, form] of Object.entries(forms)) {
    for (const item of form.body.filter((b) => b.type !== 'markdown')) {
      assert.ok(item.attributes.label, `${file}: ${item.id} has no label`);
      assert.ok(item.attributes.description || item.type === 'checkboxes', `${file}: ${item.id} has no description`);
      assert.equal(item.attributes.placeholder, undefined, `${file}: ${item.id} explains itself by placeholder`);
    }
  }
});

test('the Nemeth form asks for the symbol, the cells and the reading, and the Code section is optional', () => {
  const fields = Object.fromEntries(forms['nemeth-feature.yml'].body.filter((b) => b.id).map((b) => [b.id, b]));
  for (const id of ['symbol', 'cells', 'reading']) assert.equal(fields[id].validations.required, true, id);
  assert.equal(fields['code-section'].validations.required, false);
  assert.equal(fields.diagnostics.validations.required, false);
});

test('the bug form no longer sends a feature request to a blank issue', () => {
  const text = JSON.stringify(forms['bug-report.yml']);
  assert.doesNotMatch(text, /blank issue/i);
  assert.match(text, /Nemeth feature form/);
  assert.match(text, /Design form/);
});

test('the forms that no agent works on say so', () => {
  for (const file of ['design.yml', 'other.yml']) {
    assert.match(JSON.stringify(forms[file]), /No agent starts/, file);
  }
});
