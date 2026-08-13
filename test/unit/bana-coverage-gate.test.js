import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('BANA source inventory contains the complete manual order and does not silently pass gaps', async () => {
  const inventory = JSON.parse(await readFile(new URL('../../docs/bana-source-inventory.json', import.meta.url), 'utf8'));
  assert.equal(inventory.counts.numberedRows, 509);
  assert.equal(inventory.counts.planBaselineNumberedRows, 516);
  assert.equal(inventory.counts.examples, 1229);
  assert.equal(inventory.counts.errata, 42);
  assert.equal(inventory.counts.errataInScope, 34);
  assert.equal(inventory.rows[0].auditOrder, 0);
  assert.ok(inventory.rows.every((row, index) => row.auditOrder === index));
  assert.ok(!inventory.rows.some((row) => /^bana-2022:(?:0\.333|1\.5|2\.5|10\.0|9\.80|6\.696)$/.test(row.id)));
  assert.equal(inventory.rows.find((row) => row.id === 'bana-2022:4.6.8.c')?.disposition, 'unclassified');
  assert.equal(inventory.source.sourcePdfSha256, 'fc2324a522b4ee053923b6f28ccd05c7a1caad280531e26df35ef46479559e68');
  assert.equal(inventory.source.errataPdfSha256, 'f9f97b0912c61eb2ca0ab3d4474cfd4021b1bb89d0722808bf13e3c3d5e2db84');
});
