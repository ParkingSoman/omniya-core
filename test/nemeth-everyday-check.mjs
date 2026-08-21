import SRE from 'speech-rule-engine';
import {
  applyNemethBoundary,
  applyNemethCell,
  applyNemethChoice,
  commitNemethLocalCode,
  startReplacementSession
} from '../src/domain/replacement-session.js';
import { WHOLE_EXPRESSION_FIXTURES } from './fixtures/nemeth-braille-fixtures.js';

await SRE.engineReady();
await SRE.setupEngine({ locale: 'nemeth', modality: 'braille', domain: 'default' });

let matched = 0;
for (const fixture of WHOLE_EXPRESSION_FIXTURES) {
  let session = startReplacementSession({ target: { kind: 'node', nodeId: 'root' }, method: 'nemeth' });
  let failure = null;

  for (const cell of [...fixture.expected]) {
    let step = cell === '⠀' ? applyNemethBoundary(session, 'space') : applyNemethCell(session, cell);
    // Answer meaning prompts the way the corpus replay does: take the first choice.
    let guard = 0;
    while (step.status === 'choice' && guard < 4) {
      guard += 1;
      step = applyNemethChoice(step.session ?? session, step.choices[0].operationId);
    }
    if (step.status === 'rejected') {
      failure = `rejected at ${cell}: ${step.announcement}`;
      break;
    }
    session = step.session ?? session;
  }

  if (!failure && session.nemethState?.prefix) {
    let step = commitNemethLocalCode(session);
    let guard = 0;
    while (step.status === 'choice' && guard < 4) {
      guard += 1;
      step = applyNemethChoice(step.session ?? session, step.choices[0].operationId);
    }
    if (step.status === 'applied') session = step.session;
    else failure = `commit ${step.status}: ${step.announcement}`;
  }

  const projected = failure ? null : SRE.toSpeech(session.draft.mathml);
  const ok = projected === fixture.expected;
  if (ok) matched += 1;
  console.log(`${ok ? 'MATCH ' : 'DIFFER'} ${String(fixture.latex).padEnd(32)} ${failure ?? projected}`);
  if (!ok && !failure) console.log(`        BANA   ${fixture.expected}`);
}

console.log(`\ntyped through the session layer: ${matched}/${WHOLE_EXPRESSION_FIXTURES.length} match the BANA-recorded cells`);
