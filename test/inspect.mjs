import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addItem,
  createInitialState,
  createNapkin,
  deleteNapkin
} from '../src/domain/model.js';
import { convertLatexToMathML } from '../src/main/mathml.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const napkinDirectory = path.join(projectRoot, 'test', 'artifacts', 'latest');
const napkinFile = path.join(napkinDirectory, 'test.napkin.json');

const examples = [
  {
    name: 'Plain text notes',
    items: [{ type: 'text', source: 'Let a be positive.', note: 'A short text item.' }]
  },
  {
    name: 'Basic addition',
    items: [{ type: 'equation', source: 'a+b', note: 'Try entering this equation and moving through a, plus, and b.' }]
  },
  {
    name: 'Nested fraction',
    items: [{
      type: 'equation',
      source: String.raw`\frac{a^2+\sqrt{b}}{c}`,
      note: 'A fraction containing a superscript and a radical.'
    }]
  },
  {
    name: 'Matrix navigation',
    items: [{
      type: 'equation',
      source: String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`,
      note: 'Use the MathJax explorer to move between cells.'
    }]
  },
  {
    name: 'Radical and sum',
    items: [{
      type: 'equation',
      source: String.raw`\sum_{i=1}^n \sqrt{i^2+1}`,
      note: 'A sum with limits and a radical.'
    }]
  },
  {
    name: 'Mixed proof scratch',
    items: [
      { type: 'text', source: 'The proof starts with an assumption.', note: '' },
      {
        type: 'equation',
        source: String.raw`x^2+y^2=z^2`,
        note: 'A second item in the same napkin.'
      }
    ]
  }
];

let state = createInitialState();
const initialNapkinId = state.activeNapkinId;

for (const example of examples) {
  state = createNapkin(state, example.name);
  for (const item of example.items) {
    const mathml = item.type === 'equation'
      ? await convertLatexToMathML(item.source)
      : null;
    state = addItem(state, { ...item, mathml });
  }
}

state = deleteNapkin(state, initialNapkinId);
await mkdir(napkinDirectory, { recursive: true });
await writeFile(napkinFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

console.log(`Generated ${state.napkins.length} editable example napkins:`);
for (const napkin of state.napkins) console.log(`  - ${napkin.name}`);
console.log(`\nOpening: ${napkinFile}`);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['run', 'open:napkin', '--', napkinFile], {
  cwd: projectRoot,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (code !== 0) process.exitCode = code ?? 1;
  if (signal) process.exitCode = 1;
});
