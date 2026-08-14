import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coverage = JSON.parse(fs.readFileSync(new URL('../../docs/bana-coverage.json', import.meta.url)));

test('non-mathematical UEB and Braille Formats examples remain documentary exclusions', () => {
  const expected = new Map([
    ['bana-2022:example-3-39', /typeform has no mathematical meaning/],
    ['bana-2022:example-17-21', /Braille Formats rules are followed for non-mathematical words/]
  ]);
  for (const [id, sourceText] of expected) {
    const row = coverage.rows.find((candidate) => candidate.id === id);
    assert.equal(row?.disposition, 'excluded-document-format', id);
    assert.match(row?.officialSource?.printAndBraille ?? '', sourceText, id);
    assert.deepEqual(row?.mappingIds, [], `${id} must not inherit operation credit`);
    assert.equal(row?.verified?.creation, false, `${id} must not claim Electron evidence`);
  }
});
