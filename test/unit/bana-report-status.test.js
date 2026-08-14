import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('coverage report distinguishes implementation completion from audit completion', () => {
  const report = fs.readFileSync(new URL('../../docs/bana-coverage-report.md', import.meta.url), 'utf8');
  assert.match(report, /Status: \*\*implementation-complete; evidence-incomplete\*\*/);
  assert.doesNotMatch(report, /Status: \*\*automated-complete\*\*/);
  assert.match(report, /Missing Electron creation evidence:/);
  assert.match(report, /Pending independent transcriber review:/);
});
