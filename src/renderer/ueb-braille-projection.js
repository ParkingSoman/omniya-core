export async function applyUebBrailleLabel(element, text, grade, translateUeb) {
  if (!element) return;
  try {
    const result = await translateUeb(text ?? '', grade);
    const braille = typeof result === 'string' ? result : result?.braille;
    element.setAttribute('aria-braillelabel', braille || '');
  } catch {
    element.removeAttribute('aria-braillelabel');
  }
}
