/**
 * One Tab stop for a group of controls, with arrow keys inside it.
 *
 * This is the "roving tabindex" of the WAI-ARIA Authoring Practices (the Toolbar
 * pattern). Word's ribbon, Outlook's message list and Gmail's editor all work this
 * way. A person who Tabs past the group lands on one control, not on every one.
 * A person who wants another control uses the arrow keys.
 *
 * Only one item has `tabindex="0"`. The rest have `-1`, so they still take focus
 * from a script, a click or an arrow key. The stop is the item last used, so
 * Shift+Tab back into the group returns to where the person was.
 *
 * Call `refresh()` after the items change (the list of notes is drawn again on
 * every edit). `fallback` names the item to use when none has been used yet.
 */
export function attachRoving(container, { items, keys, wrap = false, fallback = () => null }) {
  const [previous, next] = keys;
  let stop = null;

  const live = () => [...container.querySelectorAll(items)].filter((item) => !item.hidden);

  function refresh() {
    const all = live();
    if (!all.includes(stop)) stop = fallback(all) ?? all[0] ?? null;
    for (const item of container.querySelectorAll(items)) item.tabIndex = item === stop ? 0 : -1;
  }

  function move(all, from, to) {
    const target = all[to];
    if (!target || target === from) return;
    stop = target;
    refresh();
    target.focus();
  }

  container.addEventListener('focusin', (event) => {
    const item = event.target instanceof Element ? event.target.closest(items) : null;
    if (!item || item === stop || !container.contains(item)) return;
    stop = item;
    refresh();
  });

  container.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const from = event.target instanceof Element ? event.target.closest(items) : null;
    const all = live();
    const index = all.indexOf(from);
    if (index < 0) return;
    let to = null;
    if (event.key === previous) to = index > 0 ? index - 1 : (wrap ? all.length - 1 : index);
    else if (event.key === next) to = index < all.length - 1 ? index + 1 : (wrap ? 0 : index);
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = all.length - 1;
    if (to === null) return;
    event.preventDefault();
    move(all, from, to);
  });

  refresh();
  return { refresh };
}
