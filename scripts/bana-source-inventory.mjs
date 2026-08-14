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
    const title = match[2] || `Example ${match[1]}`;
    // A literary/non-mathematical example demonstrates passage-level
    // transcription, not an equation-tree construction. Keep it in the
    // sequential ledger, but classify it under the approved document-format
    // exclusion instead of manufacturing an Electron equation case.
    const nonMathematicalContext = /non[- ]mathematical context/i.test(title);
    add({ id: `bana-2022:example-${match[1]}`, kind: 'example', parentId: currentProvision ? `bana-2022:${currentProvision}` : `bana-2022:rule-${rule}`,
      title, pdfPage: pageStarts[index], printedPage: printedPages[index] ?? null,
      disposition: nonMathematicalContext || Number(rule) >= 26 ? 'excluded-document-format' : Number(rule) === 25 ? 'excluded-spatial' : 'unclassified' });
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

// Appendices are normative source material too.  The body parser deliberately
// stops before Appendix A, so inventory them explicitly rather than letting the
// source ledger silently end at Rule 26.  A-C are policy/change tables; D is
// the 63-entry symbol index.  The detailed subentries remain represented by
// their printed index row and are linked to the operation or parameterized
// mapping during enrichment.
const appendixStart = bodyEnd;
const appendixDStart = sourceLines.findIndex((line, index) => index > appendixStart && /^\s*Appendix D\s*$/.test(line));
if (appendixStart >= 0) {
  for (const [appendix, title] of [['A', 'Code Changes'], ['B', 'Placement of Code Switch Indicators'], ['C', 'Combinations of Typeform, Alphabetic and Capitalization Indicators']]) {
    const lineIndex = sourceLines.findIndex((line, index) => index >= appendixStart && new RegExp(`^\\s*Appendix ${appendix}\\s*$`).test(line));
    add({ id: `bana-2022:appendix-${appendix}`, kind: 'appendix', parentId: null, title: `Appendix ${appendix}: ${title}`, pdfPage: pageStarts[lineIndex], printedPage: printedPages[lineIndex] ?? `${appendix}-1`, disposition: 'unclassified' });
  }
}
if (appendixDStart >= 0) {
  // The summary table is laid out in five columns in the PDF text, while the
  // detailed index omits headings for several ranks.  Keep the authoritative
  // 1–63 order from that table explicitly so no symbol can disappear because
  // of a text-extraction line wrap.
  const symbols = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','x','y','z','&','=','(','!',')','*','<','%','?',':','$',']','\\','[','w','1','2','3','4','5','6','7','8','9','0','/','+','#','>','\'','-','@','^','_','"','.',';',','];
  const appendixPage = pageStarts[appendixDStart];
  symbols.forEach((symbol, index) => add({
    id: `bana-2022:appendix-D-${index + 1}`,
    kind: 'appendix',
    parentId: 'bana-2022:appendix-D',
    title: `Appendix D symbol ${index + 1}: ${symbol}`,
    pdfPage: appendixPage,
    printedPage: 'D-1',
    disposition: 'unclassified'
  }));
}

const hash = (path, content) => createHash('sha256').update(content).digest('hex');
const durableDisposition = rows.find((row) => row.id === 'bana-2022:example-7-22');
if (durableDisposition) durableDisposition.disposition = 'implemented-context-policy';
// Rules 3-11 errata are classified from the exact 2025 correction text.
// Only three corrections change executable Nemeth cells; five change
// normative context rules. The remainder correct headings, commentary, print
// layout, or a withdrawn erratum and therefore own no application behavior.
const rules3To11ErrataOperations = Object.freeze({
  'errata-2025:3.3.1-3-4': ['letter.capital-r'],
  'errata-2025:8.2.4-8-3': ['punctuation.long-dash', 'punctuation.ellipsis'],
  'errata-2025:9.1-9-1': ['reference.checkmark']
});
for (const [id, mappingIds] of Object.entries(rules3To11ErrataOperations)) {
  const row = rows.find((candidate) => candidate.id === id);
  if (row) {
    row.disposition = 'implemented-operation';
    row.mappingIds = mappingIds;
  }
}
for (const id of [
  'errata-2025:4.2-4-1',
  'errata-2025:4.6.8.c-4-16',
  'errata-2025:6.4.2-6-9',
  'errata-2025:10.6.3-10-11',
  'errata-2025:11.1.4-11-3'
]) {
  const row = rows.find((candidate) => candidate.id === id);
  if (row) row.disposition = 'implemented-context-policy';
}
for (const id of [
  'errata-2025:3.4.3-3-14',
  'errata-2025:3.5.2-3-16',
  'errata-2025:3.6.2-3-20',
  'errata-2025:4.5.3-4-8',
  'errata-2025:4.8.2-4-19',
  'errata-2025:8.2.13-8-7',
  'errata-2025:8.2.16-8-8',
  'errata-2025:8.8.2-8-15',
  'errata-2025:9.3.2-9-3',
  'errata-2025:10.1.1.a-10-1',
  'errata-2025:10.6.1-10-9'
]) {
  const row = rows.find((candidate) => candidate.id === id);
  if (row) row.disposition = 'excluded-document-format';
}
// The 2025 Rule 20.6 erratum changes only the heading of Example 20-36 from
// "Plus and Minus" to "Minus and Plus." Its print expression and BRF are
// unchanged, so it owns no executable operation or context-policy behavior.
const rule20HeadingErratum = rows.find((row) => row.id === 'errata-2025:20.6-20-9');
if (rule20HeadingErratum) rule20HeadingErratum.disposition = 'excluded-document-format';
// The remaining Rule 15 and appendix errata have different scopes. Example
// 15-8 supplies corrected executable BRF for a subscripted modified expression;
// Rule 15.7 corrects print-only modifier context; Appendix B clarifies document
// placement; Appendix D adds crossed d and removes a UEB-only index entry.
const rule15Example8Erratum = rows.find((row) => row.id === 'errata-2025:15.2.1-15-4');
if (rule15Example8Erratum) {
  rule15Example8Erratum.disposition = 'implemented-operation';
  rule15Example8Erratum.mappingIds = [
    'script.subscript',
    'indicator.multipurpose',
    'modifier.directly-over',
    'modifier.tilde.simple',
    'modifier.terminate.over',
    'script.baseline'
  ];
}
for (const id of ['errata-2025:15.7-15-12', 'errata-2025:B-2-B-2']) {
  const row = rows.find((candidate) => candidate.id === id);
  if (row) row.disposition = 'implemented-context-policy';
}
const appendixCrossedDErratum = rows.find((row) => row.id === 'errata-2025:D-27-D-27');
if (appendixCrossedDErratum) {
  appendixCrossedDErratum.disposition = 'implemented-operation';
  appendixCrossedDErratum.mappingIds = ['misc.crossed-d'];
}
const appendixUebRemovalErratum = rows.find((row) => row.id === 'errata-2025:D-32-D-32');
if (appendixUebRemovalErratum) appendixUebRemovalErratum.disposition = 'excluded-document-format';
// The Rule 23 errata restores crossed d in the symbol list and section 23.4,
// adds a spatial-layout exception to monetary spacing, and corrects Example
// 23-48 with the barred-letter indicator. Link each correction to only the
// exact existing operations or context decision it changes.
const rule23ErrataMappings = Object.freeze({
  'errata-2025:symbol-list-23-1': ['misc.crossed-d'],
  'errata-2025:23.4-23-3': ['misc.crossed-d'],
  'errata-2025:23.17-23-13': ['quantifier.exists-unique', 'typeform.barred']
});
for (const [id, mappingIds] of Object.entries(rule23ErrataMappings)) {
  const row = rows.find((candidate) => candidate.id === id);
  if (row) {
    row.disposition = 'implemented-operation';
    row.mappingIds = mappingIds;
  }
}
const rule23MonetaryErratum = rows.find((row) => row.id === 'errata-2025:23.13-23-9');
if (rule23MonetaryErratum) rule23MonetaryErratum.disposition = 'implemented-context-policy';
// Rule 18.2 delegates numeric function subscripts to the existing Rule 14.6
// context, while 18.5 selects mathematical versus literary punctuation. They
// define context rather than new input cells. Example 18-22's reviewed math
// segment uses exactly the three abbreviated functions named in the source.
for (const ref of ['18.2', '18.5']) {
  const row = rows.find((candidate) => candidate.id === `bana-2022:${ref}`);
  if (row) row.disposition = 'implemented-context-policy';
}
const rule18Example22 = rows.find((row) => row.id === 'bana-2022:example-18-22');
if (rule18Example22) {
  rule18Example22.disposition = 'implemented-operation';
  rule18Example22.mappingIds = ['function.sin', 'function.cos', 'function.tan'];
}
// Rule 21.10 decides when the four set/logical symbols are operations versus
// comparisons, and 21.13 governs spaces around comparison symbols. They are
// context policies rather than new cells. Their examples, however, exercise
// exact existing operations and receive only those row-specific mappings.
for (const ref of ['21.10', '21.13']) {
  const row = rows.find((candidate) => candidate.id === `bana-2022:${ref}`);
  if (row) row.disposition = 'implemented-context-policy';
}
const rule21ExampleMappings = Object.freeze({
  'example-21-23': ['comparison.union.bar-under'],
  'example-21-25': ['shape.square'],
  'example-21-26': ['operator.equals'],
  'example-21-27': ['operator.equals'],
  'example-21-28': ['operator.equals'],
  'example-21-29': ['comparison.greater'],
  'example-21-30': ['comparison.subset'],
  'example-21-31': ['comparison.subset'],
  'example-21-32': ['comparison.less'],
  'example-21-33': ['comparison.reverse-membership'],
  'example-21-34': ['comparison.ratio', 'comparison.proportion'],
  'example-21-35': ['comparison.ratio', 'comparison.proportion'],
  'example-21-36': ['comparison.variation'],
  'example-21-37': ['comparison.vertical-bar', 'comparison.less'],
  'example-21-38': ['operator.equals', 'comparison.vertical-bar', 'comparison.less-equal'],
  'example-21-39': ['comparison.less'],
  'example-21-40': ['comparison.less', 'operator.equals', 'comparison.greater'],
  'example-21-41': ['operator.equals']
});
for (const [suffix, mappingIds] of Object.entries(rule21ExampleMappings)) {
  const row = rows.find((candidate) => candidate.id === `bana-2022:${suffix}`);
  if (row) {
    row.disposition = 'implemented-operation';
    row.mappingIds = mappingIds;
  }
}
// Examples 14-1 and 14-2 are explanatory prose/standalone script illustrations,
// not executable equation-draft cases. Keep them source-linked as honest
// document-format exclusions rather than claiming a context-policy operation.
const rule14Example1 = rows.find((row) => row.id === 'bana-2022:example-14-1');
if (rule14Example1) rule14Example1.disposition = 'excluded-document-format';
// Example 3-1 demonstrates the printed section-title layout ("Section
// 1.3.4"), not a standalone mathematical expression. Its extracted source
// block intentionally has no local Nemeth notation.
const rule3SectionTitle = rows.find((row) => row.id === 'bana-2022:example-3-1');
if (rule3SectionTitle) rule3SectionTitle.disposition = 'excluded-document-format';
// These examples explicitly leave mathematical Nemeth: 3-39 says its
// typeform has no mathematical meaning and is transcribed in UEB; 17-21
// delegates non-mathematical words in shapes to Braille Formats.
for (const id of ['bana-2022:example-3-39', 'bana-2022:example-17-21']) {
  const row = rows.find((candidate) => candidate.id === id);
  if (row) row.disposition = 'excluded-document-format';
}
const rule17_8 = rows.find((row) => row.id === 'bana-2022:17.8');
if (rule17_8) rule17_8.disposition = 'excluded-document-format';
// Rule 19.7–19.9 and Examples 19-36–19-45 are layout/spacing prose and
// transcriber-inserted grouping guidance, not standalone executable symbols.
for (const row of rows.filter((candidate) => /^bana-2022:(?:19\.7|19\.8|19\.9(?:\.1|\.2)?|example-19-(?:3[6-9]|4[0-5]))$/.test(candidate.id))) {
  row.disposition = 'excluded-document-format';
}
// Rule 4.1 and Example 4-1 are the Special Symbols Page/documentary
// description of switch indicators, not executable mathematical content.
for (const id of ['bana-2022:4.1', 'bana-2022:example-4-1']) {
  const row = rows.find((candidate) => candidate.id === id);
  if (row) row.disposition = 'implemented-context-policy';
}
// Examples 10-15 through 10-17 are document-format demonstrations with no
// standalone equation payload. Keep them as canonical exclusions rather than
// using a custom disposition that the report cannot classify consistently.
for (const number of [15, 16, 17]) {
  const row = rows.find((candidate) => candidate.id === `bana-2022:example-10-${number}`);
  if (row) row.disposition = 'excluded-document-format';
}
const rule14Batch = {
  'example-14-3': ['script.superscript'],
  'example-14-4': ['script.superscript'],
  'example-14-5': ['script.superscript'],
  'example-14-6': ['script.superscript'],
  'example-14-7': ['script.subscript'],
  'example-14-8': ['script.subscript'],
  'example-14-9': ['script.superscript'],
  'example-14-10': ['script.sup-sub'],
  'example-14-11': ['script.sub-sup']
};
for (const [suffix, mappingIds] of Object.entries(rule14Batch)) {
  const row = rows.find((entry) => entry.id === `bana-2022:${suffix}`);
  if (row) { row.disposition = 'implemented-operation'; row.mappingIds = mappingIds; }
}
const rule14Example2 = rows.find((row) => row.id === 'bana-2022:example-14-2');
if (rule14Example2) rule14Example2.disposition = 'excluded-document-format';
// These Rule 14 provisions define level-indicator context and interaction
// boundaries rather than standalone executable operations. Keep them
// explicitly classified so coverage does not mistake documentary policy for
// an unimplemented registry row.
for (const id of [
  'bana-2022:14.1', 'bana-2022:14.2', 'bana-2022:14.5', 'bana-2022:14.6',
  'bana-2022:14.9', 'bana-2022:14.9.1', 'bana-2022:14.9.2', 'bana-2022:14.9.3',
  'bana-2022:14.9.4', 'bana-2022:14.9.5', 'bana-2022:14.10', 'bana-2022:14.10.1',
  'bana-2022:14.10.2', 'bana-2022:14.10.3', 'bana-2022:14.11', 'bana-2022:14.11.1',
  'bana-2022:14.11.2', 'bana-2022:14.12', 'bana-2022:14.12.1', 'bana-2022:14.12.2',
  'bana-2022:14.12.3'
]) {
  const row = rows.find((candidate) => candidate.id === id);
  if (row) row.disposition = 'implemented-context-policy';
}
for (let number = 12; number <= 22; number += 1) {
  const row = rows.find((entry) => entry.id === `bana-2022:example-14-${number}`);
  if (!row) continue;
  const source = ({
    12: 'n;x;;y', 13: 'n~x~~y~~~z', 14: 'x~y~~z~~;a', 15: 'x~y~;a~;~n',
    16: 'n~x~;a~;;j', 17: 'x;a;~r;~~n', 18: 'x;a;~n;~;b',
    19: 'x;p;;a;;~m', 20: 'n;x;;y;;;z', 21: 'n~x~~y~~~z~~~~\'\'\'',
    22: 'n;x;;y;;;z;;;;\'\'\''
  })[number];
  const directions = [...source].filter((cell) => cell === '~' || cell === ';')
    .map((cell) => cell === '~' ? 'sup' : 'sub');
  row.disposition = 'implemented-operation';
  row.mappingIds = [`script.${directions.join('-')}`];
}
for (const [number, mappingIds] of Object.entries({
  23: ['script.left-superscript'], 24: ['script.left-superscript'],
  27: ['script.superscript', 'script.left-superscript'],
  28: ['script.left-superscript', 'script.subscript'],
  29: ['script.left-superscript', 'script.left-subscript'],
  31: ['script.left-subscript', 'script.left-superscript']
})) {
  const row = rows.find((entry) => entry.id === `bana-2022:example-14-${number}`);
  if (row) { row.disposition = 'implemented-operation'; row.mappingIds = mappingIds; }
}
for (const [number, mappingIds] of Object.entries({
  52: ['script.subscript'], 53: ['script.subscript'], 54: ['script.subscript'],
  55: ['script.subscript'], 56: ['script.subscript'],
  57: ['script.subscript', 'script.superscript'],
  58: ['script.subscript', 'script.contracted-comma'],
  59: ['script.subscript', 'script.contracted-comma'],
  60: ['script.subscript', 'script.contracted-comma'],
  61: ['script.subscript', 'script.contracted-comma'],
  62: ['script.subscript', 'script.contracted-comma'],
  63: ['script.subscript'], 64: ['script.superscript', 'script.baseline'],
  65: ['script.subscript', 'script.baseline'], 66: ['script.superscript', 'script.baseline'],
  67: ['script.superscript', 'script.baseline'], 68: ['script.superscript', 'script.baseline'],
  69: ['script.superscript', 'script.baseline'], 70: ['script.superscript'],
  71: ['script.subscript', 'script.contracted-comma'], 72: ['script.superscript', 'script.baseline'],
  73: ['script.superscript', 'script.baseline'], 74: ['script.superscript', 'script.baseline'],
  75: ['script.superscript', 'script.baseline'], 76: ['script.superscript', 'script.baseline'],
  77: ['script.superscript', 'script.baseline'], 78: ['script.superscript', 'script.baseline'],
  79: ['script.superscript', 'script.baseline'], 80: ['script.superscript', 'script.baseline'],
  81: ['script.superscript', 'script.baseline']
})) {
  const row = rows.find((entry) => entry.id === `bana-2022:example-14-${number}`);
  if (row) { row.disposition = 'implemented-operation'; row.mappingIds = mappingIds; }
}
for (const [number, mappingIds] of Object.entries({
  102: ['script.sup-sup-sup', 'group.round'],
  103: ['script.superscript', 'script.left-superscript'],
  104: ['script.subscript', 'script.left-subscript'],
  105: ['script.subscript', 'script.left-subscript'],
  106: ['script.subscript', 'modifier.directly-over'],
  107: ['script.subscript'], 108: ['script.sup-sup-sup'], 109: ['script.subscript'],
  110: ['script.superscript', 'script.baseline'], 111: ['script.superscript', 'script.baseline'],
  112: ['script.subscript', 'script.superscript', 'comparison.less'],
  113: ['script.superscript', 'comparison.less'], 114: ['script.sub-sub'],
  115: ['script.superscript', 'script.subscript'], 116: ['script.subscript'],
  117: ['script.subscript'], 118: ['script.superscript'], 119: ['script.superscript'],
  120: ['script.superscript'], 121: ['script.sup-sub']
})) {
  const row = rows.find((entry) => entry.id === `bana-2022:example-14-${number}`);
  if (row) { row.disposition = 'implemented-operation'; row.mappingIds = mappingIds; }
}
for (const [number, mappingIds] of Object.entries({
  122: ['script.sub-sup'], 123: ['script.superscript'], 124: ['script.sup-sub'],
  125: ['script.sub-sup'], 126: ['script.sup-sub'], 127: ['script.sub-sup'],
  128: ['script.superscript', 'script.baseline'], 129: ['misc.prime', 'script.sub-sup'],
  130: ['misc.prime'], 131: ['misc.prime', 'script.subscript']
})) {
  const row = rows.find((entry) => entry.id === `bana-2022:example-14-${number}`);
  if (row) { row.disposition = 'implemented-operation'; row.mappingIds = mappingIds; }
}
for (const [number, mappingIds] of Object.entries({
  132: ['misc.prime', 'script.superscript'],
  133: ['misc.prime', 'script.sub-sup'],
  134: ['misc.prime', 'script.superscript'],
  135: ['misc.prime', 'script.superscript'],
  136: ['script.superscript', 'misc.prime'],
  137: ['script.sub-sup', 'misc.prime'],
  138: ['misc.prime', 'script.sub-sup'],
  139: ['script.superscript', 'script.possessive'],
  140: ['script.subscript', 'script.possessive'],
  141: ['script.subscript', 'script.possessive']
})) {
  const row = rows.find((entry) => entry.id === `bana-2022:example-14-${number}`);
  if (row) { row.disposition = 'implemented-operation'; row.mappingIds = mappingIds; }
}
for (const [number, mappingIds] of Object.entries({
  82: ['script.sup-sup'],
  83: ['script.sup-sup-sub'],
  84: ['script.subscript', 'script.contracted-comma'],
  85: ['script.superscript'],
  86: ['script.superscript', 'fraction.start.diagonal'],
  87: ['script.subscript'],
  88: ['script.superscript'],
  89: ['script.superscript'],
  90: ['script.superscript'],
  91: ['script.superscript', 'script.baseline']
})) {
  const row = rows.find((entry) => entry.id === `bana-2022:example-14-${number}`);
  if (row) { row.disposition = 'implemented-operation'; row.mappingIds = mappingIds; }
}
for (const [number, mappingIds] of Object.entries({
  92: ['script.superscript', 'script.baseline'],
  93: ['script.sup-sup-sub'],
  94: ['script.subscript'],
  95: ['script.superscript', 'script.baseline'],
  96: ['script.sup-sup-sup'],
  97: ['fraction.start.simple', 'script.superscript', 'script.baseline'],
  98: ['fraction.start.complex', 'script.superscript', 'script.baseline'],
  99: ['script.superscript', 'modifier.directly-over'],
  100: ['script.superscript', 'modifier.terminate.over'],
  101: ['script.superscript', 'group.round']
})) {
  const row = rows.find((entry) => entry.id === `bana-2022:example-14-${number}`);
  if (row) { row.disposition = 'implemented-operation'; row.mappingIds = mappingIds; }
}
for (const [number, mappingIds] of Object.entries({
  25: ['script.left-subscript'], 26: ['script.left-subscript', 'script.subscript'],
  30: ['script.left-subscript', 'script.superscript'], 32: ['script.left-subscript', 'script.sub-sub'],
  33: ['script.left-subscript', 'script.sub-sub'], 36: ['script.subscript'], 37: ['script.subscript'],
  38: ['script.subscript'], 39: ['script.subscript'], 40: ['script.sub-sub'], 41: ['script.subscript'],
  42: ['script.subscript'], 43: ['script.subscript'], 44: ['script.subscript'], 45: ['script.subscript'],
  46: ['script.sub-sup'], 47: ['script.subscript'], 48: ['script.subscript'], 49: ['script.subscript'],
  50: ['script.left-subscript'], 51: ['script.subscript']
})) {
  const row = rows.find((entry) => entry.id === `bana-2022:example-14-${number}`);
  if (row) { row.disposition = 'implemented-operation'; row.mappingIds = mappingIds; }
}
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
