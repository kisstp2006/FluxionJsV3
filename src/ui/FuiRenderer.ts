import type { FuiAlign, FuiButtonNode, FuiDocument, FuiLabelNode, FuiNode, FuiNodeType, FuiPanelNode, FuiRect } from './FuiTypes';
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
  children: FuiCompiledNode[];
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

    if (n.type === 'panel') {
      const bg = resolveBackground(n.style);
      if (bg) {
        const radius = withDefaultNumber(n.style?.radius, 0) * Math.min(scaleX, scaleY);
        const borderWidth = withDefaultNumber(n.style?.borderWidth, 0) * Math.min(scaleX, scaleY);
        const borderColor = resolveBorderColor(n.style);
        const borderEnabled = borderWidth > 0 && !!borderColor;

        ctx.save();
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

      // Background + border
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = bg;
      drawRoundedRect(ctx, x, y, w, h, radius);
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.stroke();
      ctx.restore();

      // Text
      const text = n.text ?? '';
      ctx.save();
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

