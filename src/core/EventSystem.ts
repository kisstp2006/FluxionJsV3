// ============================================================
// FluxionJS V2 — Event System
// Decoupled pub/sub for engine-wide communication
// ============================================================

export type EventCallback<T = any> = (data: T) => void;

interface EventEntry {
  callback: EventCallback;
  once: boolean;
  priority: number;
}

export class EventSystem {
  private listeners: Map<string, EventEntry[]> = new Map();

  on<T = any>(event: string, callback: EventCallback<T>, priority = 0): () => void {
    this.addEntry(event, { callback, once: false, priority });
    return () => this.off(event, callback);
  }

  once<T = any>(event: string, callback: EventCallback<T>, priority = 0): () => void {
    this.addEntry(event, { callback, once: true, priority });
    return () => this.off(event, callback);
  }

  off<T = any>(event: string, callback: EventCallback<T>): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.findIndex(e => e.callback === callback);
    if (idx >= 0) list.splice(idx, 1);
  }

  emit<T = any>(event: string, data?: T): void {
    const list = this.listeners.get(event);
    if (!list) return;

    const toRemove: number[] = [];

    for (let i = 0; i < list.length; i++) {
      list[i].callback(data);
      if (list[i].once) toRemove.push(i);
    }

    // Remove once-listeners in reverse order
    for (let i = toRemove.length - 1; i >= 0; i--) {
      list.splice(toRemove[i], 1);
    }
  }

  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  private addEntry(event: string, entry: EventEntry): void {
    let list = this.listeners.get(event);
    if (!list) {
      list = [];
      this.listeners.set(event, list);
    }
    list.push(entry);
    list.sort((a, b) => b.priority - a.priority);
  }
}

// Global engine events
export const EngineEvents = {
  INIT: 'engine:init',
  START: 'engine:start',
  UPDATE: 'engine:update',
  FIXED_UPDATE: 'engine:fixedUpdate',
  LATE_UPDATE: 'engine:lateUpdate',
  RENDER: 'engine:render',
  RESIZE: 'engine:resize',
  DESTROY: 'engine:destroy',

  SCENE_LOADED: 'scene:loaded',
  SCENE_UNLOADED: 'scene:unloaded',
  ENTITY_CREATED: 'entity:created',
  ENTITY_DESTROYED: 'entity:destroyed',
  COMPONENT_ADDED: 'component:added',
  COMPONENT_REMOVED: 'component:removed',
} as const;
