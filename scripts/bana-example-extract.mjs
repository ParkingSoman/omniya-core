import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = process.env.BANA_SOURCE_TEXT ?? '/private/tmp/Nemeth_2022.txt';
const output = process.argv[2] ?? 'docs/bana-official-examples.json';
const lines = (await readFile(sourcePath, 'utf8')).split(/\r?\n/);
const bodyStart = lines.findIndex((line, index) => index > 300 && /^\s*Rule 1\s*$/.test(line));
const bodyEnd = lines.findIndex((line, index) => index > bodyStart && /^\s*Appendix A\s*$/.test(line));
const pageFor = [];
let page = 1;
for (let i = 0; i < lines.length; i += 1) {
  pageFor[i] = page;
  if (lines[i].includes('\f')) page += 1;
}
const headings = [];
let currentRule = null;
let currentProvision = null;
for (let i = bodyStart; i >= 0 && i < (bodyEnd > 0 ? bodyEnd : lines.length); i += 1) {
  const ruleMatch = lines[i].trim().match(/^Rule\s+(\d+)\s*$/i);
  if (ruleMatch) currentRule = ruleMatch[1];
  const provisionMatch = lines[i].trim().match(/^(\d{1,2}(?:\.\d+){1,3}(?:\.[a-z])?)\s+(?!\d)(.+)/i);
  if (provisionMatch && currentRule && (Number(provisionMatch[1].split('.')[0]) === Number(currentRule) || provisionMatch[1] === '4.6.8.c') && !/^\d+\.\d+\s+/.test(lines[i].trim().slice(provisionMatch[0].length - provisionMatch[2].length)) && (!/\bfor rules regarding\b/i.test(provisionMatch[2]) || provisionMatch[1] === '4.6.8.c')) currentProvision = provisionMatch[1];
  const match = lines[i].trim().match(/^Example\s+(\d{1,2}-\d+):?\s*(.*)$/i);
  if (match) headings.push({ number: match[1], title: match[2].trim(), start: i, parent: currentProvision ? `bana-2022:${currentProvision}` : `bana-2022:rule-${currentRule}` });
}
const extracted = headings.map((heading, index) => {
  const end = headings[index + 1]?.start ?? (bodyEnd > 0 ? bodyEnd : lines.length);
  const block = lines.slice(heading.start, end);
  const brailleLines = block.filter((line) => /(?:_%|_\s*%|;?%|_?:)/.test(line) || /[⠁-⣿]{2,}/u.test(line));
  const rule = heading.number.split('-')[0];
  return {
    id: `bana-2022:example-${heading.number}`,
    kind: 'example',
    parentId: heading.parent,
    title: heading.title || `Example ${heading.number}`,
    exampleNumber: heading.number,
    printedPage: null,
    pdfPage: pageFor[heading.start],
    sourceLines: [heading.start + 1, end],
    printAndBraille: block.join('\n').trim(),
    candidateBrailleLines: brailleLines.map((line) => line.trim()),
    inputPolicy: null,
    sourceRows: [heading.parent.replace(/^bana-2022:/, '')],
    creationEvents: [],
    electronCreationCaseIds: [],
    electronEditingCaseIds: [],
    verified: { source: true, implementation: false, creation: false, editing: false, navigation: false, wholeBraille: false, focusedBraille: false, undoRedo: false, persistence: false },
    transcriberReview: 'pending'
  };
});
const examples = [...new Map(extracted.map((example) => [example.id, example])).values()];
const result = {
  schemaVersion: 1,
  source: { textPath: sourcePath },
  counts: { examples: examples.length, withCandidateBraille: examples.filter((example) => example.candidateBrailleLines.length > 0).length },
  examples
};
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`BANA official examples written: ${output} (${examples.length} examples)`);
