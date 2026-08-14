import { readFile, writeFile } from 'node:fs/promises';
import { sourceNotationToCells } from '../src/domain/guided-nemeth/index.js';

const sourcePath = process.argv[2] ?? 'docs/bana-official-examples.json';
const outputPath = process.argv[3] ?? 'docs/bana-electron-official-corpus.json';
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const reviewedOperationIds = new Map(Object.entries({
  '14-12': ['script.sub-sub'], '14-13': ['script.sup-sup-sup'],
  '14-14': ['script.sup-sup-sub'], '14-15': ['script.sup-sub-sub-sup'],
  '14-16': ['script.sup-sub-sub-sub'], '14-17': ['script.sub-sub-sup-sup'],
  '14-18': ['script.sub-sup-sub-sub'], '14-19': ['script.sub-sub-sub-sup'],
  '14-20': ['script.sub-sub-sub-sub'], '14-21': ['script.sup-sup-sup-sup'],
  '14-22': ['script.sub-sub-sub-sub-sub'],
  '14-3': ['script.superscript'], '14-4': ['script.superscript'],
  '14-5': ['script.superscript'], '14-6': ['script.superscript'],
  '14-7': ['script.subscript'], '14-8': ['script.subscript'],
  '14-9': ['script.sup-sup'], '14-10': ['script.sup-sup-sub'],
  '14-11': ['script.sub-sub-sup'],
  '14-23': ['script.left-superscript'], '14-24': ['script.left-superscript'],
  '14-25': ['script.left-subscript'], '14-26': ['script.left-subscript', 'script.subscript'],
  '14-27': ['script.superscript', 'script.left-superscript'],
  '14-28': ['script.left-superscript', 'script.subscript'],
  '14-29': ['script.left-superscript', 'script.left-subscript'],
  '14-30': ['script.left-subscript', 'script.superscript'],
  '14-31': ['script.left-subscript', 'script.left-superscript'],
  '14-32': ['script.left-subscript', 'script.sub-sub'],
  '14-33': ['script.left-subscript', 'script.sub-sub'],
  '14-34': ['script.subscript', 'script.left-superscript'],
  '14-35': ['script.superscript', 'script.left-subscript'],
  '14-36': ['script.subscript'], '14-37': ['script.subscript'],
  '14-38': ['script.subscript'], '14-39': ['script.subscript', 'misc.prime'],
  '14-40': ['script.subscript', 'script.sub-sub'], '14-41': ['script.subscript'],
  '14-42': ['script.subscript'], '14-43': ['script.subscript'], '14-44': ['script.subscript'],
  '14-45': ['script.subscript'], '14-46': ['script.sub-sup'],
  '14-47': ['script.subscript'], '14-48': ['script.subscript'],
  '14-49': ['script.subscript'], '14-50': ['script.left-subscript'],
  '14-51': ['script.subscript'], '14-52': ['script.subscript'],
  '14-53': ['script.subscript'], '14-54': ['script.subscript'],
  '14-55': ['script.sub-sup', 'script.subscript'],
  '14-56': ['script.subscript'], '14-57': ['script.subscript', 'script.superscript'],
  '14-58': ['script.subscript', 'script.contracted-comma'],
  '14-59': ['script.subscript', 'script.contracted-comma'],
  '14-60': ['script.subscript', 'script.contracted-comma'],
  '14-61': ['script.subscript', 'script.contracted-comma'],
  '14-62': ['script.subscript', 'script.contracted-comma'],
  '14-63': ['script.subscript'], '14-64': ['script.superscript', 'script.baseline'],
  '14-65': ['script.subscript', 'script.baseline'], '14-66': ['script.superscript', 'script.baseline'],
  '14-67': ['script.superscript', 'script.baseline'], '14-68': ['script.superscript', 'script.baseline'],
  '14-69': ['script.superscript', 'script.baseline'], '14-70': ['script.superscript'],
  '14-71': ['script.subscript', 'script.contracted-comma'],
  '14-72': ['script.superscript', 'script.baseline'], '14-73': ['script.superscript', 'script.baseline'],
  '14-74': ['script.superscript', 'script.baseline'], '14-75': ['script.superscript', 'script.baseline'],
  '14-76': ['script.superscript', 'script.baseline'], '14-77': ['script.superscript', 'script.baseline'],
  '14-78': ['script.superscript', 'script.baseline'], '14-79': ['script.superscript', 'script.baseline'],
  '14-80': ['script.superscript', 'script.baseline'], '14-81': ['script.superscript', 'script.baseline'],
  '14-82': ['script.sup-sup'], '14-83': ['script.sup-sup-sub'],
  '14-84': ['script.subscript', 'script.contracted-comma'], '14-85': ['script.superscript'],
  '14-86': ['script.superscript', 'fraction.start.diagonal'], '14-87': ['script.subscript'],
  '14-88': ['script.superscript'], '14-89': ['script.superscript'], '14-90': ['script.superscript'],
  '14-91': ['script.superscript', 'script.baseline'], '14-92': ['script.superscript', 'script.baseline'],
  '14-93': ['script.sup-sup-sub'], '14-94': ['script.subscript'],
  '14-95': ['script.superscript', 'script.baseline'], '14-96': ['script.sup-sup-sup'],
  '14-97': ['fraction.start.simple', 'script.superscript', 'script.baseline'],
  '14-98': ['fraction.start.complex', 'script.superscript', 'script.baseline'],
  '14-99': ['script.superscript', 'modifier.directly-over']
}));
const reviewedChoicePrefixes = new Map([
  ['14-34', ['⠘⠉', 'script.left-superscript']],
  ['14-35', ['⠰⠉', 'script.left-subscript']],
  ['14-50', ['⠰⠒', 'script.left-subscript']]
]);
const examples = source.examples
  .filter((example) => Number(example.exampleNumber.split('-')[0]) >= 3 && Number(example.exampleNumber.split('-')[0]) <= 24)
  .map((example) => {
    let cells = null;
    let conversionError = null;
    if (example.sourceNotation) {
      try {
        // The source notation in the manual is printed ASCII. A source line
        // may contain prose or a second item after the closing switch; only
        // feed the mathematical local code between the first `%` switch and
        // its terminator to the bounded transition engine.
        const payload = example.sourceNotation.replace(/^.*?_%\s*/, '').replace(/\s+_:.*$/, '').trim();
        cells = sourceNotationToCells(payload);
      } catch (error) { conversionError = error.message; }
    }
    return {
      id: `electron:${example.id}`,
      sourceRows: [example.id.replace(/^bana-2022:/, ''), ...example.sourceRows],
      exampleNumber: example.exampleNumber,
      printedPage: example.printedPage,
      pdfPage: example.pdfPage,
      sourceNotation: example.sourceNotation,
      ...(reviewedOperationIds.has(example.exampleNumber)
        ? { operationIds: reviewedOperationIds.get(example.exampleNumber) }
        : {}),
      ...(reviewedOperationIds.has(example.exampleNumber) && reviewedOperationIds.get(example.exampleNumber).some((id) => id.includes('left-'))
        ? { choiceOperationIds: { [reviewedChoicePrefixes.get(example.exampleNumber)?.[0] ?? `${cells?.[0] ?? ''}${cells?.[1] ?? ''}`]: reviewedChoicePrefixes.get(example.exampleNumber)?.[1] ?? reviewedOperationIds.get(example.exampleNumber).find((id) => id.includes('left-')) } }
        : {}),
      ...(reviewedOperationIds.has(example.exampleNumber)
        ? { operationIds: reviewedOperationIds.get(example.exampleNumber) }
        : {}),
      // A repeated local cell can have more than one BANA meaning at the
      // current focus. Keep reviewed disambiguations on the source example
      // and carry them into the Electron runner; this is not a parser rule.
      ...(['#1_/cos -cos .k tan *sin', '?1/cos#-cos .k tan *sin'].includes(example.sourceNotation)
        ? { choiceOperationIds: { '⠡⠎': 'operator.dot' } }
        : {}),
      cells,
      expectedWholeBraille: example.expectedWholeBraille,
      candidateBrailleLines: example.candidateBrailleLines,
      // A row with no source notation is still retained as an explicit case
      // requiring a reviewed UEB/document-format decision. It is never
      // silently treated as successfully executable Nemeth.
      executable: Boolean(cells?.length) && !/non[- ]mathematical context/i.test(example.title || ''),
      conversionError,
      ...(example.choiceOperationIds ? { choiceOperationIds: example.choiceOperationIds } : {}),
      // These are evidence fields, not capabilities inferred from source
      // extraction. They remain false until the real Electron runner records
      // the corresponding UI assertion for this exact example.
      creation: false,
      editing: false,
      navigation: false,
      wholeBraille: false,
      focusedBraille: false,
      undoRedo: false,
      persistence: false
    };
  });
const result = { schemaVersion: 1, source: sourcePath, counts: { total: examples.length, executable: examples.filter((x) => x.executable).length, nonExecutable: examples.filter((x) => !x.executable).length }, cases: examples };
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`BANA official Electron corpus written: ${outputPath} (${examples.length} cases; ${result.counts.executable} executable, ${result.counts.nonExecutable} require source review)`);
