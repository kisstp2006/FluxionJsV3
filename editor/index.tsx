// ============================================================
// FluxionJS V2 — Editor Entry Point (React)
// ============================================================

import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { EditorProvider } from './core/EditorContext';
import { EditorLayout } from './components/layout/EditorLayout';
import { ElectronFileSystem, setGlobalFileSystem } from '../src/filesystem';
import { registerDefaultSettings } from './core/DefaultSettings';
import { registerDefaultProjectSettings } from './core/DefaultProjectSettings';

// Initialize filesystem + settings BEFORE React renders.
// This ensures ProjectManager can use getFileSystem() at project creation time.
const electronFs = new ElectronFileSystem((window as any).fluxionAPI);
setGlobalFileSystem(electronFs);
registerDefaultSettings();
registerDefaultProjectSettings();

const App: React.FC = () => (
  <EditorProvider>
    <EditorLayout />
  </EditorProvider>
);

// Mount with error handling
try {
  const container = document.getElementById('editor-root');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  } else {
    document.body.innerHTML = '<pre style="color:red;padding:20px;">ERROR: #editor-root not found</pre>';
  }
} catch (err: any) {
  console.error('FluxionJS mount error:', err);
  document.body.innerHTML = `<pre style="color:red;padding:20px;white-space:pre-wrap;">MOUNT ERROR:\n${err?.stack || err}</pre>`;
}
