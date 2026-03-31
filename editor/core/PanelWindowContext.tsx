// ============================================================
// FluxionJS V3 — PanelWindowContext
// Provides an EditorContext-compatible interface for detached
// panel OS windows. Reuses EditorCtx so useEditor() works
// inside panels without any code changes.
// ============================================================

import React, { useCallback } from 'react';
import { EditorCtx } from './EditorContext';
import type { EditorState, EditorAction, ConsoleEntry } from './EditorState';

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  children: React.ReactNode;
}

/**
 * Drop-in replacement for EditorProvider in a detached panel OS window.
 * Provides to the same EditorCtx used by useEditor(), so all panels work
 * without modification.
 */
export const EditorCtxForPanelWindow: React.FC<Props> = ({ state, dispatch, children }) => {
  const log = useCallback((text: string, type: ConsoleEntry['type'] = 'info') => {
    dispatch({ type: 'LOG', text, logType: type });
  }, [dispatch]);

  return (
    <EditorCtx.Provider value={{ state, dispatch, log }}>
      {children}
    </EditorCtx.Provider>
  );
};
