import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('official example extraction retains every numbered example and source block', async () => {
  const corpus = JSON.parse(await readFile(new URL('../../docs/bana-official-examples.json', import.meta.url), 'utf8'));
  assert.equal(corpus.counts.examples, 1229);
  assert.equal(new Set(corpus.examples.map((example) => example.id)).size, 1229);
  assert.ok(corpus.examples.every((example) => example.printAndBraille.length > 0));
  assert.ok(corpus.examples.every((example) => example.pdfPage > 0));
});

test('reviewed mathematical examples retain BRF that lacks passage switches', async () => {
  const corpus = JSON.parse(await readFile(new URL('../../docs/bana-official-examples.json', import.meta.url), 'utf8'));
  const expected = new Map([
    ['15-8', ';"x<`:]",a1'],
    ['20-49', '#g_/#d_/#gf']
  ]);
  for (const [exampleNumber, sourceNotation] of expected) {
    const example = corpus.examples.find((candidate) => candidate.exampleNumber === exampleNumber);
    assert.equal(example?.sourceNotation, sourceNotation, `${exampleNumber} source notation`);
    assert.equal(example?.expectedWholeBraille, sourceNotation, `${exampleNumber} expected BRF`);
  }
});
