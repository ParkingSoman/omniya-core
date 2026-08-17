import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addItem,
  createInitialState,
  createNapkin,
  deleteNapkin,
  deleteItem,
  getActiveNapkin,
  insertItemAt,
  selectItem,
  splitTextItem,
  switchNapkin,
  updateItem,
  validateState
} from '../../src/domain/model.js';

function ids(...values) {
  let index = 0;
  return () => values[index++];
}

test('creates one active untitled napkin', () => {
  const state = createInitialState({ idFactory: ids('napkin-1') });

  assert.equal(state.schemaVersion, 2);
  assert.equal(state.activeNapkinId, 'napkin-1');
  assert.deepEqual(state.napkins, [{
    id: 'napkin-1',
    name: 'Untitled Napkin',
    selectedItemId: null,
    items: []
  }]);
});

test('creates and switches between independent napkins without mutating prior state', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const created = createNapkin(initial, '  Scratch work  ', { idFactory: ids('napkin-2') });

  assert.notEqual(created, initial);
  assert.equal(initial.napkins.length, 1);
  assert.equal(created.activeNapkinId, 'napkin-2');
  assert.equal(getActiveNapkin(created).name, 'Scratch work');

  const switched = switchNapkin(created, 'napkin-1');
  assert.equal(switched.activeNapkinId, 'napkin-1');
  assert.equal(switched.napkins[1].items.length, 0);
});

test('deletes a napkin immutably, including the final napkin', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const second = createNapkin(initial, 'Second napkin', { idFactory: ids('napkin-2') });
  const third = createNapkin(second, 'Third napkin', { idFactory: ids('napkin-3') });

  const withoutThird = deleteNapkin(third, 'napkin-3');
  assert.equal(third.napkins.length, 3);
  assert.deepEqual(withoutThird.napkins.map(({ id }) => id), ['napkin-1', 'napkin-2']);
  assert.equal(withoutThird.activeNapkinId, 'napkin-2');

  const withoutFirst = deleteNapkin(withoutThird, 'napkin-1');
  assert.deepEqual(withoutFirst.napkins.map(({ id }) => id), ['napkin-2']);
  assert.equal(withoutFirst.activeNapkinId, 'napkin-2');

  const empty = deleteNapkin(withoutFirst, 'napkin-2');
  assert.deepEqual(empty.napkins, []);
  assert.equal(empty.activeNapkinId, null);
  assert.deepEqual(validateState(empty), { ok: true, issues: [] });
});

test('restores each napkin’s independent selection when switching', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const first = addItem(initial, {
    type: 'text', source: 'first napkin item', note: '', mathml: null
  }, { idFactory: ids('item-1') });
  const secondNapkin = createNapkin(first, 'Second napkin', { idFactory: ids('napkin-2') });
  const second = addItem(secondNapkin, {
    type: 'text', source: 'second napkin item', note: '', mathml: null
  }, { idFactory: ids('item-2') });

  const backToFirst = switchNapkin(second, 'napkin-1');
  assert.equal(getActiveNapkin(backToFirst).selectedItemId, 'item-1');
  const backToSecond = switchNapkin(backToFirst, 'napkin-2');
  assert.equal(getActiveNapkin(backToSecond).selectedItemId, 'item-2');
});

test('rejects a blank napkin name', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  assert.throws(() => createNapkin(initial, '   '), /Napkin name is required/);
});

test('adds text and equation items in order and selects the newest item', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const withText = addItem(initial, {
    type: 'text',
    source: '  A useful sentence  ',
    note: 'context',
    mathml: null
  }, { idFactory: ids('item-1') });
  const withEquation = addItem(withText, {
    type: 'equation',
    source: 'x^2',
    note: '',
    mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup/></math>'
  }, { idFactory: ids('item-2') });

  const napkin = getActiveNapkin(withEquation);
  assert.deepEqual(napkin.items.map(({ id, type }) => ({ id, type })), [
    { id: 'item-1', type: 'text' },
    { id: 'item-2', type: 'equation' }
  ]);
  assert.equal(napkin.items[0].source, 'A useful sentence');
  assert.equal(napkin.items[0].mathml, null);
  assert.equal(napkin.items[1].math.formatVersion, 2);
  assert.equal(napkin.selectedItemId, 'item-2');
});

test('rejects invalid item invariants', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });

  assert.throws(() => addItem(initial, {
    type: 'text', source: '', note: '', mathml: null
  }), /Item source is required/);
  assert.throws(() => addItem(initial, {
    type: 'text', source: 'hello', note: '', mathml: '<math/>'
  }), /Text items cannot contain MathML/);
  assert.throws(() => addItem(initial, {
    type: 'equation', source: 'x', note: '', mathml: null
  }), /Equation items require MathML/);
});

test('updates source, note, and regenerated MathML atomically', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const added = addItem(initial, {
    type: 'equation',
    source: 'x',
    note: 'old',
    mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>'
  }, { idFactory: ids('item-1') });
  const updated = updateItem(added, 'item-1', {
    source: 'x^2',
    note: 'new',
    mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup/></math>'
  });

  assert.match(getActiveNapkin(added).items[0].math.mathml, /<mi/);
  assert.equal(getActiveNapkin(updated).items[0].math.formatVersion, 2);
  assert.match(getActiveNapkin(updated).items[0].math.mathml, /<msup/);
});

test('deletes an item and selects the next, previous, or empty position', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const first = addItem(initial, {
    type: 'text', source: 'first', note: '', mathml: null
  }, { idFactory: ids('item-1') });
  const second = addItem(first, {
    type: 'text', source: 'second', note: '', mathml: null
  }, { idFactory: ids('item-2') });
  const third = addItem(second, {
    type: 'text', source: 'third', note: '', mathml: null
  }, { idFactory: ids('item-3') });

  const withoutSecond = deleteItem(third, 'item-2');
  assert.deepEqual(getActiveNapkin(withoutSecond).items.map(({ id }) => id), ['item-1', 'item-3']);
  assert.equal(getActiveNapkin(withoutSecond).selectedItemId, 'item-3');

  const withoutThird = deleteItem(withoutSecond, 'item-3');
  assert.deepEqual(getActiveNapkin(withoutThird).items.map(({ id }) => id), ['item-1']);
  assert.equal(getActiveNapkin(withoutThird).selectedItemId, 'item-1');

  const withoutLast = deleteItem(withoutThird, 'item-1');
  assert.deepEqual(getActiveNapkin(withoutLast).items, []);
  assert.equal(getActiveNapkin(withoutLast).selectedItemId, null);
  assert.throws(() => deleteItem(withoutLast, 'missing'), /Item not found/);
});

test('selects only items belonging to the active napkin', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const added = addItem(initial, {
    type: 'text', source: 'hello', note: '', mathml: null
  }, { idFactory: ids('item-1') });

  assert.equal(getActiveNapkin(selectItem(added, 'item-1')).selectedItemId, 'item-1');
  assert.throws(() => selectItem(added, 'missing'), /Item not found/);
});

test('validation rejects duplicate IDs and dangling active or selected IDs', () => {
  const valid = createInitialState({ idFactory: ids('napkin-1') });
  assert.deepEqual(validateState(valid), { ok: true, issues: [] });

  const duplicate = structuredClone(valid);
  duplicate.napkins.push(structuredClone(duplicate.napkins[0]));
  assert.equal(validateState(duplicate).ok, false);
  assert.match(validateState(duplicate).issues.join(' '), /duplicate napkin id/i);

  const danglingActive = structuredClone(valid);
  danglingActive.activeNapkinId = 'missing';
  assert.match(validateState(danglingActive).issues.join(' '), /activeNapkinId/);

  const danglingSelection = structuredClone(valid);
  danglingSelection.napkins[0].selectedItemId = 'missing';
  assert.match(validateState(danglingSelection).issues.join(' '), /selectedItemId/);
});

test('validation rejects unsupported schemas and item invariant violations', () => {
  const invalid = createInitialState({ idFactory: ids('napkin-1') });
  invalid.schemaVersion = 1;
  assert.match(validateState(invalid).issues.join(' '), /schemaVersion/);

  invalid.schemaVersion = 2;
  invalid.napkins[0].items.push({
    id: 'item-1', type: 'text', source: 'hello', note: '', mathml: '<math/>'
  });
  assert.match(validateState(invalid).issues.join(' '), /Text items cannot contain MathML/);
});

test('insertItemAt inserts at index, appends at length, and selects the new item without mutating prior state', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const first = addItem(initial, {
    type: 'text', source: 'first', note: '', mathml: null
  }, { idFactory: ids('item-1') });
  const second = addItem(first, {
    type: 'text', source: 'second', note: '', mathml: null
  }, { idFactory: ids('item-2') });

  const prepended = insertItemAt(second, 0, {
    type: 'text', source: '  before  ', note: 'n', mathml: null
  }, { idFactory: ids('item-0') });
  assert.notEqual(prepended, second);
  assert.deepEqual(getActiveNapkin(second).items.map(({ id }) => id), ['item-1', 'item-2']);
  assert.deepEqual(getActiveNapkin(prepended).items.map(({ id, source }) => ({ id, source })), [
    { id: 'item-0', source: 'before' },
    { id: 'item-1', source: 'first' },
    { id: 'item-2', source: 'second' }
  ]);
  assert.equal(getActiveNapkin(prepended).selectedItemId, 'item-0');

  const inserted = insertItemAt(second, 1, {
    type: 'equation',
    source: 'x',
    note: '',
    mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>'
  }, { idFactory: ids('item-eq') });
  assert.deepEqual(getActiveNapkin(inserted).items.map(({ id, type }) => ({ id, type })), [
    { id: 'item-1', type: 'text' },
    { id: 'item-eq', type: 'equation' },
    { id: 'item-2', type: 'text' }
  ]);
  assert.equal(getActiveNapkin(inserted).selectedItemId, 'item-eq');

  const appended = insertItemAt(second, 2, {
    type: 'text', source: 'third', note: '', mathml: null
  }, { idFactory: ids('item-3') });
  const viaAdd = addItem(second, {
    type: 'text', source: 'third', note: '', mathml: null
  }, { idFactory: ids('item-3') });
  assert.deepEqual(getActiveNapkin(appended).items.map(({ id }) => id), ['item-1', 'item-2', 'item-3']);
  assert.deepEqual(getActiveNapkin(viaAdd).items.map(({ id }) => id), ['item-1', 'item-2', 'item-3']);
  assert.equal(getActiveNapkin(appended).selectedItemId, 'item-3');
});

test('insertItemAt rejects out-of-range indexes and invalid items', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const withItem = addItem(initial, {
    type: 'text', source: 'hello', note: '', mathml: null
  }, { idFactory: ids('item-1') });

  assert.throws(() => insertItemAt(withItem, -1, {
    type: 'text', source: 'x', note: '', mathml: null
  }, { idFactory: ids('item-x') }), RangeError);
  assert.throws(() => insertItemAt(withItem, 2, {
    type: 'text', source: 'x', note: '', mathml: null
  }, { idFactory: ids('item-x') }), RangeError);
  assert.throws(() => insertItemAt(initial, 0, {
    type: 'text', source: '', note: '', mathml: null
  }, { idFactory: ids('item-x') }), /Item source is required/);
  assert.throws(() => insertItemAt(initial, 0, {
    type: 'equation', source: 'x', note: '', mathml: null
  }, { idFactory: ids('item-x') }), /Equation items require MathML/);
});

test('splitTextItem splits a text item at a mid offset into left and right pieces', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const first = addItem(initial, {
    type: 'text', source: 'hello world', note: 'keep', mathml: null
  }, { idFactory: ids('item-1') });
  const second = addItem(first, {
    type: 'text', source: 'after', note: '', mathml: null
  }, { idFactory: ids('item-2') });

  const { state, leftId, rightId } = splitTextItem(second, 'item-1', 5, { idFactory: ids('item-right') });

  assert.notEqual(state, second);
  assert.deepEqual(getActiveNapkin(second).items.map(({ source }) => source), ['hello world', 'after']);
  assert.equal(leftId, 'item-1');
  assert.equal(rightId, 'item-right');
  const napkin = getActiveNapkin(state);
  assert.deepEqual(napkin.items.map(({ id, type, source, note }) => ({ id, type, source, note })), [
    { id: 'item-1', type: 'text', source: 'hello', note: 'keep' },
    { id: 'item-right', type: 'text', source: ' world', note: 'keep' },
    { id: 'item-2', type: 'text', source: 'after', note: '' }
  ]);
  assert.equal(napkin.selectedItemId, 'item-1');
  assert.deepEqual(validateState(state), { ok: true, issues: [] });
});

test('splitTextItem does not persist empty sides at offset 0 or source.length', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const added = addItem(initial, {
    type: 'text', source: 'hello', note: '', mathml: null
  }, { idFactory: ids('item-1') });

  const atStart = splitTextItem(added, 'item-1', 0, { idFactory: ids('item-new') });
  assert.equal(atStart.state, added);
  assert.equal(atStart.leftId, null);
  assert.equal(atStart.rightId, 'item-1');
  assert.equal(getActiveNapkin(atStart.state).items.length, 1);

  const atEnd = splitTextItem(added, 'item-1', 5, { idFactory: ids('item-new') });
  assert.equal(atEnd.state, added);
  assert.equal(atEnd.leftId, 'item-1');
  assert.equal(atEnd.rightId, null);
  assert.equal(getActiveNapkin(atEnd.state).items.length, 1);
});

test('splitTextItem omits a whitespace-only side and keeps the original item id on the remaining side', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const added = addItem(initial, {
    type: 'text', source: 'hello', note: '', mathml: null
  }, { idFactory: ids('item-1') });
  const padded = structuredClone(added);
  padded.napkins[0].items[0].source = 'hello  ';

  const trailing = splitTextItem(padded, 'item-1', 5, { idFactory: ids('item-right') });
  assert.equal(trailing.leftId, 'item-1');
  assert.equal(trailing.rightId, null);
  assert.deepEqual(getActiveNapkin(trailing.state).items.map(({ id, source }) => ({ id, source })), [
    { id: 'item-1', source: 'hello  ' }
  ]);

  const leadingPadded = structuredClone(added);
  leadingPadded.napkins[0].items[0].source = '  hello';
  const leading = splitTextItem(leadingPadded, 'item-1', 2, { idFactory: ids('item-right') });
  assert.equal(leading.leftId, null);
  assert.equal(leading.rightId, 'item-1');
  assert.deepEqual(getActiveNapkin(leading.state).items.map(({ id, source }) => ({ id, source })), [
    { id: 'item-1', source: '  hello' }
  ]);
});

test('splitTextItem rejects missing items, non-text items, and out-of-range offsets', () => {
  const initial = createInitialState({ idFactory: ids('napkin-1') });
  const withText = addItem(initial, {
    type: 'text', source: 'hello', note: '', mathml: null
  }, { idFactory: ids('item-1') });
  const withEquation = addItem(withText, {
    type: 'equation',
    source: 'x',
    note: '',
    mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>'
  }, { idFactory: ids('item-eq') });

  assert.throws(() => splitTextItem(withEquation, 'missing', 0, { idFactory: ids('x') }), RangeError);
  assert.throws(() => splitTextItem(withEquation, 'item-eq', 0, { idFactory: ids('x') }), TypeError);
  assert.throws(() => splitTextItem(withText, 'item-1', -1, { idFactory: ids('x') }), RangeError);
  assert.throws(() => splitTextItem(withText, 'item-1', 6, { idFactory: ids('x') }), RangeError);
});

test('validation still requires a non-empty text source', () => {
  const state = createInitialState({ idFactory: ids('napkin-1') });
  state.napkins[0].items.push({
    id: 'item-1', type: 'text', source: '', note: '', mathml: null
  });
  assert.match(validateState(state).issues.join(' '), /source is required/);
});
