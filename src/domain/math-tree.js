/** Canonical, application-owned MathML tree utilities. */

export const MATH_FORMAT_VERSION = 2;
const NS = 'http://www.w3.org/1998/Math/MathML';
const ALLOWED = new Set(['math', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace', 'msup', 'msub', 'msubsup', 'mmultiscripts', 'mprescripts', 'none', 'mfrac', 'msqrt', 'mroot', 'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd', 'menclose', 'mpadded', 'mstyle', 'semantics', 'annotation']);
const TRANSIENT = /^(data-semantic-|data-speech|aria-|data-mjx-)/i;
const SAFE_ATTRIBUTES = new Set(['xmlns', 'data-omniya-id', 'data-omniya-hole', 'data-omniya-owner', 'data-omniya-role', 'data-omniya-group', 'data-omniya-fraction-kind', 'data-omniya-shape-kind', 'data-omniya-shape-modification', 'data-omniya-nemeth-intent', 'width', 'height', 'stretchy', 'displaystyle', 'scriptlevel', 'linethickness', 'open', 'close', 'notation', 'mathvariant', 'rowalign', 'columnalign', 'columnwidth', 'columnspan', 'rowspan', 'fence', 'separator', 'accent', 'movablelimits', 'symmetric', 'bevelled', 'lspace', 'rspace']);

function id() { return `omniya-${globalThis.crypto.randomUUID()}`; }

function decodeText(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body) => {
    const lower = body.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    const code = lower.startsWith('#x') ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
  });
}

function parse(source) {
  if (typeof source !== 'string' || !source.trim()) throw new TypeError('MathML is required');
  const tokens = source.match(/<[^>]+>|[^<]+/g) ?? [];
  const root = { name: null, attrs: {}, children: [] };
  const stack = [root];
  for (const token of tokens) {
    if (!token.trim() && !token.includes(' ')) continue;
    if (token.startsWith('<?') || token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const name = token.slice(2, -1).trim();
      if (stack.length === 1 || stack.at(-1).name !== name) throw new SyntaxError('Malformed MathML');
      stack.pop();
      continue;
    }
    if (token.startsWith('<')) {
      const self = token.endsWith('/>');
      const body = token.slice(1, self ? -2 : -1).trim();
      const match = body.match(/^([:\w-]+)([\s\S]*)$/);
      if (!match || !ALLOWED.has(match[1])) throw new SyntaxError(`Unsupported MathML element: ${match?.[1] ?? ''}`);
      const attrs = {};
      const attrRe = /([:\w-]+)\s*=\s*["']([^"']*)["']/g;
      let m;
      while ((m = attrRe.exec(match[2]))) {
        if (m[1] === 'xmlns' && m[2] !== NS) throw new SyntaxError('Invalid MathML namespace');
        if (m[1].startsWith('on') || m[1] === 'href' || m[1] === 'xlink:href' || m[1].includes(':')) throw new SyntaxError('Unsafe MathML attribute');
        if (!TRANSIENT.test(m[1]) && SAFE_ATTRIBUTES.has(m[1])) attrs[m[1]] = m[2];
      }
      const node = { name: match[1], attrs, children: [] };
      stack.at(-1).children.push(node);
      if (!self) stack.push(node);
    } else {
      // Pretty-printed MathML commonly places indentation between elements.
      // Those formatting nodes are not mathematical children and must not
      // change focus paths or structural arity. Preserve whitespace only in
      // mtext, where it is user content rather than XML formatting.
      if (!token.trim() && stack.at(-1).name !== 'mtext') continue;
      stack.at(-1).children.push({ text: decodeText(token) });
    }
  }
  if (stack.length !== 1 || root.children.length !== 1 || root.children[0].name !== 'math') throw new SyntaxError('MathML root must be math');
  return root.children[0];
}

function serializeNode(node) {
  if (node.text !== undefined) return String(node.text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const attrs = Object.entries(node.attrs ?? {}).map(([k, v]) => ` ${k}="${String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;') }"`).join('');
  if (!node.children?.length) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(serializeNode).join('')}</${node.name}>`;
}

function assign(node, used = new Set()) {
  if (node.text !== undefined) return node;
  const candidate = node.attrs['data-omniya-id'];
  node.attrs['data-omniya-id'] = candidate && !used.has(candidate) ? candidate : id();
  used.add(node.attrs['data-omniya-id']);
  node.children.forEach((child) => assign(child, used));
}

export function parseMathML(source) { const tree = parse(source); assign(tree); return tree; }
export function serializeMathML(tree) {
  if (!tree || tree.name !== 'math') throw new TypeError('MathML tree root must be math');
  return serializeNode(tree);
}
export function canonicalizeMathML(source) { return serializeMathML(parseMathML(source)); }

export function createHole({ ownerNodeId = null, role = 'content', idFactory = id } = {}) {
  const attrs = { 'data-omniya-id': idFactory(), 'data-omniya-hole': 'true' };
  if (ownerNodeId) attrs['data-omniya-owner'] = ownerNodeId;
  if (role) attrs['data-omniya-role'] = role;
  return { name: 'mrow', attrs, children: [{ name: 'mspace', attrs: { width: '1em' }, children: [] }] };
}

function isElement(node) { return Boolean(node && node.text === undefined); }

function parentIndex(tree) {
  const index = new Map();
  const visit = (node, parent = null, childIndex = -1, path = []) => {
    if (!isElement(node)) return;
    const nodeId = node.attrs?.['data-omniya-id'];
    if (nodeId) index.set(nodeId, { node, parent, childIndex, path });
    node.children?.forEach((child, i) => visit(child, node, i, [...path, i]));
  };
  visit(tree);
  return index;
}

export function buildMathIndex(tree) { return parentIndex(tree); }

export function findMathNode(tree, nodeId) {
  if (tree?.attrs?.['data-omniya-id'] === nodeId) return tree;
  for (const child of tree?.children ?? []) { const found = findMathNode(child, nodeId); if (found) return found; }
  return null;
}

export function findMathParent(tree, nodeId) { return parentIndex(tree).get(nodeId)?.parent ?? null; }

const REQUIRED_CHILDREN = new Map([
  ['mfrac', ['numerator', 'denominator']],
  ['msup', ['base', 'superscript']],
  ['msub', ['base', 'subscript']],
  ['msubsup', ['base', 'subscript', 'superscript']],
  ['mroot', ['radicand', 'index']],
  ['mover', ['base', 'overscript']],
  ['munder', ['base', 'underscript']],
  ['munderover', ['base', 'underscript', 'overscript']],
  ['mmultiscripts', ['base']]
]);

export function completionReport(treeOrDocument) {
  const tree = treeOrDocument?.name ? treeOrDocument : parseMathML(treeOrDocument?.mathml);
  const holes = [];
  const visit = (node, path = [], owner = null) => {
    if (!isElement(node)) return;
    const nodeId = node.attrs?.['data-omniya-id'];
    if (node.attrs?.['data-omniya-hole'] === 'true') {
      holes.push({ nodeId, ownerNodeId: node.attrs?.['data-omniya-owner'] ?? owner?.attrs?.['data-omniya-id'] ?? null, role: node.attrs?.['data-omniya-role'] ?? 'content', path: path.map(String) });
      return;
    }
    const roles = REQUIRED_CHILDREN.get(node.name);
    if (roles) {
      roles.forEach((role, index) => {
        const child = node.children?.[index];
        if (!child || !isElement(child)) holes.push({ nodeId: `${nodeId}:${role}`, ownerNodeId: nodeId, role, path: [...path, index].map(String) });
        else visit(child, [...path, index], node);
      });
      node.children?.slice(roles.length).forEach((child, index) => visit(child, [...path, roles.length + index], node));
      return;
    }
    node.children?.forEach((child, index) => visit(child, [...path, index], node));
  };
  visit(tree);
  return { complete: holes.length === 0, holes };
}

function replaceChildren(parent, first, last, replacement) {
  const indices = parent.children.map((c, i) => ({ c, i })).filter(({ c }) => c.text === undefined);
  const a = indices.find(({ c }) => c.attrs?.['data-omniya-id'] === first)?.i;
  const b = indices.find(({ c }) => c.attrs?.['data-omniya-id'] === last)?.i;
  if (a === undefined || b === undefined || b < a) throw new RangeError('Math range is not contiguous');
  parent.children.splice(a, b - a + 1, replacement);
}

export function replaceMathTarget(tree, target, replacementTree) {
  const next = structuredClone(tree);
  const replacement = structuredClone(replacementTree);
  if (!isElement(replacement) || replacement.name === 'math') {
    throw new TypeError('Math replacement must be one non-root MathML element');
  }
  if (target.kind === 'node') {
    const old = findMathNode(next, target.nodeId);
    if (!old) throw new RangeError('Math node not found');
    replacement.attrs['data-omniya-id'] = target.nodeId;
    const walk = (parent) => { for (let i = 0; i < parent.children.length; i++) { const c = parent.children[i]; if (c === old) { parent.children[i] = replacement; return true; } if (c.text === undefined && walk(c)) return true; } return false; };
    if (old === next) {
      next.children = [replacement];
      return next;
    }
    walk(next);
  } else {
    const parent = findMathNode(next, target.parentNodeId);
    if (!parent) throw new RangeError('Math range parent not found');
    // A range has no source element of its own. Reusing the first selected
    // node's identity gives the replacement a stable focus anchor while all
    // unaffected siblings retain their original identities.
    replacement.attrs['data-omniya-id'] = target.firstNodeId;
    replaceChildren(parent, target.firstNodeId, target.lastNodeId, replacement);
  }
  return next;
}

export function replaceNodeAtAddress(tree, address, replacementTree) {
  return replaceMathTarget(tree, address, replacementTree);
}

export function insertMathChild(tree, parentNodeId, child, index = null) {
  const next = structuredClone(tree);
  const parent = findMathNode(next, parentNodeId);
  if (!parent) throw new RangeError('Math parent not found');
  const at = index === null ? parent.children.length : Math.max(0, Math.min(index, parent.children.length));
  parent.children.splice(at, 0, structuredClone(child));
  return next;
}

export function removeMathNode(tree, nodeId, { replaceRequiredWithHole = true } = {}) {
  const next = structuredClone(tree);
  const index = parentIndex(next);
  const entry = index.get(nodeId);
  if (!entry?.parent) throw new RangeError('Cannot remove MathML root');
  const role = REQUIRED_CHILDREN.get(entry.parent.name)?.[entry.childIndex];
  if (replaceRequiredWithHole && role) entry.parent.children[entry.childIndex] = createHole({ ownerNodeId: entry.parent.attrs['data-omniya-id'], role });
  else entry.parent.children.splice(entry.childIndex, 1);
  return next;
}

export function structuralEquivalent(a, b) {
  const clean = (node) => {
    if (node.text !== undefined) return { text: node.text };
    const attrs = Object.fromEntries(Object.entries(node.attrs ?? {}).filter(([k]) => k !== 'data-omniya-id'));
    const children = node.children.map(clean);
    // MathML converters differ on whether a single script argument is
    // wrapped in an unannotated mrow. Treat that presentation-only wrapper as
    // equivalent while preserving explicit grouping metadata and all other
    // structure.
    if (node.name === 'mrow' && Object.keys(attrs).length === 0 && children.length === 1 && children[0].name) return children[0];
    return { name: node.name, attrs, children };
  };
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}

export function mathAddressForNode(node) { return { kind: 'node', nodeId: node?.attrs?.['data-omniya-id'] }; }
