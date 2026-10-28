import type { MathfieldElement } from 'mathlive';
import type { Box } from '../completion/FloatingPosition';

/** Approximate a caret from the public offset bounds, never Shadow DOM. */
export function caretAnchor(field: MathfieldElement): Box {
  const viewport = field.getBoundingClientRect();
  const position = field.position;
  let bounds = field.getElementInfo(position)?.bounds;
  if (!bounds) {
    // Postfix script offsets can have no rendered box of their own.
    for (let offset = position - 1; offset >= Math.max(0, position - 8); offset--) {
      const candidate = field.getElementInfo(offset)?.bounds;
      if (candidate) { bounds = candidate; break; }
    }
  }
  const scrollArea = field.parentElement?.getBoundingClientRect() ?? viewport;
  const x = Math.max(scrollArea.left + 4, Math.min(bounds?.right ?? viewport.left + 16, scrollArea.right - 4));
  const top = Math.max(scrollArea.top + 2, Math.min(bounds?.top ?? viewport.top + 10, scrollArea.bottom - 18));
  const bottom = Math.max(top + 12, Math.min(bounds?.bottom ?? top + 28, scrollArea.bottom - 2));
  return { left: x, right: x + 1, top, bottom };
}

export function revealCaret(field: MathfieldElement): void {
  if (!field.hasFocus()) return;
  const container = field.parentElement;
  const bounds = field.getElementInfo(field.position)?.bounds;
  if (!container || !bounds || container.scrollHeight <= container.clientHeight) return;
  const visible = container.getBoundingClientRect();
  const top = bounds.height > visible.height ? (bounds.top + bounds.bottom) / 2 - 8 : bounds.top;
  const bottom = bounds.height > visible.height ? top + 16 : bounds.bottom;
  if (top < visible.top + 4) container.scrollTop += top - visible.top - 4;
  else if (bottom > visible.bottom - 4) container.scrollTop += bottom - visible.bottom + 4;
}
