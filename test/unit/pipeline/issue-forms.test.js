import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

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

test('every field has a real label and description, because placeholders are not reliably announced', () => {
  for (const [file, form] of Object.entries(forms)) {
    for (const item of form.body.filter((b) => b.type !== 'markdown')) {
      assert.ok(item.attributes.label, `${file}: ${item.id} has no label`);
      assert.ok(item.attributes.description || item.type === 'checkboxes', `${file}: ${item.id} has no description`);
      assert.equal(item.attributes.placeholder, undefined, `${file}: ${item.id} explains itself by placeholder`);
    }
  }
});

test('the Nemeth form asks for the kind, the symbol and the reading, and the Code section is optional', () => {
  const fields = Object.fromEntries(forms['nemeth-feature.yml'].body.filter((b) => b.id).map((b) => [b.id, b]));
  // `cells` is optional: a speech request has none. See the speech test below.
  for (const id of ['request', 'symbol', 'reading']) assert.equal(fields[id].validations.required, true, id);
  assert.equal(fields['code-section'].validations.required, false);
  assert.equal(fields.diagnostics.validations.required, false);
});

test('the bug form no longer sends a feature request to a blank issue', () => {
  const text = JSON.stringify(forms['bug-report.yml']);
  assert.doesNotMatch(text, /blank issue/i);
  assert.match(text, /Nemeth or speech form/);
  assert.match(text, /Design form/);
});

test('the forms that no agent works on say so', () => {
  for (const file of ['design.yml', 'other.yml']) {
    assert.match(JSON.stringify(forms[file]), /No agent starts/, file);
  }
});

test('the Nemeth form also takes a speech request, so how math is spoken is not sent to a person', () => {
  // A request about how an equation is spoken is the same kind of work as a
  // missing symbol: the contributor states the words, the agent makes the app
  // say them. The Code is silent on speech, so it cannot be the test of scope.
  const form = forms['nemeth-feature.yml'];
  const fields = Object.fromEntries(form.body.filter((b) => b.id).map((b) => [b.id, b]));
  assert.equal(fields.request.type, 'dropdown');
  assert.equal(fields.request.validations.required, true);
  assert.equal(fields.request.attributes.options.length, 2);
  assert.match(fields.request.attributes.options.join('\n'), /spoken/i);
  assert.equal(fields.cells.validations.required, false, 'a speech request has no cells');
  assert.match(fields.reading.attributes.description, /exact words/);
  assert.deepEqual(form.labels, ['nemeth']);
  assert.equal(form.name, 'Nemeth or speech');
});

test('the other forms send speech to the Nemeth or speech form, and Design no longer claims it', () => {
  assert.doesNotMatch(forms['design.yml'].description, /sounds/);
  assert.doesNotMatch(JSON.stringify(forms['design.yml'].body), /sounds/);
  for (const file of ['design.yml', 'bug-report.yml', 'other.yml']) {
    assert.match(JSON.stringify(forms[file]), /Nemeth or speech form/, file);
  }
  assert.doesNotMatch(JSON.stringify(forms), /Nemeth feature form/);
});
