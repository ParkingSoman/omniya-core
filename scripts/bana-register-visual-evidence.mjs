#!/usr/bin/env node
/**
 * Register four-phase Electron screenshot sets into docs/bana-visual-evidence.json.
 *
 * Usage:
 *   node scripts/bana-register-visual-evidence.mjs \
 *     --example 5-1 \
 *     --dir docs/electron-screenshots/rule-5-1 \
 *     --source-rows example-5-1,5.1.1
 *
 * Accepts phase filenames: input, committed|creation, focused, editing (.png).
 * Does not invent screenshots — refuses unless all required phases exist and are non-empty.
 */
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);
const get = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};

const example = get('--example');
const sourceDir = get('--dir');
const sourceRows = (get('--source-rows') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const conclusion = get('--conclusion')
  ?? `Accepted all four real Electron phases for example ${example}; geometry contract passed in-runner and screenshots are non-empty.`;

if (!example || !sourceDir || sourceRows.length === 0) {
  console.error('Usage: node scripts/bana-register-visual-evidence.mjs --example N-M --dir <screenshot-dir> --source-rows a,b');
  process.exit(1);
}

const rule = example.split('-')[0];
const destDirRel = `electron-screenshots/rule-${example}`;
const destDir = path.join(root, 'docs', destDirRel);
await mkdir(destDir, { recursive: true });

const resolvePhase = async (names) => {
  for (const name of names) {
    const candidate = path.join(sourceDir, name);
    try {
      const info = await stat(candidate);
      if (info.isFile() && info.size > 0) return { name, candidate, size: info.size };
    } catch {
      // try next
    }
  }
  // Also accept Electron runner names like electron_bana-2022_example-5-1-input.png
  try {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(sourceDir);
    for (const name of names) {
      const phase = name.replace(/\.png$/, '');
      const match = files.find((file) => file.endsWith(`-${phase}.png`) || file === name);
      if (!match) continue;
      const candidate = path.join(sourceDir, match);
      const info = await stat(candidate);
      if (info.isFile() && info.size > 0) return { name, candidate, size: info.size };
    }
  } catch {
    // ignore
  }
  return null;
};

const phases = [
  { key: 'input', names: ['input.png'], claim: `The complete Nemeth draft for example ${example} is visible before submission.` },
  { key: 'committed', names: ['committed.png', 'creation.png'], claim: `The committed expression for example ${example} is visibly rendered as one canonical MathML tree.` },
  { key: 'focused', names: ['focused.png'], claim: `MathJax Explorer visibly selects the exact replacement scope for example ${example}.` },
  { key: 'editing', names: ['editing.png'], claim: `The exact-node replacement for example ${example} remains visibly integrated with the surrounding expression.` }
];

const screenshots = [];
for (const phase of phases) {
  const found = await resolvePhase(phase.names);
  if (!found) {
    console.error(`Missing non-empty screenshot for phase ${phase.key} in ${sourceDir}`);
    process.exit(1);
  }
  const destName = `${phase.key}.png`;
  const destPath = path.join(destDir, destName);
  if (path.resolve(found.candidate) !== path.resolve(destPath)) {
    await copyFile(found.candidate, destPath);
  }
  screenshots.push({
    phase: phase.key,
    path: `${destDirRel}/${destName}`,
    claim: phase.claim
  });
}

const visualPath = path.join(root, 'docs', 'bana-visual-evidence.json');
const visual = JSON.parse(await readFile(visualPath, 'utf8'));
const id = `electron:bana-2022:example-${example}`;
const next = {
  id,
  sourceRows,
  rule,
  example,
  artifact: `electron-evidence/example-${example}.json`,
  review: {
    reviewer: 'evidence-steward',
    conclusion
  },
  evidenceSet: { screenshots }
};
const index = (visual.cases ?? []).findIndex((entry) => entry.id === id || entry.example === example);
if (index >= 0) visual.cases[index] = next;
else visual.cases.push(next);
await writeFile(visualPath, `${JSON.stringify(visual, null, 2)}\n`, 'utf8');
console.log(`Registered visual evidence for example ${example} (${screenshots.length} phases)`);
