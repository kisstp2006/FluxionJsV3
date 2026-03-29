import type { FuiAnimation, FuiAnimationTrack, FuiAnimatableProperty, FuiDocument, FuiKeyframe, FuiNode, FuiNodeType, FuiPanelNode, FuiRect } from './FuiTypes';

const ANIMATABLE_PROPS = new Set<string>(['x', 'y', 'w', 'h', 'opacity', 'fontSize', 'borderWidth']);

function parseAnimations(raw: any): FuiAnimation[] {
  if (!Array.isArray(raw)) return [];
  const result: FuiAnimation[] = [];
  for (const a of raw) {
    if (!isRecord(a) || typeof a.id !== 'string' || typeof a.name !== 'string') continue;
    const duration = typeof a.duration === 'number' && a.duration > 0 ? a.duration : 1;
    const loop = a.loop === true;
    const tracks: FuiAnimationTrack[] = [];
    if (Array.isArray(a.tracks)) {
      for (const t of a.tracks) {
        if (!isRecord(t) || typeof t.nodeId !== 'string') continue;
        if (!ANIMATABLE_PROPS.has(t.property)) continue;
        const keyframes: FuiKeyframe[] = [];
        if (Array.isArray(t.keyframes)) {
          for (const k of t.keyframes) {
            if (!isRecord(k) || typeof k.time !== 'number' || typeof k.value !== 'number') continue;
            const easing = ['linear','ease-in','ease-out','ease-in-out','step'].includes(k.easing) ? k.easing : 'linear';
            keyframes.push({ time: k.time, value: k.value, easing });
          }
          keyframes.sort((a, b) => a.time - b.time);
        }
        tracks.push({ nodeId: t.nodeId, property: t.property as FuiAnimatableProperty, keyframes });
      }
    }
    result.push({ id: a.id, name: a.name, duration, loop, tracks });
  }
  return result;
}

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
      const TRANSITIONS = ['none', 'colorTint'];
      const NAVIGATIONS = ['none', 'automatic', 'horizontal', 'vertical', 'explicit'];
      return {
        id,
        type: 'button',
        rect,
        text: typeof node?.text === 'string' ? node.text : 'Button',
        icon: typeof node?.icon === 'string' ? node.icon : undefined,
        tooltip: typeof node?.tooltip === 'string' ? node.tooltip : undefined,
        disabled: node?.disabled === true,
        clickAnimation: ['none','scale','flash'].includes(node?.clickAnimation) ? node.clickAnimation : undefined,
        transition: TRANSITIONS.includes(node?.transition) ? node.transition : undefined,
        colors: isRecord(node?.colors) ? node.colors : undefined,
        navigation: NAVIGATIONS.includes(node?.navigation) ? node.navigation : undefined,
        style: isRecord(node?.style) ? node.style : undefined,
        hoverStyle: isRecord(node?.hoverStyle) ? node.hoverStyle : undefined,
        activeStyle: isRecord(node?.activeStyle) ? node.activeStyle : undefined,
        disabledStyle: isRecord(node?.disabledStyle) ? node.disabledStyle : undefined,
      };
    }
    case 'toggle': {
      const fallback: FuiRect = { x: 0, y: 0, w: 160, h: 28 };
      const rect = ensureRect(node?.rect, fallback);
      return {
        id, type: 'toggle', rect,
        text: typeof node?.text === 'string' ? node.text : 'Toggle',
        value: node?.value === true,
        navigation: ['none','automatic','horizontal','vertical','explicit'].includes(node?.navigation) ? node.navigation : undefined,
        style: isRecord(node?.style) ? node.style : undefined,
      };
    }
    case 'slider': {
      const fallback: FuiRect = { x: 0, y: 0, w: 200, h: 24 };
      const rect = ensureRect(node?.rect, fallback);
      return {
        id, type: 'slider', rect,
        value: typeof node?.value === 'number' ? node.value : 0,
        min: typeof node?.min === 'number' ? node.min : 0,
        max: typeof node?.max === 'number' ? node.max : 1,
        wholeNumbers: node?.wholeNumbers === true,
        direction: node?.direction === 'vertical' ? 'vertical' : 'horizontal',
        navigation: ['none','automatic','horizontal','vertical','explicit'].includes(node?.navigation) ? node.navigation : undefined,
        style: isRecord(node?.style) ? node.style : undefined,
      };
    }
    case 'progressBar': {
      const fallback: FuiRect = { x: 0, y: 0, w: 200, h: 16 };
      const rect = ensureRect(node?.rect, fallback);
      return {
        id, type: 'progressBar', rect,
        value: typeof node?.value === 'number' ? Math.max(0, Math.min(1, node.value)) : 0,
        direction: node?.direction === 'vertical' ? 'vertical' : 'horizontal',
        style: isRecord(node?.style) ? node.style : undefined,
      };
    }
    case 'inputField': {
      const fallback: FuiRect = { x: 0, y: 0, w: 200, h: 36 };
      const rect = ensureRect(node?.rect, fallback);
      const CT = ['standard','integer','decimal','password'];
      return {
        id, type: 'inputField', rect,
        text: typeof node?.text === 'string' ? node.text : '',
        placeholder: typeof node?.placeholder === 'string' ? node.placeholder : 'Enter text...',
        contentType: CT.includes(node?.contentType) ? node.contentType : 'standard',
        navigation: ['none','automatic','horizontal','vertical','explicit'].includes(node?.navigation) ? node.navigation : undefined,
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

  const animations = parseAnimations(raw.animations);

  return {
    version,
    mode,
    canvas: { width, height },
    root: {
      ...root,
      rect: root.rect ?? { x: 0, y: 0, w: width, h: height },
      children: root.children ?? [],
    },
    ...(animations.length > 0 ? { animations } : {}),
  };
}

