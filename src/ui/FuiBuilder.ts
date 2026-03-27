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
  FuiDocument, FuiMode, FuiNode, FuiPanelNode, FuiLabelNode, FuiButtonNode,
  FuiAnimation, FuiAnimatableProperty, FuiAlign,
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
  align?: FuiAlign;
  opacity?: number;
  parent?: string;
}

export interface FuiButtonOpts {
  bg?: string;
  border?: string;
  borderWidth?: number;
  textColor?: string;
  fontSize?: number;
  radius?: number;
  padding?: number;
  opacity?: number;
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
      style: (opts.color || opts.fontSize !== undefined ||
              opts.align || opts.opacity !== undefined)
        ? {
            color: opts.color,
            fontSize: opts.fontSize,
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
      style: {
        backgroundColor: opts.bg,
        borderColor: opts.border,
        borderWidth: opts.borderWidth,
        textColor: opts.textColor,
        fontSize: opts.fontSize,
        radius: opts.radius,
        padding: opts.padding,
        opacity: opts.opacity,
      },
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
