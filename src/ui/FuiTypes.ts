export type FuiMode = 'screen' | 'world';
export type FuiNodeType = 'panel' | 'label' | 'button' | 'icon';

export interface FuiRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FuiAlign = 'left' | 'center' | 'right';

export interface FuiBaseNode {
  id: string;
  type: FuiNodeType;
  rect?: FuiRect;
}

export interface FuiPanelNode extends FuiBaseNode {
  type: 'panel';
  children?: FuiNode[];
  style?: {
    backgroundColor?: string; // hex '#RRGGBB' (alpha optional via '#RRGGBBAA' supported by renderer)
    borderColor?: string;
    borderWidth?: number;
    radius?: number;
    opacity?: number; // 0–1
  };
}

export interface FuiLabelNode extends FuiBaseNode {
  type: 'label';
  text?: string;
  style?: {
    color?: string;
    fontSize?: number;
    align?: FuiAlign;
    opacity?: number; // 0–1
  };
}

export interface FuiButtonStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  textColor?: string;
  fontSize?: number;
  align?: FuiAlign;
  padding?: number;
  opacity?: number;   // 0–1
  /** Size of the icon in pixels (default: fontSize or 16) */
  iconSize?: number;
  /** Gap between icon and text in pixels (default: 6) */
  iconGap?: number;
}

export interface FuiButtonNode extends FuiBaseNode {
  type: 'button';
  text?: string;
  /** Project-relative path to an SVG icon shown to the left of the text. */
  icon?: string;
  /** Tooltip text shown when hovering the button. */
  tooltip?: string;
  /** CSS cursor applied when hovering. Default: 'pointer'. */
  cursor?: 'pointer' | 'default' | 'not-allowed';
  /** Disables click events and applies dimmed appearance. */
  disabled?: boolean;
  /** Click animation. 'scale' shrinks the button on press; 'flash' briefly flashes it white. */
  clickAnimation?: 'none' | 'scale' | 'flash';
  style?: FuiButtonStyle;
  /** Style overrides merged on top of base style while the mouse is hovering. */
  hoverStyle?: Partial<FuiButtonStyle>;
  /** Style overrides merged on top of base style while the button is being pressed. Supports `scale` (0–1). */
  activeStyle?: Partial<FuiButtonStyle> & { scale?: number };
  /** Style overrides applied when `disabled` is true. Defaults to opacity 0.4. */
  disabledStyle?: Partial<FuiButtonStyle>;
}

export interface FuiIconNode extends FuiBaseNode {
  type: 'icon';
  /**
   * Project-relative path to an SVG file.
   * @example 'Assets/UI/arrow.svg'
   */
  src?: string;
  style?: {
    /**
     * Flat tint colour applied to the icon using CSS `source-in` compositing.
     * Set to `null` / omit to use the SVG's original colours.
     * @example '#ffffff'
     */
    color?: string;
    opacity?: number;
    /**
     * How the icon fills its rect. Default: `'contain'`.
     * - `'contain'` — scale uniformly so the icon fits inside the rect (letter-box).
     * - `'cover'`   — scale uniformly so the icon covers the entire rect (crop).
     * - `'fill'`    — stretch to exactly fill width and height (may distort).
     */
    fit?: 'contain' | 'cover' | 'fill';
  };
}

export type FuiNode = FuiPanelNode | FuiLabelNode | FuiButtonNode | FuiIconNode;

// ── Animation ──

/** Properties that can be animated on any FUI node. */
export type FuiAnimatableProperty =
  | 'x' | 'y' | 'w' | 'h'      // rect
  | 'opacity'                    // style (all node types)
  | 'fontSize' | 'borderWidth';  // style (label/button/panel)

export interface FuiKeyframe {
  time: number;   // seconds
  value: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step';
}

export interface FuiAnimationTrack {
  nodeId: string;
  property: FuiAnimatableProperty;
  keyframes: FuiKeyframe[]; // sorted ascending by time
}

export interface FuiAnimation {
  id: string;
  name: string;
  duration: number; // seconds
  loop: boolean;
  tracks: FuiAnimationTrack[];
}

export interface FuiDocument {
  version: number;
  mode: FuiMode;
  canvas: {
    width: number;
    height: number;
  };
  root: FuiPanelNode;
  animations?: FuiAnimation[];
}

