import { readFile, writeFile } from 'node:fs/promises';

const coveragePath = process.argv[2] ?? 'docs/bana-coverage.json';
const outputPath = process.argv[3] ?? 'docs/bana-audit-table.md';
const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
const visual = JSON.parse(await readFile('docs/bana-visual-evidence.json', 'utf8'));
const visualBySource = new Map();
for (const entry of visual.cases ?? []) for (const row of entry.sourceRows ?? []) visualBySource.set(row, entry);

const ruleNames = {
  1: 'General provisions', 2: 'Nemeth/UEB boundaries and indicators', 3: 'Numbers and arithmetic',
  4: 'Fractions and numeric context', 5: 'Letters and capitalization', 6: 'Alphabets and special letterforms',
  7: 'Typeforms', 8: 'Punctuation', 9: 'Reference symbols', 10: 'Abbreviations',
  11: 'Omissions', 12: 'Cancellation', 13: 'Fractions', 14: 'Superscripts and subscripts',
  15: 'Modifiers', 16: 'Radicals', 17: 'Shapes', 18: 'Function names', 19: 'Grouping signs',
  20: 'Operators', 21: 'Comparisons', 22: 'Arrows', 23: 'Special symbols', 24: 'Multipurpose indicator',
  25: 'Spatial arrangements', 26: 'Document formatting'
};
const excluded = new Set(['excluded-spatial', 'excluded-chemistry', 'excluded-document-format', 'superseded-by-errata']);
const sourceLink = 'https://www.brailleauthority.org/sites/default/files/2024-02/Nemeth_2022.pdf';
const codeLink = '[guided transition registry](../src/domain/guided-nemeth/index.js)';
const unitLink = '[unit coverage](../test/unit/guided-nemeth-bana-mappings.test.js)';
const electronLink = '[Electron corpus](../test/e2e/bana-official-corpus.test.js)';
const short = (value) => String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 120);
const ruleFor = (row) => {
  const id = String(row.id ?? '');
  const parent = String(row.parentId ?? '');
  if (row.kind === 'appendix') {
    const appendix = id.match(/appendix-([A-D])/i)?.[1];
    return appendix ? `Appendix ${appendix.toUpperCase()}` : 'Appendix';
  }
  const direct = id.match(/(?:bana-2022:|errata-2025:)?(\d{1,2})[.-]/)?.[1];
  if (direct) return Number(direct);
  const inherited = parent.match(/(?:bana-2022:|errata-2025:)?(\d{1,2})[.-]/)?.[1];
  return inherited ? Number(inherited) : (row.kind === 'erratum' ? 'Errata' : 'Other');
};
const policy = (row) => row.inputPolicy || (row.disposition === 'implemented-context-policy' ? 'context policy' : '—');
const check = (row) => {
  const fields = ['implementation', 'creation', 'editing', 'navigation', 'wholeBraille', 'focusedBraille', 'undoRedo', 'persistence'];
  if (excluded.has(row.disposition)) return 'excluded';
  if (row.evidenceScope === 'source-policy' || row.disposition === 'implemented-context-policy') {
    return row.verified?.source === true && row.verified?.implementation === true && row.verified?.contextPolicy === true
      ? 'pass' : 'open';
  }
  if (row.verified?.visualEvidence !== true) return 'open';
  return fields.every((field) => row.verified?.[field] === true) ? 'pass' : 'open';
};
const linkEvidence = (row, kind) => row[`${kind}CaseIds`]?.length ? `${electronLink} (${row[`${kind}CaseIds`].length})` : '—';
const visualEvidenceLinks = (entry) => {
  if (!entry) return '—';
  const phases = entry.evidenceSet?.screenshots ?? entry.screenshots ?? [];
  if (phases.length) return phases.map((shot) => `[${shot.phase}](${shot.path})`).join(' / ');
  const legacy = [];
  if (entry.creationScreenshot) legacy.push(`[committed](${entry.creationScreenshot})`);
  if (entry.editingScreenshot) legacy.push(`[editing](${entry.editingScreenshot})`);
  return legacy.join(' / ') || '—';
};
const officialCells = (row) => {
  const source = row.officialSource;
  if (!source?.expectedWholeBraille && !source?.sourceNotation && !source?.brailleCells) return '—';
  const notation = source.sourceNotation ? `source: \`${short(source.sourceNotation)}\`` : '';
  const cells = source.brailleCells
    ? `cells: \`${short(source.brailleCells)}\``
    : source.expectedWholeBraille ? `cells: \`${short(source.expectedWholeBraille)}\`` : '';
  return [notation, cells].filter(Boolean).join('<br>');
};
const rows = [...(coverage.rows ?? [])].sort((a, b) => a.auditOrder - b.auditOrder);
const applicable = rows.filter((row) => !excluded.has(row.disposition));
const implemented = applicable.filter((row) => row.disposition.startsWith('implemented-'));
const ruleRows = new Map();
for (const row of rows) {
  const rule = ruleFor(row);
  if (!ruleRows.has(rule)) ruleRows.set(rule, []);
  ruleRows.get(rule).push(row);
}
const countEvidence = (rule, field) => ruleRows.get(rule)?.filter((row) => row[field]?.length).length ?? 0;
const lines = [
  '# Canonical BANA guided-Nemeth audit table', '',
  `Normative source: [BANA Nemeth Code 2022](${sourceLink}); errata hashes and extracted page metadata are in [bana-coverage.json](bana-coverage.json).`, '',
  'This is the contributor-facing source of truth. It is generated from the sequential ledger, not hand-written. Every row is one provision, official example, symbol-table entry, appendix item, or erratum. `open` means engineering or evidence is still required; it is not an unsupported claim.', '',
  `Total ledger rows: **${rows.length}**. Applicable rows: **${applicable.length}**. Implemented disposition: **${implemented.length}**.`, '',
  '## Rule index and totals', '',
  'This index is the fast audit surface. The row-level table below is canonical: every rule total expands into the exact source provisions, examples, symbols, appendices, and errata in manual order.', '',
  '| Rule | Rule name | Total rows | Applicable | Implemented disposition | Open evidence | Unit-linked rows | Electron creation rows | Electron editing rows | Navigation rows | Visual screenshot rows |',
  '| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
];
for (const rule of [...ruleRows.keys()].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))) {
  const group = ruleRows.get(rule);
  const groupApplicable = group.filter((row) => !excluded.has(row.disposition));
  const groupImplemented = groupApplicable.filter((row) => row.disposition.startsWith('implemented-'));
  const groupOpen = groupApplicable.filter((row) => check(row) === 'open');
  // Count only evidence that passed the phase contract. A legacy screenshot
  // link remains visible on the row for forensic review, but it must not make
  // the rule index look complete when input/focus evidence is absent.
  const visualRows = group.filter((row) => row.verified?.visualEvidence === true).length;
  lines.push(`| [Rule ${rule}](#rule-${rule}) | ${ruleNames[rule] ?? 'Other'} | ${group.length} | ${groupApplicable.length} | ${groupImplemented.length} | ${groupOpen.length} | ${countEvidence(rule, 'unitCaseIds')} | ${countEvidence(rule, 'electronCreationCaseIds')} | ${countEvidence(rule, 'electronEditingCaseIds')} | ${countEvidence(rule, 'navigationCaseIds')} | ${visualRows} |`);
}
lines.push('', '## Row-level canonical ledger', '', '| Order | Rule | Source row | Title / short scope | Page | Official notation / whole Braille | Input policy | Disposition | Registry / code | Unit evidence | Electron creation | Electron editing | Navigation | Visual evidence | Verification |', '| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const row of rows) {
  const rule = ruleFor(row);
  const ruleAnchor = row === ruleRows.get(rule)?.[0] ? `<a id="rule-${rule}"></a>` : '';
  const visualEntry = visualBySource.get(row.id) || visualBySource.get(row.id.replace(/^bana-2022:/, ''));
  const visualLink = visualEvidenceLinks(visualEntry ?? row.visualEvidence);
  const mappings = row.mappingIds?.length ? row.mappingIds.slice(0, 4).map((id) => `\`${id}\``).join(', ') + (row.mappingIds.length > 4 ? ` +${row.mappingIds.length - 4}` : '') : '—';
  const source = row.kind === 'erratum' ? row.id : `[${row.id.replace(/^bana-2022:/, '')}](bana-coverage.json#${row.id.replace(/[^a-z0-9]+/gi, '-')})`;
  lines.push(`| ${row.auditOrder} | ${ruleAnchor}Rule ${rule}: ${ruleNames[rule] ?? 'Other'} | ${source} | ${short(row.title)} | ${row.printedPage ?? row.pdfPage ?? '—'} | ${officialCells(row)} | ${policy(row)} | ${row.disposition} | ${mappings} ${row.mappingIds?.length ? codeLink : ''} | ${row.unitCaseIds?.length ? unitLink : '—'} | ${linkEvidence(row, 'electronCreation')} | ${linkEvidence(row, 'electronEditing')} | ${row.navigationCaseIds?.length ? electronLink : '—'} | ${visualLink} | ${check(row)} |`);
}
lines.push('', '## How to audit a failure', '', 'Start with the source row and page, then follow the registry IDs to the guided transition table and the linked unit/Electron case. For a rendering issue, open the linked visual phases in order: input proves the Nemeth interaction, committed proves the whole expression, focused proves the MathJax handoff, and editing proves exact replacement. Read each screenshot claim in the JSON artifact; a post-edit `y` alone is never sufficient evidence of a BANA rule. The canonical model is one MathML root; MathJax visual and assistive trees are derived projections. Rules 25, chemistry, and Rule 26 document-format rows are the only approved exclusions.');
await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`BANA canonical audit table written: ${outputPath} (${rows.length} rows)`);
