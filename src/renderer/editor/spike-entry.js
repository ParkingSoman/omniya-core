import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { editorSchema } from './schema.js';
import { MathNodeView } from './math-node-view.js';
import { backspaceSelectsMath, deleteSelectsMath } from './commands.js';

const XSQ = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math>';

const para = (...children) => editorSchema.node('paragraph', null, children);
const text = (s) => editorSchema.text(s);
const math = () => editorSchema.node('math', { mathml: XSQ, source: 'x^2', label: 'x squared' });

const doc = editorSchema.node('doc', null, [para(text('Solve '), math(), text(' for x.'))]);

const view = new EditorView(document.querySelector('#editor'), {
  state: EditorState.create({
    schema: editorSchema,
    doc,
    plugins: [
      history(),
      keymap({
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
        Backspace: backspaceSelectsMath,
        Delete: deleteSelectsMath,
      }),
      keymap(baseKeymap),
    ],
  }),
  attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Napkin' },
  nodeViews: { math: (node) => new MathNodeView(node) },
});
globalThis.__editor = view;
