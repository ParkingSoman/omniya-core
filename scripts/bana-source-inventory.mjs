import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sourcePath = process.env.BANA_SOURCE_TEXT ?? '/private/tmp/Nemeth_2022.txt';
const errataPath = process.env.BANA_ERRATA_TEXT ?? '/private/tmp/Nemeth_2022_Errata_2025.txt';
const output = process.argv[2] ?? 'docs/bana-source-inventory.json';

const source = await readFile(sourcePath, 'utf8');
const errata = await readFile(errataPath, 'utf8');
const sourceLines = source.split(/\r?\n/);
const pageStarts = [];
const printedPages = [];
let page = 1;
let pageStart = 0;
for (let index = 0; index < sourceLines.length; index += 1) {
  pageStarts.push(page);
  if (!sourceLines[index].includes('\f')) continue;
  const pageLines = sourceLines.slice(pageStart, index + 1);
  const footer = [...pageLines].reverse().find((line) => /^\s*(?:\d{1,2}|[A-D])-\d+\s*$/.test(line));
  for (let pageIndex = pageStart; pageIndex <= index; pageIndex += 1) printedPages[pageIndex] = footer?.trim() ?? null;
  pageStart = index + 1;
  page += 1;
}
const finalPageLines = sourceLines.slice(pageStart);
const finalFooter = [...finalPageLines].reverse().find((line) => /^\s*(?:\d{1,2}|[A-D])-\d+\s*$/.test(line));
for (let pageIndex = pageStart; pageIndex < sourceLines.length; pageIndex += 1) printedPages[pageIndex] = finalFooter?.trim() ?? null;

const rows = [];
let order = 0;
let currentRule = null;
let currentProvision = null;
const seen = new Set();
const add = (row) => {
  if (seen.has(row.id)) return;
  seen.add(row.id);
  rows.push({
    id: row.id,
    kind: row.kind,
    parentId: row.parentId ?? null,
    title: row.title?.trim() || row.id,
    printedPage: row.printedPage ?? null,
    pdfPage: row.pdfPage ?? null,
    auditOrder: order++,
    disposition: row.disposition ?? 'unclassified',
    inputPolicy: null,
    mappingIds: [],
    unitCaseIds: [],
    electronCreationCaseIds: [],
    electronEditingCaseIds: [],
    navigationCaseIds: [],
    errataRefs: [],
    verified: {
      source: true,
      implementation: false,
      creation: false,
      editing: false,
      navigation: false,
      wholeBraille: false,
      focusedBraille: false,
      undoRedo: false,
      persistence: false
    },
    transcriberReview: 'pending'
  });
};

// The extracted PDF text contains a table of contents before the body and
// Appendix A repeats rule labels as change notes. Only body rows between the
// first Rule 1 heading and Appendix A are normative rule/provision rows.
const bodyStart = sourceLines.findIndex((line, index) => index > 300 && /^\s*Rule 1\s*$/.test(line));
const bodyEnd = sourceLines.findIndex((line, index) => index > bodyStart && /^\s*Appendix A\s*$/.test(line));
for (let index = bodyStart; index >= 0 && index < (bodyEnd > 0 ? bodyEnd : sourceLines.length); index += 1) {
  const line = sourceLines[index].trim();
  let match = line.match(/^Rule\s+(\d+)\s*$/i);
  if (match) {
    currentRule = match[1];
    currentProvision = null;
    continue;
  }
  match = line.match(/^(\d{1,2}(?:\.\d+){1,3}(?:\.[a-z])?)\s+(?!\d)(.+)/i);
  const looksLikeProvision = match && currentRule &&
    (Number(match[1].split('.')[0]) === Number(currentRule) || match[1] === '4.6.8.c') &&
    !/^\d+\.\d+\s+/.test(line.slice(match[0].length - match[2].length)) &&
    !/^\d+\.\d+\s+/.test(line.slice(match[0].length - match[2].length)) &&
    !/^(?:\d+(?:\.\d+){0,2})\s+(?:mi|cm|yd|g|ft\.?|mph|=|\.\.\.)/i.test(match[2]) &&
    (!/\bfor rules regarding\b/i.test(match[2]) || match[1] === '4.6.8.c');
  if (looksLikeProvision) {
    const id = match[1];
    const parts = id.split('.');
    const parentId = `bana-2022:${parts.length === 2 ? `rule-${currentRule}` : parts.slice(0, -1).join('.')}`;
    const ruleNumber = Number(id.split('.')[0]);
    add({ id: `bana-2022:${id}`, kind: 'provision', parentId, title: match[2].replace(/\.{2,}.*$/, '').trim(), pdfPage: pageStarts[index], printedPage: printedPages[index] ?? null,
      disposition: ruleNumber >= 26 ? 'excluded-document-format' : ruleNumber === 25 ? 'excluded-spatial' : 'unclassified' });
    currentProvision = id;
    continue;
  }
  match = line.match(/^Example\s+(\d{1,2}-\d+)(?::\s*(.*))?/i);
  if (match) {
    const rule = match[1].split('-')[0];
    add({ id: `bana-2022:example-${match[1]}`, kind: 'example', parentId: currentProvision ? `bana-2022:${currentProvision}` : `bana-2022:rule-${rule}`,
      title: match[2] || `Example ${match[1]}`, pdfPage: pageStarts[index], printedPage: printedPages[index] ?? null,
      disposition: Number(rule) >= 26 ? 'excluded-document-format' : Number(rule) === 25 ? 'excluded-spatial' : 'unclassified' });
  }
}

const errataRows = [];
const seenErrataKeys = new Set();
/* Parse the detailed locations rather than the table of changes.  The table
   wraps across pages and has two August 2024 entries explicitly removed from
   the approved errata.  A section/page key collapses multiple corrections to
   one source location while preserving the exact source text in the row. */
for (const match of errata.matchAll(/Location:\s+P\.\s*([^\n]+?)(?:\s+–|\s+-|\s*$)/gi)) {
  const preceding = errata.slice(Math.max(0, match.index - 600), match.index);
  if (/Remove the following item from the approved errata/i.test(preceding)) continue;
  const locationText = match[1].trim();
  const pageLabel = locationText.split(',')[0].trim();
  const sectionMatch = locationText.match(/§\s*([^,–-]+)/i);
  const section = sectionMatch?.[1]?.trim() || (locationText.match(/\b(symbol list|B-\d+|D-\d+)\b/i)?.[1] ?? 'special');
  const normalizedSection = section.replace(/\s+/g, ' ').replace(/\.$/, '').trim();
  const id = `errata-2025:${normalizedSection.replace(/[^\w.]+/g, '-')}-${pageLabel.replace(/[^\w.-]+/g, '-')}`;
  if (seenErrataKeys.has(id)) continue;
  seenErrataKeys.add(id);
  const ruleNumber = Number(normalizedSection.match(/^\d+/)?.[0] ?? 0);
  const disposition = ruleNumber === 25 ? 'excluded-spatial' : ruleNumber === 26 ? 'excluded-document-format' : 'unclassified';
  errataRows.push({ id, kind: 'erratum', parentId: null, title: `${normalizedSection} at ${pageLabel}`, printedPage: pageLabel, pdfPage: null, disposition });
}
for (const row of [...new Map(errataRows.map((row) => [row.id, row])).values()]) add(row);

const hash = (path, content) => createHash('sha256').update(content).digest('hex');
const result = {
  schemaVersion: 1,
  source: {
    title: 'The Nemeth Braille Code for Mathematics and Science Notation 2022',
    textPath: sourcePath,
    errataPath,
    sourceTextSha256: hash(sourcePath, source),
    errataTextSha256: hash(errataPath, errata),
    sourcePdfSha256: 'fc2324a522b4ee053923b6f28ccd05c7a1caad280531e26df35ef46479559e68',
    errataPdfSha256: 'f9f97b0912c61eb2ca0ab3d4474cfd4021b1bb89d0722808bf13e3c3d5e2db84'
  },
  counts: {
    numberedRows: rows.filter((row) => row.kind === 'provision').length,
    planBaselineNumberedRows: 516,
    numberedRowCountNote: 'The PDF contains 508 actual numbered provision labels plus the 4.6.8.c provision explicitly targeted by the errata, for 509 source provision rows. The prior 516 baseline counted seven numeric example lines as provisions; this inventory excludes them.',
    examples: rows.filter((row) => row.kind === 'example').length,
    errata: rows.filter((row) => row.kind === 'erratum').length,
    errataInScope: rows.filter((row) => row.kind === 'erratum' && row.disposition === 'unclassified').length
  },
  rows
};
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`BANA source inventory written: ${output} (${rows.length} rows)`);
