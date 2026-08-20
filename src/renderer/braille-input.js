const DOT_KEYS = new Map([['s', 4], ['d', 2], ['f', 1], ['j', 8], ['k', 16], ['l', 32]]);

export function createSixKeyInput({ emit, onUnsupported } = {}) {
  let pressed = new Set();
  let active = false;
  let chordMask = 0;
  const finish = () => {
    if (!active || chordMask === 0) return;
    const mask = chordMask;
    emit?.(String.fromCodePoint(0x2800 + mask));
    pressed = new Set();
    chordMask = 0;
    active = false;
  };
  return {
    keydown(event) {
      const key = event.key.toLowerCase();
      if (!DOT_KEYS.has(key) || event.metaKey || event.ctrlKey || event.altKey) return false;
      event.preventDefault();
      active = true;
      pressed.add(key);
      chordMask |= DOT_KEYS.get(key);
      return true;
    },
    keyup(event) {
      const key = event.key.toLowerCase();
      if (!DOT_KEYS.has(key)) return false;
      pressed.delete(key);
      if (pressed.size === 0) {
        finish();
      }
      return true;
    },
    blur() { pressed = new Set(); chordMask = 0; active = false; },
    unsupported() { onUnsupported?.('Six-key input is unavailable; use a braille display or paste instead.'); }
  };
}
