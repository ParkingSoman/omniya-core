import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { _electron as electron } from 'playwright';
import { applyNemethSourceIntentToBraille } from '../../src/renderer/nemeth-braille-projection.js';
import { electronLaunchEnv, openReplacementDockOnNewEquation, waitForDocumentComposer } from './launch-electron.js';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const corpus = JSON.parse(await readFile(new URL('../../docs/bana-electron-official-corpus.json', import.meta.url), 'utf8'));

function projectWholeBraille(rawBraille, mathml) {
  if (!rawBraille || !mathml) return rawBraille;
  return applyNemethSourceIntentToBraille(
    rawBraille,
    new DOMParser().parseFromString(mathml, 'text/xml')
  );
}

async function readProjectedWholeBraille(article) {
  const rawBraille = await article.locator('mjx-speech[aria-braillelabel]').last().getAttribute('aria-braillelabel');
  const mathml = await article.evaluate((node) => (
    node.querySelector('span math')?.outerHTML
    || node.querySelector('math')?.outerHTML
    || ''
  ));
  return { wholeBraille: projectWholeBraille(rawBraille, mathml), mathml };
}

function selectedCases() {
  if (process.env.BANA_ELECTRON_EXAMPLE) return corpus.cases.filter((entry) => entry.exampleNumber === process.env.BANA_ELECTRON_EXAMPLE);
  if (process.env.BANA_RULE) return corpus.cases.filter((entry) => entry.exampleNumber.startsWith(`${process.env.BANA_RULE}-`));
  return corpus.cases;
}

async function launch(existingDataDirectory = null) {
  const dataDirectory = existingDataDirectory ?? await mkdtemp(path.join(os.tmpdir(), 'omniya-bana-official-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: electronLaunchEnv({ OMNIYA_TEST_USER_DATA_DIR: dataDirectory, OMNIYA_REPLACEMENT_TRACE: '1' })
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#app-shell[aria-busy="false"]').waitFor();
  await app.context().setOffline(true);
  return { app, dataDirectory };
}

async function createDraft(page) {
  await openReplacementDockOnNewEquation(page);
  return page.getByLabel('Replacement input', { exact: true });
}

/**
 * Visual evidence is deliberately collected at the Electron boundary. The
 * MathML/Braille assertions can pass while a source blank becomes a visible
 * full-em gap or while MathJax accidentally renders two equation containers.
 * Geometry checks run for every case; PNGs are enabled for review runs with
 * BANA_ELECTRON_SCREENSHOTS=1 (normally one rule shard at a time).
 */
async function visualEvidence(page, article, entry, phase, dataDirectory) {
  await article.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const geometry = await article.evaluate((node) => {
    const container = node.querySelector('.item-content mjx-container');
    const source = node.querySelector('.item-content mjx-assistive-mml math');
    const visualSpaces = [...node.querySelectorAll('.item-content mjx-container mjx-mspace')]
      .map((space) => ({ width: space.getBoundingClientRect().width, computedWidth: getComputedStyle(space).width }));
    return {
      mathJaxContainers: node.querySelectorAll('.item-content mjx-container').length,
      sourceMathRoots: node.querySelectorAll('.item-content mjx-assistive-mml math').length,
      sourceElementChildren: source ? [...source.children].length : 0,
      visualSpaces,
      containerWidth: container?.getBoundingClientRect().width ?? 0,
      containerHeight: container?.getBoundingClientRect().height ?? 0,
      containerText: container?.textContent?.trim() ?? '',
      containerInViewport: container ? (() => {
        const rect = container.getBoundingClientRect();
        return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      })() : false
    };
  });
  assert.equal(geometry.mathJaxContainers, 1, `${entry.exampleNumber} rendered more than one MathJax equation container`);
  assert.equal(geometry.sourceMathRoots, 1, `${entry.exampleNumber} lost its single source MathML root`);
  assert.ok(geometry.containerWidth > 0 && geometry.containerHeight > 0, `${entry.exampleNumber} rendered blank math`);
  assert.ok(geometry.containerText.length > 1, `${entry.exampleNumber} rendered no meaningful visible math`);
  assert.equal(geometry.containerInViewport, true, `${entry.exampleNumber} committed math is outside the captured viewport`);
  for (const space of geometry.visualSpaces) {
    assert.ok(space.width < 1, `${entry.exampleNumber} source blank became a visible layout gap (${space.width}px)`);
  }
  const evidence = {
    phase,
    geometry,
    claim: phase === 'creation' || phase === 'committed'
      ? 'Committed whole expression is rendered as one source MathML tree with no visible source blanks.'
      : phase === 'editing'
        ? 'The exact replacement is rendered while the surrounding expression remains present.'
        : 'Renderer geometry and source-tree invariants hold.'
  };
  if (process.env.BANA_ELECTRON_SCREENSHOTS === '1') {
    const screenshotDirectory = process.env.BANA_ELECTRON_SCREENSHOT_DIR || path.join(dataDirectory, 'screenshots');
    await mkdir(screenshotDirectory, { recursive: true });
    const safeId = entry.id.replace(/[^a-z0-9_-]+/gi, '_');
    const screenshotPath = path.join(screenshotDirectory, `${safeId}-${phase}.png`);
    // Use the viewport for review artifacts. It includes the expression,
    // editor status, and the surrounding application context, so a reviewer
    // can tell what was authored rather than seeing an isolated `y` glyph.
    await page.screenshot({ path: screenshotPath });
    evidence.screenshotPath = screenshotPath;
  }
  return evidence;
}

async function captureInteractionScreenshot(page, entry, phase, dataDirectory, claim) {
  if (process.env.BANA_ELECTRON_SCREENSHOTS !== '1') return null;
  const screenshotDirectory = process.env.BANA_ELECTRON_SCREENSHOT_DIR || path.join(dataDirectory, 'screenshots');
  await mkdir(screenshotDirectory, { recursive: true });
  const safeId = entry.id.replace(/[^a-z0-9_-]+/gi, '_');
  const screenshotPath = path.join(screenshotDirectory, `${safeId}-${phase}.png`);
  await page.locator('article.napkin-article').last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await page.screenshot({ path: screenshotPath });
  return { phase, screenshotPath, claim };
}

async function feedLocalCode(page, input, cells, choiceOperationIds = {}, options = {}) {
  if (process.env.BANA_ELECTRON_TRACE === '1') await page.evaluate(() => {
    globalThis.__omniyaNemethTrace = (entry) => console.log('[nemeth-trace]', JSON.stringify(entry));
  });
  const resolveChoices = async (nextCell = null) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const choices = page.locator('#composer-choices .replacement-choice');
      if (!(await choices.count())) return;
      // The textarea is a one-cell proxy; the bounded Nemeth prefix lives in
      // NemethState and is mirrored on the choices container for harness lookup.
      const prefix = (await page.locator('#composer-choices').getAttribute('data-prefix'))?.trimEnd?.()
        ?? (await input.inputValue()).trimEnd();
      const requested = choiceOperationIds[`${prefix}${nextCell ?? ''}`]
        ?? choiceOperationIds[prefix]
        ?? Object.entries(choiceOperationIds).find(([localPrefix]) => prefix.endsWith(localPrefix))?.[1]
        ?? (prefix.endsWith('⠐') && nextCell && ['⠤', '⠬', '⠀'].includes(nextCell) ? 'script.baseline' : null);
      const contextChoice = !requested && nextCell && [...'⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵'].includes(nextCell)
        ? page.locator('#composer-choices .replacement-choice[data-operation-id="indicator.capital"]')
        : null;
      const inferredReferenceAsterisk = !requested && prefix.includes('⠈⠼')
        ? page.locator('#composer-choices .replacement-choice[data-operation-id="reference.asterisk"]')
        : null;
      const letterOverPlural = !requested
        && (await page.locator('#composer-choices .replacement-choice[data-operation-id="letter.s"]').count())
        && (await page.locator('#composer-choices .replacement-choice[data-operation-id="plural.s"]').count())
        ? page.locator('#composer-choices .replacement-choice[data-operation-id="letter.s"]')
        : null;
      // Rule 14.5: when the next authored cell is multipurpose (base promotion),
      // prefer left-script over English-letter / ordinary script at empty root.
      const leftScriptPreferred = !requested && nextCell === '⠐'
        ? (
          (await page.locator('#composer-choices .replacement-choice[data-operation-id="script.left-subscript"]').count())
            ? page.locator('#composer-choices .replacement-choice[data-operation-id="script.left-subscript"]')
            : (await page.locator('#composer-choices .replacement-choice[data-operation-id="script.left-superscript"]').count())
              ? page.locator('#composer-choices .replacement-choice[data-operation-id="script.left-superscript"]')
              : null
        )
        : null;
      // Literary `;letter` lists (8-63) and set-builder `;x` (8-46) need the
      // English-letter indicator when the following cell is comma/space/colon.
      const englishOverScript = !requested && !leftScriptPreferred
        && (await page.locator('#composer-choices .replacement-choice[data-operation-id="indicator.english-letter"]').count())
        && (
          (await page.locator('#composer-choices .replacement-choice[data-operation-id="script.left-subscript"]').count())
          || (await page.locator('#composer-choices .replacement-choice[data-operation-id="script.subscript"]').count())
        )
        && (nextCell === '⠠' || nextCell === '⠀' || nextCell === '⠸' || nextCell === '⠨')
        ? page.locator('#composer-choices .replacement-choice[data-operation-id="indicator.english-letter"]')
        : null;
      const selected = requested
        ? page.locator(`#composer-choices .replacement-choice[data-operation-id="${requested}"]`)
        : inferredReferenceAsterisk || leftScriptPreferred || englishOverScript || contextChoice || letterOverPlural || choices.first();
      const selectedCount = await selected.count();
      if (requested && !selectedCount) {
        const available = await choices.evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.operationId, text: node.textContent })));
        throw new Error(`requested local choice ${requested} is not present; prefix=${prefix}; available=${JSON.stringify(available)}`);
      }
      await (selectedCount ? selected.first() : choices.first()).click();
      await page.waitForTimeout(80);
      if (requested && await page.locator('#composer-choices .replacement-choice').count()) {
        throw new Error(`requested local choice ${requested} remained after click; prefix=${prefix}; status=${await page.locator('#composer-status').textContent()}`);
      }
      // A selected shorter meaning may leave a second choice for a different
      // local prefix in the same bounded construction. The next loop reads
      // that fresh prefix and resolves it without treating the entire draft
      // as a parser buffer.
    }
    assert.equal(await page.locator('#composer-choices .replacement-choice').count(), 0,
      `bounded local choice did not resolve after six explicit selections; prefix=${await input.inputValue()}; choices=${await page.locator('#composer-choices .replacement-choice').allTextContents()}`);
  };
  for (const [cellIndex, cell] of cells.entries()) {
    // Pending bounded prefixes are mirrored in the textarea for braille
    // review, but each fill still supplies only the next physical cell; the
    // renderer feeds that as a suffix against NemethState. Exercise the
    // visible boundary transaction as a user does: Space produces a DOM
    // space input event, while a six-key/Unicode blank is the literal
    // Braille blank cell.
    if (cell === ' ') await input.press('Space');
    else await input.fill(cell);
    if (cellIndex === cells.length - 1 && options.captureInputEvidence) {
      await options.captureInputEvidence();
    }
    // Immediate structural codes trigger an asynchronous MathJax draft
    // preview. Give that preview a turn before routing the next physical
    // cell; bounded prefixes intentionally remain visible in the proxy.
    await page.waitForTimeout(80);
    if (await page.locator('#composer-choices .replacement-choice').count()) {
      await resolveChoices(cells[cellIndex + 1] ?? null);
    }
    const status = await page.locator('#composer-status').textContent();
    assert.doesNotMatch(status ?? '', /That Nemeth cell is not valid at this draft focus|incomplete or invalid/i, `cell ${cellIndex} ${cell} rejected: ${status}; prefix=${await input.inputValue()}; choices=${await page.locator('#composer-choices .replacement-choice').allTextContents()}`);
  }
  // Enter commits only a still-pending bounded local code. A second Enter is
  // the ordinary replacement transaction, never a passage-sized parse.
  if (await input.inputValue()) await input.press('Enter');
  await page.waitForTimeout(40);
  if (await page.locator('#composer-choices .replacement-choice').count()) {
    const choices = page.locator('#composer-choices .replacement-choice');
    const omission = choices.filter({ hasText: 'omission.long-dash' });
    const possessive = page.locator('#composer-choices .replacement-choice[data-operation-id="script.possessive"]');
    const letterS = page.locator('#composer-choices .replacement-choice[data-operation-id="letter.s"]');
    // Literary labels and unfinished apostrophe-s drafts often leave an empty
    // proxy with letter.s/plural.s (or script.possessive). Prefer the exact
    // local meaning before falling back to the first button.
    const preferred = (await omission.count()) ? omission.first()
      : (await possessive.count()) ? possessive.first()
      : (await letterS.count()) ? letterS.first()
      : choices.first();
    await preferred.click();
    await page.waitForTimeout(40);
    await resolveChoices();
  }
  // A structural group close is a local follow-up and can leave focus on the
  // group's content row even after its closing cell was consumed. Give that
  // completed boundary one final local commit opportunity before submitting;
  // this is still a UI Enter for the bounded code, not passage parsing.
  if ((await page.locator('#composer-status').textContent() ?? '').includes('incomplete at content') && cells.at(-1) === '⠾') {
    await input.press('Enter');
    await page.waitForTimeout(80);
  }
  if (options.allowIncompleteDraft && options.completionCells?.length) {
    // The opener is intentionally an incomplete source example. Continue in
    // the same replacement session before the generic submit path can reject
    // its required radicand hole.
    return feedLocalCode(page, input, options.completionCells, choiceOperationIds, { ...options, allowIncompleteDraft: false, completionCells: null });
  }
  if (options.allowIncompleteDraft && (await page.locator('#composer-status').textContent() ?? '').includes('incomplete at radicand')) {
    throw new Error(`official incomplete draft has no completion fixture: ${cells.join('')}`);
  }
  if (await page.locator('#composer-dock').isVisible()) {
    // A final alphabetic prefix can be a valid bounded word fragment whose
    // next source cell is a structural closer. Pressing Enter here is the
    // local-code disambiguator, never a passage-sized submission.
    if (await input.inputValue()) {
      await input.press('Enter');
      await page.waitForTimeout(80);
    }
    const submit = page.getByRole('button', { name: 'Replace' });
    await submit.waitFor();
    await page.waitForFunction(() => !document.querySelector('#composer-submit')?.disabled);
    await submit.click();
  }
  if (options.allowIncompleteDraft && (await page.locator('#composer-status').textContent() ?? '').includes('incomplete at radicand')) {
    throw new Error(`official incomplete draft remained after local completion: ${cells.join('')}`);
  }
  try {
    await waitForDocumentComposer(page);
  } catch (error) {
      const diagnostic = await page.evaluate(() => ({
      status: document.querySelector('#composer-status')?.textContent,
      input: document.querySelector('#composer-source')?.value,
      choices: [...document.querySelectorAll('#composer-choices .replacement-choice')].map((node) => node.textContent),
      submitDisabled: document.querySelector('#composer-submit')?.disabled,
      math: document.querySelector('article.napkin-article:last-of-type math')?.outerHTML
    }));
    throw new Error(`${error.message}; replacement diagnostic=${JSON.stringify(diagnostic)}`);
  }
  const article = page.locator('article.napkin-article').last();
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  await page.waitForTimeout(1600);
  const { wholeBraille, mathml } = await readProjectedWholeBraille(article);
  return {
    article,
    wholeBraille,
    mathml
  };
}

/**
 * Official focused edits must freeze an exact MathJax speech atom. Prefer
 * letter/number leaves (mi/mn) so replacement with `⠽` stays a one-node
 * transaction. Operator leaves (mo) and SRE speech-atomic function mrows
 * (lim/sin/…) are acceptable when no identifier exists. Empty mspaces and
 * containers (fenced/infixop/appl) are never edit targets.
 */
function isOfficialAtomicCanonicalTarget(target, { allowOperator = true } = {}) {
  if (!target?.nodeName || !target.text) return false;
  const name = String(target.nodeName).replace(/^mjx-/, '');
  if (/^m[in]$/.test(name)) return true;
  if (allowOperator && name === 'mo' && target.text.trim() && !/^[\u2062\u2063\u2064]$/.test(target.text)) {
    return true;
  }
  if (name === 'mrow' && (
    target.semanticType === 'function'
    || /limit function|simple function/i.test(target.semanticRole || '')
    || target.intent === 'function-name'
  )) return true;
  return false;
}

async function readOfficialEditTarget(page) {
  return page.evaluate(() => {
    const current = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current;
    const semanticId = current?.getAttribute('data-semantic-id');
    const source = semanticId && [...document.querySelectorAll('[id^="omniya-source-"][data-semantic-id]')]
      .find((node) => node.getAttribute('data-semantic-id') === semanticId);
    const node = source || current;
    const rawName = node?.localName || node?.tagName || '';
    return {
      semanticId,
      text: (source?.textContent ?? current?.textContent ?? '').trim(),
      nodeName: rawName,
      childElements: source?.children?.length ?? current?.childElementCount ?? -1,
      semanticType: source?.getAttribute('data-semantic-type') || current?.getAttribute('data-semantic-type') || '',
      semanticRole: source?.getAttribute('data-semantic-role') || current?.getAttribute('data-semantic-role') || '',
      intent: source?.getAttribute('data-omniya-nemeth-intent') || ''
    };
  });
}

/**
 * Prefer a real authored leaf via MathJax setCurrent/setNode when keyboard
 * depth-first lands on mspace or a virtual container (fenced/infixop/appl).
 * Uses the source node itself so focus stays on that exact atom rather than a
 * broadened semantic range.
 */
async function focusPreferredOfficialAtomicTarget(page) {
  return page.evaluate(() => {
    const explorer = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech;
    if (!explorer) return null;
    const focusNode = (node) => {
      const semanticId = node.getAttribute('data-semantic-id');
      if (!semanticId) return null;
      if (typeof explorer.setCurrent === 'function') explorer.setCurrent(node);
      else if (typeof explorer.setNode === 'function') explorer.setNode(semanticId);
      else return null;
      const current = explorer.current;
      const currentId = current?.getAttribute?.('data-semantic-id');
      return currentId === semanticId || current === node ? semanticId : null;
    };
    const seen = new Set();
    const sources = [];
    for (const node of document.querySelectorAll('[id^="omniya-source-"][data-semantic-id], mjx-assistive-mml [data-semantic-id]')) {
      const semanticId = node.getAttribute('data-semantic-id');
      if (!semanticId || seen.has(semanticId)) continue;
      seen.add(semanticId);
      sources.push(node);
    }
    const prefer = (predicate) => {
      for (const node of sources) {
        const name = String(node.localName || '').replace(/^mjx-/, '');
        const text = (node.textContent || '').trim();
        if (!predicate(name, text, node)) continue;
        const focused = focusNode(node);
        if (focused) return focused;
      }
      return null;
    };
    return prefer((name, text) => /^m[in]$/.test(name) && text && !/^[\u2062\u2063\u2064]$/.test(text))
      || prefer((name, text, node) => name === 'mrow' && text && (
        node.getAttribute('data-semantic-type') === 'function'
        || /limit function|simple function/i.test(node.getAttribute('data-semantic-role') || '')
        || node.getAttribute('data-omniya-nemeth-intent') === 'function-name'
      ))
      || prefer((name, text) => name === 'mo' && text && !/^[\u2062\u2063\u2064]$/.test(text));
  });
}

async function replaceFocusedEquationWithNemeth(page, cells, options = {}) {
  const article = page.locator('article.napkin-article').last();
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current));
  // Jump to an authored atom before arrow walking. Keyboard depth-first often
  // settles on SRE virtual containers or blank mspaces that have no Omniya id.
  await focusPreferredOfficialAtomicTarget(page);
  await page.waitForTimeout(60);
  let selectedTarget = await readOfficialEditTarget(page);
  let previousId = null;
  const visited = new Set();
  for (let depth = 0; depth < 32 && !isOfficialAtomicCanonicalTarget(selectedTarget, { allowOperator: false }); depth += 1) {
    if (isOfficialAtomicCanonicalTarget(selectedTarget) && depth > 8) break;
    // Empty mspaces and other non-atoms often cannot deepen. Prefer a sibling
    // step when focus did not move or landed on mspace; otherwise keep
    // descending. Never invent an ancestor range — only move MathJax focus.
    const stuck = !selectedTarget.semanticId || selectedTarget.semanticId === previousId
      || visited.has(selectedTarget.semanticId);
    if (selectedTarget.semanticId) visited.add(selectedTarget.semanticId);
    const onSpace = /mspace$/i.test(selectedTarget.nodeName || '');
    const onContainer = /^(fenced|infixop|appl|punctuated|relseq|multirel)$/i.test(selectedTarget.semanticType || '');
    const key = stuck || onSpace || onContainer || !selectedTarget.text ? 'ArrowRight' : 'ArrowDown';
    previousId = selectedTarget.semanticId;
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
    selectedTarget = await readOfficialEditTarget(page);
  }
  if (!isOfficialAtomicCanonicalTarget(selectedTarget, { allowOperator: false })) {
    await focusPreferredOfficialAtomicTarget(page);
    await page.waitForTimeout(60);
    selectedTarget = await readOfficialEditTarget(page);
  }
  assert.ok(isOfficialAtomicCanonicalTarget(selectedTarget),
    `official edit must select an atomic canonical target: ${JSON.stringify(selectedTarget)}`);
  const focusedEvidence = options.captureFocusedEvidence
    ? await options.captureFocusedEvidence()
    : null;
  const selectedSemanticId = selectedTarget.semanticId;
  await page.keyboard.press('r');
  await page.locator('#composer-dock').waitFor();
  const targetId = await page.locator('#replacement-scope').getAttribute('data-target-id');
  assert.ok(targetId, 'official edit must freeze a canonical MathJax descendant or range');
  // The frozen Omniya id must belong to the exact focused atom (or its source
  // twin), never a broadened container that would discard sibling structure.
  const frozenMatchesSelection = await page.evaluate(({ targetId: frozenId, semanticId }) => {
    const nodes = [...document.querySelectorAll('[data-omniya-id], [id^="omniya-source-"]')];
    const frozen = nodes.find((node) => (node.getAttribute('data-omniya-id') || node.id?.replace(/^omniya-source-/, '')) === frozenId);
    if (!frozen) return false;
    if (!semanticId) return Boolean(frozen.getAttribute('data-omniya-id') || frozen.id);
    if (frozen.getAttribute('data-semantic-id') === semanticId) return true;
    const source = nodes.find((node) => node.getAttribute('data-semantic-id') === semanticId);
    const sourceId = source?.getAttribute('data-omniya-id') || source?.id?.replace(/^omniya-source-/, '');
    return sourceId === frozenId;
  }, { targetId, semanticId: selectedSemanticId });
  assert.ok(frozenMatchesSelection,
    `official edit broadened beyond the selected atom: selected=${JSON.stringify(selectedTarget)} targetId=${targetId}`);
  const input = page.getByLabel('Replacement input', { exact: true });
  await feedLocalCode(page, input, cells);
  await article.locator('mjx-speech[aria-braillelabel]').waitFor();
  await page.waitForTimeout(500);
  if (options.originalElementCount) {
    // Count authored Omniya nodes, not every SRE enrichment leaf. Invisible
    // times and speech wrappers fluctuate across focused replacements.
    const editedElementCount = await article.locator('math [data-omniya-id]').count();
    // Replacing an operator-like icon with an identifier can legitimately
    // remove a small semantic wrapper, but must retain the surrounding tree.
    assert.ok(editedElementCount >= options.originalElementCount - 3,
      `focused edit discarded surrounding structure: before=${options.originalElementCount} after=${editedElementCount}`);
  }
  // Submission restores the explorer to the replacement's inherited stable
  // Omniya ID. Do not re-enter Explorer here: restarting it would intentionally
  // reset focus to the equation root and would invalidate this assertion.
  await page.waitForTimeout(120);
  await page.evaluate((canonicalId) => {
    const node = [...document.querySelectorAll('[data-omniya-id]')]
      .find((candidate) => candidate.getAttribute('data-omniya-id') === canonicalId);
    const semanticId = node?.getAttribute('data-semantic-id');
    globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.setNode?.(semanticId);
  }, targetId);
  await page.waitForTimeout(80);
  const focusedBraille = await page.evaluate(() => {
    const current = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current;
    const semanticId = current?.getAttribute('data-semantic-id');
    const semanticSpeech = semanticId && [...document.querySelectorAll('mjx-speech[aria-braillelabel]')]
      .find((node) => node.getAttribute('data-semantic-id') === semanticId);
    const descendant = current?.querySelector?.('[data-semantic-braille], [aria-braillelabel]');
    return current?.getAttribute('data-braille')
      || current?.getAttribute('data-semantic-braille')
      || current?.getAttribute('aria-braillelabel')
      || descendant?.getAttribute('data-braille')
      || descendant?.getAttribute('data-semantic-braille')
      || descendant?.getAttribute('aria-braillelabel')
      || semanticSpeech?.getAttribute('aria-braillelabel')
      || '';
  });
  if (!focusedBraille) {
    const diagnostic = await page.evaluate(() => {
      const current = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current;
      return {
        current: current?.outerHTML || null,
        speech: [...document.querySelectorAll('mjx-speech[aria-braillelabel]')].map((node) => node.outerHTML),
        semantic: [...document.querySelectorAll('[data-semantic-id]')].slice(0, 20).map((node) => ({ id: node.getAttribute('data-semantic-id'), html: node.outerHTML.slice(0, 400) }))
      };
    });
    throw new Error(`focused Braille unavailable: ${JSON.stringify(diagnostic)}`);
  }
  if (focusedBraille !== cells.join('')) {
    const focusDiagnostic = await page.evaluate(() => {
      const explorer = globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech;
      const current = explorer?.current;
      return {
        current: current?.outerHTML || null,
        currentSemanticId: current?.getAttribute('data-semantic-id') || null,
        sourceIds: [...document.querySelectorAll('[id^="omniya-source-"]')].map((node) => ({ id: node.id, semanticId: node.getAttribute('data-semantic-id'), text: node.textContent })),
        speech: [...document.querySelectorAll('mjx-speech[aria-braillelabel]')].map((node) => ({ id: node.getAttribute('data-semantic-id'), braille: node.getAttribute('aria-braillelabel') }))
      };
    });
    throw new Error(`focused Braille mismatch: expected=${cells.join('')} actual=${focusedBraille} diagnostic=${JSON.stringify(focusDiagnostic)}`);
  }
  await page.keyboard.press('Escape');
  const { wholeBraille, mathml } = await readProjectedWholeBraille(article);
  return {
    wholeBraille,
    focusedBraille,
    targetId,
    mathml,
    focusedEvidence
  };
}

async function undoRedo(page, originalBraille, replacementBraille) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const article = page.locator('article.napkin-article').last();
  const wholeSpeech = article.locator('mjx-speech[aria-braillelabel]').last();
  const readWhole = async () => (await readProjectedWholeBraille(article)).wholeBraille;
  // Undo is an explorer command in the application, so re-enter MathJax
  // exploration after the replacement helper's Escape has returned focus to
  // the article. This also proves the persisted transaction is reachable from
  // the same reading workflow a user would use.
  await article.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Boolean(globalThis.MathJax?.startup?.document?.activeItem?.explorers?.speech?.current));
  await page.keyboard.press(`${modifier}+z`);
  await wholeSpeech.waitFor();
  await page.waitForTimeout(400);
  const afterUndo = await readWhole();
  await page.keyboard.press(`${modifier}+Shift+z`);
  await wholeSpeech.waitFor();
  await page.waitForTimeout(400);
  const afterRedo = await readWhole();
  return { ok: afterUndo === originalBraille && afterRedo === replacementBraille, afterUndo, afterRedo, originalBraille, replacementBraille };
}

test('official BANA examples execute through the real Nemeth replacement renderer', { timeout: 900_000 }, async (t) => {
  if (process.env.BANA_ELECTRON_OFFICIAL !== '1') {
    t.skip('Set BANA_ELECTRON_OFFICIAL=1 to run the sequential official-example Electron corpus.');
    return;
  }
  const cases = selectedCases();
  assert.ok(cases.length, 'official corpus selection is empty');
  let { app, dataDirectory } = await launch();
  const restartDataDirectory = process.env.BANA_ELECTRON_ISOLATE_CASES === '1';
  const results = {
    schemaVersion: 1,
    runKind: 'official-electron-corpus',
    startedAt: new Date().toISOString(),
    filter: { rule: process.env.BANA_RULE ?? null, example: process.env.BANA_ELECTRON_EXAMPLE ?? null },
    dataDirectory,
    cases: []
  };
  const resultPath = process.env.BANA_ELECTRON_RESULTS;
  const persistResults = async () => {
    if (resultPath) await writeFile(resultPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  };
  t.after(async () => {
    await persistResults();
    await app.close().catch(() => {});
  });
  let page = await app.firstWindow();
  const restartEvery = Math.max(1, Number(process.env.BANA_ELECTRON_RESTART_EVERY ?? 8));
  for (const [caseIndex, entry] of cases.entries()) {
    if (process.env.BANA_ELECTRON_TRACE === '1') console.error(`[bana-electron] begin ${entry.exampleNumber}`);
    if (!entry.executable) {
      // Source rows whose printed example is UEB, spatial, prose, or whose
      // extracted PDF block does not contain a complete Nemeth local code are
      // retained in the corpus but are not executable equation cases. The
      // coverage ledger keeps them open for source classification rather than
      // pretending the renderer can author document-format material.
      results.cases.push({ id: entry.id, sourceRows: entry.sourceRows, creation: false, editing: false, navigation: false, wholeBraille: false, focusedBraille: false, undoRedo: false, persistence: false, error: 'non-executable source case' });
      continue;
    }
    const evidence = { id: entry.id, sourceRows: entry.sourceRows, creation: false, editing: false, navigation: false, wholeBraille: false, focusedBraille: false, undoRedo: false, persistence: false };
    try {
      const input = await createDraft(page);
      const created = await feedLocalCode(page, input, entry.cells, entry.choiceOperationIds ?? {}, {
        allowIncompleteDraft: entry.allowIncompleteDraft,
        completionCells: entry.completionCells,
        captureInputEvidence: async () => {
          evidence.visualInput = await captureInteractionScreenshot(
            page,
            entry,
            'input',
            dataDirectory,
            'The completed cell-by-cell Nemeth draft is visibly rendered before submission; the empty proxy confirms the final bounded cell was consumed.'
          );
        }
      });
      if (process.env.BANA_ELECTRON_TRACE === '1') console.error(`[bana-electron] created ${entry.exampleNumber}`);
      const actual = created.wholeBraille;
      if (entry.allowIncompleteDraft && !entry.completionCells) {
        evidence.creation = true;
        evidence.wholeBraille = true;
        evidence.incompleteDraft = true;
        evidence.editing = false;
        evidence.navigation = true;
        results.cases.push(evidence);
        await persistResults();
        continue;
      }
      assert.ok(actual, `${entry.exampleNumber} produced no Nemeth output`);
      const expectedCreationCells = entry.completionCells
        ? [...entry.cells, ...entry.completionCells]
        : entry.cells;
      assert.equal(actual, expectedCreationCells.join(''), `${entry.exampleNumber} whole-expression Braille differs from the authored BANA cells; math=${created.mathml}; source=${await page.locator('article.napkin-article').last().evaluate((node) => node.querySelector('span math')?.outerHTML || '')}`);
      evidence.creation = true;
      evidence.wholeBraille = true;
      // Keep the pre-edit evidence alongside the replacement evidence. A
      // final post-edit screenshot/MathML blob must never be mistaken for the
      // official expression that was authored. Reviewers need to see the
      // exact cells and one-tree rendering before E as well as after it.
      evidence.creationWholeBraille = actual;
      evidence.creationMathml = created.mathml;
      evidence.visualCreation = await visualEvidence(page, created.article, entry, 'committed', dataDirectory);
      // Always replace the focused first descendant with a visibly different
      // identifier so undo/redo proves a real structural transaction rather
      // than accidentally exercising a no-op replacement.
      const replacementCells = actual.startsWith('⠽') ? ['⠵'] : ['⠽'];
      const originalElementCount = await created.article.locator('math [data-omniya-id]').count();
      const edited = await replaceFocusedEquationWithNemeth(page, replacementCells, {
        originalElementCount,
        captureFocusedEvidence: async () => captureInteractionScreenshot(
          page,
          entry,
          'focused',
          dataDirectory,
          'MathJax Explorer has selected the exact scope immediately before E; this image is the navigation-to-edit handoff.'
        )
      });
      if (process.env.BANA_ELECTRON_TRACE === '1') console.error(`[bana-electron] edited ${entry.exampleNumber}`);
      assert.equal(edited.focusedBraille, replacementCells.join(''), `${entry.exampleNumber} focused replacement Braille was not exposed after rerender; math=${edited.mathml}`);
      const expectedReplacementBraille = edited.wholeBraille;
      evidence.editing = true;
      evidence.navigation = true;
      evidence.focusedBraille = true;
      const history = await undoRedo(page, actual, expectedReplacementBraille);
      if (process.env.BANA_ELECTRON_TRACE === '1') console.error(`[bana-electron] history ${entry.exampleNumber}`);
      evidence.undoRedo = history.ok;
      assert.equal(history.ok, true, `${entry.exampleNumber} undo/redo did not restore the replacement: ${JSON.stringify(history)}`);
      evidence.expectedPersistedBraille = expectedReplacementBraille;
      evidence.replacementWholeBraille = expectedReplacementBraille;
      evidence.mathml = edited.mathml;
      evidence.visualEditing = await visualEvidence(page, page.locator('article.napkin-article').last(), entry, 'editing', dataDirectory);
      evidence.visualFocused = edited.focusedEvidence;
    } catch (error) {
      evidence.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      results.cases.push(evidence);
      await persistResults();
      if (process.env.BANA_ELECTRON_TRACE === '1') console.error(`[bana-electron] end ${entry.exampleNumber}`);
    }
    // MathJax's explorer/enrichment state is intentionally ephemeral. Large
    // official expressions can leave a renderer process busy after several
    // complete create/edit/undo cycles even though the persisted model is
    // healthy. Relaunching against the same test data directory keeps every
    // case in the real Electron boundary and exercises persistence, while
    // preventing a stale renderer from silently truncating a shard.
    if (restartDataDirectory && caseIndex + 1 < cases.length) {
      // Isolated review runs deliberately use one fresh napkin per case. A
      // same-directory relaunch proves persistence for this exact expression,
      // then the next case gets a clean renderer and clean data set.
      await app.close();
      ({ app } = await launch(dataDirectory));
      page = await app.firstWindow();
      const persisted = page.locator('article.napkin-article');
      const saved = results.cases.at(-1);
      if (saved?.creation && !saved.incompleteDraft) {
        const { wholeBraille: braille } = await readProjectedWholeBraille(persisted.first());
        assert.equal(braille, saved.expectedPersistedBraille, `${saved.id} isolated relaunch changed persisted Braille`);
        saved.persistence = true;
        await persistResults();
      }
      await app.close();
      if (caseIndex + 1 < cases.length) {
        ({ app, dataDirectory } = await launch());
        page = await app.firstWindow();
      }
    } else if ((caseIndex + 1) % restartEvery === 0 && caseIndex + 1 < cases.length) {
      if (process.env.BANA_ELECTRON_TRACE === '1') console.error(`[bana-electron] restart after ${entry.exampleNumber}`);
      await app.close();
      ({ app, dataDirectory } = await launch(dataDirectory));
      page = await app.firstWindow();
    }
  }
  // Persistence is verified against the same committed state after a real
  // Electron relaunch. Every executable case in this shard gets an article;
  // source-review cases never enter this application-level assertion.
  if (restartDataDirectory) {
    // The final case has not had a following-case boundary, so perform its
    // same persistence check before ending the isolated shard.
    await app.close();
    ({ app } = await launch(dataDirectory));
    const persisted = app.firstWindow ? await app.firstWindow() : page;
    const saved = results.cases.at(-1);
    if (saved?.creation && !saved.incompleteDraft) {
      const article = persisted.locator('article.napkin-article').first();
      await article.locator('mjx-speech[aria-braillelabel]').waitFor();
      const { wholeBraille: braille } = await readProjectedWholeBraille(article);
      assert.equal(braille, saved.expectedPersistedBraille, `${saved.id} isolated relaunch changed persisted Braille`);
      saved.persistence = true;
      await persistResults();
    }
    await app.close();
    // Each case was already relaunched and checked above. Do not reopen the
    // final fresh session and compare it against every isolated case.
    return;
  }
  await app.close();
  ({ app, dataDirectory } = await launch(dataDirectory));
  page = await app.firstWindow();
  const persistedArticles = page.locator('article.napkin-article');
  const executableResults = results.cases.filter((entry) => entry.creation === true && !entry.incompleteDraft);
  assert.equal(await persistedArticles.count(), executableResults.length, 'relaunch did not restore every committed official equation');
  for (const [index, evidence] of executableResults.entries()) {
    const article = persistedArticles.nth(index);
    await article.locator('mjx-speech[aria-braillelabel]').waitFor();
    const { wholeBraille: actual } = await readProjectedWholeBraille(article);
    assert.equal(actual, evidence.expectedPersistedBraille, `${evidence.id} persisted Braille differs after relaunch`);
    evidence.persistence = true;
  }
  await persistResults();
});
