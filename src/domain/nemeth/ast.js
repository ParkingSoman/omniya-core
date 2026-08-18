/**
 * The AST is the artifact of record.
 *
 * Nodes are frozen, JSON-safe plain objects -- never class instances, because
 * the repo moves trees through `structuredClone`, which drops prototypes. Each
 * node is `{ kind, ...fields, src, marks }`: `fields` are exactly the ones
 * `kinds.js` lists, in that order, and `src` is the `[start, end]` cell span the
 * node came from (null when it was built by hand).
 *
 * Constructors validate arity and child kinds and throw on violation, so a
 * malformed tree cannot be built at all and the error surfaces at the parse
 * site, where the offsets still exist.
 *
 * `marks` carries what Nemeth stated but LaTeX cannot store -- typeform,
 * fraction order, numeric-indicator and explicit-baseline provenance -- and is
 * populated only from things actually observed in the braille.
 *
 * `Sequence` is juxtaposition and asserts NO semantics. It is not
 * multiplication, and nothing downstream may read it as such.
 */

import { KIND_NAMES, NODE_KINDS } from './kinds.js';

// One entry per field of each kind, positionally matching NODE_KINDS.
// 'node?' marks an optional child, which may be null.
const FIELD_SPECS = Object.freeze({
  Number: ['string'],
  Identifier: ['string'],
  Operator: ['string'],
  Sequence: ['nodes'],
  Fraction: ['node', 'node'],
  Root: ['node', 'node?'],
  Superscript: ['node', 'node'],
  Subscript: ['node', 'node'],
  SubSuperscript: ['node', 'node', 'node'],
  Fenced: ['string', 'node', 'string'],
  FunctionCall: ['string', 'node'],
  BigOperator: ['string', 'node?', 'node?', 'node'],
  Text: ['string'],
  Hole: ['string']
});

for (const kind of KIND_NAMES) {
  const specs = FIELD_SPECS[kind];
  if (!specs || specs.length !== NODE_KINDS[kind].length) {
    throw new Error(`ast.js has no field specs matching the kind registry for ${kind}`);
  }
}

export function isNode(value) {
  return Boolean(value) && typeof value === 'object' && KIND_NAMES.includes(value.kind);
}

function describe(value) {
  if (isNode(value)) return value.kind;
  if (Array.isArray(value)) return 'array';
  return value === null ? 'null' : typeof value;
}

const ACCEPTS = Object.freeze({
  string: (value) => typeof value === 'string',
  node: isNode,
  'node?': (value) => value === null || isNode(value),
  nodes: (value) => Array.isArray(value) && value.length > 0 && value.every(isNode)
});

function validate(kind, field, spec, value) {
  if (!ACCEPTS[spec](value)) {
    throw new TypeError(`${kind}.${field} must be ${spec}, received ${describe(value)}`);
  }
}

function makeConstructor(kind) {
  const fields = NODE_KINDS[kind];
  const specs = FIELD_SPECS[kind];
  return (...args) => {
    if (args.length !== fields.length && args.length !== fields.length + 1) {
      throw new TypeError(
        `${kind} takes ${fields.length} field(s) (${fields.join(', ')}) and an optional options object, received ${args.length} argument(s)`
      );
    }
    const options = args.length === fields.length + 1 ? args[fields.length] : {};
    if (typeof options !== 'object' || options === null || isNode(options)) {
      // Without this, one field too many is read as options and silently dropped.
      throw new TypeError(`${kind}: the trailing argument must be an options object, received ${describe(options)}`);
    }
    const values = args.slice(0, fields.length);
    const node = { kind };
    for (let i = 0; i < fields.length; i += 1) {
      validate(kind, fields[i], specs[i], values[i]);
      node[fields[i]] = specs[i] === 'nodes' ? Object.freeze([...values[i]]) : values[i];
    }
    node.src = options.src ?? null;
    node.marks = Object.freeze({ ...options.marks });
    return Object.freeze(node);
  };
}

const CONSTRUCTORS = Object.freeze(
  Object.fromEntries(KIND_NAMES.map((kind) => [kind, makeConstructor(kind)]))
);

export const { Number, Identifier, Operator, Sequence } = CONSTRUCTORS;
export const { Fraction, Root, Superscript, Subscript, SubSuperscript } = CONSTRUCTORS;
export const { Fenced, FunctionCall, BigOperator, Text, Hole } = CONSTRUCTORS;

function formatValue(value) {
  if (isNode(value)) return format(value);
  if (Array.isArray(value)) return `[ ${value.map(formatValue).join(', ')} ]`;
  if (typeof value === 'string') return `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;
  return String(value);
}

/**
 * Print a node in constructor form, e.g.
 *   Sequence([ Identifier('x'), Operator('+'), Fraction(Number('2'), Identifier('y')) ])
 *
 * This is the primary debugging surface for the pipeline: `⠹⠁⠬⠃⠌⠉⠼` is opaque
 * to a sighted developer and the printed tree is not.
 */
export function format(node) {
  if (!isNode(node)) throw new TypeError(`format() requires an AST node, received ${describe(node)}`);
  const fields = NODE_KINDS[node.kind].map((field) => formatValue(node[field]));
  return `${node.kind}(${fields.join(', ')})`;
}
