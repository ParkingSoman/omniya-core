import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authoredSourceRoot,
  captureExplorerFocus,
  canonicalId
} from '../../src/renderer/math-explorer-bridge.js';

function h(name, attrs = {}, ...kids) {
  const node = {
    nodeType: 1,
    localName: name,
    tagName: name.toUpperCase(),
    attrs: { ...attrs },
    childNodes: [],
    parentElement: null,
    get id() {
      return this.attrs.id || '';
    },
    getAttribute(key) {
      const value = this.attrs[key];
      return value == null ? null : String(value);
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (matches(current, selector)) return current;
        current = current.parentElement;
      }
      return null;
    },
    contains(other) {
      if (other === this) return true;
      return this.childNodes.some((child) => child.contains?.(other));
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      const found = [];
      const walk = (current) => {
        if (current.nodeType === 1 && matches(current, selector)) found.push(current);
        current.childNodes?.forEach(walk);
      };
      this.childNodes.forEach(walk);
      if (matches(this, selector)) found.unshift(this);
      return found;
    }
  };
  for (const kid of kids.flat()) {
    if (!kid) continue;
    kid.parentElement = node;
    node.childNodes.push(kid);
  }
  node.children = node.childNodes;
  node.outerHTML = `<${name}>`;
  return node;
}

function matches(node, selector) {
  const parts = String(selector).split(',').map((part) => part.trim()).filter(Boolean);
  return parts.some((part) => matchSimple(node, part));
}

function matchSimple(node, selector) {
  const chunks = selector.split(/\s+/).filter(Boolean);
  if (chunks.length > 1) {
    const last = chunks.at(-1);
    if (!matchSimple(node, last)) return false;
    let ancestor = node.parentElement;
    const rest = chunks.slice(0, -1).join(' ');
    while (ancestor) {
      if (matchSimple(ancestor, rest) || matchSimple(ancestor, chunks[0])) return true;
      ancestor = ancestor.parentElement;
    }
    return false;
  }
  let rest = selector;
  const tag = rest.match(/^([a-z][\w-]*)/i);
  if (tag) {
    if (node.localName !== tag[1].toLowerCase()) return false;
    rest = rest.slice(tag[1].length);
  }
  const attrs = [...rest.matchAll(/\[([^\]]+)\]/g)];
  return attrs.every((match) => {
    const body = match[1];
    const prefix = body.match(/^([:\w-]+)\^="([^"]*)"$/);
    if (prefix) {
      const value = prefix[1] === 'id' ? node.id : node.getAttribute(prefix[1]);
      return Boolean(value?.startsWith(prefix[2]));
    }
    const eq = body.match(/^([:\w-]+)="([^"]*)"$/);
    if (eq) return node.getAttribute(eq[1]) === eq[2];
    return Boolean(node.getAttribute(body) || (body === 'id' && node.id));
  });
}

function stubMathJax(article, current) {
  globalThis.MathJax = {
    startup: {
      document: {
        activeItem: {
          explorers: { speech: { current, semanticFocus() { return null; } } }
        },
        getMathItemsWithin(node) {
          if (node === article || article.contains(node)) {
            return [{ explorers: { speech: { current, semanticFocus() { return null; } } } }];
          }
          return [];
        }
      }
    }
  };
}

test('canonicalId reads omniya-source ids after assistive sanitization', () => {
  const node = h('msup', { id: 'omniya-source-omniya-term' });
  assert.equal(canonicalId(node), 'omniya-term');
});

test('authoredSourceRoot prefers the application math, not the assistive clone', () => {
  const authored = h('math', {
    'data-omniya-id': 'omniya-root',
    id: 'omniya-source-omniya-root'
  }, h('msup', { 'data-omniya-id': 'omniya-term', id: 'omniya-source-omniya-term', 'data-semantic-id': '2' }));
  const assistive = h('mjx-assistive-mml', {}, h('math', { 'data-semantic-id': '7' }));
  const article = h('article', { class: 'napkin-article' },
    h('span', {}, authored),
    h('mjx-container', {}, assistive)
  );
  assert.equal(canonicalId(authoredSourceRoot(article)), 'omniya-root');
});

test('a matching semantic id on authored MathML is the substitution slot', () => {
  const msup = h('msup', {
    'data-omniya-id': 'omniya-term',
    id: 'omniya-source-omniya-term',
    'data-semantic-id': '2'
  });
  const authored = h('math', {
    'data-omniya-id': 'omniya-root',
    id: 'omniya-source-omniya-root',
    'data-semantic-id': '7'
  }, msup);
  const focused = h('span', {
    'data-semantic-id': '2',
    'data-semantic-type': 'superscript',
    'data-semantic-speech-none': 'x to the fourth power'
  });
  const article = h('article', { class: 'napkin-article' }, h('span', {}, authored), focused);
  stubMathJax(article, focused);

  const result = captureExplorerFocus(article);
  assert.equal(result.target.kind, 'node');
  assert.equal(result.target.nodeId, 'omniya-term');
  assert.match(result.speech, /fourth/i);
});

test('a virtual SRE grouping with no authored element refuses instead of replacing the equation', () => {
  const msup = h('msup', {
    'data-omniya-id': 'omniya-term',
    id: 'omniya-source-omniya-term',
    'data-semantic-id': '2'
  });
  const authored = h('math', {
    'data-omniya-id': 'omniya-root',
    id: 'omniya-source-omniya-root',
    'data-semantic-id': '7'
  }, msup);
  const focused = h('span', {
    'data-semantic-id': '99',
    'data-semantic-type': 'infixop',
    'data-speech': 's y plus 1 to the fourth power'
  });
  const article = h('article', { class: 'napkin-article' }, h('span', {}, authored), focused);
  stubMathJax(article, focused);
  globalThis.__omniyaReplaceRefusals = [];

  assert.throws(() => captureExplorerFocus(article), /not a MathML element/i);
  const debug = globalThis.__omniyaReplaceRefusals.at(-1);
  assert.equal(debug?.semanticType, 'infixop');
  assert.equal(debug?.semanticId, '99');
  assert.match(debug?.speech ?? '', /s y plus 1/i);
});

test('capture uses this article’s MathItem, not another equation’s activeItem', () => {
  const authored = h('math', {
    'data-omniya-id': 'omniya-root',
    id: 'omniya-source-omniya-root',
    'data-semantic-id': '1'
  });
  const article = h('article', { class: 'napkin-article' }, h('span', {}, authored));
  const otherFocus = h('mi', {
    'data-omniya-id': 'other-term',
    'data-semantic-id': '8',
    'data-speech': 'stolen'
  });
  globalThis.MathJax = {
    startup: {
      document: {
        activeItem: {
          explorers: { speech: { current: otherFocus, semanticFocus() { return null; } } }
        },
        getMathItemsWithin() {
          return [];
        }
      }
    }
  };

  const result = captureExplorerFocus(article);
  assert.equal(result.target.nodeId, 'omniya-root');
  assert.notEqual(result.target.nodeId, 'other-term');
  assert.notEqual(result.speech, 'stolen');
});
