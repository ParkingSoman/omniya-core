import SRE from 'speech-rule-engine';
import {
  applyNemethCell,
  commitNemethLocalCode,
  createEmptyDraftMathDocument,
  operationRegistry
} from '../src/domain/guided-nemeth/index.js';

async function nemeth(mathml) {
  await SRE.engineReady();
  await SRE.setupEngine({ locale: 'nemeth', modality: 'braille', domain: 'default' });
  return SRE.toSpeech(mathml);
}

function typeRow(row) {
  const doc = createEmptyDraftMathDocument();
  let state = { document: doc, focus: doc.focus, inputState: { prefix: '', mode: null } };
  for (const cell of row.cells) {
    const result = applyNemethCell({ ...state, cell });
    if (result.status === 'rejected') return null;
    state = { document: result.document, focus: result.focus, inputState: result.inputState };
  }
  if (!state.inputState.prefix) return state.document;
  const committed = commitNemethLocalCode(state);
  return committed.status === 'applied' ? committed.document : null;
}

// Deterministic sample so the result can be re-checked.
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

const seed = Number(process.argv[2] ?? 20260815);
const count = Number(process.argv[3] ?? 12);
const rows = operationRegistry()
  .filter((row) => row.cells?.length && row.commitPolicy !== 'structural-followup')
  .sort((a, b) => a.id.localeCompare(b.id));

const random = seeded(seed);
const picked = [];
const seen = new Set();
while (picked.length < count && seen.size < rows.length) {
  const index = Math.floor(random() * rows.length);
  if (seen.has(index)) continue;
  seen.add(index);
  const row = rows[index];
  const document = typeRow(row);
  if (document) picked.push({ row, document });
}

for (const { row, document } of picked) {
  const authored = row.cells.join('');
  const projected = await nemeth(document.mathml);
  const glyph = row.args?.value ?? '';
  const match = authored === projected ? 'MATCH' : 'DIFFER';
  console.log(`${match}  ${row.id}`);
  console.log(`        BANA refs ${row.banaRefs?.join(', ') || '—'}   glyph ${JSON.stringify(glyph)}`);
  console.log(`        typed     ${authored}`);
  console.log(`        projected ${projected}`);
}
