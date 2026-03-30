// ============================================================
// FluxionJS V3 — Build Window Entry Point
// Standalone OS window for Web (HTML5) export.
// ============================================================

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { BuildPanel } from './components/panels/BuildPanel';
import { EditorProvider } from './core/EditorContext';
import { ElectronFileSystem, setGlobalFileSystem } from '../src/filesystem';
import { projectManager } from '../src/project/ProjectManager';

// Initialise filesystem
const _fs = new ElectronFileSystem((window as any).fluxionAPI);
setGlobalFileSystem(_fs);

// Project file path passed by main process via query string
const params = new URLSearchParams(window.location.search);
const projectFilePath = params.get('projectFilePath') || '';

const App: React.FC = () => {
  const [ready, setReady] = useState(!projectFilePath);

  useEffect(() => {
    if (!projectFilePath) return;
    projectManager.openProject(projectFilePath)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  return (
    <EditorProvider>
      <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {ready
          ? <BuildPanel />
          : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading project…</div>
        }
      </div>
    </EditorProvider>
  );
};

try {
  const container = document.getElementById('build-root');
  if (container) {
    createRoot(container).render(<App />);
  }
} catch (err: any) {
  console.error('Build window mount error:', err);
}
