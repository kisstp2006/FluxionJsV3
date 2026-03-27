import type { FuiAlign, FuiButtonNode, FuiDocument, FuiIconNode, FuiLabelNode, FuiNode, FuiNodeType, FuiPanelNode, FuiRect } from './FuiTypes';
import { parseFuiJson } from './FuiParser';

export interface FuiStyleResolved {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  color?: string;
  fontSize?: number;
  align?: FuiAlign;

  // Button-specific
  backgroundColorButton?: string; // unused legacy
  textColor?: string;
  padding?: number;
}

export interface FuiCompiledNode {
  id: string;
  type: FuiNodeType;
  rect: FuiRect; // absolute in document coords
  style?: any;
  text?: string;
  /** Icon-node only: absolute filesystem path to the SVG source file. */
  src?: string;
  children: FuiCompiledNode[];
}

// ── SVG image cache (module-level, survives across renders) ──

type SvgCacheEntry =
  | { state: 'loading' }
  | { state: 'ready'; img: HTMLImageElement }
  | { state: 'error' };

const _svgCache = new Map<string, SvgCacheEntry>();

/**
 * Start loading all SVG icons referenced in a compiled FUI document.
 * When *any* icon finishes loading (or fails), `onLoaded` is called so the
 * caller can trigger a re-render.
 *
 * @param compiled        A compiled FUI document (from `compileFui`).
 * @param resolveAbsPath  Function that converts a project-relative `src` path
 *                        to an absolute filesystem path.
 * @param onLoaded        Callback invoked when at least one icon becomes ready.
 */
export function preloadFuiImages(
  compiled: FuiCompiled,
  resolveAbsPath: (src: string) => string,
  onLoaded: () => void,
): void {
  for (const node of compiled.drawOrder) {
    if (node.type !== 'icon' || !node.src) continue;
    const key = node.src;
    if (_svgCache.has(key)) continue; // already loading or ready

    _svgCache.set(key, { state: 'loading' });
    const absPath = resolveAbsPath(key);
    const url = absPath.startsWith('file://') ? absPath : `file:///${absPath.replace(/\\/g, '/')}`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      _svgCache.set(key, { state: 'ready', img });
      onLoaded();
    };
    img.onerror = () => {
      _svgCache.set(key, { state: 'error' });
    };
    img.src = url;
  }
}

/**
 * Remove a cached SVG image (call after the source file changes on disk).
 */
export function invalidateFuiSvgCache(projectRelSrc: string): void {
  _svgCache.delete(projectRelSrc);
}

export interface FuiCompiled {
  doc: FuiDocument;
  root: FuiCompiledNode;
  nodeById: Map<string, FuiCompiledNode>;
  // Drawing order list for reverse hit-testing (last drawn is on top)
  drawOrder: FuiCompiledNode[];
}

function parseHexColor(color: string, fallback = { r: 1, g: 1, b: 1, a: 1 }): { r: number; g: number; b: number; a: number } {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.substring(1);
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      return { r, g, b, a: 1 };
    }
    if (hex.length === 8) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const a = parseInt(hex.substring(6, 8), 16) / 255;
      return { r, g, b, a };
    }
  }
  // Fallback: let canvas attempt to parse
  return fallback;
}

function withDefaultNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function ensureRect(rect: FuiRect | undefined, fallback: FuiRect): FuiRect {
  return rect ? rect : { ...fallback };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function resolveBackground(style: any): string | undefined {
  // Prefer semantic key names
  return style?.backgroundColor ?? style?.background ?? style?.backgroundColorButton;
}

function resolveBorderColor(style: any): string | undefined {
  return style?.borderColor ?? style?.border ?? undefined;
}

function resolveTextColor(style: any): string | undefined {
  return style?.textColor ?? style?.color ?? undefined;
}

function resolveFontSize(style: any): number {
  return withDefaultNumber(style?.fontSize, 18);
}

function resolveAlign(style: any): FuiAlign {
  const a = style?.align as FuiAlign | undefined;
  if (a === 'left' || a === 'right' || a === 'center') return a;
  return 'center';
}

export function compileFui(doc: FuiDocument): FuiCompiled {
  const nodeById = new Map<string, FuiCompiledNode>();
  const drawOrder: FuiCompiledNode[] = [];

  const walk = (
    node: FuiNode,
    parentAbs: { x: number; y: number },
  ): FuiCompiledNode => {
    const rect = node.rect ?? { x: 0, y: 0, w: doc.canvas.width, h: doc.canvas.height };
    const absRect: FuiRect = {
      x: parentAbs.x + rect.x,
      y: parentAbs.y + rect.y,
      w: rect.w,
      h: rect.h,
    };

    const compiled: FuiCompiledNode = {
      id: node.id,
      type: node.type,
      rect: absRect,
      style: (node as any).style,
      text: (node as any).text,
      src: node.type === 'icon' ? (node as FuiIconNode).src : undefined,
      children: [],
    };

    nodeById.set(compiled.id, compiled);
    drawOrder.push(compiled);

    if (node.type === 'panel') {
      const panel = node as FuiPanelNode;
      const children = panel.children ?? [];
      compiled.children = children.map((c) => walk(c, { x: absRect.x, y: absRect.y }));
    }

    return compiled;
  };

  const root = walk(doc.root, { x: 0, y: 0 });
  return { doc, root, nodeById, drawOrder };
}

export function renderFuiToCanvas(
  doc: FuiDocument,
  ctx: CanvasRenderingContext2D,
  opts?: { scaleX?: number; scaleY?: number },
): void {
  const compiled = compileFui(doc);
  renderCompiledFuiToCanvas(compiled, ctx, opts);
}

export function renderCompiledFuiToCanvas(
  compiled: FuiCompiled,
  ctx: CanvasRenderingContext2D,
  opts?: { scaleX?: number; scaleY?: number },
): void {
  const scaleX = opts?.scaleX ?? 1;
  const scaleY = opts?.scaleY ?? 1;

  // Clear
  ctx.clearRect(0, 0, compiled.doc.canvas.width * scaleX, compiled.doc.canvas.height * scaleY);

  const drawNode = (n: FuiCompiledNode): void => {
    const x = n.rect.x * scaleX;
    const y = n.rect.y * scaleY;
    const w = n.rect.w * scaleX;
    const h = n.rect.h * scaleY;

    const opacity = Math.min(1, Math.max(0, withDefaultNumber(n.style?.opacity, 1)));

    if (n.type === 'panel') {
      const bg = resolveBackground(n.style);
      if (bg) {
        const radius = withDefaultNumber(n.style?.radius, 0) * Math.min(scaleX, scaleY);
        const borderWidth = withDefaultNumber(n.style?.borderWidth, 0) * Math.min(scaleX, scaleY);
        const borderColor = resolveBorderColor(n.style);
        const borderEnabled = borderWidth > 0 && !!borderColor;

        ctx.save();
        ctx.globalAlpha = opacity;
        if (radius > 0) drawRoundedRect(ctx, x, y, w, h, radius);
        else ctx.fillRect(x, y, w, h);
        ctx.fillStyle = bg;
        ctx.fill();

        if (borderEnabled) {
          ctx.strokeStyle = borderColor!;
          ctx.lineWidth = borderWidth;
          if (radius > 0) {
            drawRoundedRect(ctx, x, y, w, h, radius);
          } else {
            ctx.strokeRect(x, y, w, h);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (n.type === 'label') {
      const text = n.text ?? '';
      const color = resolveTextColor(n.style) ?? '#ffffff';
      const fontSize = resolveFontSize(n.style) * Math.min(scaleX, scaleY);
      const align = resolveAlign(n.style);

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      const tx =
        align === 'left' ? x + 4 * scaleX :
        align === 'right' ? x + w - 4 * scaleX :
        x + w / 2;
      const ty = y + h / 2;
      ctx.fillText(text, tx, ty);
      ctx.restore();
    } else if (n.type === 'button') {
      const bg = resolveBackground(n.style) ?? '#1f2a44';
      const borderColor = resolveBorderColor(n.style) ?? '#6b8cff';
      const borderWidth = withDefaultNumber(n.style?.borderWidth, 2) * Math.min(scaleX, scaleY);
      const radius = withDefaultNumber(n.style?.radius, 6) * Math.min(scaleX, scaleY);
      const textColor = resolveTextColor(n.style) ?? '#ffffff';
      const fontSize = resolveFontSize(n.style) * Math.min(scaleX, scaleY);
      const align = resolveAlign(n.style);
      const padding = withDefaultNumber(n.style?.padding, 8) * Math.min(scaleX, scaleY);

      ctx.save();
      ctx.globalAlpha = opacity;

      // Background + border
      ctx.fillStyle = bg;
      drawRoundedRect(ctx, x, y, w, h, radius);
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.stroke();

      // Text
      const text = n.text ?? '';
      ctx.fillStyle = textColor;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      const tx =
        align === 'left' ? x + padding :
        align === 'right' ? x + w - padding :
        x + w / 2;
      const ty = y + h / 2;
      ctx.fillText(text, tx, ty);
      ctx.restore();
    }

    else if (n.type === 'icon') {
      if (n.src) {
        const entry = _svgCache.get(n.src);
        if (entry?.state === 'ready') {
          const fit = n.style?.fit ?? 'contain';
          const tint: string | undefined = n.style?.color;
          const opacity = Math.min(1, Math.max(0, withDefaultNumber(n.style?.opacity, 1)));

          // Compute destination rect based on fit mode.
          let dx = x, dy = y, dw = w, dh = h;
          if (fit === 'contain') {
            const scale = Math.min(w / (entry.img.naturalWidth || w), h / (entry.img.naturalHeight || h));
            dw = entry.img.naturalWidth * scale;
            dh = entry.img.naturalHeight * scale;
            dx = x + (w - dw) / 2;
            dy = y + (h - dh) / 2;
          } else if (fit === 'cover') {
            const scale = Math.max(w / (entry.img.naturalWidth || w), h / (entry.img.naturalHeight || h));
            dw = entry.img.naturalWidth * scale;
            dh = entry.img.naturalHeight * scale;
            dx = x + (w - dw) / 2;
            dy = y + (h - dh) / 2;
          }
          // 'fill' uses the full x/y/w/h as-is.

          ctx.save();
          ctx.globalAlpha = opacity;

          if (tint) {
            // Draw to an offscreen canvas, apply tint, then draw result.
            const tmp = document.createElement('canvas');
            tmp.width = Math.max(1, Math.round(dw));
            tmp.height = Math.max(1, Math.round(dh));
            const tc = tmp.getContext('2d')!;
            tc.drawImage(entry.img, 0, 0, tmp.width, tmp.height);
            tc.globalCompositeOperation = 'source-in';
            tc.fillStyle = tint;
            tc.fillRect(0, 0, tmp.width, tmp.height);
            ctx.drawImage(tmp, dx, dy, dw, dh);
          } else {
            ctx.drawImage(entry.img, dx, dy, dw, dh);
          }

          ctx.restore();
        } else if (!entry) {
          // Image not yet queued — draw a translucent placeholder so the slot is visible.
          ctx.save();
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = '#888888';
          ctx.fillRect(x, y, w, h);
          ctx.restore();
        }
        // 'loading' state: draw nothing; onLoaded callback will trigger a re-render.
        // 'error' state: silently skip.
      }
    }

    for (const c of n.children) drawNode(c);
  };

  drawNode(compiled.root);
}

export function hitTestFuiButtons(
  compiled: FuiCompiled,
  docX: number,
  docY: number,
): FuiCompiledNode | null {
  // Reverse draw order for topmost element picking.
  for (let i = compiled.drawOrder.length - 1; i >= 0; i--) {
    const n = compiled.drawOrder[i];
    if (n.type !== 'button') continue;
    const r = n.rect;
    if (docX >= r.x && docX <= r.x + r.w && docY >= r.y && docY <= r.y + r.h) {
      return n;
    }
  }
  return null;
}

export function parseFuiAndCompile(text: string): FuiCompiled {
  const doc = parseFuiJson(text);
  return compileFui(doc);
}

