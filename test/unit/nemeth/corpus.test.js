import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// These tests guard the committed correctness-oracle corpus itself (its
// shape and internal consistency), not the parser -- which does not exist
// yet. The JSON is loaded once from disk; no network access.

const corpusPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../test/corpus/nemeth-v1.json'
);
const raw = readFileSync(corpusPath, 'utf8');
const corpus = JSON.parse(raw);

const BRAILLE_CELL_RE = /^[⠀-⣿]+$/;

test('corpus JSON parses and declares schemaVersion 1', () => {
  assert.equal(corpus.schemaVersion, 1);
});

test('corpus has the expected top-level shape', () => {
  assert.equal(typeof corpus.generatedBy, 'string');
  assert(Array.isArray(corpus.sources));
  assert(Array.isArray(corpus.cases));
});

test('total case count equals the sum of the declared source caseCounts', () => {
  const declaredTotal = corpus.sources.reduce((sum, s) => sum + s.caseCount, 0);
  assert.equal(corpus.cases.length, declaredTotal);
});

test('each source\'s declared caseCount matches its actual case count', () => {
  for (const source of corpus.sources) {
    const actual = corpus.cases.filter((c) => c.source === source.id).length;
    assert.equal(actual, source.caseCount, `source "${source.id}" caseCount mismatch`);
  }
});

test('the two verified known-count assertions hold: 273 mathcat-rules, 340 sre-aata', () => {
  const mathcatCount = corpus.cases.filter((c) => c.source === 'mathcat-rules').length;
  const sreCount = corpus.cases.filter((c) => c.source === 'sre-aata').length;
  assert.equal(mathcatCount, 273);
  assert.equal(sreCount, 340);
});

test('every case id is unique', () => {
  const ids = corpus.cases.map((c) => c.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length);
});

test('every case\'s source matches a declared source id', () => {
  const declaredIds = new Set(corpus.sources.map((s) => s.id));
  for (const c of corpus.cases) {
    assert(declaredIds.has(c.source), `case "${c.id}" references undeclared source "${c.source}"`);
  }
});

test('every cells value is non-empty and contains only braille cell codepoints (U+2800-U+28FF)', () => {
  for (const c of corpus.cases) {
    assert(typeof c.cells === 'string' && c.cells.length > 0, `case "${c.id}" has an empty cells value`);
    assert(BRAILLE_CELL_RE.test(c.cells), `case "${c.id}" cells contains a non-braille codepoint: ${JSON.stringify(c.cells)}`);
  }
});

test('every mathml value is non-empty, starts with "<math", and contains no XML comments', () => {
  for (const c of corpus.cases) {
    assert(typeof c.mathml === 'string' && c.mathml.length > 0, `case "${c.id}" has an empty mathml value`);
    assert(c.mathml.startsWith('<math'), `case "${c.id}" mathml does not start with "<math": ${JSON.stringify(c.mathml.slice(0, 40))}`);
    assert(!c.mathml.includes('<!--'), `case "${c.id}" mathml still contains an XML comment`);
  }
});
