import type { FuiDocument, FuiNode, FuiNodeType, FuiPanelNode, FuiRect } from './FuiTypes';

function isRecord(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null;
}

function ensureRect(rect: any, fallback: FuiRect): FuiRect {
  if (!rect || typeof rect !== 'object') return { ...fallback };
  const x = typeof rect.x === 'number' ? rect.x : fallback.x;
  const y = typeof rect.y === 'number' ? rect.y : fallback.y;
  const w = typeof rect.w === 'number' ? rect.w : fallback.w;
  const h = typeof rect.h === 'number' ? rect.h : fallback.h;
  return { x, y, w, h };
}

function parseNode(node: any, idx: number, canvasW: number, canvasH: number): FuiNode {
  const type = node?.type as FuiNodeType;
  const id = typeof node?.id === 'string' && node.id.trim().length > 0 ? node.id : `node_${idx}`;

  switch (type) {
    case 'panel': {
      const fallback: FuiRect = { x: 0, y: 0, w: canvasW, h: canvasH };
      const rect = ensureRect(node?.rect, fallback);
      const childrenRaw = Array.isArray(node?.children) ? node.children : [];
      const children = childrenRaw.map((c: any, i: number) => parseNode(c, i, canvasW, canvasH));
      return {
        id,
        type: 'panel',
        rect,
        children,
        style: isRecord(node?.style) ? node.style : undefined,
      };
    }
    case 'label': {
      const fallback: FuiRect = { x: 0, y: 0, w: 160, h: 40 };
      const rect = ensureRect(node?.rect, fallback);
      return {
        id,
        type: 'label',
        rect,
        text: typeof node?.text === 'string' ? node.text : 'Label',
        style: isRecord(node?.style) ? node.style : undefined,
      };
    }
    case 'button': {
      const fallback: FuiRect = { x: 0, y: 0, w: 180, h: 44 };
      const rect = ensureRect(node?.rect, fallback);
      return {
        id,
        type: 'button',
        rect,
        text: typeof node?.text === 'string' ? node.text : 'Button',
        style: isRecord(node?.style) ? node.style : undefined,
      };
    }
    default: {
      // Unknown type: coerce to panel so rendering doesn't crash.
      const fallback: FuiRect = { x: 0, y: 0, w: canvasW, h: canvasH };
      const rect = ensureRect(node?.rect, fallback);
      const childrenRaw = Array.isArray(node?.children) ? node.children : [];
      const children = childrenRaw.map((c: any, i: number) => parseNode(c, i, canvasW, canvasH));
      const panel: FuiPanelNode = {
        id,
        type: 'panel',
        rect,
        children,
        style: isRecord(node?.style) ? node.style : undefined,
      };
      return panel;
    }
  }
}

/**
 * Parse a `.fui` JSON string into a typed document model.
 * The schema is intentionally minimal (MVP).
 */
export function parseFuiJson(text: string): FuiDocument {
  const raw = JSON.parse(text) as any;

  if (!isRecord(raw)) {
    throw new Error('Invalid .fui: root must be an object');
  }

  const version = typeof raw.version === 'number' ? raw.version : 1;
  const mode = (raw.mode === 'world' || raw.mode === 'screen') ? raw.mode : 'screen';

  const canvasW = raw.canvas?.width ?? 800;
  const canvasH = raw.canvas?.height ?? 600;
  const width = typeof canvasW === 'number' ? canvasW : 800;
  const height = typeof canvasH === 'number' ? canvasH : 600;

  const rootAny = raw.root;
  if (!isRecord(rootAny)) {
    throw new Error('Invalid .fui: missing `root`');
  }

  const root: FuiPanelNode = parseNode(rootAny, 0, width, height) as FuiPanelNode;
  // Ensure the root is always a panel.
  if (root.type !== 'panel') {
    throw new Error('Invalid .fui: `root.type` must be "panel"');
  }

  return {
    version,
    mode,
    canvas: { width, height },
    root: {
      ...root,
      rect: root.rect ?? { x: 0, y: 0, w: width, h: height },
      children: root.children ?? [],
    },
  };
}

