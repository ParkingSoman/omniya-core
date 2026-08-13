import { readFile, writeFile } from 'node:fs/promises';
import { sourceNotationToCells } from '../src/domain/guided-nemeth/index.js';

const sourcePath = process.argv[2] ?? 'docs/bana-official-examples.json';
const outputPath = process.argv[3] ?? 'docs/bana-electron-official-corpus.json';
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
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
      // A repeated local cell can have more than one BANA meaning at the
      // current focus. Keep reviewed disambiguations on the source example
      // and carry them into the Electron runner; this is not a parser rule.
      choiceOperationIds: ['#1_/cos -cos .k tan *sin', '?1/cos#-cos .k tan *sin'].includes(example.sourceNotation)
        ? { '⠡⠎': 'operator.dot' }
        : undefined,
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
