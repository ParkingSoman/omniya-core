import { Schema } from 'prosemirror-model';
import { schema as basic } from 'prosemirror-schema-basic';

// Plain word-processor document: paragraphs of text with inline math.
// Math is one atomic leaf, so the caret treats it as a single unit.
//
// This matches the plain-JSON shape in src/domain/document.js. A speakable label
// is not stored. The node view derives it from MathJax when the equation is drawn.
export const editorSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: basic.spec.nodes.get('paragraph'),
    text: basic.spec.nodes.get('text'),
    math: {
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      attrs: {
        mathml: { default: '' },
        source: { default: '' },
        sourceKind: { default: 'latex' },
      },
    },
  },
  marks: {},
});
