export interface Box { left: number; top: number; right: number; bottom: number }
export interface FloatingPlacement { left: number; top: number; width: number; maxHeight: number; side: 'top' | 'bottom' }

/** Viewport coordinates are CSS pixels, including WebView/device scaling. */
export function placeFloating(anchor: Box, viewport: Box, desiredWidth: number, desiredHeight: number, margin = 8, gap = 5): FloatingPlacement {
  const anchorTop = Math.max(viewport.top + margin, Math.min(anchor.top, viewport.bottom - margin));
  const anchorBottom = Math.max(anchorTop, Math.min(anchor.bottom, viewport.bottom - margin));
  const width = Math.max(0, Math.min(desiredWidth, viewport.right - viewport.left - margin * 2));
  const below = Math.max(0, viewport.bottom - margin - anchorBottom - gap);
  const above = Math.max(0, anchorTop - gap - viewport.top - margin);
  const side = below >= desiredHeight || below >= above ? 'bottom' : 'top';
  const maxHeight = Math.min(desiredHeight, side === 'bottom' ? below : above);
  return {
    left: Math.max(viewport.left + margin, Math.min(anchor.left, viewport.right - margin - width)),
    top: side === 'bottom' ? anchorBottom + gap : anchorTop - gap - maxHeight,
    width, maxHeight, side,
  };
}
