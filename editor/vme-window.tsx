// ============================================================
// FluxionJS V3 — Visual Material Editor (Standalone Window Entry)
// ============================================================

import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { VisualMaterialEditor } from './components/panels/VisualMaterialEditor';
import { ElectronFileSystem, setGlobalFileSystem } from '../src/filesystem';

// Initialize filesystem before React renders
setGlobalFileSystem(new ElectronFileSystem());

// Read filePath from URL query string (set by Electron main process)
const params = new URLSearchParams(window.location.search);
const filePath = params.get('filePath') || '';

const App: React.FC = () => {
  const handleClose = () => {
    window.fluxionAPI?.close();
  };

  if (!filePath) {
    return (
      <div style={{ color: 'red', padding: 20, fontFamily: 'system-ui' }}>
        ERROR: No filePath specified in query string.
      </div>
    );
  }

  return <VisualMaterialEditor filePath={filePath} onClose={handleClose} />;
};

try {
  const container = document.getElementById('vme-root');
  if (container) {
    createRoot(container).render(<App />);
  }
} catch (err: any) {
  console.error('VME window mount error:', err);
}
