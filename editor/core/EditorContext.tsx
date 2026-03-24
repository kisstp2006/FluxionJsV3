// ============================================================
// FluxionJS V2 — Editor Context (React Provider)
// Thin React wrapper around pure core services
// ============================================================

import React, { createContext, useContext, useReducer, useCallback, useRef, useState, useEffect } from 'react';
import {
  EditorState, EditorAction, ConsoleEntry,
  initialEditorState, editorReducer,
} from './EditorState';
import { EngineSubsystems, initEditorEngine } from './EditorEngine';

// ── Re-export types for convenience ──
export type { EditorState, EditorAction, ConsoleEntry } from './EditorState';
export type { EngineSubsystems } from './EditorEngine';
export {
  EditorTool, TransformSpace, BottomTab, ViewportShadingMode, SnapConfig,
} from './EditorState';

// ── Editor State Context ──
interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  log: (text: string, type?: ConsoleEntry['type']) => void;
}

const EditorCtx = createContext<EditorContextValue | null>(null);

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);

  const log = useCallback((text: string, type: ConsoleEntry['type'] = 'info') => {
    dispatch({ type: 'LOG', text, logType: type });
  }, []);

  return (
    <EditorCtx.Provider value={{ state, dispatch, log }}>
      {children}
    </EditorCtx.Provider>
  );
};

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorCtx);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}

// ── Engine Context ──
const EngineCtx = createContext<EngineSubsystems | null>(null);

export function useEngine(): EngineSubsystems | null {
  return useContext(EngineCtx);
}

interface EngineProviderProps {
  children: React.ReactNode;
  canvas: HTMLCanvasElement | null;
  onReady?: (subsystems: EngineSubsystems) => void;
  onLog?: (text: string, type: 'info' | 'warn' | 'error' | 'system') => void;
}

export const EngineProvider: React.FC<EngineProviderProps> = ({ children, canvas, onReady, onLog }) => {
  const [subsystems, setSubsystems] = useState<EngineSubsystems | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!canvas || initialized.current) return;
    initialized.current = true;

    const log = (text: string, type: 'info' | 'warn' | 'error' | 'system' = 'info') => {
      onLog?.(text, type);
    };

    initEditorEngine(canvas, log).then((sys) => {
      setSubsystems(sys);
      onReady?.(sys);
    });
  }, [canvas]);

  return (
    <EngineCtx.Provider value={subsystems}>
      {children}
    </EngineCtx.Provider>
  );
};
