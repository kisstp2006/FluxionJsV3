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
  };
}

export interface FuiLabelNode extends FuiBaseNode {
  type: 'label';
  text?: string;
  style?: {
    color?: string;
    fontSize?: number;
    align?: FuiAlign;
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
  };
}

export type FuiNode = FuiPanelNode | FuiLabelNode | FuiButtonNode;

export interface FuiDocument {
  version: number;
  mode: FuiMode;
  canvas: {
    width: number;
    height: number;
  };
  root: FuiPanelNode;
}

