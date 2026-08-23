/**
 * The visible half of the inspector. Builds its own DOM so `index.html` gains
 * nothing and the `elements` map in `app.js` gains no ids.
 *
 * `aria-hidden` and out of the tab order, on purpose. This is a readout for a
 * sighted developer watching what a braille device sent; injecting an
 * undesigned live region into a screen-reader-first app -- one that would
 * announce on every keystroke, next to the status line that already does --
 * would be exactly the "decide it for blind users" guesswork this project
 * refuses to do without evidence. The contributor-facing view of this same data
 * is the diagnostics dump, which is deliberate, on request, and silent.
 */
import { formatEntry } from '../input-log.js';

const MAX_ROWS = 12;

export function createInspectorPanel({ document }) {
  const panel = document.createElement('details');
  panel.id = 'omniya-dev-input-inspector';
  panel.setAttribute('aria-hidden', 'true');
  panel.open = true;
  panel.style.cssText = [
    'position:fixed', 'right:8px', 'bottom:8px', 'z-index:9999',
    'max-width:min(46rem,60vw)', 'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'background:Canvas', 'color:CanvasText', 'border:1px solid GrayText',
    'border-radius:6px', 'padding:6px 8px', 'opacity:.94'
  ].join(';');

  const summary = document.createElement('summary');
  summary.textContent = 'Nemeth input inspector (dev)';
  summary.style.cssText = 'cursor:pointer;font-weight:600';
  summary.setAttribute('tabindex', '-1');
  panel.append(summary);

  const list = document.createElement('pre');
  list.style.cssText = 'margin:6px 0 0;white-space:pre-wrap;overflow-x:auto;max-height:14rem';
  panel.append(list);

  const render = (log) => {
    list.textContent = log.entries().slice(-MAX_ROWS).map(formatEntry).join('\n');
  };

  (document.querySelector('#app-shell') ?? document.body).append(panel);
  return { panel, render };
}
