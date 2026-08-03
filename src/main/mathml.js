import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { SerializedMmlVisitor } from '@mathjax/src/js/core/MmlTree/SerializedMmlVisitor.js';
import { STATE } from '@mathjax/src/js/core/MathItem.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';

import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: ['base', 'ams', 'newcommand', 'noundefined'],
  formatError() {
    throw new SyntaxError('Invalid LaTeX');
  }
});
const document = mathjax.document('', { InputJax: tex });
const visitor = new SerializedMmlVisitor();

export async function convertLatexToMathML(source) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new Error('LaTeX source is required.');
  }

  try {
    const node = document.convert(source.trim(), {
      display: true,
      end: STATE.CONVERT
    });
    const mathml = visitor.visitTree(node, document);
    if (!mathml.startsWith('<math') ||
        !mathml.includes('xmlns="http://www.w3.org/1998/Math/MathML"')) {
      throw new Error('MathJax did not return MathML');
    }
    return mathml;
  } catch {
    throw new Error('The LaTeX could not be converted. Check its syntax.');
  }
}
