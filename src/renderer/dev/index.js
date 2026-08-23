/**
 * Single entry point for the dev tools, reached by one dynamic import in
 * `app.js`. Dynamic so a build where this directory was excluded degrades to a
 * no-op instead of failing to parse.
 */
import { attachInputCapture } from '../input-capture.js';
import { createInspectorPanel } from './input-inspector-panel.js';
import { createInputLog } from '../input-log.js';

export function enableDevTools({ document = globalThis.document, log } = {}) {
  const { render } = createInspectorPanel({ document });
  // Renders the log the app already keeps rather than starting a second one:
  // two captures on the same field would double every entry and disagree about
  // `defaultPrevented`, which is the field most worth trusting here.
  const target = log ?? createInputLog();
  if (log) {
    render(log);
    log.subscribe?.(render);
  } else {
    attachInputCapture({ document, log: target, onChange: render });
  }
  return { log: target, render };
}
