export type FuiMode = 'screen' | 'world';

/** Anchor point relative to the parent container. Determines which corner/edge rect.x/y is measured from. */
export type FuiAnchor =
  | 'topLeft'    | 'top'    | 'topRight'
  | 'left'       | 'center' | 'right'
  | 'bottomLeft' | 'bottom' | 'bottomRight';

/** How the UI canvas scales relative to the actual screen in screen-space mode. */
export type FuiScaleMode = 'constantPixelSize' | 'scaleWithScreenSize';

export type FuiNodeType = 'panel' | 'label' | 'button' | 'icon' | 'image' | 'toggle' | 'slider' | 'progressBar' | 'inputField';

/** How a button visually responds to interaction. */
export type FuiTransition = 'none' | 'colorTint';

/** Gamepad/keyboard navigation mode. */
export type FuiNavigation = 'none' | 'automatic' | 'horizontal' | 'vertical' | 'explicit';

/** Per-state text color block for the button label. */
export interface FuiTextColorBlock {
  normalColor?:      string;
  highlightedColor?: string;
  pressedColor?:     string;
  selectedColor?:    string;
  disabledColor?:    string;
}

/** Unity-style color block used by the colorTint transition. */
export interface FuiColorBlock {
  normalColor?:      string;
  highlightedColor?: string;
  pressedColor?:     string;
  selectedColor?:    string;
  disabledColor?:    string;
  /** Multiplier applied to all colors (1–5). Default: 1. */
  colorMultiplier?:  number;
  /** Blend duration in seconds. Default: 0.1. */
  fadeDuration?:     number;
}

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
  /** Anchor point in parent space that rect.x/y is measured from. Default: 'topLeft'. */
  anchor?: FuiAnchor;
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
    fontFamily?: string;
    align?: FuiAlign;
    opacity?: number; // 0–1
  };
}

export interface FuiButtonStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  /** Base/fallback text colour. Use `textColors` for per-state control. */
  textColor?: string;
  /** Per-state text colours (normal / highlighted / pressed / selected / disabled). */
  textColors?: FuiTextColorBlock;
  fontSize?: number;
  fontFamily?: string;
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
  /** Project-relative path to a raster image (PNG / JPG / WebP) used as the button background. */
  image?: string;
  /** How the background image fills the button rect. Default: 'fill'. */
  imageFit?: 'contain' | 'cover' | 'fill';
  /** Tooltip text shown when hovering the button. */
  tooltip?: string;
  /** CSS cursor applied when hovering. Default: 'pointer'. */
  cursor?: 'pointer' | 'default' | 'not-allowed';
  /** Disables click events and applies dimmed appearance. */
  disabled?: boolean;
  /** Click animation. 'scale' shrinks the button on press; 'flash' briefly flashes it white. */
  clickAnimation?: 'none' | 'scale' | 'flash';
  /** Visual transition mode. Default: 'colorTint'. */
  transition?: FuiTransition;
  /** Color block used when transition === 'colorTint'. */
  colors?: FuiColorBlock;
  /** Keyboard/gamepad navigation behaviour. Default: 'automatic'. */
  navigation?: FuiNavigation;
  style?: FuiButtonStyle;
  /** Style overrides merged on top of base style while the mouse is hovering. */
  hoverStyle?: Partial<FuiButtonStyle>;
  /** Style overrides merged on top of base style while the button is being pressed. Supports `scale` (0–1). */
  activeStyle?: Partial<FuiButtonStyle> & { scale?: number };
  /** Style overrides applied when `disabled` is true. Defaults to opacity 0.4. */
  disabledStyle?: Partial<FuiButtonStyle>;
}

export interface FuiImageNode extends FuiBaseNode {
  type: 'image';
  /** Project-relative path to a raster image (PNG / JPG / WebP / SVG). */
  src?: string;
  style?: {
    opacity?: number;
    /**
     * How the image fills its rect. Default: `'contain'`.
     * - `'contain'` — scale uniformly so the image fits inside the rect.
     * - `'cover'`   — scale uniformly so the image covers the entire rect.
     * - `'fill'`    — stretch to exactly fill width and height.
     */
    fit?: 'contain' | 'cover' | 'fill';
    /** Optional background/matte colour visible in letterbox areas. */
    backgroundColor?: string;
    radius?: number;
  };
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

export interface FuiToggleNode extends FuiBaseNode {
  type: 'toggle';
  text?: string;
  value?: boolean;
  navigation?: FuiNavigation;
  style?: {
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    radius?: number;
    checkColor?: string;
    textColor?: string;
    fontSize?: number;
    fontFamily?: string;
    opacity?: number;
  };
}

export interface FuiSliderNode extends FuiBaseNode {
  type: 'slider';
  /** Normalised value 0–1 (or min–max if those are set). */
  value?: number;
  min?: number;
  max?: number;
  wholeNumbers?: boolean;
  direction?: 'horizontal' | 'vertical';
  navigation?: FuiNavigation;
  style?: {
    trackColor?: string;
    fillColor?: string;
    handleColor?: string;
    handleSize?: number;
    trackHeight?: number;
    opacity?: number;
  };
}

export interface FuiProgressBarNode extends FuiBaseNode {
  type: 'progressBar';
  /** 0–1 fill fraction. */
  value?: number;
  direction?: 'horizontal' | 'vertical';
  style?: {
    trackColor?: string;
    fillColor?: string;
    radius?: number;
    opacity?: number;
  };
}

export interface FuiInputFieldNode extends FuiBaseNode {
  type: 'inputField';
  text?: string;
  placeholder?: string;
  contentType?: 'standard' | 'integer' | 'decimal' | 'password';
  navigation?: FuiNavigation;
  style?: {
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    radius?: number;
    textColor?: string;
    placeholderColor?: string;
    fontSize?: number;
    fontFamily?: string;
    opacity?: number;
  };
}

export type FuiNode = FuiPanelNode | FuiLabelNode | FuiButtonNode | FuiImageNode | FuiIconNode | FuiToggleNode | FuiSliderNode | FuiProgressBarNode | FuiInputFieldNode;

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
    /** How to scale the canvas when screen resolution differs from the design size. Default: 'constantPixelSize'. */
    scaleMode?: FuiScaleMode;
    /** Reference resolution width used by 'scaleWithScreenSize'. Defaults to canvas.width. */
    referenceWidth?: number;
    /** Reference resolution height used by 'scaleWithScreenSize'. Defaults to canvas.height. */
    referenceHeight?: number;
    /** Blend between matching width (0) and height (1). Used with 'scaleWithScreenSize'. Default: 0.5. */
    matchWidthOrHeight?: number;
  };
  root: FuiPanelNode;
  animations?: FuiAnimation[];
}

