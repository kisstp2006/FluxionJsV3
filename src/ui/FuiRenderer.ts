import type { FuiAlign, FuiButtonNode, FuiButtonStyle, FuiColorBlock, FuiDocument, FuiFont, FuiIconNode, FuiImageNode, FuiInputFieldNode, FuiLabelNode, FuiNode, FuiNodeType, FuiPanelNode, FuiProgressBarNode, FuiRect, FuiSliderNode, FuiTextAreaNode, FuiToggleNode } from './FuiTypes';
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
  // ── Button-only extended properties ──
  /** SVG icon shown left of button text (project-relative path). */
  icon?: string;
  /** Raster background image path (project-relative). */
  image?: string;
  /** How the background image fills the button rect. */
  imageFit?: 'contain' | 'cover' | 'fill';
  tooltip?: string;
  cursor?: string;
  disabled?: boolean;
  clickAnimation?: string;
  transition?: string;
  colors?: FuiColorBlock;
  navigation?: string;
  hoverStyle?: Partial<FuiButtonStyle>;
  activeStyle?: Partial<FuiButtonStyle> & { scale?: number };
  disabledStyle?: Partial<FuiButtonStyle>;
  // ── Toggle/Slider/ProgressBar/InputField shared fields ──
  value?: number | boolean;
  min?: number;
  max?: number;
  wholeNumbers?: boolean;
  direction?: string;
  placeholder?: string;
  contentType?: string;
}

/** Per-node render state injected by the runtime (hover / active). */
export interface FuiNodeRenderState {
  hover?: boolean;
  active?: boolean;
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
    // Collect all image source keys for this node
    const srcKeys: (string | undefined)[] = [];
    if (node.type === 'icon')   srcKeys.push(node.src);
    if (node.type === 'image')  srcKeys.push(node.src);
    if (node.type === 'button') { srcKeys.push(node.icon); srcKeys.push(node.image); }
    for (const srcKey of srcKeys) {
    if (!srcKey) continue;
    const key = srcKey;
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
    } // end srcKeys for-loop
  } // end drawOrder for-loop
}

/**
 * Remove a cached SVG image (call after the source file changes on disk).
 */
export function invalidateFuiSvgCache(projectRelSrc: string): void {
  _svgCache.delete(projectRelSrc);
}

/** Set of already-loaded font families (to avoid re-loading). */
const _loadedFontFamilies = new Set<string>();

/**
 * Pre-load custom fonts declared in a FUI document's `fonts` array.
 * Uses the FontFace API — fonts are added to `document.fonts` and
 * become available as CSS font-family values in the 2D canvas context.
 *
 * @param fonts       The FuiFont[] from FuiDocument.fonts.
 * @param resolveUrl  Converts a project-relative path to a `file:///` URL.
 */
export async function loadFuiFonts(
  fonts: FuiFont[] | undefined,
  resolveUrl: (path: string) => string,
): Promise<void> {
  if (!fonts?.length) return;
  const promises: Promise<void>[] = [];
  for (const f of fonts) {
    if (!f.family || !f.path) continue;
    if (_loadedFontFamilies.has(f.family)) continue;
    _loadedFontFamilies.add(f.family);
    promises.push(
      (async () => {
        try {
          const url = resolveUrl(f.path);
          const ff = new FontFace(f.family, `url("${url}")`);
          await ff.load();
          (document as any).fonts.add(ff);
        } catch (e) {
          console.warn(`[FuiRenderer] Failed to load font "${f.family}" from "${f.path}":`, e);
        }
      })(),
    );
  }
  await Promise.all(promises);
}

/**
 * Evict a font family from the loaded-font cache (call when the font file
 * changes on disk so the next render re-loads it).
 */
export function invalidateFuiFont(family: string): void {
  _loadedFontFamilies.delete(family);
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

function resolveFontFamily(style: any): string {
  const f = style?.fontFamily;
  return typeof f === 'string' && f.trim().length > 0 ? f.trim() : 'sans-serif';
}

function resolveAlign(style: any): FuiAlign {
  const a = style?.align as FuiAlign | undefined;
  if (a === 'left' || a === 'right' || a === 'center') return a;
  return 'center';
}

/** Resolve anchor offset in pixels given parent dimensions. */
function _anchorOffset(
  anchor: string | undefined,
  parentW: number,
  parentH: number,
): { ax: number; ay: number } {
  let ax = 0, ay = 0;
  if (anchor === 'top'    || anchor === 'center' || anchor === 'bottom')    ax = parentW / 2;
  else if (anchor === 'topRight' || anchor === 'right' || anchor === 'bottomRight') ax = parentW;
  if (anchor === 'left'  || anchor === 'center' || anchor === 'right')     ay = parentH / 2;
  else if (anchor === 'bottomLeft' || anchor === 'bottom' || anchor === 'bottomRight') ay = parentH;
  return { ax, ay };
}

export function compileFui(doc: FuiDocument): FuiCompiled {
  const nodeById = new Map<string, FuiCompiledNode>();
  const drawOrder: FuiCompiledNode[] = [];

  const walk = (
    node: FuiNode,
    parentAbs: { x: number; y: number },
    parentSize: { w: number; h: number },
  ): FuiCompiledNode => {
    const rect = node.rect ?? { x: 0, y: 0, w: doc.canvas.width, h: doc.canvas.height };
    const { ax, ay } = _anchorOffset((node as any).anchor, parentSize.w, parentSize.h);
    const pivotX = ((node as any).pivot?.x ?? 0) * rect.w;
    const pivotY = ((node as any).pivot?.y ?? 0) * rect.h;
    const absRect: FuiRect = {
      x: parentAbs.x + ax + rect.x - pivotX,
      y: parentAbs.y + ay + rect.y - pivotY,
      w: rect.w,
      h: rect.h,
    };

    const imgN = node.type === 'image'       ? (node as FuiImageNode)       : null;
    const btn  = node.type === 'button'      ? (node as FuiButtonNode)      : null;
    const tog  = node.type === 'toggle'       ? (node as FuiToggleNode)      : null;
    const sld  = node.type === 'slider'       ? (node as FuiSliderNode)      : null;
    const pb   = node.type === 'progressBar'  ? (node as FuiProgressBarNode) : null;
    const inp  = node.type === 'inputField'   ? (node as FuiInputFieldNode)  : null;
    const compiled: FuiCompiledNode = {
      id: node.id,
      type: node.type,
      rect: absRect,
      style: (node as any).style,
      text: (node as any).text,
      src: (node.type === 'icon' || node.type === 'image') ? (node as FuiIconNode | FuiImageNode).src : undefined,
      children: [],
      ...(imgN ? {} : {}),
      ...(btn ? {
        icon:           btn.icon,
        image:          btn.image,
        imageFit:       btn.imageFit,
        tooltip:        btn.tooltip,
        cursor:         btn.cursor,
        disabled:       btn.disabled,
        clickAnimation: btn.clickAnimation,
        transition:     btn.transition,
        colors:         btn.colors,
        navigation:     btn.navigation,
        hoverStyle:     btn.hoverStyle,
        activeStyle:    btn.activeStyle,
        disabledStyle:  btn.disabledStyle,
      } : {}),
      ...(tog ? { value: tog.value, navigation: tog.navigation } : {}),
      ...(sld ? { value: sld.value, min: sld.min, max: sld.max, wholeNumbers: sld.wholeNumbers, direction: sld.direction, navigation: sld.navigation } : {}),
      ...(pb  ? { value: pb.value,  direction: pb.direction }  : {}),
      ...(inp ? { placeholder: inp.placeholder, contentType: inp.contentType, navigation: inp.navigation } : {}),
    };

    nodeById.set(compiled.id, compiled);
    drawOrder.push(compiled);

    if (node.type === 'panel') {
      const panel = node as FuiPanelNode;
      const children = panel.children ?? [];
      compiled.children = children.map((c) => walk(c, { x: absRect.x, y: absRect.y }, { w: absRect.w, h: absRect.h }));
    }

    return compiled;
  };

  const root = walk(doc.root, { x: 0, y: 0 }, { w: doc.canvas.width, h: doc.canvas.height });
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
  opts?: { scaleX?: number; scaleY?: number; nodeStates?: Map<string, FuiNodeRenderState> },
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
      const glowEnabled  = (n.style as any)?.glowEnabled === true;
      const glowColor    = (n.style as any)?.glowColor ?? color;
      const glowStrength = Math.max(1, Math.min(40, withDefaultNumber((n.style as any)?.glowStrength, 10))) * Math.min(scaleX, scaleY);

      ctx.save();
      ctx.globalAlpha = opacity;
      if (glowEnabled) {
        ctx.shadowBlur  = glowStrength;
        ctx.shadowColor = glowColor;
      }
      ctx.fillStyle = color;
      ctx.font = `${fontSize}px ${resolveFontFamily(n.style)}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      const tx =
        align === 'left' ? x + 4 * scaleX :
        align === 'right' ? x + w - 4 * scaleX :
        x + w / 2;
      const ty = y + h / 2;
      ctx.fillText(text, tx, ty);
      ctx.restore();
    } else if (n.type === 'textArea') {
      const text = n.text ?? '';
      const color = resolveTextColor(n.style) ?? '#ffffff';
      const fontSize = resolveFontSize(n.style) * Math.min(scaleX, scaleY);
      const align = resolveAlign(n.style);
      const lineHeightMult = withDefaultNumber((n.style as any)?.lineHeight, 1.4);
      const wrapMode: string = (n.style as any)?.wrapMode ?? 'word';
      const paddingH = withDefaultNumber((n.style as any)?.paddingH, 4) * scaleX;
      const paddingV = withDefaultNumber((n.style as any)?.paddingV, 4) * scaleY;
      const glowEnabled  = (n.style as any)?.glowEnabled === true;
      const glowColor    = (n.style as any)?.glowColor ?? color;
      const glowStrength = Math.max(1, Math.min(40, withDefaultNumber((n.style as any)?.glowStrength, 10))) * Math.min(scaleX, scaleY);
      const lineHeight   = fontSize * lineHeightMult;
      const maxW = w - paddingH * 2;

      ctx.save();
      ctx.globalAlpha = opacity;
      if (glowEnabled) { ctx.shadowBlur = glowStrength; ctx.shadowColor = glowColor; }
      ctx.fillStyle = color;
      ctx.font = `${fontSize}px ${resolveFontFamily(n.style)}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';

      // Word-wrap helper
      const wrapLines = (src: string): string[] => {
        if (wrapMode === 'none') return src.split('\n');
        const result: string[] = [];
        for (const paragraph of src.split('\n')) {
          if (paragraph === '') { result.push(''); continue; }
          if (wrapMode === 'char') {
            let line = '';
            for (const ch of paragraph) {
              if (ctx.measureText(line + ch).width > maxW && line) { result.push(line); line = ch; }
              else line += ch;
            }
            if (line) result.push(line);
          } else {
            const words = paragraph.split(' ');
            let line = '';
            for (const word of words) {
              const test = line ? line + ' ' + word : word;
              if (ctx.measureText(test).width > maxW && line) { result.push(line); line = word; }
              else line = test;
            }
            if (line) result.push(line);
          }
        }
        return result;
      };

      const lines = wrapLines(text);
      const totalH = lines.length * lineHeight;
      let startY = y + paddingV + fontSize * 0.8; // baseline offset
      // Vertically center the block
      if (totalH < h - paddingV * 2) startY = y + (h - totalH) / 2 + fontSize * 0.8;

      const tx =
        align === 'left'  ? x + paddingH :
        align === 'right' ? x + w - paddingH :
        x + w / 2;

      for (let li = 0; li < lines.length; li++) {
        const ly = startY + li * lineHeight;
        if (ly > y + h + lineHeight) break; // clipped
        ctx.fillText(lines[li], tx, ly);
      }
      ctx.restore();
    } else if (n.type === 'button') {
      const st = opts?.nodeStates?.get(n.id);
      const isDisabled = n.disabled === true;
      const isActive   = !isDisabled && (st?.active === true);
      const isHover    = !isDisabled && !isActive && (st?.hover === true);
      const isSelected = !isDisabled && !isActive && !isHover && (st as any)?.selected === true;

      // Resolve colorTint block colours
      const useTint  = (n.transition ?? 'colorTint') === 'colorTint';
      const cb: FuiColorBlock = n.colors ?? {};
      const tintBg =
        isDisabled ? (cb.disabledColor  ?? undefined) :
        isActive   ? (cb.pressedColor   ?? undefined) :
        isSelected ? (cb.selectedColor  ?? undefined) :
        isHover    ? (cb.highlightedColor ?? undefined) :
        (cb.normalColor ?? undefined);

      const styleOverrideBg = useTint && tintBg ? { backgroundColor: tintBg } : {};

      const overlay: Partial<FuiButtonStyle> =
        isDisabled ? { ...(n.disabledStyle ?? { opacity: 0.38 }), ...styleOverrideBg } :
        isActive   ? { ...(n.activeStyle   ?? { backgroundColor: '#3a4a70', borderColor: '#a0b8ff' }), ...styleOverrideBg } :
        isHover    ? { ...(n.hoverStyle    ?? { backgroundColor: '#2a3a5a', borderColor: '#8aabff' }), ...styleOverrideBg } :
        styleOverrideBg;

      const merged = { ...n.style, ...overlay };
      const bg          = resolveBackground(merged)  ?? '#1f2a44';
      const borderColor = resolveBorderColor(merged) ?? '#6b8cff';
      const borderWidth = withDefaultNumber(merged.borderWidth, 2) * Math.min(scaleX, scaleY);
      const radius      = withDefaultNumber(merged.radius,      6) * Math.min(scaleX, scaleY);
      const tc = merged.textColors as any;
      const stateTextColor =
        tc ? (
          isDisabled ? (tc.disabledColor  ?? undefined) :
          isActive   ? (tc.pressedColor   ?? undefined) :
          isSelected ? (tc.selectedColor  ?? undefined) :
          isHover    ? (tc.highlightedColor ?? undefined) :
          (tc.normalColor ?? undefined)
        ) : undefined;
      const textColor = stateTextColor ?? resolveTextColor(merged) ?? '#ffffff';
      const fontSize    = resolveFontSize(merged) * Math.min(scaleX, scaleY);
      const align       = resolveAlign(merged);
      const padding     = withDefaultNumber(merged.padding, 8) * Math.min(scaleX, scaleY);
      const mergedOpacity = Math.min(1, Math.max(0, withDefaultNumber(merged.opacity, 1)));

      // Scale transform for active press animation — only when clickAnimation === 'scale'
      const clickAnim = n.clickAnimation ?? 'none';
      const scale = (isActive && clickAnim === 'scale')
        ? ((n.activeStyle as any)?.scale ?? 0.96)
        : 1;

      ctx.save();
      ctx.globalAlpha = mergedOpacity;

      if (scale !== 1) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-(x + w / 2), -(y + h / 2));
      }

      // Background + border
      ctx.fillStyle = bg;
      drawRoundedRect(ctx, x, y, w, h, radius);
      ctx.fill();
      if (merged.showBorder !== false) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.stroke();
      }

      // Background image (drawn over solid bg, clipped to button shape)
      if (n.image) {
        const imgEntry = _svgCache.get(n.image);
        if (imgEntry?.state === 'ready') {
          const fit = n.imageFit ?? 'fill';
          let dx = x, dy = y, dw = w, dh = h;
          if (fit === 'contain') {
            const sc = Math.min(w / (imgEntry.img.naturalWidth || w), h / (imgEntry.img.naturalHeight || h));
            dw = imgEntry.img.naturalWidth * sc; dh = imgEntry.img.naturalHeight * sc;
            dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
          } else if (fit === 'cover') {
            const sc = Math.max(w / (imgEntry.img.naturalWidth || w), h / (imgEntry.img.naturalHeight || h));
            dw = imgEntry.img.naturalWidth * sc; dh = imgEntry.img.naturalHeight * sc;
            dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
          }
          ctx.save();
          drawRoundedRect(ctx, x, y, w, h, radius);
          ctx.clip();
          ctx.drawImage(imgEntry.img, dx, dy, dw, dh);
          ctx.restore();
        }
      }

      // Icon left of text
      const iconSrc = n.icon;
      const iconSize   = withDefaultNumber(merged.iconSize, Math.round(fontSize)) * 1;
      const iconGap    = withDefaultNumber(merged.iconGap, 6) * Math.min(scaleX, scaleY);
      const text = n.text ?? '';

      let textOffsetX = 0; // extra left margin when icon is present
      if (iconSrc) {
        const entry = _svgCache.get(iconSrc);
        if (entry?.state === 'ready') {
          const iSize = iconSize * Math.min(scaleX, scaleY);
          const ix = x + padding;
          const iy = y + h / 2 - iSize / 2;
          ctx.save();
          if (n.style?.color) {
            const tmp = document.createElement('canvas');
            tmp.width = Math.max(1, Math.round(iSize));
            tmp.height = Math.max(1, Math.round(iSize));
            const tc = tmp.getContext('2d')!;
            tc.drawImage(entry.img, 0, 0, tmp.width, tmp.height);
            tc.globalCompositeOperation = 'source-in';
            tc.fillStyle = textColor;
            tc.fillRect(0, 0, tmp.width, tmp.height);
            ctx.drawImage(tmp, ix, iy, iSize, iSize);
          } else {
            ctx.drawImage(entry.img, ix, iy, iSize, iSize);
          }
          ctx.restore();
          textOffsetX = iSize + iconGap;
        }
      }

      // Text
      const btnGlowEnabled  = merged.glowEnabled === true;
      const btnGlowColor    = merged.glowColor ?? textColor;
      const btnGlowStrength = Math.max(1, Math.min(40, withDefaultNumber(merged.glowStrength, 10))) * Math.min(scaleX, scaleY);
      if (btnGlowEnabled) { ctx.shadowBlur = btnGlowStrength; ctx.shadowColor = btnGlowColor; }
      ctx.fillStyle = textColor;
      ctx.font = `${fontSize}px ${resolveFontFamily(merged)}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      const tx =
        align === 'left'  ? x + padding + textOffsetX :
        align === 'right' ? x + w - padding :
        x + w / 2 + textOffsetX / 2;
      const ty = y + h / 2;
      ctx.fillText(text, tx, ty);

      ctx.restore();
    } else if (n.type === 'toggle') {
      const val = n.value === true;
      const st = n.style as any ?? {};
      const opacity = Math.min(1, Math.max(0, withDefaultNumber(st.opacity, 1)));
      const bg          = st.backgroundColor ?? '#1a2340';
      const borderColor = st.borderColor     ?? '#6b8cff';
      const bw          = withDefaultNumber(st.borderWidth, 2) * Math.min(scaleX, scaleY);
      const radius      = withDefaultNumber(st.radius, 4)      * Math.min(scaleX, scaleY);
      const checkColor  = st.checkColor  ?? '#58c4ff';
      const textColor   = st.textColor   ?? '#ffffff';
      const fontSize    = withDefaultNumber(st.fontSize, 14)  * Math.min(scaleX, scaleY);
      const boxSize     = h * 0.72;
      const boxX        = x + 2 * scaleX;
      const boxY        = y + (h - boxSize) / 2;

      ctx.save();
      ctx.globalAlpha = opacity;
      // Box background
      ctx.fillStyle = val ? checkColor : bg;
      drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, radius);
      ctx.fill();
      ctx.strokeStyle = val ? checkColor : borderColor;
      ctx.lineWidth   = bw;
      ctx.stroke();
      // Checkmark when checked
      if (val) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = Math.max(1.5, 2 * Math.min(scaleX, scaleY));
        ctx.beginPath();
        const cx = boxX + boxSize * 0.2; const cy = boxY + boxSize * 0.5;
        ctx.moveTo(cx, cy);
        ctx.lineTo(boxX + boxSize * 0.45, boxY + boxSize * 0.75);
        ctx.lineTo(boxX + boxSize * 0.85, boxY + boxSize * 0.2);
        ctx.stroke();
      }
      // Label
      if (n.text) {
        const togGlowEnabled  = (n.style as any)?.glowEnabled === true;
        const togGlowColor    = (n.style as any)?.glowColor ?? textColor;
        const togGlowStrength = Math.max(1, Math.min(40, withDefaultNumber((n.style as any)?.glowStrength, 10))) * Math.min(scaleX, scaleY);
        if (togGlowEnabled) { ctx.shadowBlur = togGlowStrength; ctx.shadowColor = togGlowColor; }
        ctx.fillStyle = textColor;
        ctx.font = `${fontSize}px ${resolveFontFamily(n.style as any)}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.text, boxX + boxSize + 8 * scaleX, y + h / 2);
      }
      ctx.restore();
    } else if (n.type === 'slider') {
      const val       = withDefaultNumber(n.value as number, 0);
      const minV      = withDefaultNumber(n.min, 0);
      const maxV      = withDefaultNumber(n.max, 1);
      const fraction  = maxV > minV ? Math.max(0, Math.min(1, (val - minV) / (maxV - minV))) : 0;
      const isVert    = (n.direction === 'vertical');
      const st        = n.style as any ?? {};
      const opacity   = Math.min(1, Math.max(0, withDefaultNumber(st.opacity, 1)));
      const trackColor  = st.trackColor  ?? '#1a2340';
      const fillColor   = st.fillColor   ?? '#3a6fff';
      const handleColor = st.handleColor ?? '#ffffff';
      const trackH      = withDefaultNumber(st.trackHeight, 6) * Math.min(scaleX, scaleY);
      const handleSz    = withDefaultNumber(st.handleSize,  14) * Math.min(scaleX, scaleY);
      const trackR      = trackH / 2;

      ctx.save();
      ctx.globalAlpha = opacity;
      if (isVert) {
        const tx = x + w / 2 - trackH / 2;
        const ty = y; const th = h;
        drawRoundedRect(ctx, tx, ty, trackH, th, trackR); ctx.fillStyle = trackColor; ctx.fill();
        const fillH = th * fraction;
        drawRoundedRect(ctx, tx, ty + th - fillH, trackH, fillH, trackR); ctx.fillStyle = fillColor; ctx.fill();
        const hy = ty + th - th * fraction;
        ctx.beginPath(); ctx.arc(tx + trackH / 2, hy, handleSz / 2, 0, Math.PI * 2);
        ctx.fillStyle = handleColor; ctx.fill();
      } else {
        const ty = y + h / 2 - trackH / 2;
        drawRoundedRect(ctx, x, ty, w, trackH, trackR); ctx.fillStyle = trackColor; ctx.fill();
        drawRoundedRect(ctx, x, ty, w * fraction, trackH, trackR); ctx.fillStyle = fillColor; ctx.fill();
        const hx = x + w * fraction;
        ctx.beginPath(); ctx.arc(hx, y + h / 2, handleSz / 2, 0, Math.PI * 2);
        ctx.fillStyle = handleColor; ctx.fill();
      }
      ctx.restore();
    } else if (n.type === 'progressBar') {
      const val     = withDefaultNumber(n.value as number, 0);
      const fraction = Math.max(0, Math.min(1, val));
      const isVert   = (n.direction === 'vertical');
      const st       = n.style as any ?? {};
      const opacity  = Math.min(1, Math.max(0, withDefaultNumber(st.opacity, 1)));
      const trackColor = st.trackColor ?? '#1a2340';
      const fillColor  = st.fillColor  ?? '#3a6fff';
      const radius     = withDefaultNumber(st.radius, 4) * Math.min(scaleX, scaleY);

      ctx.save();
      ctx.globalAlpha = opacity;
      drawRoundedRect(ctx, x, y, w, h, radius); ctx.fillStyle = trackColor; ctx.fill();
      if (isVert) {
        const fh = h * fraction;
        drawRoundedRect(ctx, x, y + h - fh, w, fh, radius); ctx.fillStyle = fillColor; ctx.fill();
      } else {
        drawRoundedRect(ctx, x, y, w * fraction, h, radius); ctx.fillStyle = fillColor; ctx.fill();
      }
      ctx.restore();
    } else if (n.type === 'inputField') {
      const st       = n.style as any ?? {};
      const opacity  = Math.min(1, Math.max(0, withDefaultNumber(st.opacity, 1)));
      const bg       = st.backgroundColor ?? '#111827';
      const bc       = st.borderColor     ?? '#374151';
      const bw       = withDefaultNumber(st.borderWidth, 1) * Math.min(scaleX, scaleY);
      const radius   = withDefaultNumber(st.radius, 4)      * Math.min(scaleX, scaleY);
      const textColor= st.textColor    ?? '#e5e7eb';
      const phColor  = st.placeholderColor ?? '#6b7280';
      const fontSize = withDefaultNumber(st.fontSize, 14)   * Math.min(scaleX, scaleY);
      const padding  = 8 * Math.min(scaleX, scaleY);
      const display  = n.text ? n.text : null;
      const isPassword = n.contentType === 'password';

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = bg;
      drawRoundedRect(ctx, x, y, w, h, radius); ctx.fill();
      ctx.strokeStyle = bc; ctx.lineWidth = bw;
      drawRoundedRect(ctx, x, y, w, h, radius); ctx.stroke();
      ctx.font = `${fontSize}px ${resolveFontFamily(st)}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const inpGlowEnabled  = (st as any)?.glowEnabled === true;
      const inpGlowColor    = (st as any)?.glowColor ?? textColor;
      const inpGlowStrength = Math.max(1, Math.min(40, withDefaultNumber((st as any)?.glowStrength, 10))) * Math.min(scaleX, scaleY);
      if (display) {
        if (inpGlowEnabled) { ctx.shadowBlur = inpGlowStrength; ctx.shadowColor = inpGlowColor; }
        ctx.fillStyle = textColor;
        const shown = isPassword ? '•'.repeat(display.length) : display;
        ctx.fillText(shown, x + padding, y + h / 2);
      } else {
        ctx.fillStyle = phColor;
        ctx.fillText(n.placeholder ?? 'Enter text...', x + padding, y + h / 2);
      }
      // Cursor blink indicator
      ctx.fillStyle = textColor;
      ctx.globalAlpha = opacity * 0.5;
      ctx.fillRect(x + padding + (display ? ctx.measureText(isPassword ? '•'.repeat(display.length) : display).width + 2 : 0), y + (h - fontSize) / 2, 1.5 * scaleX, fontSize);
      ctx.restore();
    }

    else if (n.type === 'image') {
      const st = n.style as any ?? {};
      const opacity = Math.min(1, Math.max(0, withDefaultNumber(st.opacity, 1)));
      const fit = st.fit ?? 'contain';
      const bg: string | undefined = st.backgroundColor;
      const radius = withDefaultNumber(st.radius, 0) * Math.min(scaleX, scaleY);

      ctx.save();
      ctx.globalAlpha = opacity;

      if (bg) {
        if (radius > 0) { drawRoundedRect(ctx, x, y, w, h, radius); ctx.fillStyle = bg; ctx.fill(); }
        else { ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); }
      }

      if (n.src) {
        const entry = _svgCache.get(n.src);
        if (entry?.state === 'ready') {
          let dx = x, dy = y, dw = w, dh = h;
          if (fit === 'contain') {
            const sc = Math.min(w / (entry.img.naturalWidth || w), h / (entry.img.naturalHeight || h));
            dw = entry.img.naturalWidth * sc; dh = entry.img.naturalHeight * sc;
            dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
          } else if (fit === 'cover') {
            const sc = Math.max(w / (entry.img.naturalWidth || w), h / (entry.img.naturalHeight || h));
            dw = entry.img.naturalWidth * sc; dh = entry.img.naturalHeight * sc;
            dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
          }
          if (radius > 0) {
            ctx.save();
            drawRoundedRect(ctx, x, y, w, h, radius);
            ctx.clip();
            ctx.drawImage(entry.img, dx, dy, dw, dh);
            ctx.restore();
          } else {
            ctx.drawImage(entry.img, dx, dy, dw, dh);
          }
        } else if (!entry) {
          ctx.globalAlpha = opacity * 0.15;
          ctx.fillStyle = '#888888';
          if (radius > 0) { drawRoundedRect(ctx, x, y, w, h, radius); ctx.fill(); }
          else ctx.fillRect(x, y, w, h);
        }
      }

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
  { includeDisabled = false } = {},
): FuiCompiledNode | null {
  // Reverse draw order for topmost element picking.
  for (let i = compiled.drawOrder.length - 1; i >= 0; i--) {
    const n = compiled.drawOrder[i];
    if (n.type !== 'button') continue;
    if (!includeDisabled && n.disabled) continue; // skip disabled buttons for click events
    const r = n.rect;
    if (docX >= r.x && docX <= r.x + r.w && docY >= r.y && docY <= r.y + r.h) {
      return n;
    }
  }
  return null;
}

const INTERACTABLE_TYPES = new Set(['button', 'toggle', 'slider', 'inputField']);

/**
 * Hit-test all interactable node types (button, toggle, slider, inputField).
 * Returns the topmost hit node, or null.
 */
export function hitTestInteractable(
  compiled: FuiCompiled,
  docX: number,
  docY: number,
  { includeDisabled = false } = {},
): FuiCompiledNode | null {
  for (let i = compiled.drawOrder.length - 1; i >= 0; i--) {
    const n = compiled.drawOrder[i];
    if (!INTERACTABLE_TYPES.has(n.type)) continue;
    if (!includeDisabled && n.disabled) continue;
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

