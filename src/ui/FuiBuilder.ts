// ============================================================
// FluxionJS V3 — FuiBuilder
// Fluent, code-first API for constructing FuiDocuments without
// the visual editor. Inspired by Stride's UILibrary approach.
//
// Usage:
//   const doc = new FuiBuilder(400, 200)
//     .panel('bg', 0, 0, 400, 200, { bg: '#1a1a2e', radius: 12 })
//     .label('score', 10, 10, 200, 30, 'Score: 0', { fontSize: 20, color: '#fff' })
//     .button('play_btn', 100, 130, 200, 50, 'Play', { bg: '#3a86ff', radius: 8 })
//     .build();
// ============================================================

import type {
  FuiDocument, FuiFont, FuiMode, FuiNode, FuiPanelNode, FuiLabelNode, FuiButtonNode, FuiIconNode, FuiImageNode,
  FuiToggleNode, FuiSliderNode, FuiProgressBarNode, FuiInputFieldNode,
  FuiAnimation, FuiAnimatableProperty, FuiAlign, FuiTransition, FuiNavigation, FuiColorBlock, FuiTextColorBlock,
} from './FuiTypes';

// ── Option types ──────────────────────────────────────────────

export interface FuiPanelOpts {
  bg?: string;
  border?: string;
  borderWidth?: number;
  radius?: number;
  opacity?: number;
  /** Parent node ID. Defaults to the root panel. */
  parent?: string;
}

export interface FuiLabelOpts {
  color?: string;
  fontSize?: number;
  font?: string;
  align?: FuiAlign;
  opacity?: number;
  parent?: string;
}

export interface FuiButtonOpts {
  bg?: string;
  border?: string;
  borderWidth?: number;
  textColor?: string;
  /** Per-state text colours. Overrides `textColor` per-state when set. */
  textColors?: FuiTextColorBlock;
  fontSize?: number;
  font?: string;
  radius?: number;
  padding?: number;
  opacity?: number;
  disabled?: boolean;
  tooltip?: string;
  icon?: string;
  /** Project-relative path to a raster image used as the button background. */
  image?: string;
  /** How the background image fills the button rect. Default: 'fill'. */
  imageFit?: 'contain' | 'cover' | 'fill';
  clickAnimation?: 'none' | 'scale' | 'flash';
  transition?: FuiTransition;
  colors?: FuiColorBlock;
  navigation?: FuiNavigation;
  parent?: string;
}

export interface FuiToggleOpts {
  value?: boolean;
  bg?: string;
  border?: string;
  borderWidth?: number;
  radius?: number;
  checkColor?: string;
  textColor?: string;
  fontSize?: number;
  font?: string;
  opacity?: number;
  navigation?: FuiNavigation;
  parent?: string;
}

export interface FuiSliderOpts {
  value?: number;
  min?: number;
  max?: number;
  wholeNumbers?: boolean;
  direction?: 'horizontal' | 'vertical';
  trackColor?: string;
  fillColor?: string;
  handleColor?: string;
  handleSize?: number;
  trackHeight?: number;
  opacity?: number;
  navigation?: FuiNavigation;
  parent?: string;
}

export interface FuiProgressBarOpts {
  value?: number;
  direction?: 'horizontal' | 'vertical';
  trackColor?: string;
  fillColor?: string;
  radius?: number;
  opacity?: number;
  parent?: string;
}

export interface FuiInputFieldOpts {
  text?: string;
  placeholder?: string;
  contentType?: 'standard' | 'integer' | 'decimal' | 'password';
  bg?: string;
  border?: string;
  borderWidth?: number;
  radius?: number;
  textColor?: string;
  placeholderColor?: string;
  fontSize?: number;
  font?: string;
  opacity?: number;
  navigation?: FuiNavigation;
  parent?: string;
}

export interface FuiImageOpts {
  opacity?: number;
  /**
   * How the image fills its rect. Default: `'contain'`.
   */
  fit?: 'contain' | 'cover' | 'fill';
  /** Background/matte colour visible in letterbox areas. */
  bg?: string;
  radius?: number;
  /** Parent node ID. Defaults to the root panel. */
  parent?: string;
}

export interface FuiIconOpts {
  /**
   * Flat tint colour applied to the icon (CSS colour string).
   * Omit to render with the SVG's original colours.
   */
  color?: string;
  opacity?: number;
  /**
   * How the icon fills its rect. Default: `'contain'`.
   * - `'contain'` — uniform scale, letter-box.
   * - `'cover'`   — uniform scale, crop to fill.
   * - `'fill'`    — stretch to exact rect size.
   */
  fit?: 'contain' | 'cover' | 'fill';
  /** Parent node ID. Defaults to the root panel. */
  parent?: string;
}

export interface FuiAnimTrackSpec {
  nodeId: string;
  property: FuiAnimatableProperty;
  keyframes: Array<{
    time: number;
    value: number;
    easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step';
  }>;
}

// ── FuiBuilder ────────────────────────────────────────────────

/**
 * Fluent builder for FuiDocument objects.
 * All nodes are added relative to the implicit root panel (full canvas).
 * Use the `parent` option to nest nodes inside any previously added panel.
 */
export class FuiBuilder {
  private _nodeMap: Map<string, FuiNode> = new Map();
  private _nodeParent: Map<string, string> = new Map();
  private _animations: FuiAnimation[] = [];
  private _fonts: FuiFont[] = [];
  private _width: number;
  private _height: number;
  private _mode: FuiMode;

  private static _idCounter = 0;

  constructor(width = 800, height = 600, mode: FuiMode = 'screen') {
    this._width = width;
    this._height = height;
    this._mode = mode;
  }

  // ── Node creation ─────────────────────────────────────────

  /**
   * Add a rectangular panel (container / background).
   * @example builder.panel('bg', 0, 0, 400, 300, { bg: '#1a1a2e80', radius: 8 })
   */
  panel(
    id: string,
    x: number, y: number, w: number, h: number,
    opts: FuiPanelOpts = {},
  ): this {
    const node: FuiPanelNode = {
      type: 'panel',
      id,
      rect: { x, y, w, h },
      children: [],
      style: (opts.bg || opts.border || opts.borderWidth !== undefined ||
              opts.radius !== undefined || opts.opacity !== undefined)
        ? {
            backgroundColor: opts.bg,
            borderColor: opts.border,
            borderWidth: opts.borderWidth,
            radius: opts.radius,
            opacity: opts.opacity,
          }
        : undefined,
    };
    this._nodeMap.set(id, node);
    this._nodeParent.set(id, opts.parent ?? '__root__');
    return this;
  }

  /**
   * Add a text label.
   * @example builder.label('hp_text', 10, 10, 200, 30, 'HP: 100', { color: '#ff4444', fontSize: 18 })
   */
  label(
    id: string,
    x: number, y: number, w: number, h: number,
    text: string,
    opts: FuiLabelOpts = {},
  ): this {
    const node: FuiLabelNode = {
      type: 'label',
      id,
      rect: { x, y, w, h },
      text,
      style: (opts.color || opts.fontSize !== undefined || opts.font ||
              opts.align || opts.opacity !== undefined)
        ? {
            color: opts.color,
            fontSize: opts.fontSize,
            fontFamily: opts.font,
            align: opts.align,
            opacity: opts.opacity,
          }
        : undefined,
    };
    this._nodeMap.set(id, node);
    this._nodeParent.set(id, opts.parent ?? '__root__');
    return this;
  }

  /**
   * Add a clickable button.
   * @example builder.button('play_btn', 100, 120, 200, 48, 'Play', { bg: '#3a86ff', radius: 6 })
   */
  button(
    id: string,
    x: number, y: number, w: number, h: number,
    text: string,
    opts: FuiButtonOpts = {},
  ): this {
    const node: FuiButtonNode = {
      type: 'button',
      id,
      rect: { x, y, w, h },
      text,
      ...(opts.disabled !== undefined ? { disabled: opts.disabled } : {}),
      ...(opts.tooltip   ? { tooltip: opts.tooltip }     : {}),
      ...(opts.icon      ? { icon:    opts.icon }        : {}),
      ...(opts.image     ? { image:   opts.image }        : {}),
      ...(opts.imageFit  ? { imageFit: opts.imageFit }    : {}),
      ...(opts.clickAnimation ? { clickAnimation: opts.clickAnimation } : {}),
      ...(opts.transition ? { transition: opts.transition } : {}),
      ...(opts.colors     ? { colors:     opts.colors }     : {}),
      ...(opts.navigation ? { navigation: opts.navigation } : {}),
      style: {
        backgroundColor: opts.bg,
        borderColor: opts.border,
        borderWidth: opts.borderWidth,
        textColor: opts.textColor,
        textColors: opts.textColors,
        fontSize: opts.fontSize,
        fontFamily: opts.font,
        radius: opts.radius,
        padding: opts.padding,
        opacity: opts.opacity,
      },
    };
    this._nodeMap.set(id, node);
    this._nodeParent.set(id, opts.parent ?? '__root__');
    return this;
  }

  /**
   * Add a toggle (checkbox) node.
   * @example builder.toggle('sound_toggle', 20, 60, 140, 28, 'Sound', { value: true })
   */
  toggle(
    id: string,
    x: number, y: number, w: number, h: number,
    text: string,
    opts: FuiToggleOpts = {},
  ): this {
    const node: FuiToggleNode = {
      type: 'toggle', id, rect: { x, y, w, h }, text,
      value: opts.value ?? false,
      ...(opts.navigation ? { navigation: opts.navigation } : {}),
      style: {
        backgroundColor: opts.bg, borderColor: opts.border, borderWidth: opts.borderWidth,
        radius: opts.radius, checkColor: opts.checkColor, textColor: opts.textColor,
        fontSize: opts.fontSize, fontFamily: opts.font, opacity: opts.opacity,
      },
    };
    this._nodeMap.set(id, node);
    this._nodeParent.set(id, opts.parent ?? '__root__');
    return this;
  }

  /**
   * Add a slider node.
   * @example builder.slider('volume', 20, 100, 200, 24, { value: 0.75, fillColor: '#3a86ff' })
   */
  slider(
    id: string,
    x: number, y: number, w: number, h: number,
    opts: FuiSliderOpts = {},
  ): this {
    const node: FuiSliderNode = {
      type: 'slider', id, rect: { x, y, w, h },
      value: opts.value ?? 0,
      min:   opts.min   ?? 0,
      max:   opts.max   ?? 1,
      ...(opts.wholeNumbers ? { wholeNumbers: true } : {}),
      direction: opts.direction ?? 'horizontal',
      ...(opts.navigation ? { navigation: opts.navigation } : {}),
      style: {
        trackColor: opts.trackColor, fillColor: opts.fillColor,
        handleColor: opts.handleColor, handleSize: opts.handleSize,
        trackHeight: opts.trackHeight, opacity: opts.opacity,
      },
    };
    this._nodeMap.set(id, node);
    this._nodeParent.set(id, opts.parent ?? '__root__');
    return this;
  }

  /**
   * Add a progress bar node.
   * @example builder.progressBar('hp_bar', 20, 140, 200, 16, { value: 0.6, fillColor: '#4caf50' })
   */
  progressBar(
    id: string,
    x: number, y: number, w: number, h: number,
    opts: FuiProgressBarOpts = {},
  ): this {
    const node: FuiProgressBarNode = {
      type: 'progressBar', id, rect: { x, y, w, h },
      value: opts.value ?? 0,
      direction: opts.direction ?? 'horizontal',
      style: {
        trackColor: opts.trackColor, fillColor: opts.fillColor,
        radius: opts.radius, opacity: opts.opacity,
      },
    };
    this._nodeMap.set(id, node);
    this._nodeParent.set(id, opts.parent ?? '__root__');
    return this;
  }

  /**
   * Add an input field node.
   * @example builder.inputField('name_input', 20, 60, 200, 36, { placeholder: 'Your name...' })
   */
  inputField(
    id: string,
    x: number, y: number, w: number, h: number,
    opts: FuiInputFieldOpts = {},
  ): this {
    const node: FuiInputFieldNode = {
      type: 'inputField', id, rect: { x, y, w, h },
      text:        opts.text        ?? '',
      placeholder: opts.placeholder ?? 'Enter text...',
      contentType: opts.contentType ?? 'standard',
      ...(opts.navigation ? { navigation: opts.navigation } : {}),
      style: {
        backgroundColor: opts.bg, borderColor: opts.border, borderWidth: opts.borderWidth,
        radius: opts.radius, textColor: opts.textColor, placeholderColor: opts.placeholderColor,
        fontSize: opts.fontSize, fontFamily: opts.font, opacity: opts.opacity,
      },
    };
    this._nodeMap.set(id, node);
    this._nodeParent.set(id, opts.parent ?? '__root__');
    return this;
  }

  /**
   * Add a raster image node (PNG / JPG / WebP / SVG without tinting).
   * @example
   *   builder.image('hero_bg', 0, 0, 400, 300, 'Assets/UI/hero.png', { fit: 'cover' })
   */
  image(
    id: string,
    x: number, y: number, w: number, h: number,
    src: string,
    opts: FuiImageOpts = {},
  ): this {
    const node: FuiImageNode = {
      type: 'image',
      id,
      rect: { x, y, w, h },
      src,
      style: (opts.opacity !== undefined || opts.fit || opts.bg || opts.radius !== undefined)
        ? { opacity: opts.opacity, fit: opts.fit, backgroundColor: opts.bg, radius: opts.radius }
        : undefined,
    };
    this._nodeMap.set(id, node);
    this._nodeParent.set(id, opts.parent ?? '__root__');
    return this;
  }

  /**
   * Add an SVG icon node.
   *
   * The `src` is a project-relative path to an `.svg` file. The image is
   * loaded asynchronously the first time; subsequent renders use the cache.
   *
   * @example
   *   builder.icon('close_icon', 370, 6, 24, 24, 'Assets/UI/close.svg', { color: '#ffffff' })
   */
  icon(
    id: string,
    x: number, y: number, w: number, h: number,
    src: string,
    opts: FuiIconOpts = {},
  ): this {
    const node: FuiIconNode = {
      type: 'icon',
      id,
      rect: { x, y, w, h },
      src,
      style: (opts.color || opts.opacity !== undefined || opts.fit)
        ? { color: opts.color, opacity: opts.opacity, fit: opts.fit }
        : undefined,
    };
    this._nodeMap.set(id, node);
    this._nodeParent.set(id, opts.parent ?? '__root__');
    return this;
  }

  // ── Shortcut ──────────────────────────────────────────────

  /**
   * Shortcut: add a full-canvas background panel named 'bg'.
   * Equivalent to `.panel('bg', 0, 0, width, height, { bg: color, opacity })`.
   */
  background(color: string, opts?: { opacity?: number }): this {
    return this.panel('bg', 0, 0, this._width, this._height, {
      bg: color,
      opacity: opts?.opacity,
    });
  }

  // ── Fonts ──────────────────────────────────────────────────

  /**
   * Register a custom font for this document.
   * The font is loaded from `path` and available as CSS font-family `family`.
   * @example builder.addFont('Orbitron', 'Assets/Fonts/Orbitron.ttf')
   */
  addFont(family: string, path: string): this {
    if (family && path && !this._fonts.find((f) => f.family === family)) {
      this._fonts.push({ family, path });
    }
    return this;
  }

  // ── Animation ─────────────────────────────────────────────

  /**
   * Add a keyframe animation to the document.
   * @example
   *   builder.animation('fade_in', 'Fade In', 0.5, false, [
   *     { nodeId: 'panel', property: 'opacity', keyframes: [{ time: 0, value: 0 }, { time: 0.5, value: 1 }] }
   *   ])
   */
  animation(
    id: string,
    name: string,
    duration: number,
    loop: boolean,
    tracks: FuiAnimTrackSpec[],
  ): this {
    this._animations.push({
      id,
      name,
      duration,
      loop,
      tracks: tracks.map((t) => ({
        nodeId: t.nodeId,
        property: t.property,
        keyframes: t.keyframes.map((k) => ({
          time: k.time,
          value: k.value,
          easing: k.easing ?? 'linear',
        })),
      })),
    });
    return this;
  }

  // ── Build ─────────────────────────────────────────────────

  /** Compile all added nodes into a FuiDocument ready for FuiRuntimeSystem. */
  build(): FuiDocument {
    // Build children lists per parent ID
    const childrenOf = new Map<string, FuiNode[]>();
    childrenOf.set('__root__', []);

    for (const [id] of this._nodeMap) {
      if (!childrenOf.has(id)) childrenOf.set(id, []);
    }

    for (const [id, node] of this._nodeMap) {
      const parentId = this._nodeParent.get(id) ?? '__root__';
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId)!.push(node);
      if (node.type === 'panel') {
        (node as FuiPanelNode).children = childrenOf.get(id) ?? [];
      }
    }

    const root: FuiPanelNode = {
      type: 'panel',
      id: '__root__',
      rect: { x: 0, y: 0, w: this._width, h: this._height },
      children: childrenOf.get('__root__') ?? [],
    };

    return {
      version: 1,
      mode: this._mode,
      canvas: { width: this._width, height: this._height },
      root,
      animations: this._animations.length > 0 ? [...this._animations] : undefined,
      fonts: this._fonts.length > 0 ? [...this._fonts] : undefined,
    };
  }

  /** Serialize the document to a JSON string (for saving .fui files). */
  toJSON(): string {
    return JSON.stringify(this.build(), null, 2);
  }

  // ── Utilities ─────────────────────────────────────────────

  /** Generate a unique node ID safe for dynamic UIs. */
  static genId(prefix = 'node'): string {
    return `${prefix}_${++FuiBuilder._idCounter}`;
  }
}
