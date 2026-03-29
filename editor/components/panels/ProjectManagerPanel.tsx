// ============================================================
// FluxionJS V3 — Project Manager Panel
// Flax Engine-style project launcher:
//   Left sidebar (logo + nav) | Right content (project grid)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../../ui/Icons';
import { useEditor } from '../../core/EditorContext';
import { projectManager, RecentProject } from '../../../src/project/ProjectManager';

// ── Sidebar nav items ─────────────────────────────────────────

type NavPage = 'projects';

const NAV_ITEMS: { id: NavPage; label: string; icon: React.ReactNode }[] = [
  { id: 'projects', label: 'Projects', icon: Icons.folder },
];

// ── New-project modal ──────────────────────────────────────────

const NewProjectModal: React.FC<{
  onConfirm: (name: string, dir: string) => void;
  onCancel: () => void;
  loading: boolean;
}> = ({ onConfirm, onCancel, loading }) => {
  const [name, setName] = useState('');
  const [dir, setDir] = useState('');

  const pickDir = async () => {
    const picked = await (window.fluxionAPI as any)?.openDirDialog?.();
    if (picked) setDir(picked);
  };

  const canCreate = name.trim().length > 0 && dir.length > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 440, background: '#1e2030',
        border: '1px solid #2e3150',
        borderRadius: 8,
        padding: '28px 28px 22px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#d0d0e0', marginBottom: 20 }}>
          New Project
        </div>

        <label style={labelStyle}>Project Name</label>
        <input
          autoFocus
          type="text"
          placeholder="MyProject"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && canCreate) onConfirm(name.trim(), dir); if (e.key === 'Escape') onCancel(); }}
          style={modalInputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 14 }}>Location</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Choose folder..."
            value={dir}
            readOnly
            style={{ ...modalInputStyle, flex: 1, cursor: 'default', color: dir ? '#d0d0e0' : '#555' }}
          />
          <button onClick={pickDir} style={secondaryBtnStyle}>Browse</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={secondaryBtnStyle}>Cancel</button>
          <button
            onClick={() => canCreate && onConfirm(name.trim(), dir)}
            disabled={!canCreate || loading}
            style={{
              ...primaryBtnStyle,
              opacity: (!canCreate || loading) ? 0.45 : 1,
              cursor: (!canCreate || loading) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Project card ──────────────────────────────────────────────

const ProjectCard: React.FC<{
  project: RecentProject;
  onOpen: () => void;
  onRemove: (e: React.MouseEvent) => void;
}> = ({ project, onOpen, onRemove }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const dateStr = new Date(project.lastOpened).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <div
      onClick={onOpen}
      style={{
        width: 148,
        background: '#1a1c2e',
        border: '1px solid #2a2d45',
        borderRadius: 6,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 120ms',
        position: 'relative',
        userSelect: 'none',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#4a4e7a')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a2d45')}
    >
      {/* Thumbnail placeholder */}
      <div style={{
        height: 90,
        background: 'linear-gradient(145deg, #1e2038 0%, #141625 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid #2a2d45',
      }}>
        <div style={{ opacity: 0.25, color: '#7080b0' }}>
          {Icons.folder}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '7px 8px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#c8cce0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 104,
          }}>
            {project.name}
          </div>
          <div style={{ fontSize: 9, color: '#5a5e80', marginTop: 1 }}>{dateStr}</div>
        </div>

        {/* Context menu button */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
            style={{
              background: 'none', border: 'none',
              color: '#5a5e80', cursor: 'pointer',
              padding: '2px 3px', borderRadius: 3,
              display: 'flex', alignItems: 'center', gap: 1,
              lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#9098c0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#5a5e80')}
            title="Options"
          >
            <span style={{ fontSize: 13, letterSpacing: -1 }}>···</span>
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%',
              background: '#1e2030', border: '1px solid #2e3150',
              borderRadius: 5, overflow: 'hidden',
              boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
              zIndex: 100, minWidth: 120,
            }}>
              <button
                onClick={e => { setMenuOpen(false); onOpen(); }}
                style={ctxItemStyle}
              >
                {Icons.folderOpen}
                <span>Open</span>
              </button>
              <div style={{ height: 1, background: '#2e3150', margin: '2px 0' }} />
              <button
                onClick={e => { setMenuOpen(false); onRemove(e); }}
                style={{ ...ctxItemStyle, color: '#e05a5a' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(224,90,90,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                {Icons.trash}
                <span>Remove</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────

export const ProjectManagerPanel: React.FC<{
  onProjectOpened: (projectPath: string) => void;
}> = ({ onProjectOpened }) => {
  const { log } = useEditor();
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [activePage] = useState<NavPage>('projects');
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    projectManager.getRecentProjects().then(setRecentProjects).catch(() => {});
  }, []);

  const handleNewProject = async (name: string, dir: string) => {
    setLoading(true);
    try {
      await projectManager.createProject(name, dir);
      log(`Project created: ${name}`, 'system');
      onProjectOpened(projectManager.projectFilePath!);
    } catch (err: any) {
      log(`Failed to create project: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setShowNewModal(false);
    }
  };

  const handleAddProject = async () => {
    const api = window.fluxionAPI;
    if (!api) return;
    const path = await api.openFileDialog?.([{ name: 'FluxionJS Project', extensions: ['fluxproj'] }]);
    if (!path) return;
    setLoading(true);
    try {
      await projectManager.openProject(path);
      log(`Project opened: ${projectManager.config!.name}`, 'system');
      onProjectOpened(path);
    } catch (err: any) {
      log(`Failed to open project: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRecent = async (recent: RecentProject) => {
    setLoading(true);
    try {
      await projectManager.openProject(recent.path);
      log(`Project opened: ${recent.name}`, 'system');
      onProjectOpened(recent.path);
    } catch (err: any) {
      log(`Failed to open project: ${err.message}`, 'error');
      await projectManager.removeFromRecent(recent.path);
      setRecentProjects(prev => prev.filter(r => r.path !== recent.path));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await projectManager.removeFromRecent(path);
    setRecentProjects(prev => prev.filter(r => r.path !== path));
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: '#13141f', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: 148,
        flexShrink: 0,
        background: '#0e0f1a',
        borderRight: '1px solid #1e2035',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{
          padding: '28px 16px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          borderBottom: '1px solid #1e2035',
        }}>
          <div style={{
            width: 52, height: 52,
            background: 'linear-gradient(135deg, #3a4fff 0%, #7c3aff 100%)',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(80,80,255,0.35)',
          }}>
            {Icons.zap}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#d0d4f0', letterSpacing: 0.3 }}>FLUXION</div>
            <div style={{ fontSize: 9, color: '#555870', letterSpacing: 1.5, marginTop: 1 }}>ENGINE</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV_ITEMS.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '9px 16px',
                fontSize: 12,
                fontWeight: activePage === item.id ? 600 : 400,
                color: activePage === item.id ? '#d0d4f0' : '#5a5e80',
                background: activePage === item.id ? 'rgba(80,100,255,0.15)' : 'none',
                borderLeft: activePage === item.id ? '2px solid #5064ff' : '2px solid transparent',
                cursor: 'default',
                userSelect: 'none',
              }}
            >
              {item.icon}
              {item.label}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e2035' }}>
          <div style={{ fontSize: 10, color: '#3a3d55', textAlign: 'center', letterSpacing: 0.3 }}>
            v3.0.0
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 28px 14px',
          borderBottom: '1px solid #1e2035',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#d0d4f0', letterSpacing: 0.2 }}>
            Projects Library
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setShowNewModal(true)}
              disabled={loading}
              style={primaryBtnStyle}
            >
              {Icons.plus}
              <span style={{ marginLeft: 5 }}>New Project</span>
            </button>
            <button
              onClick={handleAddProject}
              disabled={loading}
              style={secondaryBtnStyle}
            >
              {Icons.folderOpen}
              <span style={{ marginLeft: 5 }}>Add Project</span>
            </button>
          </div>
        </div>

        {/* Project grid */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 28px',
        }}>
          {recentProjects.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '60%',
              gap: 12, color: '#3a3d55',
            }}>
              <div style={{ opacity: 0.4 }}>{Icons.folder}</div>
              <div style={{ fontSize: 13, color: '#4a4e70' }}>No projects yet</div>
              <div style={{ fontSize: 11, color: '#3a3d55' }}>Create a new project or add an existing one</div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 14,
              alignContent: 'flex-start',
            }}>
              {recentProjects.map(project => (
                <ProjectCard
                  key={project.path}
                  project={project}
                  onOpen={() => handleOpenRecent(project)}
                  onRemove={(e) => handleRemoveRecent(e, project.path)}
                />
              ))}
            </div>
          )}
        </div>

        {loading && (
          <div style={{
            position: 'absolute', bottom: 16, right: 24,
            fontSize: 11, color: '#5a5e80', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {Icons.refresh}
            <span>Loading…</span>
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <NewProjectModal
          onConfirm={handleNewProject}
          onCancel={() => setShowNewModal(false)}
          loading={loading}
        />
      )}
    </div>
  );
};

// ── Shared styles ─────────────────────────────────────────────

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '7px 14px',
  borderRadius: 5,
  border: 'none',
  background: '#3a4fff',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 120ms',
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '7px 14px',
  borderRadius: 5,
  border: '1px solid #2e3150',
  background: '#1a1c2e',
  color: '#8a8eb0',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'border-color 120ms',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#6870a0',
  marginBottom: 5,
  fontWeight: 500,
};

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 5,
  border: '1px solid #2e3150',
  background: '#141625',
  color: '#d0d0e0',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

const ctxItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', textAlign: 'left',
  padding: '7px 12px',
  background: 'none', border: 'none',
  color: '#9098c0', fontSize: 11,
  cursor: 'pointer',
  transition: 'background 80ms',
};
