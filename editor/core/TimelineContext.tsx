// ============================================================
// FluxionJS V3 — TimelineContext
// React context that bridges the EntityTimeline panel (bottom)
// with the AutoInspector (right panel) so that:
//   • AutoInspector can show ◆ key buttons when timeline is active
//   • Clicking ◆ inserts a keyframe into the current clip at currentTime
// ============================================================

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { EntityId } from '../../src/core/ECS';

// ── Context shape ─────────────────────────────────────────────────────────────

export interface TimelineContextValue {
  /** Whether the timeline has an active clip selected for the inspected entity */
  isActive: boolean;
  /** Whether auto-key (REC) mode is on — every inspector change inserts a keyframe */
  isRecording: boolean;
  /** The entity currently being edited in the timeline */
  entityId: EntityId | null;
  /** Active clip id */
  clipId: string | null;
  /**
   * Insert or overwrite a keyframe on the given component+property.
   * The current time is read from an internal ref at call-time — NOT from
   * context state — so calling this never triggers unnecessary re-renders.
   */
  insertKeyframe: (componentType: string, propertyPath: string, value: number) => void;
  /** Called by the timeline panel to update isActive/entityId/clipId/isRecording */
  _setTimelineState: (state: { isActive: boolean; isRecording: boolean; entityId: EntityId | null; clipId: string | null }) => void;
  /**
   * Ref written by the timeline panel to its own insert-keyframe handler.
   * The handler captures the panel's currentTime in its closure, avoiding
   * a context value change on every scrub frame.
   */
  _onInsertRef: React.MutableRefObject<((compType: string, path: string, value: number) => void) | null>;
}

const DEFAULT: TimelineContextValue = {
  isActive: false,
  isRecording: false,
  entityId: null,
  clipId: null,
  insertKeyframe: () => {},
  _setTimelineState: () => {},
  _onInsertRef: { current: null },
};

export const TimelineContext = createContext<TimelineContextValue>(DEFAULT);

// ── Provider ──────────────────────────────────────────────────────────────────

export const TimelineContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{ isActive: boolean; isRecording: boolean; entityId: EntityId | null; clipId: string | null }>({
    isActive: false,
    isRecording: false,
    entityId: null,
    clipId: null,
  });

  const onInsertRef = useRef<((compType: string, path: string, value: number) => void) | null>(null);

  const setTimelineState = useCallback((
    s: { isActive: boolean; isRecording: boolean; entityId: EntityId | null; clipId: string | null },
  ) => {
    setState(s);
  }, []);

  const insertKeyframe = useCallback((componentType: string, propertyPath: string, value: number) => {
    onInsertRef.current?.(componentType, propertyPath, value);
  }, []);

  const value: TimelineContextValue = {
    ...state,
    insertKeyframe,
    _setTimelineState: setTimelineState,
    _onInsertRef: onInsertRef,
  };

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTimeline(): TimelineContextValue {
  return useContext(TimelineContext);
}
