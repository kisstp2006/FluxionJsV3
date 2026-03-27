export type FuiMode = 'screen' | 'world';
export type FuiNodeType = 'panel' | 'label' | 'button';

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

export interface FuiButtonNode extends FuiBaseNode {
  type: 'button';
  text?: string;
  style?: {
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    radius?: number;
    textColor?: string;
    fontSize?: number;
    align?: FuiAlign;
    padding?: number;
    opacity?: number; // 0–1
  };
}

export type FuiNode = FuiPanelNode | FuiLabelNode | FuiButtonNode;

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

