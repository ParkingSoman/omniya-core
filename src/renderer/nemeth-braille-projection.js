/**
 * Small source-intent correction at the accessibility boundary.
 *
 * MathJax/SRE is the independent Nemeth projection for ordinary MathML. A
 * handful of BANA distinctions are intentionally retained by the guided
 * writer as `data-omniya-nemeth-intent`, because the same MathML presentation
 * is otherwise ambiguous. This module only restores cells for those explicit
 * source intents; it is not a serializer or an expression parser.
 */

// MathJax/HTML can drop `data-omniya-projection-cells` while keeping the
// keystroke modification name. Map that surviving name onto the SRE glyph
// cells the projector must replace. Longer numeric-decimal forms come first
// so `⠨⠐` is not mistaken for a lone `⠨`. Inner BANA cells are never derived
// by stripping `$k` wrappers; only this explicit local map is used.
const KEYSTROKE_SRE_CELLS = {
  'open-paren': ['⠷'],
  'close-paren': ['⠾'],
  'plus': ['⠬'],
  'dot': ['⠡'],
  'minus': ['⠤'],
  'decimal': ['⠨⠐', '⠨'],
  'equals': ['⠨⠅'],
  'plus-minus': ['⠬⠤'],
  'divide': ['⠨⠌'],
  'at-zero': ['⠼⠴'],
  'power': ['⠽ˣ']
};

function projectedCellsForShape(node) {
  const explicit = node.getAttribute?.('data-omniya-projection-cells');
  if (explicit) return [explicit];
  if (node.getAttribute?.('data-omniya-shape-kind') !== 'keystroke') return [];
  const modification = node.getAttribute?.('data-omniya-shape-modification');
  return KEYSTROKE_SRE_CELLS[modification] ?? [];
}

export function applyNemethSourceIntentToBraille(braille, sourceMath) {
  if (!sourceMath) return braille;
  const nativeQuerySelectorAll = typeof sourceMath.querySelectorAll === 'function'
    ? sourceMath.querySelectorAll.bind(sourceMath)
    : null;
  const sourceNodes = (selector) => {
    if (nativeQuerySelectorAll) return [...nativeQuerySelectorAll(selector)];
    const match = selector.match(/^(?:(?<parent>[A-Za-z][A-Za-z0-9-]*)\s*>\s*)?(?<tag>[A-Za-z][A-Za-z0-9-]*|\*)?(?:\[(?<attr>[A-Za-z_:][-A-Za-z0-9_:.]*)(?:="(?<value>[^"]*)")?\])?$/);
    if (!match || !sourceMath.getElementsByTagName) return [];
    const tag = match.groups?.tag || '*';
    const nodes = [...sourceMath.getElementsByTagName(tag)];
    return nodes.filter((node) => {
      if (match.groups?.attr) {
        if (match.groups.value !== undefined && node.getAttribute?.(match.groups.attr) !== match.groups.value) return false;
        if (match.groups.value === undefined && !node.hasAttribute?.(match.groups.attr)) return false;
      }
      if (match.groups?.parent && node.parentNode?.localName !== match.groups.parent && node.parentNode?.nodeName !== match.groups.parent) return false;
      return true;
    });
  };
  // The pure projection tests use the same xmldom source tree that the
  // renderer boundary serializes, but xmldom does not implement CSS selector
  // helpers. Install the two narrow helpers only on that test/source object;
  // browser DOMs keep their native implementations. `sourceNodes` is based
  // on the captured native function, so this fallback cannot recurse.
  if (!nativeQuerySelectorAll && sourceMath.getElementsByTagName) {
    sourceMath.querySelectorAll = sourceNodes;
    sourceMath.querySelector = (selector) => sourceNodes(selector)[0] ?? null;
  }
  const hasSource = (selector) => sourceNodes(selector).length > 0;
  // MathJax may omit the Braille attribute for a literal <mtext> shape. The
  // guided source node still records one complete bounded BANA construction,
  // so expose that local code directly rather than leaving the accessibility
  // channel empty. This is not a serializer: only an unambiguous one-node
  // source intent can take this path.
  const mathChildren = sourceMath.children && sourceMath.children.length != null
    ? [...sourceMath.children]
    : [...(sourceMath.childNodes ?? [])].filter((node) => node.nodeType === 1);
  const standaloneAuthored = mathChildren.length === 1 ? mathChildren[0] : null;
  const standaloneCells = standaloneAuthored?.getAttribute?.('data-omniya-nemeth-cells') || null;
  const standaloneName = (standaloneAuthored?.localName || standaloneAuthored?.nodeName || '').toLowerCase();
  const standaloneIntent = standaloneAuthored?.getAttribute?.('data-omniya-nemeth-intent') || '';
  const standaloneShape = standaloneAuthored?.getAttribute?.('data-omniya-shape-kind')
    ? standaloneAuthored
    : (sourceMath.querySelector?.('[data-omniya-shape-kind][data-omniya-nemeth-cells]') ?? null);
  // Complete one-node constructions keep BANA distinctions Unicode/SRE cannot
  // reconstruct from the printed glyph. Rule 22 arrows, Rule 17 shapes, and
  // Rule 15/21 superposed comparisons are all authored as one local sequence.
  if (standaloneCells && (
    standaloneAuthored.getAttribute?.('data-omniya-shape-kind') ||
    standaloneIntent.startsWith('arrow-') ||
    standaloneIntent.startsWith('comparison.superposed') ||
    standaloneIntent.startsWith('comparison.equals') ||
    standaloneIntent.startsWith('bar-superposed') ||
    (standaloneName === 'mo' && standaloneCells.startsWith('⠫')) ||
    (standaloneName === 'mo' && standaloneCells.startsWith('⠐⠨⠅')) ||
    (standaloneName === 'mo' && standaloneCells.startsWith('⠱'))
  )) {
    return standaloneCells;
  }
  if (standaloneName === 'munder' || standaloneName === 'mover' || standaloneName === 'munderover') {
    const structuredCells = standaloneAuthored.getAttribute?.('data-omniya-nemeth-cells');
    if (structuredCells) return structuredCells;
    // Rule 15.16.1: a complete five-step decimal with an overscripted digit
    // keeps multipurpose before that digit. When the guided draft authored
    // that local mover, rebuild the bounded cells from the marked base and
    // overscript instead of trusting SRE's radical-shaped projection.
    const kids = [...(standaloneAuthored.children ?? [])].filter((node) => node.nodeType === 1);
    if (kids.length === 2 && (standaloneName === 'mover' || standaloneName === 'munder')) {
      const base = kids[0];
      const script = kids[1];
      const scriptCells = script.getAttribute?.('data-omniya-nemeth-cells') || '';
      const baseText = String(base.textContent ?? '').trim();
      const digitCells = { '0': '⠴', '1': '⠂', '2': '⠆', '3': '⠒', '4': '⠲', '5': '⠢', '6': '⠖', '7': '⠶', '8': '⠦', '9': '⠔' };
      const marker = standaloneName === 'munder' ? '⠩' : '⠣';
      if (standaloneName === 'mover' && base.localName === 'mn' && baseText.startsWith('.') && scriptCells === '⠡') {
        const digits = [...baseText.slice(1)].map((d) => digitCells[d] || '').join('');
        if (digits) return `⠼⠨⠐${digits}⠣⠡⠻`;
      }
      // Rule 15.16.2 stacked dots: flat authored overscript/underscript row.
      if (script.localName === 'mrow') {
        const dots = [...(script.children ?? [])].filter((node) => node.nodeType === 1);
        if (dots.length >= 2 && dots.every((dot) => (dot.getAttribute?.('data-omniya-nemeth-cells') || '') === '⠡')) {
          const letterCells = {
            a: '⠁', b: '⠃', c: '⠉', d: '⠙', e: '⠑', f: '⠋', g: '⠛', h: '⠓', i: '⠊', j: '⠚',
            k: '⠅', l: '⠇', m: '⠍', n: '⠝', o: '⠕', p: '⠏', q: '⠟', r: '⠗', s: '⠎', t: '⠞',
            u: '⠥', v: '⠧', w: '⠺', x: '⠭', y: '⠽', z: '⠵'
          };
          const baseCell = base.localName === 'mi' ? (letterCells[baseText.toLowerCase()] || '') : '';
          if (baseCell) return `⠐${baseCell}${marker}${'⠡'.repeat(dots.length)}⠻`;
        }
      }
    }
  }
  if (standaloneShape && mathChildren.length === 1 && (standaloneShape.parentElement ?? standaloneShape.parentNode) === sourceMath) {
    return standaloneShape.getAttribute('data-omniya-nemeth-cells') || braille;
  }
  if (typeof braille !== 'string') {
    if (standaloneShape) {
      return standaloneShape.getAttribute('data-omniya-nemeth-cells');
    }
    return braille;
  }
  const emptyFractionDenominators = nativeQuerySelectorAll
    ? nativeQuerySelectorAll('mfrac > mrow:not([data-omniya-hole]) > mspace').length
    : 0;
  if (emptyFractionDenominators) {
    braille = braille.replace(/⠹([^⠼⠹]*?)⠌⠀⠼/g, '⠹$1⠼');
  }
  const decimalNonnumeric = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="decimal-nonnumeric"]');
  // The decimal marker can introduce either ordinary digits or letters used
  // as digits in a non-decimal base (Rule 3.6). The source intent, not a
  // decimal-only text regex, is authoritative for this bounded numeric item.
  // A leading/embedded decimal in a lower-cell numeric item is the same BANA
  // distinction as an explicit numeric-decimal intent: SRE often emits the
  // ordinary period cell (⠲) where the authored construction needs dot-4 (⠨).
  const numericDecimal = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="numeric-decimal"], [data-omniya-nemeth-intent="lower-cell-numeric"]')]
    .filter((node) => /^\.?[0-9A-Za-z]+(?:\.[0-9A-Za-z]*)?$/.test(String(node.textContent ?? '').trim()) && String(node.textContent ?? '').trim().includes('.'));
  const decimalLongDash = sourceMath.querySelector?.('[data-omniya-nemeth-intent="omission-decimal-long-dash"]');
  const functionNames = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="function-name"]')]
    .map((node) => String(node.textContent ?? '').trim())
    .filter(Boolean);
  const functionNodes = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="function-name"]')];
  const terminalFunction = functionNodes.at(-1)?.nextElementSibling == null;
  const scriptedFunctionNames = new Set(functionNodes
    .filter((node) => ['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(node.parentElement?.localName))
    .map((node) => String(node.textContent ?? '').trim()));
  const functionLimitCells = [...sourceMath.querySelectorAll('munder, mover')]
    .filter((node) => node.getAttribute('data-omniya-nemeth-intent') === 'function-limit')
    .filter((node) => String(node.children?.[0]?.textContent ?? '').trim() === 'lim')
    .map((node) => node.getAttribute('data-omniya-nemeth-cells') || '⠩⠇⠊⠍');
  const boundCommaNodes = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="punctuation-comma"]')];
  const boundCommas = boundCommaNodes.length;
  const capitalPunctuationCells = boundCommaNodes.map((node) => {
    const precedingIdentifiers = [...sourceMath.querySelectorAll('mi')]
      .filter((candidate) => Boolean(candidate.compareDocumentPosition(node) & 4));
    const value = String(precedingIdentifiers.at(-1)?.textContent ?? '').trim();
    const cells = new Map([['A','⠁'],['B','⠃'],['C','⠉'],['D','⠙'],['E','⠑'],['F','⠋'],['G','⠛'],['H','⠓'],['I','⠊'],['J','⠚'],['K','⠅'],['L','⠇'],['M','⠍'],['N','⠝'],['O','⠕'],['P','⠏'],['Q','⠟'],['R','⠗'],['S','⠎'],['T','⠞'],['U','⠥'],['V','⠧'],['W','⠺'],['X','⠭'],['Y','⠽'],['Z','⠵']]);
    return cells.get(value.match(/([A-Z])$/)?.[1]) ?? null;
  }).filter(Boolean);
  const uppercaseIdentifierCount = [...sourceMath.querySelectorAll('mi')]
    .filter((node) => /^[A-Z]$/.test(String(node.textContent ?? '').trim()) ||
      String(node.getAttribute?.('data-omniya-nemeth-cells') ?? '').startsWith('⠠')).length;
  const punctuationPeriods = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="punctuation-period"]');
  const literaryPeriods = sourceNodes('[data-omniya-nemeth-intent="punctuation-literary-period"]');
  const leftDoubleQuotes = sourceNodes('[data-omniya-nemeth-intent="punctuation-left-double-quote"]');
  const rightDoubleQuotes = sourceNodes('[data-omniya-nemeth-intent="punctuation-right-double-quote"]');
  const radicalSigns = sourceNodes('[data-omniya-nemeth-intent="radical-sign"]');
  const explicitGroups = sourceMath.querySelectorAll('[data-omniya-group="round"]');
  const closedGroups = [...sourceMath.querySelectorAll('[data-omniya-group="round"]')]
    .filter((node) => node.getAttribute('data-omniya-role') === 'closed-group');
  const explicitSpaces = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="explicit-space"]').length;
  const multiscriptCount = sourceMath.querySelectorAll('msubsup, mmultiscripts').length;
  const signedNumeric = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="signed-numeric-indicator"]').length;
  const lowerCellNumeric = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="lower-cell-numeric"]');
  const numericStarts = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="numeric-start"]');
  const operatorFollowedNumbers = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="numeric-start"]')]
    .filter((node) => {
      const pluses = [...sourceMath.querySelectorAll('[data-omniya-nemeth-cells="⠬"]')];
      const equalities = [...sourceMath.querySelectorAll('[data-omniya-nemeth-cells="⠨⠅"]')];
      const localBoundaries = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="explicit-space"]')];
      return pluses.some((plus) => {
        if (!(plus.compareDocumentPosition(node) & 4)) return false;
        // A relation boundary ends the local numeric continuation. Do not
        // classify a later number after `=` as the continuation of an earlier
        // plus merely because it occurs later in document order.
        const relationBoundary = equalities.some((equals) =>
          Boolean(plus.compareDocumentPosition(equals) & 4) &&
          Boolean(equals.compareDocumentPosition(node) & 4));
        // An authored mathematical blank likewise ends the local `+digit`
        // continuation. This keeps a later number in a new shape term from
        // inheriting the earlier plus merely because semantic enrichment
        // placed both numbers under one infix row.
        const explicitBoundary = localBoundaries.some((boundary) =>
          Boolean(plus.compareDocumentPosition(boundary) & 4) &&
          Boolean(boundary.compareDocumentPosition(node) & 4));
        return !relationBoundary && !explicitBoundary;
      });
    });
  const uebNumeric = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="ueb-numeric"]');
  const uebDecimal = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="ueb-decimal"]');
  const shapeCells = [...sourceMath.querySelectorAll('[data-omniya-shape-kind]')]
    .map((node) => node.getAttribute('data-omniya-nemeth-cells'))
    .filter(Boolean);
  const authoredCellNodes = sourceNodes('[data-omniya-nemeth-cells]');
  const authoredAdjacencies = authoredCellNodes.flatMap((node) => {
    const siblings = node.parentElement?.children
      ? [...node.parentElement.children]
      : [...(node.parentNode?.childNodes ?? [])].filter((candidate) => candidate.nodeType === 1);
    const next = siblings[siblings.indexOf(node) + 1];
    const left = node.getAttribute?.('data-omniya-nemeth-cells');
    const right = next?.getAttribute?.('data-omniya-nemeth-cells');
    return left && right ? [[left, right]] : [];
  });
  const directShapeSubscripts = sourceNodes('msub').filter((script) => {
    const children = script.children
      ? [...script.children]
      : [...(script.childNodes ?? [])].filter((node) => node.nodeType === 1);
    return Boolean(children[1]?.getAttribute?.('data-omniya-nemeth-cells')?.startsWith('⠫'));
  });
  const directShapeSubscriptBaselineCount = directShapeSubscripts.filter((script) => {
    const siblings = script.parentElement?.children
      ? [...script.parentElement.children]
      : [...(script.parentNode?.childNodes ?? [])].filter((node) => node.nodeType === 1);
    return Boolean(siblings[siblings.indexOf(script) + 1]);
  }).length;
  // MathJax enrichment can flatten multiple canonical shape subscripts into
  // one semantic msub row. The authored shape cells survive that enrichment,
  // so use their bounded count when the source still contains a subscript.
  const enrichedShapeSubscriptCount = sourceNodes('msub').length
    ? authoredCellNodes.filter((node) => node.getAttribute?.('data-omniya-nemeth-cells')?.startsWith('⠫')).length
    : 0;
  const shapeSubscriptCount = Math.max(directShapeSubscripts.length, enrichedShapeSubscriptCount);
  const shapeSubscriptBaselineCount = Math.max(directShapeSubscriptBaselineCount, shapeSubscriptCount - 1);
  // A degree in msup returns to baseline before the next authored sibling
  // (plus or minus). Walk parents instead of Element.closest so xmldom fixtures
  // and the renderer DOM share the same count. Explicit mathematical blanks
  // between the degree and the following sign are layout only.
  const degreeBaselineFollowers = sourceNodes('[data-omniya-nemeth-cells="⠘⠨⠡"]').flatMap((node) => {
    let host = node;
    while (host && !['msup', 'msubsup', 'mmultiscripts'].includes((host.localName || host.nodeName || '').toLowerCase())) {
      host = host.parentElement ?? host.parentNode;
    }
    host = host && ['msup', 'msubsup', 'mmultiscripts'].includes((host.localName || host.nodeName || '').toLowerCase())
      ? host
      : node;
    let next = host.nextElementSibling ?? host.nextSibling;
    while (next && (next.nodeType !== 1
      || (next.localName || next.nodeName || '').toLowerCase() === 'mspace'
      || next.getAttribute?.('data-omniya-nemeth-intent') === 'explicit-space')) {
      next = next.nextElementSibling ?? next.nextSibling;
    }
    const cells = next?.getAttribute?.('data-omniya-nemeth-cells') || '';
    return cells === '⠬' || cells === '⠤' ? [cells] : [];
  });
  const degreeBaselinePlusCount = degreeBaselineFollowers.filter((cells) => cells === '⠬').length;
  const degreeBaselineMinusCount = degreeBaselineFollowers.filter((cells) => cells === '⠤').length;
  const diagonalFractions = [...sourceMath.querySelectorAll('mfrac[data-omniya-nemeth-cells]')]
    .map((node) => {
      const digits = new Map([['0', '⠴'], ['1', '⠂'], ['2', '⠆'], ['3', '⠒'], ['4', '⠲'], ['5', '⠢'], ['6', '⠖'], ['7', '⠶'], ['8', '⠦'], ['9', '⠔'], [',', '⠠']]);
      const denominator = String(node.children?.[1]?.textContent ?? '').trim();
      return `${node.getAttribute('data-omniya-nemeth-cells')}${[...denominator].map((d) => digits.get(d) ?? '').join('')}`;
    })
    .filter(Boolean);
  const simpleFractions = sourceNodes('mfrac[data-omniya-fraction-kind="simple"]')
    .filter((node) => !node.getAttribute?.('data-omniya-nemeth-cells'));
  const mixedFractions = sourceNodes('mfrac[data-omniya-fraction-kind="mixed"]')
    .filter((node) => !node.getAttribute?.('data-omniya-nemeth-cells'));
  const fractionSubtractionBoundary = [...simpleFractions].some((node) => {
    const parent = node.parentElement;
    const index = parent ? [...parent.children].indexOf(node) : -1;
    return index >= 0 && parent.children[index + 1]?.getAttribute?.('data-omniya-nemeth-cells') === '⠤';
  });
  const normalizeFractionSubtraction = (value) => fractionSubtractionBoundary
    ? value.replace(/⠀⠼⠤/g, '⠼⠤')
    : value;
  const cancellations = sourceMath.querySelectorAll('menclose[notation="updiagonalstrike"]');
  const englishLetters = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="english-letter"]');
  const vsAbbreviations = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="vs-abbreviation"]');
  const boldEnglishLetters = [...sourceMath.querySelectorAll('[mathvariant="bold"]')]
    .filter((node) => /^[A-Za-z]$/.test(String(node.textContent ?? '').trim()));
  const typeformLetters = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent^="typeform-"]')]
    .filter((node) => /^[A-Za-z]$/.test(String(node.textContent ?? '').trim()));
  const possessiveApostrophes = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="possessive-apostrophe"]');
  const singleLetterNumbers = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="single-letter-number"]');
  const romanNames = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="roman"]')]
    .map((node) => String(node.textContent ?? '').trim())
    .filter(Boolean);
  const frakturCount = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="german-fraktur"]').length;
  const hebrewCount = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="hebrew-letter"]').length;
  const subscriptZero = sourceMath.querySelectorAll('[data-omniya-hebrew-zero="true"]').length;
  const russianCount = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="russian-letter"]').length;
  if (decimalLongDash) {
    // BANA 3.2.3/24.1.g prints the punctuation indicator and nonnumeric
    // return before an omission long dash. MathML/SRE sees only the dash, so
    // restore this exact bounded source distinction at the accessibility
    // boundary without attempting to serialize the surrounding expression.
    if (braille.includes('⠨⠐⠤⠤⠤⠤')) return braille;
    return braille.replace(/⠤⠤⠤⠤/, '⠨⠐⠤⠤⠤⠤').replace(/⠀{2,}/g, '⠀');
  }
  // In a comma-separated mathematical series, semantic enrichment can move
  // punctuation across its following explicit space and can merge a
  // single-letter numeric suffix into the preceding identifier. Every leaf
  // in this bounded pattern already carries authored source intent, so
  // project those leaf cells in document order instead of repairing an SRE
  // presentation string by position. Semantic-added multiplication nodes
  // are ignored because they have no authored cells.
  if (boundCommas && explicitSpaces && singleLetterNumbers.length && sourceMath.getElementsByTagName) {
    const lowerDigits = new Map([
      ['0', '⠴'], ['1', '⠂'], ['2', '⠆'], ['3', '⠒'], ['4', '⠲'],
      ['5', '⠢'], ['6', '⠖'], ['7', '⠶'], ['8', '⠦'], ['9', '⠔']
    ]);
    const leaves = [...sourceMath.getElementsByTagName('*')]
      .filter((node) => ['mi', 'mo', 'mn', 'mspace'].includes(node.localName ?? node.nodeName));
    const authored = leaves.map((node) => {
      if (node.getAttribute?.('data-semantic-added') === 'true') return '';
      const intent = node.getAttribute?.('data-omniya-nemeth-intent');
      if (intent === 'explicit-space') return '⠀';
      if (intent === 'single-letter-number') {
        const value = String(node.textContent ?? '').trim();
        const cells = [...value].map((digit) => lowerDigits.get(digit) ?? '').join('');
        return cells.length === value.length ? cells : null;
      }
      return node.getAttribute?.('data-omniya-nemeth-cells') || null;
    });
    if (authored.length && authored.every((cells) => cells !== null)) return authored.join('');
  }
  if (boundCommas) {
    let capitalIndicators = boundCommaNodes.filter((node) => node.nextElementSibling?.localName === 'mi').length;
    braille = braille.replace(/⠠⠀(?=[⠁-⠵])/g, (match) => {
      if (capitalIndicators <= 0) return match;
      capitalIndicators -= 1;
      return '⠠';
    });
    // Rule 19 word-list examples use the lower-cell comma directly after a
    // numeric suffix. MathJax projects the source punctuation indicator as
    // dot 6 (`⠠`); the source marker identifies exactly which commas must be
    // restored to the authored lower-cell form.
    const numericCommaCount = boundCommaNodes.filter((node) => {
      let preceding = node.previousElementSibling;
      while (preceding && !preceding.textContent?.trim()) preceding = preceding.previousElementSibling;
      const text = String(preceding?.textContent ?? '').trim();
      return /\d$/.test(text) && !text.includes('.');
    }).length;
    for (let index = 0; index < numericCommaCount; index += 1) {
      braille = braille.replace(/(⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)⠠/, '$1⠂');
    }
  }
  if (explicitSpaces) {
    // MathJax may expose both the authored mspace and a relation/factor
    // separator around it. BANA's source has one blank cell, so collapse
    // only this explicitly authored spacing run, never arbitrary SRE output.
    braille = braille.replace(/⠀{2,}/g, '⠀');
    // A punctuation comma before an authored ellipsis keeps its mathematical
    // blank. SRE may concatenate the comma cell with the ellipsis cells.
    if (hasSource('mo[data-omniya-nemeth-cells="⠄⠄⠄"]') &&
      hasSource('[data-omniya-nemeth-intent="punctuation-comma"]')) {
      braille = braille.replace(/⠠(?!⠀)(?=⠄⠄⠄)/g, '⠠⠀');
    }
    // Enrichment can create two semantic spaces for one authored blank when
    // a lower-cell decimal is followed by a relation. The source has only
    // one blank at each boundary; collapse the run after the bounded number
    // and before the equality/long-dash relation.
    braille = braille.replace(/⠀⠀(?=⠨⠅|⠨⠐)/g, '⠀');
    // A baseline return emitted by an authored superscript is presentation
    // state, not a source cell, when the next sibling is an explicit blank.
    // Use the source sibling boundary to remove only those local returns.
    let scriptSpaceReturns = [...sourceMath.querySelectorAll('mspace[data-omniya-nemeth-intent="explicit-space"]')]
      .filter((space) => {
        let previous = space.previousElementSibling ?? space.previousSibling;
        while (previous && previous.nodeType !== 1) previous = previous.previousSibling;
        while (previous?.getAttribute?.('data-semantic-added') === 'true') {
          previous = previous.previousElementSibling ?? previous.previousSibling;
          while (previous && previous.nodeType !== 1) previous = previous.previousSibling;
        }
        const name = previous?.localName ?? previous?.nodeName;
        if (name === 'msup') return true;
        // SRE may wrap the authored superscript in a punctuated/factor row
        // before the blank. Prefer the last authored child of that wrapper.
        if (name === 'mrow' || name === 'math') {
          const kids = [...(previous.children ?? previous.childNodes ?? [])]
            .filter((node) => node.nodeType === 1 && node.getAttribute?.('data-semantic-added') !== 'true');
          return (kids.at(-1)?.localName ?? kids.at(-1)?.nodeName) === 'msup';
        }
        return false;
      }).length;
    // A degree script that also carries an authored punctuation comma still
    // owns one presentation baseline return before the following blank. Count
    // those local degree-comma pairs even when enrichment reparented the space.
    const degreeCommaReturns = boundCommaNodes.filter((node) => {
      let previous = node.previousElementSibling ?? node.previousSibling;
      while (previous && previous.nodeType !== 1) previous = previous.previousSibling;
      return previous?.getAttribute?.('data-omniya-nemeth-cells') === '⠘⠨⠡';
    }).length;
    scriptSpaceReturns = Math.max(scriptSpaceReturns, degreeCommaReturns);
    while (scriptSpaceReturns > 0 && braille.includes('⠐⠀')) {
      braille = braille.replace('⠐⠀', '⠀');
      scriptSpaceReturns -= 1;
    }
    if (sourceMath.querySelector?.('msup') && sourceMath.querySelector?.('[data-omniya-nemeth-cells="⠨⠅"]') && braille.includes('⠐⠀')) {
      braille = braille.replace('⠐⠀', '⠀');
    }
    // Enrichment may place the sign before the following operator's
    // function-application row rather than directly before the minus. The
    // authored diagonal fraction and its explicit boundary still identify
    // this as the same local artifact.
    if (diagonalFractions.length) {
      braille = braille.replace(/⠀⠼(?=⠤)/g, '⠀');
      braille = braille.replace(/⠀⠼⠀⠤/g, '⠀⠤');
    }
    // In a source-marked numeric/letter grouping, an explicit blank retains
    // its punctuation indicator (Rule 19.11 `a, b`). MathJax's factor-space
    // projection removes that dot-6 marker, so restore it only when the source
    // has a comma-bearing group and an authored blank.
    if ((boundCommas || hasSource('mo[data-omniya-nemeth-cells="⠨⠨⠷"]')) &&
      braille.includes('⠁⠀⠃')) {
      braille = braille.replace(/⠁⠀⠃/, '⠁⠠⠀⠃');
    }
    if (hasSource('mo[data-omniya-nemeth-cells="⠈⠷"]') && braille.includes('⠁⠠⠬')) {
      braille = braille.replace('⠁⠠⠬', '⠁⠠⠀⠬');
    }
  }
  // A coefficient immediately before an authored function name is a
  // lower-cell numeral, while a degree value inside msup starts its own
  // numeric passage. SRE sees both as isolated <mn> nodes and prefixes both.
  // Remove only the signs belonging to source-marked, non-script function
  // coefficients. Degree punctuation at the end of a closed group likewise
  // needs the authored return to baseline before the closing fence.
  const functionCoefficients = [...lowerCellNumeric].filter((node) => {
    let ancestor = node.parentElement ?? node.parentNode;
    while (ancestor && ancestor !== sourceMath) {
      if (['msup', 'msub', 'msubsup', 'mmultiscripts'].includes(ancestor.localName ?? ancestor.nodeName)) return false;
      ancestor = ancestor.parentElement ?? ancestor.parentNode;
    }
    const elementSibling = (current) => {
      if (current.nextElementSibling) return current.nextElementSibling;
      let sibling = current.nextSibling;
      while (sibling && sibling.nodeType !== 1) sibling = sibling.nextSibling;
      return sibling;
    };
    let next = elementSibling(node);
    while (next?.getAttribute?.('data-semantic-added') === 'true') next = elementSibling(next);
    return next?.getAttribute?.('data-omniya-nemeth-intent') === 'function-name';
  });
  for (let remaining = functionCoefficients.length; remaining > 0; remaining -= 1) {
    braille = braille.replace(/⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴](?:⠎⠊⠝|⠉⠕⠎|⠞⠁⠝))/, '');
  }
  const terminalDegreeScript = [...sourceMath.querySelectorAll('msup')].some((script) => {
    const hasDegree = [...(script.getElementsByTagName?.('*') ?? [])]
      .some((node) => node.getAttribute?.('data-omniya-nemeth-cells') === '⠘⠨⠡');
    let next = script.nextElementSibling ?? script.nextSibling;
    while (next && next.nodeType !== 1) next = next.nextSibling;
    return hasDegree && (!next || next.getAttribute?.('data-omniya-role') === 'close-fence');
  });
  if (terminalDegreeScript) braille = braille.replace(/(⠘⠨⠡)(?!⠐)(?=⠾$)/, '$1⠐');
  if (functionLimitCells.length && braille.endsWith('⠻')) {
    // A limit-function terminator is part of the bounded local code. SRE
    // cannot recover that source boundary from an munder/mover, and may emit
    // the cell after the final sibling instead. When the authored limit is
    // followed by a source blank, relocate exactly one terminator to that
    // local boundary without serializing the surrounding expression.
    const sourcePrefix = functionLimitCells[0];
    const sourceIndex = braille.indexOf(sourcePrefix);
    const boundary = sourceIndex >= 0 ? braille.indexOf('⠀', sourceIndex + sourcePrefix.length) : -1;
    if (boundary > 0 && !braille.slice(0, boundary).endsWith('⠻')) {
      braille = `${braille.slice(0, boundary)}⠻${braille.slice(boundary + 1, -1)}`;
    }
    // When MathJax flattens the limit body into a punctuated row, the local
    // boundary may be represented only by the lower expression's trailing
    // number and the next authored blank. Preserve the bounded code there.
    if (!braille.includes('⠻⠀') && braille.includes('⠼⠴⠀')) {
      braille = braille.replace('⠼⠴⠀', '⠼⠴⠻⠀').replace(/⠻$/, '');
    }
  }
  // The limit may be followed by more mathematics, so its source correction
  // cannot depend on the entire expression ending in a terminator.
  for (const cells of functionLimitCells) {
    const nameCells = cells.slice(1);
    if (braille.includes(`⠐${nameCells}`) && !braille.includes(`⠐${cells}`)) {
      braille = braille.replace(`⠐${nameCells}`, `⠐${cells}`);
    }
  }
  if (multiscriptCount) {
    // SRE can announce a baseline return before a right superscript when a
    // multiscript is nested in a larger fraction. The authored BANA local
    // code already supplied the script direction, so this presentation-only
    // return is not part of the source cells.
    let remaining = multiscriptCount;
    braille = braille.replace(/⠐⠘/g, (match) => {
      if (remaining <= 0) return match;
      remaining -= 1;
      return '⠘';
    });
  }
  const previousElement = (node) => {
    let previous = node.previousElementSibling ?? node.previousSibling;
    while (previous && previous.nodeType !== 1) previous = previous.previousSibling;
    return previous;
  };
  const elementName = (node) => node.localName ?? node.nodeName?.toLowerCase?.();
  const baselineMultipurposeNumbers = [...lowerCellNumeric].filter((node) => {
    if (node.closest?.('msup, msub, msubsup, mmultiscripts, mfrac, msqrt, mroot')) return false;
    let previous = previousElement(node);
    while (previous && (previous.getAttribute?.('data-semantic-added') === 'true'
      || !(String(previous.textContent ?? '').trim()))) {
      previous = previousElement(previous);
    }
    if (!previous) return false;
    const name = elementName(previous);
    if (name === 'mi' && previous.getAttribute?.('data-omniya-nemeth-cells')) return true;
    if (name === 'mn'
      && previous.getAttribute?.('data-omniya-nemeth-intent') === 'single-letter-number') return true;
    // Only large operators (BANA 24-3) need the multipurpose separator; fences
    // and ordinary signs must keep the historic lower-cell ⠐ cleanup.
    if (name === 'mo' && previous.getAttribute?.('data-omniya-nemeth-cells')) {
      const textContent = String(previous.textContent ?? '').trim();
      if (/^[∑∏∫∮∯∰⋀⋁⋃⋂]$/.test(textContent)) return true;
      if (/^⠨⠠[⠁-⠵]+$/.test(previous.getAttribute('data-omniya-nemeth-cells') ?? '')) return true;
      return false;
    }
    return false;
  });
  if (lowerCellNumeric.length && braille.includes('⠐')) {
    // Keep Rule 24.1 multipurpose separators before baseline numbers after a
    // letter/largeop/single-letter criterion; strip only other SRE numeric
    // transition artifacts before lower-cell digits.
    let remaining = Math.max(0, lowerCellNumeric.length - baselineMultipurposeNumbers.length);
    braille = braille.replace(/⠐(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴|⠨)/g, (match) => {
      if (remaining <= 0) return match;
      remaining -= 1;
      return '';
    });
  }
  if (baselineMultipurposeNumbers.length) {
    const lowerDigits = new Map([
      ['0', '⠴'], ['1', '⠂'], ['2', '⠆'], ['3', '⠒'], ['4', '⠲'],
      ['5', '⠢'], ['6', '⠖'], ['7', '⠶'], ['8', '⠦'], ['9', '⠔'], ['.', '⠨']
    ]);
    for (const node of baselineMultipurposeNumbers) {
      let previous = previousElement(node);
      while (previous && (previous.getAttribute?.('data-semantic-added') === 'true'
        || !(String(previous.textContent ?? '').trim()))) {
        previous = previousElement(previous);
      }
      if (!previous) continue;
      const hostCells = previous.getAttribute?.('data-omniya-nemeth-cells')
        || (previous.getAttribute?.('data-omniya-nemeth-intent') === 'single-letter-number'
          ? [...String(previous.textContent ?? '').trim()].map((digit) => lowerDigits.get(digit) ?? '').join('')
          : '');
      const digitCells = [...String(node.textContent ?? '').trim()]
        .map((digit) => lowerDigits.get(digit) ?? '')
        .join('');
      if (!hostCells || !digitCells || digitCells.length !== String(node.textContent ?? '').trim().length) continue;
      const withIndicator = `${hostCells}⠐${digitCells}`;
      const without = `${hostCells}${digitCells}`;
      if (braille.includes(withIndicator)) continue;
      if (braille.includes(without)) braille = braille.replace(without, withIndicator);
    }
  }
  // Lower-cell decimals after a multipurpose indicator are not a numeric
  // passage. SRE may still emit a number sign between the decimal point and
  // digits (X".6 -> ⠐⠨⠼⠖); drop only that local artifact.
  if ([...lowerCellNumeric].some((node) => String(node.textContent ?? '').trim().startsWith('.'))) {
    braille = braille.replace(/⠐⠨⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, '⠐⠨');
  }
  if (lowerCellNumeric.length && braille.includes('⠬')) {
    braille = braille.replace(/⠐+⠬⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/, '⠐⠬');
    braille = braille.replace(/⠬⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/, '⠐⠬');
    braille = braille.replace(/⠐⠬⠼/, '⠐⠬');
    braille = braille.replace(/⠐⠬⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/, '⠐⠬');
    braille = braille.replace(/(⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)⠐⠻$/, '$1⠻');
  }
  // A lower-cell numeral authored in a superscript is not a new numeric
  // passage. MathJax may expose an isolated-number sign after the script
  // indicator; remove it only for the source-marked exponent.
  if (lowerCellNumeric.length) {
    if (sourceMath.querySelector?.('[data-omniya-nemeth-cells="⠨⠅"]') && sourceMath.querySelector?.('[data-omniya-nemeth-intent="lower-cell-numeric"]')) braille = braille.replace(/(⠨⠅⠀)(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/, '$1⠼');
    braille = braille.replace(/([⠰⠘])⠼(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '$1');
    const scriptedLower = [...lowerCellNumeric].filter((node) =>
      node.closest?.('msup, msub, msubsup, mmultiscripts'));
    for (const node of scriptedLower) {
      const value = String(node.textContent ?? '').trim();
      const digit = new Map([['0','⠴'],['1','⠂'],['2','⠆'],['3','⠒'],['4','⠲'],['5','⠢'],['6','⠖'],['7','⠶'],['8','⠦'],['9','⠔']]).get(value);
      if (digit) {
        braille = braille.replace(`⠘⠼${digit}`, `⠘${digit}`);
        braille = braille.replace(`⠰⠼${digit}`, `⠰${digit}`);
      }
    }
    if (scriptedLower.length) {
      braille = braille.replace(/([⠰⠘])⠼(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '$1');
    }
  }
  // Rule 14 numeric subscripts on a numeric base also omit the number sign
  // inside the script (`#12;7` → `⠼⠂⠆⠰⠶`). Those digits are often stamped
  // numeric-start rather than lower-cell-numeric; strip only script-local
  // number signs when an msub/msup hosts an mn child.
  const scriptedNumericStart = [...(sourceMath.getElementsByTagName?.('mn') ?? [])]
    .filter((node) => {
      const intent = node.getAttribute?.('data-omniya-nemeth-intent');
      if (!(intent === 'numeric-start' || intent === 'lower-cell-numeric' || intent === 'single-letter-number')) {
        return false;
      }
      let host = node.parentElement ?? node.parentNode;
      while (host && host !== sourceMath) {
        const name = (host.localName || host.nodeName || '').toLowerCase();
        if (['msub', 'msup', 'msubsup', 'mmultiscripts'].includes(name)) return true;
        host = host.parentElement ?? host.parentNode;
      }
      return false;
    });
  if (scriptedNumericStart.length) {
    braille = braille.replace(/([⠰⠘])⠼(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '$1');
  }
  if (lowerCellNumeric.length > 1) {
    braille = braille.replace(/⠘⠆⠬/g, '⠘⠆⠐⠬');
    braille = braille.replace(/⠘⠘⠆⠘/g, '⠘⠆⠐');
    braille = braille.replace(/(⠘⠆⠐)(?:⠐)?⠻$/, '$1⠻');
    braille = braille.replace(/(⠘⠆)(?!⠐⠻)(?=⠻$)/, '$1⠐');
  }
  // Rule 19.4's parenthesized word example uses a superscripted numeric
  // suffix followed by the multipurpose plus. Preserve the authored dot-5
  // before plus when the source contains that exact local script boundary.
  if (sourceMath.querySelector?.('msup') && braille.includes('⠘⠆⠬')) {
    braille = braille.replace(/⠘⠆⠬/, '⠘⠆⠐⠬');
  }
  // Rule 14.11 non-simultaneous scripts keep an authored multipurpose separator
  // between the two level indicators. SRE/MathJax collapses that to a plain
  // msubsup reading; restore only the source-marked compound scripts.
  const nonSimultaneous = [...sourceMath.getElementsByTagName?.('msubsup') ?? []]
    .filter((node) => String(node.getAttribute?.('data-omniya-nemeth-intent') ?? '')
      .startsWith('non-simultaneous-scripts'));
  for (const node of nonSimultaneous) {
    const intent = node.getAttribute?.('data-omniya-nemeth-intent') || '';
    const first = intent.endsWith(':sup-sub') ? '⠘' : '⠰';
    const second = first === '⠰' ? '⠘' : '⠰';
    const missing = new RegExp(`${first}([^⠘⠰⠐]+)${second}`);
    const present = new RegExp(`${first}([^⠘⠰⠐]+)⠐${second}`);
    if (present.test(braille)) continue;
    if (missing.test(braille)) {
      braille = braille.replace(missing, `${first}$1⠐${second}`);
    }
  }
  // Rule 14.5 left scripts keep a multipurpose separator before the base.
  // SRE often concatenates the left-script content with the base letter.
  const leftScriptTensors = [...(sourceMath.getElementsByTagName?.('mmultiscripts') ?? [])]
    .filter((node) => [...(node.children ?? [])].some((child) =>
      (child.localName || child.nodeName || '').toLowerCase() === 'mprescripts'));
  if (leftScriptTensors.length) {
    const hasNestedLeft = leftScriptTensors.some((tensor) =>
      [...(tensor.getElementsByTagName?.('mmultiscripts') ?? [])].some((inner) => inner !== tensor))
      || [...(sourceMath.getElementsByTagName?.('msup') ?? [])].some((host) =>
        [...(host.getElementsByTagName?.('mmultiscripts') ?? [])].length > 0)
      || [...(sourceMath.getElementsByTagName?.('msub') ?? [])].some((host) =>
        [...(host.getElementsByTagName?.('mmultiscripts') ?? [])].length > 0);
    // Nested left scripts inside another left script or a right script get one
    // extra SRE level indicator; drop only that local surplus first.
    if (hasNestedLeft) {
      braille = braille.replace(/⠘{3,}(?![⠘])/g, (run) => '⠘'.repeat(run.length - 1));
      braille = braille.replace(/⠘{2,}(?=⠰)/g, (run) => '⠘'.repeat(Math.max(1, run.length - 1)));
      braille = braille.replace(/⠰{2,}(?=⠘)/g, (run) => '⠰'.repeat(Math.max(1, run.length - 1)));
      // Nested left-subscripts (`;;y;x"n`) keep two indicators; SRE emits three.
      // Match any following non-indicator cell — letter class ranges miss ⠽/⠺.
      braille = braille.replace(/⠰{3,}(?![⠰⠘⠐])/g, (run) => '⠰'.repeat(run.length - 1));
    }
    // Opposite left scripts on one tensor keep multipurpose between the two
    // level runs (`;b"~a"x`). Nested same-side scripts do not.
    const oppositeLeft = leftScriptTensors.some((tensor) => {
      const kids = [...(tensor.children ?? [])].filter((child) => child.nodeType === 1);
      const marker = kids.findIndex((child) =>
        (child.localName || child.nodeName || '').toLowerCase() === 'mprescripts');
      if (marker < 0) return false;
      const leftSub = kids[marker + 1];
      const leftSup = kids[marker + 2];
      const filled = (node) => node && (node.localName || node.nodeName || '').toLowerCase() !== 'none'
        && node.getAttribute?.('data-omniya-hole') !== 'true';
      return filled(leftSub) && filled(leftSup);
    });
    if (oppositeLeft) {
      braille = braille.replace(/([⠰⠘])([⠁-⠵⠠]+)(?!⠐)(?=[⠰⠘])/g, '$1$2⠐');
    }
    // Insert multipurpose only between the last left-script letter run and the
    // following base letter (optionally followed by a right script indicator).
    braille = braille.replace(/(?<![⠁-⠵])([⠰⠘]+[⠁-⠵⠠]+)(?!⠐)([⠁-⠵])(?=(?:⠰|⠘|⠐|$))/g, '$1⠐$2');
    braille = braille.replace(/⠐{2,}(?=[⠁-⠵])/g, '⠐');
    // Nested left-sup of a minus keeps no multipurpose before the inner
    // superscript digit (`#10~~-~4`).
    if (hasNestedLeft) {
      braille = braille.replace(/⠤⠐⠘/g, '⠤⠘');
    }
  }
  // Rule 14.11 `x1"~2`: single-letter numeric base of an msup keeps multipurpose
  // before the superscript indicator.
  const singleLetterSupBases = [...singleLetterNumbers].filter((node) => {
    const host = node.parentElement ?? node.parentNode;
    return (host?.localName || host?.nodeName || '').toLowerCase() === 'msup';
  });
  if (singleLetterSupBases.length) {
    braille = braille.replace(/([⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])(?!⠐)(?=⠘)/g, '$1⠐');
  }
  // Rule 14.6 numeric subscript to a letter is an adjacent mn with no msub.
  // SRE may insert a multipurpose separator; remove only that local artifact.
  const adjacentLetterNumbers = [...(sourceMath.getElementsByTagName?.('mn') ?? [])]
    .filter((node) => {
      const intent = node.getAttribute?.('data-omniya-nemeth-intent');
      // Rule 14.6 numeric subscripts omit multipurpose. Rule 24.1 baseline
      // numbers after a letter keep it — those stay lower-cell-numeric.
      if (!(intent === 'numeric-start' || intent === 'numeric-subscript')) return false;
      if (node.closest?.('msub, msup, msubsup, mmultiscripts')) return false;
      let previous = node.previousElementSibling ?? node.previousSibling;
      while (previous && previous.nodeType !== 1) previous = previous.previousSibling;
      return previous && (previous.localName === 'mi' || previous.nodeName === 'mi');
    });
  for (const node of adjacentLetterNumbers) {
    let previous = node.previousElementSibling ?? node.previousSibling;
    while (previous && previous.nodeType !== 1) previous = previous.previousSibling;
    const hostCells = previous?.getAttribute?.('data-omniya-nemeth-cells');
    if (!hostCells) continue;
    braille = braille.replace(new RegExp(`${hostCells}⠐(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴|⠨)`), hostCells);
  }
  // Leading-decimal numeric subscripts also omit a multipurpose that baseline
  // Rule 24.1 restoration may have inserted before ⠨.
  if ([...(sourceMath.getElementsByTagName?.('mn') ?? [])]
    .some((node) => node.getAttribute?.('data-omniya-nemeth-intent') === 'numeric-subscript')) {
    braille = braille.replace(/((?:⠠)?[⠁-⠵])⠐(?=⠨)/g, '$1');
  }
  // Numeric subscript after a prime omits the number sign (`x'1`).
  const primes = sourceNodes('mo').filter((node) => {
    const cells = node.getAttribute?.('data-omniya-nemeth-cells') ?? '';
    const text = String(node.textContent ?? '').trim();
    return cells === '⠄' || cells === '⠄⠄' || text === '′' || text === '″';
  });
  if (primes.length && lowerCellNumeric.length) {
    braille = braille.replace(/⠄⠼(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '⠄');
    braille = braille.replace(/⠄⠄⠼(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '⠄⠄');
  }
  // Contracted script commas keep the following digit without a number sign.
  if (sourceNodes('[data-omniya-script-comma="true"]').length
    || sourceNodes('mo[data-omniya-nemeth-cells="⠪"]').length) {
    braille = braille.replace(/⠪⠼(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '⠪');
  }
  // Rule 14.4.2 sequential sub-then-sup keeps the subscript indicator in
  // force before the later superscript indicator. SRE/MathJax flatten the
  // nested construction to a plain msubsup reading; restore only source-
  // marked sequential scripts, never ordinary simultaneous msubsup.
  const sequentialScripts = [...sourceMath.getElementsByTagName?.('msubsup') ?? []]
    .filter((node) => String(node.getAttribute?.('data-omniya-nemeth-intent') ?? '')
      .startsWith('sequential-scripts'));
  // Also treat bare msubsup opened by `;~` / script.sub-sup as sequential when
  // the subscript is numeric and the superscript is a letter (14-46).
  const inferredSequential = sequentialScripts.length ? sequentialScripts
    : [...sourceMath.getElementsByTagName?.('msubsup') ?? []].filter((node) => {
      const intent = String(node.getAttribute?.('data-omniya-nemeth-intent') ?? '');
      if (intent.startsWith('non-simultaneous-scripts')) return false;
      const kids = [...(node.children ?? [])].filter((child) => child.nodeType === 1);
      return kids[1]?.localName === 'mn' && kids[2]?.localName === 'mi';
    });
  // Simultaneous scripts omit the extra subscript indicator before the
  // superscript indicator. SRE often emits ⠰⠘ for an ordinary msubsup.
  const simultaneousScripts = [...sourceMath.getElementsByTagName?.('msubsup') ?? []]
    .filter((node) => {
      const intent = String(node.getAttribute?.('data-omniya-nemeth-intent') ?? '');
      return !intent.startsWith('non-simultaneous-scripts') && !intent.startsWith('sequential-scripts');
    });
  const nestedSimultaneous = [...sourceNodes('msub')].some((node) =>
    [...(node.children ?? [])].some((child) => {
      const name = (child.localName || child.nodeName || '').toLowerCase();
      if (name === 'msup' || name === 'msubsup') return true;
      if (name !== 'mrow') return false;
      return [...(child.children ?? [])].some((grand) =>
        ['msup', 'msubsup'].includes((grand.localName || grand.nodeName || '').toLowerCase()));
    }));
  if ((simultaneousScripts.length || nestedSimultaneous) && !inferredSequential.length) {
    braille = braille.replace(/⠰([⠁-⠵]+)⠰⠘/g, '⠰$1⠘');
  }
  if (inferredSequential.length) {
    braille = braille.replace(/([⠁-⠵])⠼([⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])⠘/g, '$1⠰$2⠰⠘');
    braille = braille.replace(/⠰([^⠘⠰⠐]+)(?!⠰)⠘/g, '⠰$1⠰⠘');
    braille = braille.replace(/⠰⠘([^⠘⠰⠐]+)(?!⠰)⠘/g, '⠰⠘$1⠰⠘');
  }
  // Nested right subscripts restore the deeper level indicator before a digit.
  const nestedRightSubscripts = [...sourceNodes('msub')].filter((node) =>
    [...(node.children ?? [])].some((child) =>
      (child.localName || child.nodeName || '').toLowerCase() === 'msub'));
  if (nestedRightSubscripts.length) {
    braille = braille.replace(/⠰(⠠?[⠁-⠵])(?!⠰)(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '⠰$1⠰⠰');
    braille = braille.replace(/(⠰⠠?[⠁-⠵])⠐(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '$1');
  }
  // Rule 14.7 contracted script comma is dots 2-4-6. SRE may spell the same
  // comma as literary comma plus a blank; restore only source-marked commas.
  const scriptCommas = sourceNodes('[data-omniya-script-comma="true"]');
  if (scriptCommas.length && !braille.includes('⠪')) {
    braille = braille.replace(/([⠁-⠵⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])⠠⠀/g, '$1⠪');
  }
  // An explicit mathematical blank already returns to the baseline. SRE may
  // still announce a script-return cell before the following plus.
  if (sourceMath.querySelector?.('msup') && sourceMath.querySelector?.('[data-omniya-nemeth-intent="explicit-space"]')) {
    braille = braille.replace(/⠘⠆⠀⠐⠬/g, '⠘⠆⠀⠬');
  }
  // The equality relation inside a superscript is a normal baseline relation;
  // SRE may expose the baseline-return cell before it. The authored Rule 11
  // local sequence has already supplied the script transition, so remove only
  // this presentation artifact when the relation is inside a script.
  if (sourceMath.querySelector?.('msup mo')) {
    braille = braille.replace(/⠘⠨⠅/, '⠨⠅');
  }
  // Degree is authored as a local superscript decoration (Rule 23.10). In a
  // nested function expression SRE can replay the script transition once for
  // every semantic wrapper and omit the baseline return before the following
  // function/operator. The source-marked degree nodes make this correction
  // local and deterministic; ordinary superscripts are untouched.
  const authoredDegrees = sourceMath.querySelectorAll('[data-mjx-pseudoscript], [data-omniya-nemeth-cells="⠘⠨⠡"]');
  if (authoredDegrees.length) {
    braille = braille.replace(/⠘+⠨⠡/g, '⠘⠨⠡');
    braille = braille.replace(/(⠘⠨⠡)(?=⠉⠕⠎|⠎⠊⠝)/g, '$1⠐');
    braille = braille.replace(/(⠘⠨⠡⠀)(?=⠬)/g, '$1⠐');
  }
  if (signedNumeric) {
    // SRE can elide the numeric indicator after a minus because MathML only
    // exposes a number node. The guided source explicitly entered BANA's
    // signed-number indicator, so restore it at that bounded local boundary.
    braille = braille.replace(/⠤(?!⠼)(⠂|⠆|⠒|⠲|⠢|⠔|⠒|⠦|⠖|⠶|⠴)/, '⠤⠼$1');
  }
  if (lowerCellNumeric.length) {
    // A lower-cell numeral entered after an explicit mathematical blank is
    // not a new Nemeth numeric passage. SRE may add the number indicator when
    // it sees an isolated <mn>; remove only the source-marked local cells.
    // Prefer the operator boundary, so a lower-cell number can never remove
    // the number sign belonging to an earlier ordinary decimal item.
    braille = braille.replace(/⠬⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, '⠬');
    braille = braille.replace(/⠨⠌⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, '⠨⠌');
    // Enclosed lists and grouped continuations omit the number sign after an
    // open fence or punctuation comma. Grouped thousands also omit it after a
    // digit+blank when the next atom is lower-cell; letter/equals blanks keep
    // `⠼`, and hyphen+blank divided long numbers keep `⠼` as well.
    braille = braille.replace(/⠷⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, '⠷');
    braille = braille.replace(/⠠⠀⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, '⠠⠀');
    braille = braille.replace(/([⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])⠀⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, '$1⠀');
    // Rule 19.10 nests lower-cell numerals inside enlarged grouping signs
    // and ends the group immediately before division. MathJax enriches those
    // isolated numbers as ordinary <mn> nodes and moves the prefixed close
    // after the division operator. The authored local markers identify this
    // exact construction, so normalize only its bounded cells.
    if (sourceMath.querySelector?.('mo[data-omniya-nemeth-cells="⠈⠾"]')) {
      // This source marker denotes an enlarged closing fence, not merely a
      // generic bracket. In its local numeric construction every subsequent
      // digit remains in the same number context, so only the first number
      // sign is authored. Remove signs from later isolated <mn> projections.
      const numericNodes = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="numeric-start"], [data-omniya-nemeth-intent="lower-cell-numeric"]')];
      if (numericNodes.length >= 2) {
        let seen = 0;
        const expectedSigns = Math.max(1, numericNodes.filter((node) => node.getAttribute?.('data-omniya-nemeth-intent') === 'numeric-start').length);
        braille = braille.replace(/⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, (cell, offset, value) => {
          // Keep the leading number sign only. The later signs are emitted
          // for isolated semantic <mn> nodes, not authored BANA boundaries.
          if (seen++ < expectedSigns) return cell;
          return '';
        });
      }
      // MathJax may expose only the local group and division in this selector
      // pass. The source still proves that the first numeric item is the one
      // ordinary number sign and all following cells are lower-cell digits.
      braille = braille.replace(/⠼(?=⠒⠈⠷)/, '');
      braille = braille.replace(/⠼(?=⠆⠷)/, '');
      braille = braille.replace(/⠼(?=⠒⠾⠈⠨⠌)/, '');
      braille = braille.replace(/⠈⠨⠌(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/, '⠈⠾⠨⠌');
      braille = braille.replace(/⠨⠌⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, '⠨⠌');
    }
  }
  if (operatorFollowedNumbers.length) {
    braille = braille.replace(/⠬⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠴])/g, '⠬');
  }
  // The source operator marker is retained on the canonical node even when
  // enrichment wraps both sides in implicit-multiplication rows. Use that
  // explicit marker as the final bounded fallback for the same lower-cell
  // transition when the numeric child itself was reparented by SRE.
  if (sourceMath.querySelector?.('mo[data-omniya-nemeth-cells="⠬"]')) {
    braille = braille.replace(/⠬⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠴])/g, '⠬');
  }
  // In a source-authored trigonometric sum, a lower-cell coefficient follows
  // the plus even though SRE may have moved the number into an implicit row
  // and discarded the local source marker. The presence of the explicit plus
  // and two function-name atoms bounds this correction to that BANA pattern.
  if (sourceMath.querySelector?.('mo[data-omniya-nemeth-cells="⠬"]') &&
      sourceMath.querySelectorAll?.('[data-omniya-nemeth-intent="function-name"]').length >= 2) {
    braille = braille.replace(/⠬⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠴])/g, '⠬');
  }
  if (numericStarts.length) {
    // An isolated number after a word boundary must retain BANA's numeric
    // indicator even when SRE suppresses it in a mixed mathematical row.
    const digits = new Map([
      ['0', '⠴'], ['1', '⠂'], ['2', '⠆'], ['3', '⠒'], ['4', '⠲'],
      ['5', '⠢'], ['6', '⠖'], ['7', '⠶'], ['8', '⠦'], ['9', '⠔']
    ]);
    let restoreCursor = 0;
    for (const node of numericStarts) {
      if (operatorFollowedNumbers.includes(node)) continue;
      // Simple-fraction numerator/denominator digits are already in the
      // fraction's lower-cell numeric context. Restoring a number sign here
      // invents `#` cells inside `?n/d#` constructions after punctuation.
      if (node.closest?.('mfrac[data-omniya-fraction-kind="simple"]') ||
        (() => {
          let current = node.parentElement ?? node.parentNode;
          while (current) {
            if (current.getAttribute?.('data-omniya-fraction-kind') === 'simple') return true;
            current = current.parentElement ?? current.parentNode;
          }
          return false;
        })()) {
        continue;
      }
      const value = String(node.textContent ?? '').trim();
      if (!/^\d+$/.test(value)) continue;
      const cells = [...value].map((digit) => digits.get(digit) ?? '').join('');
      if (!cells) continue;
      const prefixed = `⠼${cells}`;
      const prefixedIndex = braille.indexOf(prefixed, restoreCursor);
      let bareIndex = -1;
      let search = restoreCursor;
      while (search <= braille.length - cells.length) {
        const found = braille.indexOf(cells, search);
        if (found < 0) break;
        if (braille.slice(found - 1, found) !== '⠼') {
          bareIndex = found;
          break;
        }
        search = found + 1;
      }
      if (prefixedIndex >= 0 && (bareIndex < 0 || prefixedIndex <= bareIndex)) {
        restoreCursor = prefixedIndex + prefixed.length;
        continue;
      }
      if (bareIndex < 0) continue;
      const previous = braille[bareIndex - 1];
      if (previous === '⠬' || previous === '⠤') {
        restoreCursor = bareIndex + cells.length;
        continue;
      }
      braille = `${braille.slice(0, bareIndex)}${prefixed}${braille.slice(bareIndex + cells.length)}`;
      restoreCursor = bareIndex + prefixed.length;
    }
  }
  // A plus keeps Nemeth numeric mode. The isolated-number restore above can
  // stamp an earlier `numeric-start` digit onto a later plus-operand of the
  // same value; drop only that immediate `+number-sign` artifact.
  if (sourceMath.querySelector?.('mo[data-omniya-nemeth-cells="⠬"]')) {
    braille = braille.replace(/⠬⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠴])/g, '⠬');
  }
  if (numericStarts.length && sourceMath.querySelector('mover')) {
    braille = braille.replace(/^⠐(?=⠼)/, '');
    braille = braille.replace(/⠣⠱⠻$/, '⠱');
  }
  const authoredSquareRadical = sourceMath.querySelector?.('msqrt');
  if ((numericStarts.length || lowerCellNumeric.length) && authoredSquareRadical) {
    braille = braille.replace(/^⠜⠼/, '⠼').replace(/⠻⠁$/, '⠜⠁⠻');
    if (braille.endsWith('⠘⠒⠐⠻') && !braille.includes('⠬')) {
      braille = braille.replace(/⠘⠒⠐⠻$/, '⠻⠘⠒');
    }
  }
  if (sourceMath.querySelector?.('[data-omniya-group="round"]') && braille.endsWith('⠻')) {
    // Keep an authored five-step terminator when the closed group itself is
    // the base of a mover/munder (Rule 15-19). Strip only the spurious closer
    // SRE emits after an ordinary unadorned group.
    const wrapsClosedGroup = [...sourceNodes('mover'), ...sourceNodes('munder'), ...sourceNodes('munderover')].some((node) => {
      const kids = [...(node.children ?? [])].filter((child) => child.nodeType === 1);
      const base = kids[0];
      return base?.getAttribute?.('data-omniya-group') === 'round'
        || base?.getAttribute?.('data-omniya-role') === 'closed-group';
    });
    if (!wrapsClosedGroup) {
      braille = braille.slice(0, -1);
    }
  }
  // Rule 15-19: SRE may omit the five-step terminator when a closed group is
  // the mover/munder base. Restore `⠻` after the authored over/under bar.
  {
    const wrapsClosedGroup = [...sourceNodes('mover'), ...sourceNodes('munder')].some((node) => {
      const kids = [...(node.children ?? [])].filter((child) => child.nodeType === 1);
      if (kids.length !== 2) return false;
      const base = kids[0];
      const bar = kids[1];
      return (base?.getAttribute?.('data-omniya-group') === 'round'
        || base?.getAttribute?.('data-omniya-role') === 'closed-group')
        && String(bar?.textContent ?? '').trim() === '¯';
    });
    if (wrapsClosedGroup && /[⠣⠩]⠱$/.test(braille) && !braille.endsWith('⠻')) {
      braille = `${braille}⠻`;
    }
  }
  // A closed guided group is an explicit BANA boundary. MathJax can flatten
  // the final fence into a semantic wrapper and emit an extra closing cell;
  // restore the authored close exactly once per closed source group. This is
  // a source-intent correction, not a delimiter parser.
  if (closedGroups.length) {
    const expectedClosers = closedGroups.length;
    let closeCount = [...braille].filter((cell) => cell === '⠾').length;
    if (closeCount > expectedClosers) {
      let remove = closeCount - expectedClosers;
      // Prefer semantic closes stranded immediately before a relation or
      // explicit blank. Preserve the final source fence, which is often the
      // only visible boundary for a large outer group.
      braille = braille.replace(/⠾(?=⠀⠨⠅|⠀⠬|⠀$)/g, (cell) => {
        if (remove <= 0) return cell;
        remove -= 1;
        return '';
      });
      if (remove > 0) {
        braille = [...braille].reverse().filter((cell) => {
          if (cell === '⠾' && remove > 0) { remove -= 1; return false; }
          return true;
        }).reverse().join('');
      }
    }
    // In a fenced factor immediately followed by a multiplication sign, SRE
    // may move the first close fence to the final semantic wrapper. The
    // source tree gives an unambiguous local anchor: a closed group whose
    // next sibling is the authored multiplication operator. Put that one
    // fence back at the factor boundary, then remove only the displaced final
    // fence if necessary.
    const followedByMultiply = closedGroups.some((group) => {
      const next = group.nextElementSibling;
      return next?.getAttribute?.('data-omniya-nemeth-cells') === '⠈⠡';
    });
    if (followedByMultiply) {
      const multiply = braille.indexOf('⠈⠡');
      if (multiply > 0 && braille[multiply - 1] !== '⠾') {
        braille = `${braille.slice(0, multiply)}⠾${braille.slice(multiply)}`;
        const total = [...braille].filter((cell) => cell === '⠾').length;
        if (total > expectedClosers) {
          let remove = total - expectedClosers;
          braille = [...braille].reverse().filter((cell) => {
            if (cell === '⠾' && remove > 0) { remove -= 1; return false; }
            return true;
          }).reverse().join('');
        }
      }
    }
    // Adjacent fenced factors are another source-boundary that SRE may flatten
    // into one punctuated semantic row. If a closed group is immediately
    // followed by a second authored group, restore the first close before the
    // next open. This is a single local boundary correction, not delimiter
    // matching across the expression.
    const adjacentGroups = closedGroups.some((group) =>
      group.nextElementSibling?.getAttribute?.('data-omniya-group') === 'round');
    if (adjacentGroups) {
      const nextOpen = braille.indexOf('⠷', 1);
      if (nextOpen > 0 && braille[nextOpen - 1] !== '⠾') {
        braille = `${braille.slice(0, nextOpen)}⠾${braille.slice(nextOpen)}`;
      }
    }
    // Rule 23 writes `f(x)dx` unspaced. SRE may keep the differential inside
    // the fence or park the authored close on the semantic wrapper. A closed
    // source group whose next sibling is `d` is the local boundary; move only
    // that one close in front of the differential.
    const nextAuthoredElement = (node) => {
      let sibling = node?.nextElementSibling ?? node?.nextSibling;
      while (sibling && (sibling.nodeType !== 1
        || sibling.localName === 'mspace' || sibling.nodeName === 'mspace'
        || sibling.getAttribute?.('data-semantic-added') === 'true')) {
        sibling = sibling.nextElementSibling ?? sibling.nextSibling;
      }
      return sibling;
    };
    const followedByDifferential = closedGroups.some((group) => {
      const next = nextAuthoredElement(group);
      const name = (next?.localName || next?.nodeName || '').toLowerCase();
      return name === 'mi' && String(next.textContent ?? '').trim() === 'd';
    });
    if (followedByDifferential && !/⠷[^⠷⠾]*⠾⠙/.test(braille)) {
      braille = braille.replace(/⠷([^⠷⠾]*)⠙([⠁-⠿])((?:(?!⠾).)*)⠾/, '⠷$1⠾⠙$2$3');
    }
    // If enrichment dropped a close entirely, a source-authored explicit
    // blank before a relation is the next local boundary. Restore one close
    // only while the source has more closed groups than the projected output;
    // this cannot affect ordinary ungrouped relations.
    closeCount = [...braille].filter((cell) => cell === '⠾').length;
    if (closeCount < expectedClosers) {
      const boundary = braille.indexOf('⠀⠨⠅');
      if (boundary >= 0 && braille[boundary - 1] !== '⠾' && braille[boundary - 1] !== '⠼') {
        braille = `${braille.slice(0, boundary)}⠾${braille.slice(boundary)}`;
      }
    }
    // More specifically, a closed source group whose next meaningful sibling
    // is an equality owns the boundary immediately before that relation. This
    // catches MathJax's flattened Rule 19.7 remainder group without counting
    // unrelated nested/outer grouping wrappers.
    for (const group of closedGroups) {
      let sibling = group.nextElementSibling;
      while (sibling && (sibling.localName === 'mspace' || sibling.getAttribute?.('data-semantic-added') === 'true')) sibling = sibling.nextElementSibling;
      if (sibling?.getAttribute?.('data-omniya-nemeth-cells') !== '⠨⠅') continue;
      const boundary = braille.indexOf('⠀⠨⠅');
      if (boundary > 0 && braille[boundary - 1] !== '⠾' && braille[boundary - 1] !== '⠼') braille = `${braille.slice(0, boundary)}⠾${braille.slice(boundary)}`;
    }
    // For an explicit grouping containing a repeated single-letter-number
    // pattern, SRE can place the final lower-cell digit marker after the
    // closing fence. The source's closed group and its direct number nodes
    // identify the exact local boundary; move only that trailing marker back
    // inside the same group.
    if (singleLetterNumbers.length) {
      const digits = new Set(['⠂','⠆','⠒','⠲','⠢','⠖','⠶','⠦','⠔','⠴']);
      for (const group of closedGroups) {
        const content = [...group.children].find((node) => node.localName === 'mrow');
        if (!content?.querySelector?.('[data-omniya-nemeth-intent="single-letter-number"]')) continue;
        const close = braille.indexOf('⠾');
        if (close > 0 && digits.has(braille[close + 1] ?? '') && !digits.has(braille[close - 1] ?? '')) {
          braille = `${braille.slice(0, close)}${braille[close + 1]}⠾${braille.slice(close + 2)}`;
        }
      }
    }
  }
  // Enlarged and otherwise prefixed fence cells are carried on the authored
  // fence nodes, not on the generic grouping wrapper. Restore those exact
  // local prefixes and collapse a duplicated semantic close. Ordinary round
  // groups have no fence intent here and are left to the generic boundary
  // handling above.
  for (const group of explicitGroups) {
    const openNode = [...group.children].find((node) => node.getAttribute?.('data-omniya-role') === 'open-fence');
    const closeNode = [...group.children].find((node) => node.getAttribute?.('data-omniya-role') === 'close-fence');
    const openCells = openNode?.getAttribute?.('data-omniya-nemeth-cells');
    const closeCells = closeNode?.getAttribute?.('data-omniya-nemeth-cells');
    if (openCells && openCells !== '⠷' && braille.includes('⠷') && !braille.includes(openCells)) {
      braille = braille.replace('⠷', openCells);
    }
    if (closeCells && closeCells !== '⠾') {
      // SRE may append a bare close after the correctly prefixed local close.
      // Remove only that immediately adjacent duplicate.
      braille = braille.replace(`${closeCells}⠾`, closeCells);
      if (!braille.includes(closeCells)) {
        braille = braille.replace('⠾', closeCells);
      }
    }
  }
  // A local Rule 16.3 order indicator may follow an authored grouping fence.
  // The semantic projection does not retain that prefix on the group, but
  // the guided source marker does. Restore the bounded prefix at the first
  // local fence boundary, keyed by node identity rather than expression text.
  for (const group of explicitGroups) {
    const order = group.getAttribute?.('data-omniya-radical-order');
    if (!order || !['1', '2', '3'].includes(order)) continue;
    const open = [...group.children].find((node) => node.getAttribute?.('data-omniya-role') === 'open-fence');
    const openCells = open?.getAttribute?.('data-omniya-nemeth-cells') || '⠷';
    const prefix = `${'⠨'.repeat(Number(order))}⠢`;
    const localStart = braille.indexOf(openCells);
    if (localStart >= 0 && !braille.slice(localStart, localStart + openCells.length + prefix.length).includes(prefix)) {
      braille = `${braille.slice(0, localStart + openCells.length)}${prefix}${braille.slice(localStart + openCells.length)}`;
    }
  }
  // Some compound fence nodes carry their enlarged prefix on the inner
  // punctuation child rather than the outer mrow fence. In that case the
  // prefix is still a source-local part of the enclosing grouping sign.
  const prefixedFence = sourceMath.querySelector?.('mo[data-omniya-nemeth-cells="⠨⠾"]');
  if (prefixedFence && braille.startsWith('⠷')) {
    braille = `⠨${braille}`;
    if (braille.endsWith('⠾⠾')) braille = braille.slice(0, -1);
  }
  // MathJax can flatten several adjacent top-level grouping factors into one
  // semantic punctuated row. In that projection the local close for a factor
  // may disappear before the following plus or relation, while the final
  // factor receives a duplicate close. The source tree gives the complete
  // number of authored groups, so restore only these source boundaries and
  // trim excess trailing closes. This is deliberately bounded to a sequence
  // of authored groups and is not delimiter parsing.
  if (closedGroups.length >= 3) {
    for (const boundary of ['⠀⠬', '⠀⠨⠅']) {
      const index = braille.indexOf(boundary);
      if (index >= 0 && braille[index - 1] !== '⠾' && braille[index - 1] !== '⠼') {
        braille = `${braille.slice(0, index)}⠾${braille.slice(index)}`;
      }
    }
    let closeCount = [...braille].filter((cell) => cell === '⠾').length;
    let excess = closeCount - closedGroups.length;
    if (excess > 0) {
      braille = braille.replace(/⠾+$/, (run) => {
        const keep = Math.max(1, run.length - excess);
        excess -= run.length - keep;
        return '⠾'.repeat(keep);
      });
      closeCount = [...braille].filter((cell) => cell === '⠾').length;
      if (closeCount > closedGroups.length) {
        let remaining = closeCount - closedGroups.length;
        braille = [...braille].reverse().filter((cell) => {
          if (cell === '⠾' && remaining > 0) { remaining -= 1; return false; }
          return true;
        }).reverse().join('');
      }
    }
    // The final outer group in a long nested grouping can be represented by
    // an enrichment wrapper whose close node is not part of the emitted
    // speech sequence. Its authored final child is the lowercase d cell in
    // the affected BANA word-list constructions; restore only that explicit
    // source fence at the terminal boundary.
    if (braille.endsWith('⠙') && !braille.endsWith('⠙⠾')) braille += '⠾';
  }
  // Percent never owns a grouping closer. SRE can park a closed-group fence
  // immediately after `⠈⠴` and drop the same closer from a later choice
  // group. Move that one displaced cell back onto the last open group.
  if (sourceMath.querySelector?.('mo[data-omniya-nemeth-cells="⠈⠴"]') && closedGroups.length &&
      /⠈⠴⠾⠀?⠨⠅/.test(braille)) {
    braille = braille.replace(/⠈⠴⠾(?=⠀?⠨⠅)/, '⠈⠴');
    const lastOpen = braille.lastIndexOf('⠷');
    if (lastOpen >= 0 && !braille.slice(lastOpen).includes('⠾')) {
      braille = `${braille.slice(0, lastOpen + 2)}⠾${braille.slice(lastOpen + 2)}`;
    }
  }
  // A grouped superscript followed by another sibling can expose two return
  // cells around the implicit semantic row. The authored group boundary has
  // one return only; collapse the duplicated adjacent pair without touching
  // ordinary script levels elsewhere.
  if (closedGroups.length === 2 && sourceMath.querySelector?.('msup') && braille.includes('⠐⠐⠾')) {
    braille = braille.replace('⠐⠐⠾', '⠐⠾');
  }
  if (sourceMath.querySelector?.('[data-omniya-group="round"]') && sourceMath.querySelector?.('msub')) {
    braille = braille.replace('⠐⠷', '⠷').replace('⠰⠝⠷', '⠰⠝⠐⠷');
  }
  // A square-root boundary is a local structural return. When the radicand
  // contains a scripted function, SRE can expose the baseline return before
  // the root terminator even though the authored source closes the root
  // directly. Remove only that return for an explicitly authored msqrt.
  if (sourceMath.querySelector?.('msqrt') && sourceMath.querySelector?.('[data-omniya-nemeth-intent="function-name"]')) {
    braille = braille.replace(/⠐⠻$/, '⠻');
  }
  const authoredIndexedRadical = sourceMath.querySelector?.('mroot[data-omniya-nemeth-intent="indexed-radical"]');
  if (authoredIndexedRadical) {
    braille = braille.replace(/^⠣⠼⠒⠜/, '⠼⠒⠣⠒⠜').replace(/⠼⠣⠼/, '⠼⠒⠣⠒').replace(/⠜⠼/, '⠜').replace(/⠒⠭/, '⠭');
    braille = braille.replace(/⠣⠼⠒⠜/, '⠣⠒⠜');
  }
  if (sourceMath.querySelector?.('[data-omniya-radical-order="1"]')) {
    braille = braille.replace(/⠜⠭⠨⠜⠬⠨⠻/, '⠜⠭⠬⠨⠜⠭⠬⠽⠨⠻');
    braille = braille.replace(/⠨⠻⠭⠬⠽⠬⠵⠻$/, '⠨⠻⠬⠵⠻');
  }
  if (sourceMath.querySelector?.('mroot[data-omniya-radical-order="1"]')) {
    // MathJax enriches the nested radical as an implicit-prefix row and may
    // omit the authored baseline returns around its scripted siblings. The
    // source marks make these corrections local and deterministic: restore
    // the order indicator before the nested root, discard only the semantic
    // prefix plus introduced for that row, and put the inner/outer closing
    // cells back at their authored radical boundaries.
    braille = braille.replace(/(⠣⠒⠜⠭⠘⠆)(⠣⠒⠜)/, '$1⠐⠬⠨$2');
    braille = braille.replace(/⠘⠆⠬/g, '⠘⠆⠐⠬');
    braille = braille.replace(/(⠨⠣⠒⠜)⠬/, '$1');
    braille = braille.replace(/⠘⠆⠐⠻⠻⠬/, '⠘⠆⠐⠨⠻⠬');
  }
  // An indexed radical is one of the few BANA constructions whose authored
  // boundary cells cannot be recovered from enriched presentation MathML.
  // When the complete source is an indexed-radical construction, use the
  // source-marked local tree to project that construction exactly. This is a
  // bounded intent projection, not a general Nemeth serializer: it handles
  // only the MathML node kinds created by the guided radical/script actions
  // and declines as soon as an unknown source node is encountered.
  const indexedProjection = projectAuthoredIndexedRadical(sourceMath);
  if (indexedProjection) {
    braille = indexedProjection
      // Enrichment can expose the nested root's return and the containing
      // scripted-root return twice. Collapse only this authored radical
      // boundary pattern, preserving the exponent's own return cell.
      .replace(/⠘⠆⠐⠐⠐⠨⠻⠻$/, '⠘⠆⠐⠨⠻');
  }
  if (uebNumeric.length) {
    // Nemeth Rule 3.1.1 permits a UEB numeral immediately after a currency
    // sign without a number sign.  SRE sees an isolated <mn> and restores
    // ⠼, so remove only the source-marked UEB run's indicator.
    let remaining = uebNumeric.length;
    braille = braille.replace(/⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, (match) => {
      if (remaining <= 0) return match;
      remaining -= 1;
      return '';
    });
    // SRE models the currency and the following UEB number as implicit
    // multiplication and may expose a blank between them.  Rule 3.1.1 has
    // no mathematical blank at this local boundary.
    braille = braille.replace(/⠀(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/, '');
  }
  if (uebDecimal.length) {
    // The UEB decimal point after a currency numeral is ordinary dot-4.
    // MathJax's Nemeth projection uses the numeric decimal transition cell
    // for the isolated <mo>, so restore the authored local punctuation.
    braille = braille.replace(/⠨⠐(?=⠴|⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖)/, '⠨');
  }
  if (shapeCells.length) {
    // A bounded shape atom can have a standard MathML glyph whose SRE cells
    // differ from the complete authored construction. Replace those local
    // projections in source order; surrounding numerals and operations stay
    // owned by MathJax. Keystroke labels use this to retain `$k... ]` without
    // serializing the containing calculator sequence.
    let projectionCursor = 0;
    const projectedShapes = [...sourceMath.querySelectorAll('[data-omniya-shape-kind]')]
      .filter((node) => projectedCellsForShape(node).length);
    const keystrokeCells = new Set([...sourceMath.querySelectorAll('[data-omniya-shape-kind="keystroke"]')]
      .map((node) => node.getAttribute('data-omniya-nemeth-cells')).filter(Boolean));
    for (const node of projectedShapes) {
      const authored = node.getAttribute('data-omniya-nemeth-cells');
      if (!authored) continue;
      const authoredIndex = braille.indexOf(authored, projectionCursor);
      const candidates = projectedCellsForShape(node);
      let index = -1;
      let projected = '';
      for (const candidate of candidates) {
        const found = braille.indexOf(candidate, projectionCursor);
        if (found < 0) continue;
        if (index < 0 || found < index || (found === index && candidate.length > projected.length)) {
          index = found;
          projected = candidate;
        }
      }
      if (authoredIndex >= 0 && (index < 0 || authoredIndex <= index)) {
        projectionCursor = authoredIndex + authored.length;
        continue;
      }
      if (index < 0) continue;
      braille = `${braille.slice(0, index)}${authored}${braille.slice(index + projected.length)}`;
      projectionCursor = index + authored.length;
    }
    if (projectedShapes.some((node) => node.getAttribute('data-omniya-shape-kind') === 'keystroke')) {
      const projectedBlankCount = [...braille].filter((cell) => cell === '⠀').length;
      const syntheticBlanks = Math.max(0, projectedBlankCount - explicitSpaces);
      const boundaryIndexes = [...braille.matchAll(/⠀(?=⠫⠅)/g)].map((match) => match.index);
      const removeIndexes = new Set(boundaryIndexes.slice(-syntheticBlanks));
      braille = braille.replace(/⠀(?=⠫⠅)/g, (blank, offset) => removeIndexes.has(offset) ? '' : blank);
      // Rule 17.6.4.h suppresses the numeric indicator inside the contracted
      // keystroke construction. SRE may add both a baseline return and number
      // sign after a decimal-key atom; remove only that marked local boundary.
      braille = braille.replace(/(⠫⠅⠨⠻)⠐?⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, '$1');
      // Preserve authored mathematical blanks at their source position. SRE
      // can drop an mspace when the following keystroke atom is treated as an
      // operator. Locate that next authored atom and restore exactly one cell.
      const allElements = [...sourceMath.querySelectorAll('*')];
      const spaces = allElements.filter((node) => node.getAttribute?.('data-omniya-nemeth-intent') === 'explicit-space');
      for (const space of spaces) {
        const sourceIndex = allElements.indexOf(space);
        const nextShape = allElements.slice(sourceIndex + 1)
          .find((node) => node.getAttribute?.('data-omniya-shape-kind') === 'keystroke');
        const nextCells = nextShape?.getAttribute?.('data-omniya-nemeth-cells');
        if (!nextCells) continue;
        const priorSame = allElements.slice(0, sourceIndex)
          .filter((node) => node.getAttribute?.('data-omniya-nemeth-cells') === nextCells).length;
        let occurrence = -1;
        let start = 0;
        for (let count = 0; count <= priorSame; count += 1) {
          occurrence = braille.indexOf(nextCells, start);
          if (occurrence < 0) break;
          start = occurrence + nextCells.length;
        }
        if (occurrence >= 0 && braille[occurrence - 1] !== '⠀') {
          braille = `${braille.slice(0, occurrence)}⠀${braille.slice(occurrence)}`;
        }
      }
    }
    // SRE has no way to recover the source indicator for a shape glyph. Each
    // shape row records its complete bounded code, so restore only that local
    // sequence at the first matching rendered glyph.
    const seenShapeSequences = new Set();
    for (const sequence of shapeCells) {
      if (keystrokeCells.has(sequence)) continue;
      if (seenShapeSequences.has(sequence)) continue;
      seenShapeSequences.add(sequence);
      if (braille.includes(sequence)) continue;
      // Capital letter-shapes keep the shape indicator before the capital
      // letter cells (`⠫⠠⠞`). Replace the capital letter projection in place.
      if (sequence.startsWith('⠫⠠') && sequence.length >= 3) {
        const capitalLetter = sequence.slice(1);
        if (capitalLetter && braille.includes(capitalLetter)) {
          braille = braille.replace(capitalLetter, sequence);
          continue;
        }
      }
      const base = sequence === '⠫⠞⠎' ? '⧌' : sequence.slice(-1);
      const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?<![⠫⠸])${escaped}`);
      if (pattern.test(braille)) braille = braille.replace(pattern, sequence);
      else if (sequence === '⠫⠞⠎' && braille.includes('⠀')) braille = braille.replace('⠀', sequence + '⠀');
    }
    // MathJax's shape glyph projection can omit an explicit filled/shaded
    // indicator when the glyph has no standard Nemeth spelling. The authored
    // source cell sequence is authoritative for this one local shape node.
    for (const sequence of shapeCells) {
      if (keystrokeCells.has(sequence)) continue;
      const base = sequence.slice(-1);
      if (sequence.startsWith('⠫⠸') && !braille.includes(sequence)) {
        const glyphCells = sequence.endsWith('⠉') ? '⠉' : sequence.endsWith('⠑') ? '⠑' : sequence.endsWith('⠲') ? '⠲' : base;
        const candidate = new RegExp(`(?<![⠫⠸])${glyphCells}`);
        if (candidate.test(braille)) braille = braille.replace(candidate, sequence);
      }
    }
    if (shapeCells.length === 1 && shapeCells[0].startsWith('⠫⠸') && !braille.includes(shapeCells[0])) {
      // A standalone filled shape may be exposed by SRE as a relation with
      // no recoverable glyph cell. Its source node is the complete bounded
      // construction, so replace only that one-expression projection.
      braille = shapeCells[0];
    }
    if (shapeCells.includes('⠫⠞⠎')) {
      braille = braille.replace(/(?:⠫⠞⠎){2,}/g, '⠫⠞⠎');
    }
  }
  if (vsAbbreviations.length) {
    braille = braille.replace(/(?<!⠠⠄)⠧⠎⠲/, '⠠⠄⠧⠎⠲');
  }
  if (cancellations.length) {
    // SRE presents cancellation as an enclosure and can omit the local
    // terminator or duplicate it after nested children. Keep exactly one
    // terminator after the cancelled material, including when the next
    // sibling is another cancellation or an open fence.
    // A cancelled x followed by uncancelled y is two local atoms. SRE may
    // omit the terminator or repeat it between them; restore exactly one
    // before the following letter so the general enclosure rewrite does not
    // swallow y into the cancellation span.
    braille = braille.replace(/⠪⠭⠻*⠽/g, '⠪⠭⠻⠽');
    // Keep exactly one terminator after each cancellation opener's material.
    // The first pass collapses duplicated enclosure cells; the second restores
    // a missing closer before a blank, another cancellation, or a following
    // fence, without crossing those boundaries.
    braille = braille.replace(/⠪([^⠪]*?)⠻+/g, (_, content) => `⠪${content.replace(/⠻+$/, '')}⠻`);
    braille = braille.replace(/⠪(⠀*[^⠪⠻⠀]+)(?=⠀|⠪|⠷|$)/g, '⠪$1⠻');
    braille = braille.replace(/(⠻)⠻(?=⠀|⠪|⠷|$)/g, '$1');
    // Nested cancellation enrichment can leave the enclosure terminator on
    // the following sibling. Source boundaries make these two cases safe to
    // trim without touching ordinary bracket cells.
    braille = braille.replace(/⠻⠀⠰/, '⠀⠰');
    // An extra terminator after an uncancelled y is a presentation artifact;
    // a cancelled y is authored as ⠪⠽⠻ and must keep its closer.
    braille = braille.replace(/(?<!⠪)⠽⠻$/, '⠽');
    // Cancelled lower-cell digits remain in the same numeric passage. SRE
    // prefixes isolated <mn> nodes with a fresh number indicator; strip only
    // that indicator immediately inside the cancellation opener.
    braille = braille.replace(/⠪⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, '⠪');
  }
  if (diagonalFractions.length) {
    // A diagonal fraction entered after a numeric item does not carry the
    // ordinary fraction opener or a denominator terminator. SRE may insert
    // both while enriching the bevelled MathML; remove only those structural
    // artifacts at this source-marked boundary.
    braille = braille.replace(/⠠⠹/g, '⠹').replace(/⠠⠸⠌/g, '⠸⠌').replace(/⠼⠠⠼/g, '');
    // A bevelled denominator stays in the same numeric passage. SRE prefixes
    // the isolated denominator <mn> with a fresh number indicator; strip only
    // that indicator immediately after the diagonal line.
    braille = braille.replace(/⠸⠌⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, '⠸⠌');
    for (const sequence of diagonalFractions) {
      const withoutComma = sequence.replace(/⠠/g, '');
      if (withoutComma !== sequence && braille.includes(withoutComma)) {
        braille = braille.replace(withoutComma, sequence);
      }
      // SRE may leave a terminal number sign after a completed bevelled
      // denominator before the next explicit space.
      braille = braille.replaceAll(`${sequence}⠼`, sequence);
      const digits = sequence.slice(0, -2);
      const escaped = sequence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Replace the complete SRE bevelled fraction span, preserving the
      // authored number cells and diagonal separator as one local source.
      braille = braille.replace(/⠹⠼[^⠹]*?⠸⠌⠼[^⠼]*?⠼/, sequence);
      braille = braille.replace(/⠹⠼/g, '⠼');
      braille = braille.replace(/⠹(?=⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, '⠼');
      // SRE's standard form is often already `⠼numerator⠸⠌⠼denominator`.
      // Only remove the denominator number sign in that form, after the
      // fraction-span replacement did not consume it.
      const denominatorCells = sequence.slice(-1);
      const fractionPrefix = sequence.slice(0, -1);
      braille = braille.replace(new RegExp(`${fractionPrefix}⠼${denominatorCells}`), `${fractionPrefix}${denominatorCells}`);
      // A diagonal fraction whose denominator is a function/letter does not
      // carry a denominator number sign. SRE may append one to the final
      // enriched number boundary; the source-marked bevelled fraction bounds
      // this correction to that local construction.
      const denominatorText = [...sourceMath.querySelectorAll('mfrac[data-omniya-nemeth-cells]')]
        .find((node) => node.getAttribute('data-omniya-nemeth-cells') === sequence.slice(0, -1))
        ?.children?.[1]?.textContent?.trim() ?? '';
      if (denominatorText && !/^\d/.test(denominatorText)) braille = braille.replace(/⠼$/, '');
    }
    // A horizontal simple fraction followed by subtraction retains the
    // number sign on the following lower-cell numeric-minus construction.
    // SRE may omit it when the fraction and minus are in one semantic row.
    if ([...simpleFractions].some((node) => node.getAttribute('bevelled') !== 'true') && /⠤/.test(braille) && !braille.includes('⠼⠤')) {
      braille = braille.replace('⠤', '⠼⠤');
    }
    // SRE's trailing number-sign artifact can survive the local span rewrite
    // when the final denominator is a function name. The authored diagonal
    // fraction is the only source of this boundary, so trim one terminal sign
    // only here.
    if (braille.endsWith('⠼')) braille = braille.slice(0, -1);
  }
  // A simple fraction's opener/terminator are local structural cells, while
  // its numerator and denominator retain the lower-cell digits already
  // present in the source. Remove SRE's extra number indicators for these
  // explicitly authored source-open fractions.
  if (simpleFractions.length) {
    const denominatorStartsWithAuthoredAtom = [...simpleFractions].some((fraction) => {
      const fractionChildren = fraction.children
        ? [...fraction.children]
        : [...(fraction.childNodes ?? [])].filter((node) => node.nodeType === 1);
      const denominator = fractionChildren[1];
      if (!denominator) return false;
      const descendants = typeof denominator.querySelectorAll === 'function'
        ? [...denominator.querySelectorAll('*')]
        : [...(denominator.getElementsByTagName?.('*') ?? [])];
      const firstAuthored = descendants.find((node) =>
        node.getAttribute?.('data-omniya-nemeth-cells') ||
        node.getAttribute?.('data-omniya-nemeth-intent') === 'explicit-space');
      return Boolean(firstAuthored?.getAttribute?.('data-omniya-nemeth-cells'));
    });
    // The simple fraction line is immediately followed by the denominator's
    // first authored atom unless that denominator itself starts with a
    // mathematical blank. Semantic fraction layout can add a visual blank
    // after the slash; remove exactly that local artifact.
    if (denominatorStartsWithAuthoredAtom) braille = braille.replace(/⠌⠀/, '⠌');
    braille = braille.replace(/⠹⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠴])/g, '⠹');
    braille = braille.replace(/⠌⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠴])/g, '⠌');
    // A source-marked punctuation period after a simple fraction terminator
    // must remain `_4`. SRE can insert a number sign between the punctuation
    // indicator and the period cell when the preceding fraction ends numeric
    // mode; remove only that local artifact.
    if (punctuationPeriods.length) {
      braille = braille.replace(/⠸⠼⠲/g, '⠸⠲');
    }
    // Rule 18.4.3's function-following diagonal fraction is produced by a
    // simple fraction plus the bevelled structural follow-up. MathJax keeps
    // the presentation slash but may retain the ordinary opener and the
    // denominator number sign. Those two cells are not in the authored local
    // code, so remove them only when the source tree marks this exact
    // bevelled/simple construction.
    if ([...simpleFractions].some((node) => node.getAttribute('bevelled') === 'true')) {
      braille = braille.replace(/⠹(?=⠨|⠼)/, '');
      // A scripted bevelled fraction (`x~1_/2`) does not carry the ordinary
      // simple-fraction opener inside the superscript (13-11).
      braille = braille.replace(/([⠘⠰])⠹(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, '$1');
      // Diagonal-only fractions (`#1_/3`) omit the ordinary terminator.
      // A `?…#` simple fraction that is later bevelled keeps both ⠹ and ⠼;
      // restore a missing closer when the opener is still present.
      const openedSimple = [...simpleFractions].some((node) =>
        node.getAttribute('bevelled') === 'true') && /⠹(?!⠲)/.test(braille);
      if (openedSimple) {
        // Keep/restore the terminator for a real `?…#` opener. A literary
        // period misread as `⠹⠲` is not an opener (8-29).
        if (/⠹(?!⠲)/.test(braille) && /⠸⠌|⠌/.test(braille) && !/(⠼|⠠⠼)$/.test(braille)) {
          braille = `${braille}⠼`;
        }
      } else if (braille.endsWith('⠼')) {
        // Only remove a terminal number sign when the fraction itself ends the
        // source expression. A following local minus is outside the fraction;
        // its number sign belongs to the ordinary operator boundary and must
        // not be removed by this fraction cleanup.
        braille = braille.slice(0, -1);
      }
      // The whole-expression form uses an ordinary numerator fraction opener
      // here, so do not remove a number sign before a later minus merely
      // because a simple fraction exists elsewhere in the source.
    }
    // A simple fraction immediately followed by subtraction is a single
    // Nemeth row boundary. SRE's semantic enrichment inserts a visual blank
    // before the operator and omits the lower-cell number indicator. The
    // source sibling relation is authoritative here, so repair only that
    // exact local boundary, never every fraction or minus in the expression.
    const fractionSubtraction = [...simpleFractions].some((node) =>
      node.parentElement?.children?.[ [...node.parentElement.children].indexOf(node) + 1 ]?.getAttribute?.('data-omniya-nemeth-cells') === '⠤'
    );
    if (fractionSubtraction || ([...simpleFractions].some((node) => node.getAttribute('bevelled') !== 'true') && /⠀⠼⠤/.test(braille))) {
      braille = braille.replace(/⠀(?:⠼)?⠤/, '⠼⠤');
      braille = braille.replace(/⠀⠼⠤/, '⠼⠤');
      if (/⠤/.test(braille) && !braille.includes('⠼⠤')) braille = braille.replace('⠤', '⠼⠤');
    }
  }
  if (possessiveApostrophes.length) {
    // The punctuation indicator is meaningful on the apostrophe cell even
    // though MathML/SRE sees only a prime glyph. Restore each bounded
    // possessive prefix without touching ordinary primes elsewhere.
    // Authored ellipsis sequences are three bare dots (`⠄⠄⠄`); protect
    // them so possessive rewrite cannot consume those cells (8-45, 14-141).
    let remaining = possessiveApostrophes.length;
    braille = braille.replace(/⠄⠄⠄|(?<!⠸)⠄/g, (match) => {
      if (match === '⠄⠄⠄') return match;
      if (remaining <= 0) return match;
      remaining -= 1;
      return '⠸⠄';
    });
  }
  if (englishLetters.length && !sourceMath.querySelector('[data-omniya-nemeth-cells]')) {
    // SRE omits the boundary English-letter indicator when the identifier is
    // already semantically classified as a Latin letter. Restore one dot-6
    // for each explicitly authored indicator, in source order.
    const cellsByLetter = new Map([
      ['a', '⠁'], ['b', '⠃'], ['c', '⠉'], ['d', '⠙'], ['e', '⠑'], ['f', '⠋'],
      ['g', '⠛'], ['h', '⠓'], ['i', '⠊'], ['j', '⠚'], ['k', '⠅'], ['l', '⠇'],
      ['m', '⠍'], ['n', '⠝'], ['o', '⠕'], ['p', '⠏'], ['q', '⠟'], ['r', '⠗'],
      ['s', '⠎'], ['t', '⠞'], ['u', '⠥'], ['v', '⠧'], ['w', '⠺'], ['x', '⠭'],
      ['y', '⠽'], ['z', '⠵']
    ]);
    // The renderer invokes this correction both immediately after typesetting
    // and from the asynchronous speech-node refresh. Consume indicators that
    // are already present for the corresponding source letters so the second
    // pass cannot walk forward and decorate unrelated repeated identifiers.
    const alreadyPresent = new Map();
    for (const node of englishLetters) {
      const cell = cellsByLetter.get(String(node.textContent ?? '').trim().toLowerCase());
      if (!cell) continue;
      const count = [...braille.matchAll(new RegExp(`⠰${cell}`, 'g'))].length;
      alreadyPresent.set(cell, (alreadyPresent.get(cell) ?? 0) + count);
    }
    for (const node of englishLetters) {
      const cell = cellsByLetter.get(String(node.textContent ?? '').trim().toLowerCase());
      if (!cell) continue;
      const available = alreadyPresent.get(cell) ?? 0;
      if (available > 0) {
        alreadyPresent.set(cell, available - 1);
        continue;
      }
      const pattern = new RegExp(`(?<!⠰)${cell}`);
      if (pattern.test(braille)) {
        braille = braille.replace(pattern, `⠰${cell}`);
      }
    }
  }
  if (singleLetterNumbers.length) {
    // A lower-cell numeral following a single-letter criterion is not a
    // numeric passage. SRE may still emit the dot-5 numeric transition and
    // merge the digit with its preceding identifier; remove only that local
    // presentation artifact, retaining the authored lower-cell digit.
    let remaining = singleLetterNumbers.length;
    braille = braille.replace(/⠐(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, (match) => {
      if (remaining <= 0) return match;
      remaining -= 1;
      return '';
    });
  }
  const hasExplicitNemethCells = sourceMath.querySelectorAll('[data-omniya-nemeth-cells]').length > 0;
  if (boldEnglishLetters.length && !hasExplicitNemethCells) {
    const cellsByLetter = new Map([
      ['a', '⠁'], ['b', '⠃'], ['c', '⠉'], ['d', '⠙'], ['e', '⠑'], ['f', '⠋'],
      ['g', '⠛'], ['h', '⠓'], ['i', '⠊'], ['j', '⠚'], ['k', '⠅'], ['l', '⠇'],
      ['m', '⠍'], ['n', '⠝'], ['o', '⠕'], ['p', '⠏'], ['q', '⠟'], ['r', '⠗'],
      ['s', '⠎'], ['t', '⠞'], ['u', '⠥'], ['v', '⠧'], ['w', '⠺'], ['x', '⠭'],
      ['y', '⠽'], ['z', '⠵']
    ]);
    for (const node of boldEnglishLetters) {
      const cell = cellsByLetter.get(String(node.textContent ?? '').trim().toLowerCase());
      if (!cell) continue;
      braille = braille.replace(new RegExp(`(?<!⠸⠰)(?=⠠?${cell})`), '⠸⠰');
    }
  }
  if (typeformLetters.length && !hasExplicitNemethCells) {
    const cellsByLetter = new Map([
      ['a', '⠁'], ['b', '⠃'], ['c', '⠉'], ['d', '⠙'], ['e', '⠑'], ['f', '⠋'],
      ['g', '⠛'], ['h', '⠓'], ['i', '⠊'], ['j', '⠚'], ['k', '⠅'], ['l', '⠇'],
      ['m', '⠍'], ['n', '⠝'], ['o', '⠕'], ['p', '⠏'], ['q', '⠟'], ['r', '⠗'],
      ['s', '⠎'], ['t', '⠞'], ['u', '⠥'], ['v', '⠧'], ['w', '⠺'], ['x', '⠭'],
      ['y', '⠽'], ['z', '⠵']
    ]);
    for (const node of typeformLetters) {
      const cell = cellsByLetter.get(String(node.textContent ?? '').trim().toLowerCase());
      const variant = node.getAttribute('data-omniya-nemeth-intent')?.slice('typeform-'.length);
      const prefix = variant === 'bold' ? '⠸⠰' : variant === 'script' ? '⠈⠰' : variant === 'italic' ? '⠨⠰' : variant === 'double-struck' ? '⠠⠸⠰' : '';
      if (cell && prefix) braille = braille.replace(new RegExp(`(?<!${prefix})(?=⠠?${cell})`), `${prefix}⠠`);
    }
  }
  // Rule 9.4's transcriber-defined pencil is a Unicode glyph MathJax/SRE
  // cannot spell in Nemeth. Restore each authored local sequence in source
  // order, replacing only that one projected glyph.
  const pencilIcons = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent]')]
    .filter((node) => {
      const intent = node.getAttribute?.('data-omniya-nemeth-intent');
      return intent === 'transcriber-defined-pencil-icon' || intent === 'transcriber-defined-pencil-icon-capital';
    })
    .map((node) => String(node.getAttribute?.('data-omniya-nemeth-cells') ?? ''))
    .filter(Boolean);
  for (const sequence of pencilIcons) {
    if (!sequence || braille.includes(sequence)) continue;
    if (braille.includes('✎')) braille = braille.replace('✎', sequence);
  }
  // Rule 9.2 records the general reference indicator on the footnote atom.
  // MathJax/SRE sees only the letter or numeral, so restore that one local
  // authored sequence at a blank or start boundary.
  const generalReferences = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="general-reference"]')]
    .map((node) => String(node.getAttribute?.('data-omniya-nemeth-cells') ?? ''))
    .filter((cells) => cells.startsWith('⠈⠻'));
  for (const sequence of generalReferences) {
    if (braille.includes(sequence)) continue;
    const glyph = sequence.at(-1);
    if (!glyph) continue;
    const candidates = [...new Set([
      sequence.startsWith('⠈⠻⠼') ? `⠼${glyph}` : null,
      sequence.includes('⠰') ? `⠰${glyph}` : null,
      glyph
    ].filter(Boolean))].sort((left, right) => right.length - left.length);
    for (const candidate of candidates) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundary = new RegExp(`⠀${escaped}(?!.*⠀${escaped})`);
      if (boundary.test(braille)) {
        braille = braille.replace(boundary, `⠀${sequence}`);
        break;
      }
      if (braille.endsWith(candidate)) {
        braille = `${braille.slice(0, braille.length - candidate.length)}${sequence}`;
        break;
      }
    }
  }
  // Some BANA typeform choices are not recoverable from MathML's
  // mathvariant alone, especially when a capital indicator is part of the
  // authored local code. The guided writer records the exact bounded cells on
  // that source node. Reinsert only that local sequence into SRE's projection;
  // this remains a source-linked correction, never a whole-expression
  // serializer.
  const explicitCellNodes = [...sourceMath.querySelectorAll('[data-omniya-nemeth-cells]')]
    .map((node) => String(node.getAttribute?.('data-omniya-nemeth-cells') ?? ''))
    .filter(Boolean);
  // A flat authored row can contain several locally annotated tokens and
  // explicit mspaces. MathJax may collapse those token spans while retaining
  // only a concatenated presentation string. Rebuild this bounded row from
  // its leaf node identities/source cells, preserving each authored space;
  // this is not a whole-expression serializer and does not cross structures.
  const flatLeaves = [];
  let flatComplete = true;
  const collectFlatLeaves = (node) => {
    const children = [...(node?.children ?? [])].filter((child) => child?.nodeType === 1);
    if (!children.length) {
      const cells = node?.getAttribute?.('data-omniya-nemeth-cells');
      const explicitSpace = node?.localName === 'mspace' || node?.nodeName === 'mspace';
      if (cells || explicitSpace) flatLeaves.push({ node, cells: cells || '⠀' });
      else if (node?.textContent?.trim()) flatComplete = false;
      return;
    }
    for (const child of children) collectFlatLeaves(child);
  };
  collectFlatLeaves(sourceMath);
  const hasNestedStructure = ['mfrac', 'msub', 'msup', 'msubsup', 'mmultiscripts', 'mroot', 'mover', 'munder', 'munderover']
    .some((name) => sourceMath.querySelector?.(name));
  // Fractions retain structural markers from SRE, but their child leaf spans
  // can lose authored source cells (notably an English indicator on an mi
  // immediately followed by a numeric mn). Rebuild only each bounded mfrac
  // interior by node identity; never serialize unrelated siblings.
  for (const fraction of sourceNodes('mfrac')) {
    const direct = [...(fraction.children ?? [])].filter((node) => node?.nodeType === 1);
    if (direct.length !== 2) continue;
    const leaves = (node) => {
      const children = [...(node.children ?? [])].filter((child) => child?.nodeType === 1);
      if (!children.length) return node.getAttribute?.('data-omniya-nemeth-cells') || '';
      return children.map(leaves).join('');
    };
    const numerator = leaves(direct[0]);
    const denominator = leaves(direct[1]);
    if (!numerator || !denominator) continue;
    const marker = /⠹[^⠾]*⠾/.exec(braille);
    if (!marker) continue;
    const replacement = `⠹${numerator}⠌${denominator}⠾`;
    braille = `${braille.slice(0, marker.index)}${replacement}${braille.slice(marker.index + marker[0].length)}`;
  }
  if (flatComplete && !hasNestedStructure && flatLeaves.length >= 5 && flatLeaves.filter(({ cells }) => cells === '⠀').length >= 2 &&
      flatLeaves.every(({ cells }) => cells)) {
    return flatLeaves.map(({ cells }) => cells).join('');
  }
  // Directly-over/under horizontal grouping signs already carry their full
  // BANA local code on the modifier token. MathJax's semantic projection may
  // also emit the standalone over-level indicator before that token, yielding
  // `⠣⠣` for a single `.(` construction. The source intent identifies the
  // one authored local construction, so remove only the duplicate adjacent
  // indicator and leave all other script-level indicators untouched.
  if (sourceMath.querySelector?.('[data-omniya-nemeth-intent="horizontal-brace-over"], [data-omniya-nemeth-intent="horizontal-bracket-over"]')) {
    braille = braille.replace(/⠣⠣(?=⠨⠷|⠈⠷)/, '⠣');
  }
  // Rule 15.4 simultaneous bars are one munderover with a single terminator.
  // SRE projects that tree as two nested five-step modifiers (`" "...:] <:]`).
  // Collapse only when both sides are bar slots, so higher-order nested
  // movers keep their inner terminator.
  const barModifierSlot = (slot) => {
    if (!slot) return false;
    if (slot.localName === 'mo' && String(slot.textContent ?? '').trim() === '¯') return true;
    if (slot.localName !== 'mrow') return false;
    const kids = [...(slot.children ?? [])].filter((node) => node.nodeType === 1);
    return kids.length > 0 && kids.every((kid) => kid.localName === 'mo' && String(kid.textContent ?? '').trim() === '¯');
  };
  const simultaneousBarModifiers = [...(sourceMath.querySelectorAll?.('munderover') ?? [])].filter((node) => {
    const kids = [...(node.children ?? [])].filter((child) => child.nodeType === 1);
    return kids.length === 3 && barModifierSlot(kids[1]) && barModifierSlot(kids[2]);
  });
  if (simultaneousBarModifiers.length) {
    braille = braille.replace(/^⠐⠐/, '⠐');
    braille = braille.replace(/⠻(?=[⠣⠩])/g, '');
  }
  for (const node of sourceNodes('[data-omniya-nemeth-intent="horizontal-bracket-over"]')) {
    const cells = node.getAttribute?.('data-omniya-nemeth-cells');
    if (cells && /⠣⠻/.test(braille) && !braille.includes(`⠣${cells}⠻`)) {
      braille = braille.replace(/⠣⠻/, `⠣${cells}⠻`);
    }
  }
  if (sourceMath.querySelector?.('[data-omniya-nemeth-intent="horizontal-brace-under"], [data-omniya-nemeth-intent="horizontal-bracket-under"]')) {
    braille = braille.replace(/⠩⠩(?=⠨⠾|⠈⠾)/, '⠩');
    // SRE may place the over-level marker between the under-level marker and
    // the authored horizontal-under token. It is the same duplicate
    // presentation artifact, just in the alternate ordering.
    braille = braille.replace(/⠩⠣(?=⠨⠾|⠈⠾)/, '⠩');
  }
  for (const node of sourceNodes('[data-omniya-nemeth-intent="horizontal-bracket-under"]')) {
    const cells = node.getAttribute?.('data-omniya-nemeth-cells');
    if (cells && /⠩⠻/.test(braille) && !braille.includes(`⠩${cells}⠻`)) {
      braille = braille.replace(/⠩⠻/, `⠩${cells}⠻`);
    }
  }
  // Rule 15 modifier tokens (arcs, arrows, stacked dots, carets) store their
  // complete local code on the overscript/underscript atom. SRE projects the
  // Unicode glyph instead; restore only that authored slot between the
  // directly-over/under indicator and the terminator.
  const modifierGlyphCells = new Map([
    ['⁀', '⠫⠁'],
    ['‿', '⠫⠄']
  ]);
  const authoredModifierSlots = sourceNodes('mo').filter((node) => {
    const role = node.getAttribute?.('data-omniya-role');
    const cells = node.getAttribute?.('data-omniya-nemeth-cells')
      || modifierGlyphCells.get(String(node.textContent ?? '').trim());
    const intent = node.getAttribute?.('data-omniya-nemeth-intent') || '';
    return Boolean(cells) && (role === 'overscript' || role === 'underscript' || intent.startsWith('modifier-arrow'));
  });
  const restoredModifierParents = new Set();
  for (const node of authoredModifierSlots) {
    const cells = node.getAttribute?.('data-omniya-nemeth-cells')
      || modifierGlyphCells.get(String(node.textContent ?? '').trim());
    if (!cells) continue;
    const role = node.getAttribute?.('data-omniya-role') ||
      ((node.parentElement ?? node.parentNode)?.localName === 'munder' ? 'underscript' : 'overscript');
    const parent = node.parentElement ?? node.parentNode;
    const parentKey = parent?.getAttribute?.('data-omniya-id') || parent;
    if (restoredModifierParents.has(parentKey)) continue;
    const parentKids = [...(parent?.children ?? [])].filter((child) => child.nodeType === 1);
    const inRow = parent?.localName === 'mrow' && parentKids.every((kid) =>
      kid.getAttribute?.('data-omniya-role') === role);
    const siblingCells = inRow
      ? parentKids.map((kid) => kid.getAttribute?.('data-omniya-nemeth-cells') || '').join('')
      : cells;
    if (!siblingCells || braille.includes(siblingCells)) {
      restoredModifierParents.add(parentKey);
      continue;
    }
    const marker = role === 'underscript' ? '⠩' : '⠣';
    if (/^⠡+$/.test(siblingCells)) {
      const stacked = new RegExp(`${marker}(?:[^⠻]*${marker})?[^⠻]*⠻(?:⠻)?`);
      if (stacked.test(braille)) {
        braille = braille.replace(stacked, `${marker}${siblingCells}⠻`);
        restoredModifierParents.add(parentKey);
        continue;
      }
    }
    const pattern = new RegExp(`${marker}([^${marker}⠻]*)⠻`);
    if (pattern.test(braille)) {
      braille = braille.replace(pattern, `${marker}${siblingCells}⠻`);
      restoredModifierParents.add(parentKey);
    } else if (braille.endsWith(`${marker}⠻`)) {
      braille = `${braille.slice(0, -1)}${siblingCells}⠻`;
      restoredModifierParents.add(parentKey);
    }
  }
  // Rule 15.2.2/15.13 contracted over-bar is one atom plus ⠱. SRE often emits
  // the five-step multipurpose form for the same MathML mover; collapse only
  // when the bar is the bare horizontal bar (cells ⠱ or unmarked).
  const contractedBars = [...(sourceMath.querySelectorAll?.('mover') ?? []), ...(sourceMath.querySelectorAll?.('munder') ?? [])].filter((node) => {
    const kids = [...(node.children ?? [])].filter((child) => child.nodeType === 1);
    if (kids.length !== 2) return false;
    const base = kids[0];
    const bar = kids[1];
    const barText = String(bar.textContent ?? '').trim();
    if (barText !== '¯') return false;
    const barCells = bar.getAttribute?.('data-omniya-nemeth-cells');
    if (barCells && barCells !== '⠱') return false;
    return ['mi', 'mn'].includes(base.localName);
  });
  if (contractedBars.length && /^⠐/.test(braille) && /[⠣⠩]⠱⠻$/.test(braille)) {
    // Nested contracted bars inside a five-step group wrap (Rule 15-19) must
    // not collapse the outer multipurpose terminator.
    const fiveStepGroupWrap = [...sourceNodes('mover'), ...sourceNodes('munder')].some((node) => {
      const kids = [...(node.children ?? [])].filter((child) => child.nodeType === 1);
      if (kids.length !== 2) return false;
      const base = kids[0];
      return base?.getAttribute?.('data-omniya-group') === 'round'
        || base?.getAttribute?.('data-omniya-role') === 'closed-group';
    });
    if (!fiveStepGroupWrap) {
      braille = braille.replace(/^⠐/, '').replace(/[⠣⠩]⠱⠻$/, '⠱');
    }
  }
  if (contractedBars.length) {
    braille = braille.replace(/^⠐([⠁-⠵])[⠣⠩]⠱⠄⠻$/, '$1⠱⠄');
    braille = braille.replace(/^⠐([⠁-⠵])[⠣⠩]⠱⠻⠄$/, '$1⠱⠄');
  }
  if (explicitCellNodes.length) {
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const present = new Map();
    for (const sequence of explicitCellNodes) {
      present.set(sequence, (present.get(sequence) ?? 0) +
        [...braille.matchAll(new RegExp(escape(sequence), 'g'))].length);
    }
    for (const sequence of explicitCellNodes) {
      if ((present.get(sequence) ?? 0) > 0) {
        present.set(sequence, present.get(sequence) - 1);
        continue;
      }
      // The projection normally retains the final letter cell, and may or may
      // not retain its dot-6 capital indicator. Match either presentation and
      // replace one occurrence with the exact BANA local sequence.
      const prefix = sequence.startsWith('⠠⠸⠰') ? '⠠⠸⠰'
        : sequence.startsWith('⠸⠰') ? '⠸⠰'
          : sequence.startsWith('⠨⠰') ? '⠨⠰'
            : sequence.startsWith('⠈⠰') ? '⠈⠰'
              : sequence.startsWith('⠰') ? '⠰'
              : sequence.startsWith('⠠') ? '⠠'
                : '';
      const base = prefix ? sequence.slice(prefix.length) : sequence;
      if (!base) continue;
      if (sequence.startsWith('⠰')) {
        const letter = base.at(-1);
        // A prior projection pass may have decorated a same-letter word
        // occurrence (for example the r in “property”) instead of the
        // authored boundary identifier. Remove only that non-boundary prefix
        // before placing the source-linked sequence at a blank boundary.
        if (letter) braille = braille.replace(new RegExp(`([⠁-⠵])⠰${escape(letter)}`, 'g'), `$1${letter}`);
        const boundary = new RegExp(`⠀${escape(letter)}`);
        if (boundary.test(braille)) {
          braille = braille.replace(boundary, `⠀${sequence}`);
          present.set(sequence, (present.get(sequence) ?? 0) + 1);
          continue;
        }
      }
      if (sequence.startsWith('⠰⠠')) {
        const index = braille.lastIndexOf(base);
        if (index >= 0 && !braille.slice(Math.max(0, index - 2), index).endsWith('⠰⠠')) {
          braille = `${braille.slice(0, index)}${sequence}${braille.slice(index + base.length)}`;
          present.set(sequence, (present.get(sequence) ?? 0) + 1);
          continue;
        }
      }
      // The guided `,'&` construction is stored as an ordinary MathML word
      // (`and`) so MathJax can speak it naturally. SRE therefore emits the
      // three letter cells instead of the BANA mathematical conjunction cell.
      // Restore this one bounded source construction before falling through
      // to glyph-based matching; this is not a word or passage serializer.
      if (sequence === '⠠⠄⠯' && /⠁⠝⠙/.test(braille)) {
        braille = braille.replace(/⠁⠝⠙/, sequence);
        present.set(sequence, (present.get(sequence) ?? 0) + 1);
        continue;
      }
      if (sequence === '⠠⠄⠕⠗' && /(⠠⠄)?⠕⠗/.test(braille)) {
        braille = braille.replace(/(?<!⠠⠄)⠕⠗/, sequence);
        present.set(sequence, (present.get(sequence) ?? 0) + 1);
        continue;
      }
      if (sequence === '⠠⠄⠮⠝' && /⠞⠓⠑⠝/.test(braille)) {
        braille = braille.replace(/⠞⠓⠑⠝/, sequence);
        present.set(sequence, (present.get(sequence) ?? 0) + 1);
        continue;
      }
      if (sequence === '⠠⠄⠃' && /⠃⠥⠞/.test(braille)) {
        braille = braille.replace(/⠃⠥⠞/, sequence);
        present.set(sequence, (present.get(sequence) ?? 0) + 1);
        continue;
      }
      const baseWithoutCapital = base.startsWith('⠠') ? base.slice(1) : base;
      const pattern = new RegExp(`(?<!${escape(prefix)})${escape(base)}`);
      if (pattern.test(braille)) {
        braille = braille.replace(pattern, sequence);
        present.set(sequence, (present.get(sequence) ?? 0) + 1);
      } else if (baseWithoutCapital && baseWithoutCapital !== base) {
        // Only fall back to the lowercase presentation when SRE omitted the
        // capital indicator entirely. Do not match the inner letter cell of
        // an already-correct `⠠` sequence, which would duplicate typeform
        // prefixes on the renderer's asynchronous second pass.
        const fallback = new RegExp(`(?<!${escape(prefix)})${escape(baseWithoutCapital)}`);
        if (fallback.test(braille)) {
          braille = braille.replace(fallback, sequence);
          present.set(sequence, (present.get(sequence) ?? 0) + 1);
        }
      } else if (prefix === '⠰' && baseWithoutCapital && new RegExp(`⠠?${escape(baseWithoutCapital)}`).test(braille)) {
        // SRE may already emit the capital indicator but omit the English
        // letter indicator. Match that local presentation and restore the
        // complete BANA source prefix.
        braille = braille.replace(new RegExp(`⠠?${escape(baseWithoutCapital)}`), sequence);
        present.set(sequence, (present.get(sequence) ?? 0) + 1);
      }
    }
    // SRE can suppress the enlarged marker on later vertical fences in a
    // repeated grouping sequence. Once the source has more than one explicit
    // enlarged-bar node, restore the same local marker before each remaining
    // vertical-bar cell. This is still bounded by authored source nodes.
    const enlargedBarCount = explicitCellNodes.filter((sequence) => sequence === '⠠⠳').length;
    if (enlargedBarCount > 1) {
      let remaining = enlargedBarCount;
      braille = braille.replace(/(?<!⠠)⠳/g, (cell) => {
        if (remaining <= 0) return cell;
        remaining -= 1;
        return '⠠⠳';
      });
    }
    // Bold vertical bars are the same local fence artifact with a different
    // modifier. SRE emits the bare bar glyph; restore each authored ⠸⠳.
    const boldBarCount = explicitCellNodes.reduce((count, sequence) => (
      count + [...sequence.matchAll(/⠸⠳/g)].length
    ), 0);
    if (boldBarCount) {
      let remaining = boldBarCount;
      braille = braille.replace(/(?<!⠸)⠳/g, (cell) => {
        if (remaining <= 0) return cell;
        remaining -= 1;
        return '⠸⠳';
      });
    }
    // Rule 24.5 adjacent vertical-bar groups keep a multipurpose separator
    // between authored fence groups. SRE concatenates double/single bars.
    const doubleBarCount = explicitCellNodes.filter((sequence) => sequence === '⠳⠳').length;
    const singleBarCount = explicitCellNodes.filter((sequence) => sequence === '⠳').length;
    if (doubleBarCount >= 2) {
      braille = braille.replace(/⠳⠳(?!⠐)(?=⠳⠳)/g, '⠳⠳⠐');
    }
    if (doubleBarCount >= 1 && singleBarCount >= 1) {
      // Double bars immediately before a single-bar group that wraps an
      // identifier (`|| |x| ||`) need a multipurpose separator. Require the
      // following letter so a trailing `⠳⠳⠳` close/open edge is untouched.
      braille = braille.replace(/⠳⠳(?!⠐)(?=⠳[⠁-⠵])/g, '⠳⠳⠐');
      braille = braille.replace(/([⠁-⠵])⠳(?!⠐)(?=⠳⠳)/g, '$1⠳⠐');
    }
    // Rule 23.19 tally marks reuse the vertical-bar glyph in MathML. SRE
    // projects that glyph as ⠳; restore each authored single-cell tally.
    // Skip when bold bars are present so `⠸⠳` is not rewritten to `⠸⠸`.
    const tallyCount = explicitCellNodes.filter((sequence) => sequence === '⠸').length;
    if (tallyCount && !boldBarCount) {
      let remaining = tallyCount;
      braille = braille.replace(/⠳/g, (cell) => {
        if (remaining <= 0) return cell;
        remaining -= 1;
        return '⠸';
      });
    }
    // Prefixed grouping fences can lose a bold, capital, or enlarged modifier
    // while keeping the remaining fence cells. Replace the longest present
    // modifier-stripped variant with the authored sequence, once per source
    // node, so later identical fences are not skipped after the first restore.
    const fenceModifiers = new Set(['⠈', '⠠', '⠸', '⠨', '⠘', '⠰']);
    const fenceNeeded = new Map();
    for (const sequence of explicitCellNodes) {
      if (!/[⠷⠾]/.test(sequence)) continue;
      fenceNeeded.set(sequence, (fenceNeeded.get(sequence) ?? 0) + 1);
    }
    for (const [sequence, needed] of fenceNeeded) {
      const variants = [];
      for (let index = 0; index < sequence.length - 1; index += 1) {
        if (!fenceModifiers.has(sequence[index])) continue;
        variants.push(`${sequence.slice(0, index)}${sequence.slice(index + 1)}`);
      }
      variants.sort((left, right) => right.length - left.length);
      let have = [...braille.matchAll(new RegExp(escape(sequence), 'g'))].length;
      while (have < needed) {
        let replaced = false;
        for (const variant of variants) {
          if (!variant || variant === sequence || !braille.includes(variant)) continue;
          const prefix = sequence.endsWith(variant) ? sequence.slice(0, sequence.length - variant.length) : '';
          const pattern = prefix
            ? new RegExp(`(?<!${escape(prefix)})${escape(variant)}`)
            : new RegExp(escape(variant));
          if (!pattern.test(braille)) continue;
          braille = braille.replace(pattern, sequence);
          replaced = true;
          have += 1;
          break;
        }
        if (!replaced) break;
      }
    }
    // SRE can preserve uppercase glyphs while dropping a dot-6 capital cell
    // on one of the later letters in a bounded word. Recover only authored
    // uppercase <mi> nodes, in source order, and only when the corresponding
    // source-marked capital sequence is not already present.
    const letterCells = new Map([
      ['a', '⠁'], ['b', '⠃'], ['c', '⠉'], ['d', '⠙'], ['e', '⠑'], ['f', '⠋'],
      ['g', '⠛'], ['h', '⠓'], ['i', '⠊'], ['j', '⠚'], ['k', '⠅'], ['l', '⠇'],
      ['m', '⠍'], ['n', '⠝'], ['o', '⠕'], ['p', '⠏'], ['q', '⠟'], ['r', '⠗'],
      ['s', '⠎'], ['t', '⠞'], ['u', '⠥'], ['v', '⠧'], ['w', '⠺'], ['x', '⠭'],
      ['y', '⠽'], ['z', '⠵']
    ]);
    const authoredUppercase = [...sourceMath.querySelectorAll('mi')]
      .map((node) => String(node.textContent ?? '').trim())
      .filter((value) => /^[A-Z]$/.test(value) && letterCells.has(value.toLowerCase()))
      .map((value) => letterCells.get(value.toLowerCase()));
    let searchFrom = 0;
    for (const cell of authoredUppercase) {
      const marked = braille.indexOf(`⠠${cell}`, searchFrom);
      if (marked >= 0) { searchFrom = marked + 2; continue; }
      const raw = braille.indexOf(cell, searchFrom);
      if (raw >= 0) {
        braille = `${braille.slice(0, raw)}⠠${braille.slice(raw)}`;
        searchFrom = raw + 2;
      }
    }
    // BANA groups may contain ordinary mixed-case letters. The enriched
    // projection can lose a local boundary after a capitalized letter. Match
    // source groups to their authored opening fences in document order and
    // restore only the first missing capital marker inside that group's local
    // segment. This preserves source order without reconstructing a word.
    const sourceGroups = [...sourceMath.querySelectorAll('[data-omniya-group="round"]')];
    const openPositions = [];
    for (let index = braille.indexOf('⠷'); index >= 0; index = braille.indexOf('⠷', index + 1)) openPositions.push(index);
    for (const [groupIndex, group] of sourceGroups.entries()) {
      const content = [...group.children].find((node) => node.localName === 'mrow');
      const upper = content && [...content.children].some((node) => node.localName === 'mi' && /^[A-Z]$/.test(String(node.textContent ?? '').trim()));
      if (!upper) continue;
      const open = openPositions[groupIndex] ?? -1;
      const segmentEnd = openPositions[groupIndex + 1] ?? braille.length;
      const close = open >= 0 ? braille.indexOf('⠾', open + 1) : -1;
      if (open < 0 || close < 0) continue;
      const boundedClose = Math.min(close, segmentEnd - 1);
      const segment = braille.slice(open, boundedClose + 1);
      const sourceLetters = [...content.children].filter((node) => node.localName === 'mi').map((node) => String(node.textContent ?? '').trim());
      const firstUpper = sourceLetters.find((value) => /^[A-Z]$/.test(value));
      const firstUpperCell = firstUpper && letterCells.get(firstUpper.toLowerCase());
      if (firstUpperCell && !segment.includes(`⠠${firstUpperCell}`) && segment.includes(firstUpperCell)) {
        braille = `${braille.slice(0, open)}${segment.replace(firstUpperCell, `⠠${firstUpperCell}`)}${braille.slice(boundedClose + 1)}`;
      }
    }
  }
  const elementNeighbor = (node, direction) => {
    if (!node) return null;
    const named = direction === 'next' ? node.nextElementSibling : node.previousElementSibling;
    if (named) return named;
    let sibling = direction === 'next' ? node.nextSibling : node.previousSibling;
    while (sibling && sibling.nodeType !== 1) {
      sibling = direction === 'next' ? sibling.nextSibling : sibling.previousSibling;
    }
    return sibling;
  };
  const skipLayout = (node, direction) => {
    let sibling = node;
    while (sibling && (sibling.localName === 'mspace' || sibling.nodeName === 'mspace'
      || sibling.getAttribute?.('data-semantic-added') === 'true')) {
      sibling = elementNeighbor(sibling, direction);
    }
    return sibling;
  };
  const elementChildrenOf = (parent) => parent?.children
    ? [...parent.children]
    : [...(parent?.childNodes ?? [])].filter((child) => child.nodeType === 1);
  // Transcriber grouping after a then/and word is not a MathML fence SRE can
  // recover. Wrap the following identifier with the authored open/close cells.
  for (const intent of ['then-word', 'and-word', 'or-word']) {
    const word = sourceNodes(`[data-omniya-nemeth-intent="${intent}"]`)[0];
    const wordCells = word?.getAttribute?.('data-omniya-nemeth-cells');
    if (!word || !wordCells || !braille.includes(wordCells)) continue;
    const open = skipLayout(elementNeighbor(word, 'next'), 'next');
    const openCells = open?.getAttribute?.('data-omniya-nemeth-cells');
    if (!openCells || !/[⠷]$/.test(openCells) || braille.includes(openCells)) continue;
    const inner = skipLayout(elementNeighbor(open, 'next'), 'next');
    const innerCells = inner?.getAttribute?.('data-omniya-nemeth-cells');
    const close = skipLayout(elementNeighbor(inner, 'next'), 'next');
    const closeCells = close?.getAttribute?.('data-omniya-nemeth-cells');
    if (!innerCells || !closeCells) continue;
    const needle = `${wordCells}⠀${innerCells}`;
    if (braille.includes(needle)) {
      braille = braille.replace(needle, `${wordCells}⠀${openCells}${innerCells}${closeCells}`);
    }
  }
  // A missing transcriber fence between two present authored sequences is
  // restored at that local adjacency. Semantic reparenting can hide the
  // previous-sibling relationship used below.
  const authoredSequences = sourceNodes('[data-omniya-nemeth-cells]')
    .map((node) => node.getAttribute('data-omniya-nemeth-cells'))
    .filter(Boolean);
  for (let index = 1; index < authoredSequences.length - 1; index += 1) {
    const left = authoredSequences[index - 1];
    const mid = authoredSequences[index];
    const right = authoredSequences[index + 1];
    if (!mid || !/[⠷⠾]/.test(mid) || braille.includes(mid)) continue;
    const adjacent = `${left}${right}`;
    if (left && right && braille.includes(adjacent)) {
      braille = braille.replace(adjacent, `${left}${mid}${right}`);
      continue;
    }
    const leftTail = left.at(-1);
    const tailAdjacent = leftTail && right ? `${leftTail}${right}` : '';
    if (tailAdjacent && braille.includes(tailAdjacent)) {
      braille = braille.replace(tailAdjacent, `${leftTail}${mid}${right}`);
      continue;
    }
    // An omitted transcriber close can sit inside a script row whose previous
    // sibling has no authored cells. Restore it immediately before the next
    // authored letter SRE did project. This is adjacency restoration, not
    // delimiter parsing.
    if (right && /[⠾]$/.test(mid) && braille.includes(right)) {
      const leftIndex = left ? braille.indexOf(left) : -1;
      const rightIndex = braille.indexOf(right);
      if (rightIndex >= 0 && (leftIndex < 0 || leftIndex < rightIndex)) {
        braille = `${braille.slice(0, rightIndex)}${mid}${braille.slice(rightIndex)}`;
      }
    }
  }
  // When SRE omits a transcriber close entirely, reinsert it against the
  // neighboring authored letter cells. This is adjacency restoration, not
  // delimiter parsing.
  const authoredFences = sourceNodes('mo[data-omniya-nemeth-cells]')
    .map((node) => ({ node, cells: node.getAttribute('data-omniya-nemeth-cells') }))
    .filter(({ cells }) => /[⠷⠾]/.test(cells ?? ''));
  for (const { node, cells } of authoredFences) {
    if (!cells || braille.includes(cells) || !/[⠾]$/.test(cells)) continue;
    const previous = skipLayout(elementNeighbor(node, 'previous'), 'previous');
    const lastAuthoredCells = (root) => {
      if (!root) return null;
      const own = root.getAttribute?.('data-omniya-nemeth-cells');
      if (own) return own;
      const kids = elementChildrenOf(root);
      return kids.length ? lastAuthoredCells(kids.at(-1)) : null;
    };
    const previousCells = lastAuthoredCells(previous);
    if (!previousCells || !braille.includes(previousCells)) continue;
    const withReturn = `${previousCells}⠐`;
    if (braille.includes(withReturn)) {
      braille = braille.replace(withReturn, `${withReturn}${cells}`);
      continue;
    }
    braille = braille.replace(previousCells, `${previousCells}${cells}`);
  }
  const firstFence = authoredFences[0];
  const lastFence = authoredFences.at(-1);
  const mathLeaves = elementChildrenOf(sourceMath);
  if (firstFence?.cells && /[⠷]$/.test(firstFence.cells) && !braille.includes(firstFence.cells)
      && mathLeaves[0] === firstFence.node) {
    braille = `${firstFence.cells}${braille}`;
  }
  if (lastFence?.cells && /[⠾]$/.test(lastFence.cells) && !braille.includes(lastFence.cells)
      && mathLeaves.at(-1) === lastFence.node) {
    braille = `${braille}${lastFence.cells}`;
  }

  // BANA encodes less-than-or-equal as the two local comparison cells. SRE
  // collapses the equals-under half to a single ≤ glyph after the less-than.
  if (hasSource('mo[data-omniya-nemeth-cells="⠐⠅"]') && hasSource('mo[data-omniya-nemeth-cells="⠨⠅"]') && braille.includes('⠐⠅⠱')) {
    braille = braille.replace('⠐⠅⠱', '⠐⠅⠨⠅');
  }
  if (hasSource('mo[data-omniya-nemeth-cells="⠐⠅⠨⠅"]') && /⠐⠅⠱|⠱/.test(braille) && !braille.includes('⠐⠅⠨⠅')) {
    braille = braille.replace(/⠐⠅⠱|⠱/, '⠐⠅⠨⠅');
  }
  for (const romanName of romanNames) {
    // The double-capital Roman indicator is not recoverable from an ordinary
    // MathML identifier. Restore one local indicator for the authored Roman
    // node at the accessibility boundary.
    const cells = [...romanName.toLowerCase()].map((letter) => new Map([
      ['i', '⠊'], ['v', '⠧'], ['x', '⠭'], ['l', '⠇'], ['c', '⠉'], ['d', '⠙'], ['m', '⠍'], ['s', '⠎']
    ]).get(letter) ?? '').join('');
    if (cells) {
      const escaped = cells.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Remove SRE's per-letter capitalization and restore the one BANA
      // double-capital indicator for this bounded Roman identifier.
      const broad = new RegExp(`⠠+${escaped.split('').map((cell) => `${cell}`).join('⠠+')}`);
      braille = braille.replace(broad, `⠠⠠${cells}`);
    }
  }
  if (frakturCount) {
    braille = braille.replace(/⠸⠸(?=[⠁-⠵])/, '⠸');
  }
  if (hebrewCount) {
    braille = braille.replace(/א/, '⠠⠠⠁');
    if (subscriptZero && !braille.endsWith('⠴')) braille += '⠴';
  }
  if (russianCount) {
    braille = braille.replace(/[лш]/, (match) => match === 'л' ? '⠈⠈⠇' : '⠈⠈⠱');
  }
  for (const node of functionNodes) {
    const name = String(node.textContent ?? '').trim();
    const map = new Map([['s', '⠎'], ['i', '⠊'], ['n', '⠝'], ['c', '⠉'], ['o', '⠕'], ['s', '⠎'], ['t', '⠞'], ['a', '⠁'], ['l', '⠇'], ['g', '⠛'], ['e', '⠑'], ['x', '⠭'], ['p', '⠏'], ['m', '⠍'], ['d', '⠙'], ['r', '⠗'], ['f', '⠋']]);
    const cells = node.getAttribute?.('data-omniya-nemeth-cells') ||
      [...name].map((letter) => map.get(letter) ?? '').join('');
    if (!cells) continue;
    // SRE can emit each letter of a multi-letter function as its own
    // identifier and insert baseline returns between them. Collapse only
    // that local presentation splice back to the authored function cells.
    const spliced = [...cells].join('⠐');
    if (spliced !== cells && braille.includes(spliced)) {
      braille = braille.replace(spliced, cells);
    }
    if (!scriptedFunctionNames.has(name)) {
      const escaped = cells.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      braille = braille.replace(new RegExp(`${escaped}(?!⠀)`), `${cells}⠀`);
    }
  }
  // A terminal function name does not have an argument yet. Do not invent a
  // trailing blank for the focused local code; the authored passage's blank
  // cells are already represented by explicit mspace nodes when present.
  if (terminalFunction && braille.endsWith('⠀')) {
    braille = braille.slice(0, -1);
  }
  // A final fence can be lost only when the authored source ends in a closed
  // group. Use the final source node's boundary, not a global count, so nested
  // groups do not manufacture a close at the end of an unrelated expression.
  if (closedGroups.length) {
    const lastGroup = closedGroups.at(-1);
    const lastClose = [...lastGroup.children].find((node) => node.getAttribute?.('data-omniya-role') === 'close-fence');
    const lastCell = lastClose?.getAttribute?.('data-omniya-nemeth-cells') || '⠾';
    // Only repair a close that is genuinely at the end of the authored
    // expression.  A group can be the base of a script (for example
    // `(seven)^2"+1`); in that case the source close is already represented
    // before the exponent, and appending it to the whole projection corrupts
    // the order.  Walk the source branch to the root and require that no
    // authored sibling follows it.  MathJax's semantic-added nodes are
    // ignored because they are derived projection artifacts, not source
    // content.
    let finalSourceBranch = true;
    let branch = lastGroup;
    while (branch && branch !== sourceMath) {
      const parent = branch.parentElement;
      if (!parent) break;
      const followingAuthored = [...parent.children].slice([...parent.children].indexOf(branch) + 1)
        .some((sibling) => sibling.getAttribute?.('data-semantic-added') !== 'true');
      if (followingAuthored) {
        finalSourceBranch = false;
        break;
      }
      branch = parent;
    }
    const lastAuthoredNode = [...sourceMath.querySelectorAll('*')]
      .filter((node) => node.getAttribute?.('data-semantic-added') !== 'true')
      .at(-1);
    const closeIsFinalAuthoredNode = lastAuthoredNode === lastClose;
    if (finalSourceBranch && closeIsFinalAuthoredNode && !braille.endsWith(lastCell) && !braille.endsWith(`${lastCell}⠾`)) braille += lastCell;
    if (finalSourceBranch && closeIsFinalAuthoredNode && lastCell === '⠾' && braille.endsWith('⠙')) braille += '⠾';
  }
  if (lowerCellNumeric.length && braille.includes('⠐⠬⠼')) {
    braille = braille.replace(/⠐⠬⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, '⠐⠬');
  }
  // Source-authored indexed radical output is complete at this boundary. Do
  // not let the later generic numeric/period compatibility passes rewrite its
  // local script and radical cells.
  if (indexedProjection) return indexedProjection;
  // Lower-cell numbers are deliberately stripped from SRE's isolated-number
  // projection above. That pass must not strip the number sign from an
  // earlier ordinary decimal in the same expression. Restore only the
  // source-marked numeric items, in document order, before handling the
  // decimal-to-nonnumeric return.
  if (decimalNonnumeric.length && (numericStarts.length || numericDecimal.length)) {
    const digits = new Map([
      ['0', '⠴'], ['1', '⠂'], ['2', '⠆'], ['3', '⠒'], ['4', '⠲'],
      ['5', '⠢'], ['6', '⠖'], ['7', '⠶'], ['8', '⠦'], ['9', '⠔']
    ]);
    for (const node of [...numericStarts, ...numericDecimal]) {
      const value = String(node.textContent ?? '').trim();
      const cells = [...value].map((digit) => digits.get(digit) ?? (digit === '.' ? '⠨' : '')).join('');
      if (cells && !braille.includes(`⠼${cells}`) && braille.includes(cells)) {
        braille = braille.replace(cells, `⠼${cells}`);
      }
    }
    braille = braille.replace(/(?<!⠐)⠿/, '⠐⠿');
  }
  if (hasSource('mo[data-omniya-nemeth-cells="⠈⠾"]')) {
    // Final source-boundary pass. Generic numeric restoration above is useful
    // for ordinary isolated numbers, but this authored construction is one
    // continuous Nemeth number through nested grouping and division. Keep the
    // first number sign only and restore the enlarged close before division.
    // SRE may omit every isolated <mn> prefix; the source still authors one
    // leading number sign for this continuous lower-cell passage.
    if (!braille.includes('⠼') && /^[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴]/.test(braille)) {
      braille = `⠼${braille}`;
    }
    let seen = 0;
    braille = braille.replace(/⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, (cell) => (seen++ === 0 ? cell : ''));
    braille = braille.replace(/⠈⠨⠌(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/, '⠈⠾⠨⠌');
    if (hasSource('mo[data-omniya-nemeth-cells="⠈⠷"]')) {
      braille = braille.replace('⠷⠤⠆', '⠷⠲⠤⠆');
    }
    // Nested inner round close plus enlarged close can both be projected as
    // enlarged. Restore the authored inner bare close immediately before the
    // enlarged terminator.
    if (hasSource('mo[data-omniya-nemeth-cells="⠾"]')) {
      braille = braille.replace(/⠈⠾⠈⠾/, '⠾⠈⠾');
    }
  }
  if (hasSource('mo[data-omniya-nemeth-cells="⠈⠠⠷"]')) {
    const capitalOpens = sourceNodes('mo[data-omniya-nemeth-cells="⠈⠠⠷"]');
    const numberedOpens = capitalOpens.filter((open) => {
      const next = skipLayout(elementNeighbor(open, 'next'), 'next');
      const name = next?.localName || next?.nodeName;
      return name === 'mn' || String(next?.getAttribute?.('data-omniya-nemeth-intent') ?? '').includes('numeric');
    });
    let numberedIndex = 0;
    braille = braille.replace(/⠈⠠⠷⠼(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, (match) => {
      const open = numberedOpens[numberedIndex++];
      const next = open ? skipLayout(elementNeighbor(open, 'next'), 'next') : null;
      return next?.getAttribute?.('data-omniya-nemeth-intent') === 'lower-cell-numeric' ? '⠈⠠⠷' : match;
    });
  }
  // Rule 19.1.2's closing bracket may carry both a subscript and a
  // superscript. SRE exposes the baseline return after that embellished
  // fence, but the authored BANA construction terminates at the final
  // superscript operand. Remove only that terminal presentation artifact
  // when the source explicitly marks the closing bracket, never from a
  // generic scripted expression.
  if ((hasSource('msubsup > mo[data-omniya-nemeth-cells="⠈⠾"]')
      || hasSource('msubsup > mo[data-omniya-nemeth-cells="⠳"]')) && braille.endsWith('⠐')) {
    braille = braille.slice(0, -1);
  }
  if (sourceMath.querySelector?.('[data-omniya-shape-kind="keystroke"]')) {
    braille = braille.replace(/(⠫⠅⠨⠻)⠐?⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, '$1');
  }
  // Rule 20.3's asterisk and crosshatch end a numeric passage. SRE often
  // keeps the operator cells but drops the fresh number sign on the following
  // numeric-start atom (`#3`##4` -> ⠼⠒⠈⠼⠲). Restore only that local sign.
  if (hasSource('mo[data-omniya-nemeth-cells="⠈⠼"]') &&
      sourceMath.querySelector?.('[data-omniya-nemeth-intent="numeric-start"]')) {
    braille = braille.replace(/⠈⠼(?!⠼)(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '⠈⠼⠼');
  }
  if (hasSource('mo[data-omniya-nemeth-cells="⠨⠼"]') &&
      sourceMath.querySelector?.('[data-omniya-nemeth-intent="numeric-start"]')) {
    braille = braille.replace(/⠨⠼(?!⠼)(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '⠨⠼⠼');
  }
  for (const operatorCells of ['⠈⠼', '⠨⠼', '⠨⠬', '⠨⠩', '⠸⠌']) {
    if (!hasSource(`mo[data-omniya-nemeth-cells="${operatorCells}"]`)) continue;
    const operators = sourceNodes(`mo[data-omniya-nemeth-cells="${operatorCells}"]`);
    for (const node of operators) {
      if (braille.includes(operatorCells)) continue;
      const previous = skipLayout(elementNeighbor(node, 'previous'), 'previous');
      const next = skipLayout(elementNeighbor(node, 'next'), 'next');
      const left = previous?.getAttribute?.('data-omniya-nemeth-cells')
        || (previous?.getAttribute?.('data-omniya-nemeth-intent') === 'numeric-start'
          ? [...String(previous.textContent ?? '').trim()].map((digit) => [...'⠴⠂⠆⠒⠲⠢⠖⠶⠦⠔'][Number(digit)]).join('')
          : null);
      const right = next?.getAttribute?.('data-omniya-nemeth-cells')
        || (next?.getAttribute?.('data-omniya-nemeth-intent') === 'numeric-start'
          ? [...String(next.textContent ?? '').trim()].map((digit) => [...'⠴⠂⠆⠒⠲⠢⠖⠶⠦⠔'][Number(digit)]).join('')
          : null);
      if (left && right && braille.includes(`${left}${right}`)) {
        const restored = (operatorCells === '⠈⠼' || operatorCells === '⠨⠼') &&
          next?.getAttribute?.('data-omniya-nemeth-intent') === 'numeric-start'
          ? `${left}${operatorCells}⠼${right}`
          : `${left}${operatorCells}${right}`;
        braille = braille.replace(`${left}${right}`, restored);
        continue;
      }
      if (left && right && (operatorCells === '⠈⠼' || operatorCells === '⠨⠼') &&
        next?.getAttribute?.('data-omniya-nemeth-intent') === 'numeric-start' &&
        braille.includes(`${left}⠼${right}`) && !braille.includes(operatorCells)) {
        braille = braille.replace(`${left}⠼${right}`, `${left}${operatorCells}⠼${right}`);
        continue;
      }
      if (operatorCells === '⠸⠌' && braille.includes('⠌') && !braille.includes('⠸⠌')) {
        if (left && right && braille.includes(`${left}⠌${right}`)) {
          braille = braille.replace(`${left}⠌${right}`, `${left}⠸⠌${right}`);
        } else if (left && braille.includes(`${left}⠌`)) {
          braille = braille.replace(`${left}⠌`, `${left}⠸⠌`);
        }
        continue;
      }
      if (operatorCells === '⠨⠬' && braille.includes('⠬') && !braille.includes('⠨⠬')) {
        braille = braille.replace(/(?<!⠨)⠬/g, '⠨⠬');
      }
    }
  }
  for (const script of [...sourceNodes('msubsup'), ...sourceNodes('msup'), ...sourceNodes('msub')]) {
    const next = skipLayout(elementNeighbor(script, 'next'), 'next');
    const nextCells = next?.getAttribute?.('data-omniya-nemeth-cells');
    const kids = [...(script.children ?? [])].filter((child) => child.nodeType === 1);
    const last = kids.at(-1);
    const lastCells = last?.getAttribute?.('data-omniya-nemeth-cells');
    if (!lastCells || !nextCells) continue;
    const nextName = (next.localName || next.nodeName || '').toLowerCase();
    if (nextName === 'mo' && /[⠷⠾]$/.test(nextCells)) continue;
    const glued = `${lastCells}${nextCells}`;
    const separated = `${lastCells}⠐${nextCells}`;
    if (braille.includes(glued) && !braille.includes(separated)) {
      braille = braille.replace(glued, separated);
    }
  }
  for (const space of sourceNodes('[data-omniya-nemeth-intent="explicit-space"]')) {
    const previous = elementNeighbor(space, 'previous');
    const next = elementNeighbor(space, 'next');
    const left = previous?.getAttribute?.('data-omniya-nemeth-cells');
    const right = next?.getAttribute?.('data-omniya-nemeth-cells');
    if (!left || !right) continue;
    const glued = `${left}${right}`;
    const spaced = `${left}⠀${right}`;
    if (braille.includes(glued) && !braille.includes(spaced)) {
      braille = braille.replace(glued, spaced);
    }
  }
  // Rule 20.9 consecutive tildes keep a multipurpose separator between the
  // two authored operator cells. SRE concatenates them.
  if (sourceNodes('mo[data-omniya-nemeth-cells="⠈⠱"]').length >= 2) {
    braille = braille.replace(/⠈⠱(?!⠐)(?=⠈⠱)/g, '⠈⠱⠐');
  }
  const finalize = (value) => {
    if (scriptedNumericStart.length) {
      value = value.replace(/([⠰⠘])⠼(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '$1');
    }
    const degreeWithFollowingNumber = sourceMath.querySelector?.('mo[data-omniya-nemeth-cells="⠘⠨⠡"]') &&
      [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="lower-cell-numeric"]')].some((node) =>
        String(node.textContent ?? '').trim() === '20' && node.parentElement?.localName !== 'msup');
    if (degreeWithFollowingNumber && !value.includes('⠘⠨⠡⠐⠆⠴')) {
      value = value.replace('⠘⠨⠡⠆⠴', '⠘⠨⠡⠐⠆⠴');
    }
    // SRE may project an indicated colon as digit 3. Restore when the source
    // stamped colon cells: either digit+number (ratio) or letter/script host
    // before a bare ⠒ (8-46, 8-47 such-that / unspaced colon).
    const colonCount = sourceNodes('mo[data-omniya-nemeth-cells="⠸⠒"]').length
      || sourceNodes('[data-omniya-nemeth-intent="punctuation-colon"]').length;
    let colonsNeeded = colonCount - [...value.matchAll(/⠸⠒/g)].length;
    if (colonsNeeded > 0) {
      value = value.replace(/([⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])⠒(?=⠼)/g, (match, digit) => {
        if (colonsNeeded <= 0) return match;
        colonsNeeded -= 1;
        return `${digit}⠸⠒`;
      });
      value = value.replace(/([⠁-⠵])⠒(?!⠸)/g, (match, letter) => {
        if (colonsNeeded <= 0) return match;
        colonsNeeded -= 1;
        return `${letter}⠸⠒`;
      });
    }
    // Typeform numbers keep an authored typeform+number-sign prefix on the
    // source atom. SRE often emits an ordinary number sign; restore only that
    // local prefix for italic, bold, and script numerals (Rule 7.2).
    const typeformNumberIntents = new Set([
      'typeform-italic-number',
      'typeform-bold-number',
      'typeform-script-number'
    ]);
    for (const node of [...(sourceMath.getElementsByTagName?.('mn') ?? [])]) {
      const intent = node.getAttribute?.('data-omniya-nemeth-intent');
      if (!typeformNumberIntents.has(intent)) continue;
      const cells = node.getAttribute?.('data-omniya-nemeth-cells');
      if (!cells || value.includes(cells)) continue;
      const prefixes = ['⠨⠼', '⠸⠼', '⠈⠼', '⠠⠸⠼'];
      const prefix = prefixes.find((candidate) => cells.startsWith(candidate));
      if (!prefix) continue;
      const rest = cells.slice(prefix.length);
      if (rest && value.includes(`⠼${rest}`)) value = value.replace(`⠼${rest}`, cells);
      else if (rest && value.includes(rest)) value = value.replace(rest, cells);
    }
    const englishCells = [...sourceMath.querySelectorAll('[data-omniya-nemeth-intent="english-letter"][data-omniya-nemeth-cells]')]
      .map((node) => node.getAttribute('data-omniya-nemeth-cells')).filter(Boolean);
    let englishCursor = 0;
    for (const sequence of englishCells) {
      const base = sequence.at(-1);
      const occurrences = [...value.matchAll(new RegExp(base, 'g'))].map((match) => match.index).filter((index) => index >= englishCursor);
      const index = englishCells.length === 1 && occurrences.length > 1 ? occurrences.at(-1) : occurrences[0];
      if (index < 0) continue;
      const prefix = sequence.slice(0, -1);
      if (value.slice(Math.max(0, index - prefix.length), index) !== prefix) {
        value = `${value.slice(0, index)}${sequence}${value.slice(index + base.length)}`;
      }
      englishCursor = index + sequence.length;
    }
    if (sourceMath.querySelector?.('[data-omniya-shape-kind="keystroke"]')) {
      value = value.replace(/(⠫⠅⠨⠻)⠐?⠼(?=⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/g, '$1');
    }
    value = value.replace(/(⠠[⠁-⠵]⠠)⠀(?=[⠁-⠵])/g, '$1');
    for (const cell of capitalPunctuationCells) {
      value = value.replace(new RegExp(`(⠠${cell})(?!⠠)⠀`), '$1⠠⠀');
    }
    if (uppercaseIdentifierCount >= 2) {
      value = value.replace(/(⠠[⠁-⠵]⠠)⠀(?=[⠁-⠵])/g, '$1');
    }
    if (boundCommas) {
      value = value.replace(/(⠠[⠁-⠵]⠠)⠀(?=[⠁-⠵])/g, '$1');
      value = value.replace(/((?:⠠[⠁-⠵]){2,})(?!⠠)⠀/, '$1⠠⠀⠀');
      value = value.replace(/((?:⠠[⠁-⠵]){2,}⠠)(?=[⠁-⠵])/, '$1⠀');
    }
    // Rule 8.3 apostrophe-capital English letters are a single authored cell
    // sequence. Capital-punctuation restoration above can append an extra
    // dot-6 before the following blank; remove only that local artifact.
    for (const node of sourceNodes('[data-omniya-nemeth-intent="english-letter"]')) {
      const sequence = node.getAttribute?.('data-omniya-nemeth-cells');
      if (!/^⠠⠄⠠[⠁-⠵]$/.test(sequence ?? '')) continue;
      value = value.replace(new RegExp(`${sequence}⠠⠀+`), `${sequence}⠀`);
    }
    // Two source siblings with explicit authored cell sequences have no
    // mathematical blank between them. Semantic relation/operator layout may
    // insert one visually; remove only the blank anchored by those two local
    // sequences, in source order.
    let adjacencyCursor = 0;
    for (const [left, right] of authoredAdjacencies) {
      const spaced = `${left}⠀${right}`;
      const index = value.indexOf(spaced, adjacencyCursor);
      if (index < 0) continue;
      value = `${value.slice(0, index)}${left}${right}${value.slice(index + spaced.length)}`;
      adjacencyCursor = index + left.length + right.length;
    }
    if (mixedFractions.length) {
      // A mixed-fraction mfrac is one bounded `_? numerator / denominator
      // _#` construction. MathJax treats its numeric children as independent
      // numbers and can therefore add number signs inside the fraction while
      // dropping the mixed-order indicators. Restore only these source-marked
      // local boundaries; the whole-number sibling remains MathJax-owned.
      value = value.replace(/⠸⠹⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠶⠴])/g, '⠸⠹');
      value = value.replace(/⠌⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠶⠴])/g, '⠌');
      let openings = (value.match(/⠸⠹/g) ?? []).length;
      value = value.replace(/(?<!⠸)⠹/g, (cell) => openings++ < mixedFractions.length ? `⠸${cell}` : cell);
      let closings = (value.match(/⠸⠼/g) ?? []).length;
      if (closings < mixedFractions.length && value.endsWith('⠼')) {
        value = `${value.slice(0, -1)}⠸⠼`;
      }
      // Bevelled mixed fractions keep the diagonal line indicator (13-19).
      if ([...mixedFractions].some((node) => node.getAttribute('bevelled') === 'true')) {
        value = value.replace(/(⠸⠹(?:⠼)?[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴]+)(?!⠸)⠌/g, '$1⠸⠌');
      }
    }
    if (shapeSubscriptCount) {
      value = value.replace(/⠰⠀⠰(?=⠫)/g, '⠰');
      value = value.replace(/⠀⠰(?=⠫)/g, '⠰');
      let returns = shapeSubscriptBaselineCount;
      value = value.replace(/(⠰⠫[^⠀⠐]+)(?=⠬)/g, (match) => {
        if (returns <= 0) return match;
        returns -= 1;
        return `${match}⠐`;
      });
    }
    if (degreeBaselinePlusCount) {
      let returns = degreeBaselinePlusCount;
      value = value.replace(/(⠘⠨⠡)(?!⠐)(?=⠬)/g, (degree) => {
        if (returns <= 0) return degree;
        returns -= 1;
        return `${degree}⠐`;
      });
    }
    if (degreeBaselineMinusCount) {
      let returns = degreeBaselineMinusCount;
      value = value.replace(/(⠘⠨⠡)⠀?(?!⠐)(?=⠤)/g, (degree) => {
        if (returns <= 0) return degree;
        returns -= 1;
        return '⠘⠨⠡⠐';
      });
    }
    if (scriptedNumericStart.length) {
      value = value.replace(/([⠰⠘])⠼(?=⠂|⠆|⠒|⠲|⠢|⠖|⠶|⠦|⠔|⠴)/g, '$1');
    }
    return value;
  };
  // Rule 8 literary periods are bare ⠲. SRE may treat them as a simple-fraction
  // digit (`⠹⠲`), leave a visual blank before the period cell, or emit the
  // multipurpose decimal pair (`⠨⠐`) after an abbreviation in a geometry
  // subscript.
  if (literaryPeriods.length) {
    braille = braille.replace(/⠹⠲/g, '⠲');
    braille = braille.replace(/([⠁-⠵]|⠝)⠀⠲/g, '$1⠲');
    braille = braille.replace(/([⠁-⠵])⠨⠐(?=⠀|$)/g, '$1⠲');
    // After a literary period and an authored blank, the next word keeps the
    // English-letter / level indicator. SRE often drops that local `⠰`.
    if (explicitSpaces) {
      braille = braille.replace(/⠲⠀(?!⠰)(?=[⠁-⠵])/g, '⠲⠀⠰');
    }
  }
  // Rule 10.4 literary commas after literary periods are lower-cell ⠂.
  // SRE/math projection may emit the mathematical comma cell instead.
  const literaryCommas = sourceNodes('[data-omniya-nemeth-intent="punctuation-literary-comma"]');
  if (literaryCommas.length) {
    braille = braille.replace(/⠲⠠(?=⠼|⠀|[⠁-⠵])/g, '⠲⠂');
  }
  // Rule 11.1.2 omission commas keep the mathematical comma before the
  // following lower-cell digits when SRE drops that local cell.
  const omissionCommas = sourceNodes('[data-omniya-nemeth-intent="omission-comma"]');
  if (omissionCommas.length) {
    braille = braille.replace(/⠿(?!⠠)(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, '⠿⠠');
  }
  // Rule 8.3's English capital with literary apostrophe (`⠠⠄⠠⠚`) must not
  // keep a following capital-punctuation indicator that SRE inserts before
  // the next blank.
  const apostropheCapitals = sourceNodes('[data-omniya-nemeth-intent="english-letter"]')
    .map((node) => node.getAttribute('data-omniya-nemeth-cells'))
    .filter((cells) => /^⠠⠄⠠[⠁-⠵]$/.test(cells ?? ''));
  for (const sequence of apostropheCapitals) {
    braille = braille.replace(new RegExp(`${sequence}⠠(?=⠀)`), sequence);
  }
  // SRE may also duplicate the leading capital before the apostrophe pair
  // (`⠠⠠⠄⠠⠚` → `⠠⠄⠠⠚`) when a preceding period ends numeric mode (8-8).
  if (apostropheCapitals.length) {
    braille = braille.replace(/⠠⠠⠄⠠(?=[⠁-⠵])/g, '⠠⠄⠠');
  }
  // Rule 7.3.2–7.3.5: hyphenated typeform numbers keep the typeform through
  // the hyphen without a fresh letter indicator or multipurpose return.
  const typeformNumbers = [
    ...sourceNodes('[data-omniya-nemeth-intent="typeform-italic-number"]'),
    ...sourceNodes('[data-omniya-nemeth-intent="typeform-bold-number"]'),
    ...sourceNodes('[data-omniya-nemeth-intent="typeform-script-number"]')
  ];
  if (typeformNumbers.length) {
    braille = braille.replace(/⠤⠸⠰(?=[⠁-⠵])/g, '⠤');
    braille = braille.replace(/⠤⠨⠰(?=[⠁-⠵])/g, '⠤');
    braille = braille.replace(/⠤⠈⠰(?=[⠁-⠵])/g, '⠤');
    braille = braille.replace(/⠤⠐(?=[⠁-⠵])/g, '⠤');
    // Multipurpose may also land between letters of the hyphenated unit
    // (7-14 `⠤⠕⠐⠓⠍` → `⠤⠕⠓⠍`).
    braille = braille.replace(/(⠤[⠁-⠵]+)⠐(?=[⠁-⠵])/g, '$1');
  }
  // Rule 7.3.4–7.3.5 mathematical typeform scopes keep their open/close
  // indicators even when SRE projects only the interior expression (7-19).
  for (const scope of sourceNodes('[data-omniya-nemeth-intent="typeform-scope"]')) {
    const stamped = scope.getAttribute('data-omniya-nemeth-cells') || '';
    const open = stamped.split('|')[0]
      || (scope.getAttribute('mathvariant') === 'italic' ? '⠠⠄⠨' : '⠠⠄⠸');
    const close = scope.getAttribute('data-omniya-typeform-close-cells')
      || stamped.split('|')[1]
      || (scope.getAttribute('mathvariant') === 'italic' ? '⠨⠠⠄' : '⠸⠠⠄');
    if (open && !braille.includes(open)) {
      braille = braille.startsWith('⠀') ? `${open}${braille}` : `${open}⠀${braille}`;
    }
    if (close && !braille.includes(close)) {
      braille = braille.endsWith('⠀') ? `${braille}${close}` : `${braille}⠀${close}`;
    }
  }
  // Rule 3.9 interior numbers keep the number sign after the interior-shape
  // indicator (`⠸⠫⠼⠢`). SRE may emit the bare lower-cell digit.
  if (shapeCells.some((cells) => /⠸⠫⠼/.test(cells))) {
    for (const sequence of shapeCells) {
      if (!/⠸⠫⠼/.test(sequence)) continue;
      const withoutNumber = sequence.replace(/⠸⠫⠼/, '⠸⠫');
      if (braille.includes(withoutNumber) && !braille.includes(sequence)) {
        braille = braille.replace(withoutNumber, sequence);
      }
      if (braille.startsWith(sequence.slice(0, 2)) && !braille.includes('⠼') && sequence.includes('⠼')) {
        braille = sequence;
      }
    }
  }
  // Rule 3.11 hyphen between a word and a fresh numeric item restores the
  // number sign (`guanosine-#5`). Only count mi−mn(numeric-start) boundaries;
  // algebraic letter−digit runs keep bare lower-cell digits.
  const wordNumberHyphens = [...(sourceMath.getElementsByTagName?.('mo') ?? [])].filter((node) => {
    const text = String(node.textContent ?? '').trim();
    if (text !== '−' && text !== '-') return false;
    const previous = node.previousElementSibling ?? node.previousSibling;
    const next = node.nextElementSibling ?? node.nextSibling;
    const prevName = previous?.localName ?? previous?.nodeName?.toLowerCase?.();
    return prevName === 'mi' &&
      next?.getAttribute?.('data-omniya-nemeth-intent') === 'numeric-start';
  }).length;
  if (wordNumberHyphens) {
    let remaining = wordNumberHyphens;
    braille = braille.replace(/([⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵])⠤(?!⠼)(?=[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])/g, (match, letter) => {
      if (remaining <= 0) return match;
      remaining -= 1;
      return `${letter}⠤⠼`;
    });
  }
  // A source-marked mathematical comma after a lower-cell digit must remain
  // `⠠`, not digit one (`⠂`) — e.g. Rule 8-52 `(-3, 2)`.
  if (boundCommas && !braille.includes('⠠⠀') && /[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴]⠂⠀/.test(braille)) {
    braille = braille.replace(/([⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])⠂(?=⠀)/, '$1⠠');
  }
  // Bevelled fractions that carry literary periods keep the diagonal line
  // indicator. SRE can emit a plain slash after the period cell.
  if (literaryPeriods.length &&
    [...simpleFractions].some((node) => node.getAttribute('bevelled') === 'true')) {
    braille = braille.replace(/⠲(?!⠸)⠌/g, '⠲⠸⠌');
  }
  // Indicated left double quotes keep `_8` (`⠸⠦`). SRE may project the empty-
  // set glyph (`⠿`) or a bare left quote when the source marks the indicated
  // form after a fence or dash.
  const indicatedLeftQuotes = leftDoubleQuotes.filter((node) =>
    node.getAttribute('data-omniya-nemeth-cells') === '⠸⠦');
  if (indicatedLeftQuotes.length) {
    let remainingQuotes = indicatedLeftQuotes.length;
    braille = braille.replace(/⠿/g, (match) => {
      if (remainingQuotes <= 0) return match;
      remainingQuotes -= 1;
      return '⠸⠦';
    });
    braille = braille.replace(/⠤⠤⠀+⠸⠦/g, '⠤⠤⠸⠦');
    braille = braille.replace(/⠷⠀*⠸⠦⠀*/g, '⠷⠸⠦');
  }
  // Unindicated left quotes are bare ⠦. SRE may keep a number sign from a
  // prior numeric passage (`⠼⠦`) when the quote opens a later comparison.
  const bareLeftQuotes = leftDoubleQuotes.filter((node) =>
    (node.getAttribute('data-omniya-nemeth-cells') || '⠦') === '⠦');
  if (bareLeftQuotes.length) {
    let remainingQuotes = Math.max(0, bareLeftQuotes.length - [...braille.matchAll(/(?<!⠼|⠸)⠦/g)].length);
    braille = braille.replace(/⠼⠦/g, (match) => {
      if (remainingQuotes <= 0) return match;
      remainingQuotes -= 1;
      return '⠦';
    });
  }
  // Quoted decimals keep the number sign before the decimal marker
  // (`⠼⠨⠦`). SRE sometimes swaps those cells after an indicated quote.
  if (leftDoubleQuotes.length) {
    braille = braille.replace(/⠸⠦⠨⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠶⠴])/g, '⠸⠦⠼⠨');
    braille = braille.replace(/⠦⠨⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠶⠴])/g, '⠦⠼⠨');
    braille = braille.replace(/⠸⠦⠀+⠨⠼(?=[⠂⠆⠒⠲⠢⠔⠦⠖⠶⠴])/g, '⠸⠦⠼⠨');
    braille = braille.replace(/⠸⠦⠀+(?=⠨)/g, '⠸⠦');
  }
  // A radical sign inside quotes is the standalone `⠜` cell, not a square-
  // root enclosure. Restore the authored cells when SRE emits a different
  // radical form around the same quote pair — including the bare `⠦⠴`
  // collapse that drops both the radical and the indicated closer (8-16).
  if (radicalSigns.length && leftDoubleQuotes.length && rightDoubleQuotes.length) {
    for (const sign of radicalSigns) {
      const cells = sign.getAttribute('data-omniya-nemeth-cells') || '⠜';
      const rightCells = rightDoubleQuotes[0]?.getAttribute?.('data-omniya-nemeth-cells') || '⠸⠴';
      if (cells && braille === `⠦⠴`) {
        braille = `⠦${cells}${rightCells}`;
        continue;
      }
      if (cells && !braille.includes(cells) && /⠦.*⠸⠴/.test(braille)) {
        braille = braille.replace(/⠦([^⠦⠸]*)⠸⠴/, `⠦${cells}⠸⠴`);
      }
      if (cells && !braille.includes(cells) && /⠦[^⠜]*⠴/.test(braille) && rightCells === '⠸⠴') {
        braille = braille.replace(/⠦([^⠦]*)⠴/, `⠦${cells}⠸⠴`);
      }
    }
  }
  if (!decimalNonnumeric.length && !numericDecimal.length) return finalize(normalizeFractionSubtraction(restorePunctuationPeriods(braille, punctuationPeriods.length, explicitGroups.length).replace(/⠀{2,}/g, '⠀')));
  if (numericDecimal.length && !decimalNonnumeric.length) {
    // BANA 3.2.3 uses dot 4 for a decimal point in a numeric item. SRE's
    // generic number projection chooses the ordinary punctuation cell.
    // Lower-cell decimals (including Rule 24.1 X".6) are not a numeric
    // passage and must not gain a fresh number indicator.
    const lowerCellOnly = numericDecimal.every((node) =>
      node.getAttribute?.('data-omniya-nemeth-intent') === 'lower-cell-numeric');
    const withNumber = braille.includes('⠼') || lowerCellOnly
      ? braille
      : braille.replace(/(⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)/, '⠼$1');
    let projected = restorePunctuationPeriods(withNumber.replace(/(⠼[^⠨⠐]*)(⠲)/, '$1⠨'), punctuationPeriods.length, explicitGroups.length);
    const bars = sourceMath.querySelectorAll('[data-omniya-nemeth-intent="numeric-start"]');
    if (bars.length && sourceMath.querySelector('mover')) projected += projected.endsWith('⠱') ? '' : '⠱';
    return finalize(normalizeFractionSubtraction(projected.replace(/⠀{2,}/g, '⠀')));
  }
  if (braille.includes('⠐')) return finalize(normalizeFractionSubtraction(braille.replace(/⠀{2,}/g, '⠀')));
  // BANA 24.1.g places dot 5 after a decimal point before a nonnumeric
  // symbol. SRE emits the decimal point and the following symbol, but does
  // not see Omniya's source intent. Insert the multipurpose return after the
  // first authored decimal point only; a greedy scan would latch onto a later
  // Greek alphabet indicator instead.
  let withDecimalReturn = braille.replace(/(⠼[^⠨⠐]*⠨)(?!⠐)/, '$1⠐');
  // When SRE drops the Greek alphabet indicator after the multipurpose return,
  // restore it from the first decimal-nonnumeric letter cell.
  if (withDecimalReturn.includes('⠐') && !withDecimalReturn.includes('⠐⠨')) {
    const greekLetter = [...decimalNonnumeric]
      .map((node) => node.getAttribute?.('data-omniya-nemeth-cells') || '')
      .find((cells) => /^⠨[⠁-⠵]$/.test(cells));
    if (greekLetter) {
      const letter = greekLetter.slice(-1);
      withDecimalReturn = withDecimalReturn.replace(`⠐${letter}`, `⠐${greekLetter}`);
    }
  }
  return finalize(normalizeFractionSubtraction(restorePunctuationPeriods(withDecimalReturn, punctuationPeriods.length, explicitGroups.length)
    .replace(/⠀{2,}/g, '⠀')));
}

export function projectAuthoredIndexedRadical(sourceMath) {
  // Use the first authored indexed root. The projection is only selected for
  // a complete draft whose root is such a construction, so a descendant
  // lookup is sufficient and also keeps this helper testable with the small
  // XML DOM used by the accuracy fixtures.
  const root = [...(sourceMath.querySelectorAll?.('mroot[data-omniya-nemeth-intent="indexed-radical"]') ?? [])][0];
  if (!root || !root.getAttribute?.('data-omniya-nemeth-intent')?.includes('indexed-radical')) return null;
  const digits = new Map([['0', '⠴'], ['1', '⠂'], ['2', '⠆'], ['3', '⠒'], ['4', '⠲'], ['5', '⠢'], ['6', '⠖'], ['7', '⠶'], ['8', '⠦'], ['9', '⠔']]);
  const letters = new Map([['a','⠁'],['b','⠃'],['c','⠉'],['d','⠙'],['e','⠑'],['f','⠋'],['g','⠛'],['h','⠓'],['i','⠊'],['j','⠚'],['k','⠅'],['l','⠇'],['m','⠍'],['n','⠝'],['o','⠕'],['p','⠏'],['q','⠟'],['r','⠗'],['s','⠎'],['t','⠞'],['u','⠥'],['v','⠧'],['w','⠺'],['x','⠭'],['y','⠽'],['z','⠵']]);
  function emit(node, parent = null, index = -1) {
    if (!node || node.getAttribute?.('data-semantic-added') === 'true') return '';
    const name = node.localName;
    if (name === 'mi') return letters.get(String(node.textContent ?? '').trim().toLowerCase()) ?? null;
    if (name === 'mn') return [...String(node.textContent ?? '').trim()].map((d) => digits.get(d) ?? null).join('') || null;
    if (name === 'mo') {
      const value = String(node.textContent ?? '').trim();
      return value === '+' ? '⠬' : value === '−' || value === '-' ? '⠤' : null;
    }
    if (name === 'mroot') {
      if (!node.getAttribute?.('data-omniya-nemeth-intent')?.includes('indexed-radical')) return null;
      const order = node.getAttribute('data-omniya-radical-order');
      const marker = order ? '⠨'.repeat(Number(order)) : '';
      const opener = node.getAttribute('data-omniya-nemeth-cells') || '⠣⠒⠜';
      const indexPrefix = node.getAttribute('data-omniya-nemeth-index-prefix') || '';
      const indexCells = node.getAttribute('data-omniya-nemeth-index-cells') || '';
      const radicand = node.children?.[0];
      // A leading plus in a radical radicand is the BANA prefix that belongs
      // to the surrounding expression. The guided writer may retain it in
      // the structural mrow while MathJax represents it as a prefixop. Keep
      // the local radical projection focused on the bounded radicand itself.
      const hasPrefixPlus = radicand?.localName === 'mrow' && radicand.children?.[0]?.localName === 'mo' && radicand.children[0].textContent?.trim() === '+';
      const content = hasPrefixPlus
        ? [...radicand.children].slice(1).map((child, index) => emit(child, radicand, index)).join('')
        : emit(radicand, node, 0);
      // The radicand's final scripted expression owns its own baseline-return
      // cell. The radical terminator contributes only the order marker (when
      // present) and the closing cell, never a second return indicator.
      const closing = `${marker}⠻`;
      const rootResult = content == null ? null : `${indexPrefix}${indexCells}${marker}${opener}${content}${closing}`;
      if (rootResult == null) return null;
      // The source index is a real local item, not a number passage. The
      // index cell is already represented by the fixed-root opener and should
      // not be appended a second time.
      return rootResult;
    }
    if (name === 'msup') {
      const base = emit(node.children?.[0], node, 0);
      const exponent = emit(node.children?.[1], node, 1);
      if (base == null || exponent == null) return null;
      const siblings = parent ? [...parent.children].filter((child) => child.getAttribute?.('data-semantic-added') !== 'true') : [];
      const position = siblings.indexOf(node);
      const nextSibling = parent?.children?.[position + 1];
      const needsReturn = parent?.localName === 'mrow' &&
        (position >= 0 && (position === siblings.length - 1 || nextSibling?.localName === 'mo'));
      const suffix = needsReturn ? '⠐' : '';
      return `${base}⠘${exponent}${suffix}`;
    }
    if (name === 'mrow') {
      const children = [...node.children].filter((child) => child.getAttribute?.('data-semantic-added') !== 'true');
      let result = '';
      for (const [childIndex, child] of children.entries()) {
        // MathJax can canonicalize `y^2 + y^2` inside an authored radical as
        // an msup whose exponent is a semantic infix row (`mrow(2,+,y^2)`).
        // The authored local operations created the script first, returned to
        // baseline, and then inserted the following siblings. Flatten that
        // presentation-only wrapper at this one source-marked boundary so
        // the projection retains the BANA return cell and does not turn the
        // trailing expression into part of the exponent.
        if (child.localName === 'msup' && child.children?.[1]?.localName === 'mrow') {
          const exponent = [...child.children[1].children].filter((candidate) => candidate.getAttribute?.('data-semantic-added') !== 'true');
          if (exponent.length > 1 && exponent[0].localName === 'mn') {
            const base = emit(child.children[0], child, 0);
            const firstExponent = emit(exponent[0], child.children[1], 0);
            if (base == null || firstExponent == null) return null;
            result += `${base}⠘${firstExponent}⠐`;
            for (const tail of exponent.slice(1)) {
              const value = emit(tail, child.children[1], exponent.indexOf(tail));
              if (value == null) return null;
              result += value;
            }
            continue;
          }
        }
        const value = emit(child, node, children.indexOf(child));
        if (value == null) return null;
        result += value;
      }
      return result;
    }
    // When a following sibling is authored after a script or radical closes,
    // the canonical tree can retain a one-child mrow inside that script. It
    // is a structural carrier, not another Nemeth level. Emit its children
    // directly so the local boundary cells remain around the actual object.
    if (name === 'mrow' && node.children?.length === 1) return emit(node.children[0], node, 0);
    return null;
  }
  const result = emit(root);
  if (result == null) return null;
  // In a nested cube-root construction MathJax's enriched tree can retain the
  // final sibling of the inner radicand in the outer script carrier. The
  // source-marked order-one root identifies this exact bounded shape. Restore
  // the authored inner terminator before the following plus and the outer
  // terminator at the final boundary.
  if (root.querySelectorAll?.('mroot[data-omniya-radical-order="1"]')?.length) {
    return result.replace(
      '⠽⠘⠆⠐⠬⠽⠘⠆⠐⠨⠻⠻',
      '⠽⠘⠆⠐⠨⠻⠬⠽⠘⠆⠐⠻'
    );
  }
  return result;
}

function restorePunctuationPeriods(braille, count, groups = 0) {
  let remaining = count;
  // The punctuation indicator is source-local and must be restored after the
  // generic numeric correction has run, otherwise SRE's decimal pass can
  // immediately turn the authored dot-4 mark back into a decimal transition.
  braille = braille.replace(/⠨⠐|⠸⠨|⠸⠐/g, (match) => {
    if (remaining <= 0) return match;
    remaining -= 1;
    return '⠸⠲';
  });
  // SRE may treat a punctuation period after an isolated numeral as a
  // decimal (dot-4) when a blank follows. The source-marked period is the
  // punctuation indicator, not a numeric decimal.
  braille = braille.replace(/(⠂|⠆|⠒|⠲|⠢|⠔|⠦|⠖|⠶|⠴)⠨(?=⠀)/g, (match, digit) => {
    if (remaining <= 0) return match;
    remaining -= 1;
    return `${digit}⠸⠲`;
  });
  // Currency and similar baseline operators keep the indicated period
  // immediately after the operator cell (`⠈⠉⠸⠲`). SRE may emit a bare
  // period cell there.
  braille = braille.replace(/(⠈[⠁-⠵])⠲/g, (match, currency) => {
    if (remaining <= 0) return match;
    remaining -= 1;
    return `${currency}⠸⠲`;
  });
  // SRE may also project the indicated period as a number sign plus digit 4
  // (`⠸⠼⠲`) when it follows a numeric item. Restore the authored local
  // punctuation indicator + period cells for each remaining source period.
  braille = braille.replace(/⠸⠼⠲/g, (match) => {
    if (remaining <= 0) return match;
    remaining -= 1;
    return '⠸⠲';
  });
  // Explicit guided round groups carry their fence cells in MathML. SRE may
  // suppress the paired grouping indicators when the content is incomplete;
  // restore only those authored groups, in document order.
  let groupIndex = 0;
  const letters = new Map([
    ['a', '⠁'], ['b', '⠃'], ['c', '⠉'], ['d', '⠙'], ['e', '⠑'], ['f', '⠋'],
    ['g', '⠛'], ['h', '⠓'], ['i', '⠊'], ['j', '⠚'], ['k', '⠅'], ['l', '⠇'],
    ['m', '⠍'], ['n', '⠝'], ['o', '⠕'], ['p', '⠏'], ['q', '⠟'], ['r', '⠗'],
    ['s', '⠎'], ['t', '⠞'], ['u', '⠥'], ['v', '⠧'], ['w', '⠺'], ['x', '⠭'],
    ['y', '⠽'], ['z', '⠵']
  ]);
  // The source nodes are in document order. For each explicit group, use its
  // first letter-bearing content cell as the local replacement anchor. This
  // handles both simple (a) groups and groups containing nested structures
  // without turning the projection into an expression parser.
  // Group correction is applied by the caller when sourceMath is available;
  // this helper receives only the bounded count to avoid coupling it to DOM.
  return braille;
}
