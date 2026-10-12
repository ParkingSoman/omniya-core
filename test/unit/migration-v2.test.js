import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateState } from '../../src/domain/migration.js';
import { validateState } from '../../src/domain/model.js';

const legacy = {
  schemaVersion: 1,
  activeNapkinId: 'n1',
  napkins: [{ id: 'n1', name: 'Test', selectedItemId: 'e1', items: [
    { id: 't1', type: 'text', source: 'keep me', note: 'and this note', mathml: null },
    { id: 'e1', type: 'equation', source: 'x+1', note: '', mathml: '<math><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>' }
  ] }]
};

test('migrates a v1 napkin to a v3 document without losing text, notes or the equation', () => {
  const migrated = migrateState(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.warnings, []);
  const napkin = migrated.napkins[0];
  assert.deepEqual(Object.keys(napkin).sort(), ['doc', 'id', 'name']);
  const [first, note, equation] = napkin.doc.content;
  assert.equal(first.content[0].text, 'keep me');
  assert.equal(note.content[0].text, 'and this note');
  assert.equal(equation.content[0].type, 'math');
  assert.match(equation.content[0].attrs.mathml, /<mi[^>]*>x<\/mi>/);
  assert.equal(validateState({ ...migrated, warnings: undefined }).ok, true);
});

test('migrates a v2 equation item (math.formatVersion 2) the same way', () => {
  const v2 = {
    schemaVersion: 2,
    activeNapkinId: 'n1',
    napkins: [{ id: 'n1', name: 'T', selectedItemId: null, items: [
      { id: 'e', type: 'equation', note: '', math: { formatVersion: 2, mathml: '<math><mi>y</mi></math>', focus: null } }
    ] }]
  };
  const migrated = migrateState(v2);
  assert.equal(migrated.napkins[0].doc.content[0].content[0].type, 'math');
  assert.equal(migrated.activeNapkinId, 'n1');
});

test('an unreadable equation is reported as a warning and kept as visible text', () => {
  const broken = {
    schemaVersion: 1,
    activeNapkinId: 'n1',
    napkins: [{ id: 'n1', name: 'T', selectedItemId: null, items: [
      { id: 'e', type: 'equation', note: '', mathml: 'not mathml' }
    ] }]
  };
  const migrated = migrateState(broken);
  assert.equal(migrated.warnings.length, 1);
  assert.match(migrated.napkins[0].doc.content[0].content[0].text, /could not be converted/);
});

test('a napkin with no items becomes one empty paragraph', () => {
  const migrated = migrateState({ schemaVersion: 2, activeNapkinId: 'n', napkins: [{ id: 'n', name: 'E', selectedItemId: null, items: [] }] });
  assert.deepEqual(migrated.napkins[0].doc, { type: 'doc', content: [{ type: 'paragraph' }] });
});

test('a v3 state passes through unchanged', () => {
  const v3 = { schemaVersion: 3, activeNapkinId: 'n', napkins: [{ id: 'n', name: 'E', doc: { type: 'doc', content: [{ type: 'paragraph' }] } }] };
  const migrated = migrateState(v3);
  assert.deepEqual({ ...migrated, warnings: undefined }, { ...v3, warnings: undefined });
});
