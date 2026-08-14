import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('every non-executable official corpus case is an explicit document/context review', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url)));
  const nonExecutable = corpus.cases.filter((entry) => !entry.executable).map((entry) => entry.exampleNumber).sort();
  const expected = [
    '3-1', '3-39', '3-77', '3-78', '3-79', '3-80', '3-81', '3-82', '3-106', '3-107', '3-108', '3-109',
    '4-17', '4-18', '4-20', '4-23', '4-25', '4-32', '4-40', '7-22', '10-2', '10-3', '10-15', '10-16', '10-17',
    '11-13', '13-16', '13-17', '14-1', '14-2', '17-21', '18-3', '19-36', '19-37', '19-38', '19-39', '19-40',
    '19-41', '19-42', '19-43', '19-44', '19-45'
  ];
  assert.deepEqual(nonExecutable, [...expected].sort());
  const byNumber = new Map(corpus.cases.map((entry) => [entry.exampleNumber, entry]));
  for (const number of ['14-1', '14-2', ...expected.filter((value) => value.startsWith('19-'))]) {
    assert.equal(byNumber.get(number)?.executable, false, `${number} remains documentary/layout-only`);
  }
  for (const number of expected.filter((value) => !value.startsWith('14-') && !value.startsWith('19-'))) {
    assert.equal(byNumber.get(number)?.sourceNotation, null, `${number} has no executable mathematical source notation`);
    assert.equal(byNumber.get(number)?.cells, null, `${number} has no extracted executable cells`);
  }
});
