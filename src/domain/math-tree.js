/** Canonical, application-owned MathML tree utilities. */

export const MATH_FORMAT_VERSION = 1;
const NS = 'http://www.w3.org/1998/Math/MathML';
const ALLOWED = new Set(['math', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd', 'menclose', 'mpadded', 'mstyle', 'semantics', 'annotation']);
const TRANSIENT = /^(data-semantic-|data-speech|aria-|data-mjx-)/i;

function id() { return `omniya-${globalThis.crypto.randomUUID()}`; }

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
        if (!TRANSIENT.test(m[1])) attrs[m[1]] = m[2];
      }
      const node = { name: match[1], attrs, children: [] };
      stack.at(-1).children.push(node);
      if (!self) stack.push(node);
    } else {
      stack.at(-1).children.push({ text: token });
    }
  }
  if (stack.length !== 1 || root.children.length !== 1 || root.children[0].name !== 'math') throw new SyntaxError('MathML root must be math');
  return root.children[0];
}

function serializeNode(node) {
  if (node.text !== undefined) return node.text;
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

export function findMathNode(tree, nodeId) {
  if (tree?.attrs?.['data-omniya-id'] === nodeId) return tree;
  for (const child of tree?.children ?? []) { const found = findMathNode(child, nodeId); if (found) return found; }
  return null;
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
    replaceChildren(parent, target.firstNodeId, target.lastNodeId, replacement);
  }
  return next;
}

export function structuralEquivalent(a, b) {
  const clean = (node) => node.text !== undefined ? { text: node.text } : { name: node.name, attrs: Object.fromEntries(Object.entries(node.attrs ?? {}).filter(([k]) => k !== 'data-omniya-id')), children: node.children.map(clean) };
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}

export function mathAddressForNode(node) { return { kind: 'node', nodeId: node?.attrs?.['data-omniya-id'] }; }
