import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateState } from '../../src/domain/migration.js';
import { completionReport } from '../../src/domain/math-tree.js';

test('migrates a legacy equation into v2 math authority without losing text items', () => {
  const legacy = {
    schemaVersion: 1,
    activeNapkinId: 'n1',
    napkins: [{ id: 'n1', name: 'Test', selectedItemId: 'e1', items: [
      { id: 't1', type: 'text', source: 'keep me', note: '', mathml: null },
      { id: 'e1', type: 'equation', source: 'x+1', note: '', mathml: '<math><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>' }
    ] }]
  };
  const migrated = migrateState(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.napkins[0].items[0].source, 'keep me');
  assert.equal(migrated.napkins[0].items[1].math.formatVersion, 2);
  assert.equal(completionReport(migrated.napkins[0].items[1].math).complete, true);
});
