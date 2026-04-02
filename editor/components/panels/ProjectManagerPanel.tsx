// ============================================================
// FluxionJS V3 — Project Manager Panel
// Cocos Creator / Unity-style launcher:
//   Left sidebar (branding + nav) | Right content (project list)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../../ui/Icons';
import { PathInput } from '../../ui/inputs/PathInput';
import { useEditor } from '../../core/EditorContext';
import { projectManager, RecentProject } from '../../../src/project/ProjectManager';

// ── New-project modal ──────────────────────────────────────────

const NewProjectModal: React.FC<{
  onConfirm: (name: string, dir: string) => void;
  onCancel: () => void;
  loading: boolean;
}> = ({ onConfirm, onCancel, loading }) => {
  const [name, setName] = useState('');
  const [dir, setDir] = useState('');
  const canCreate = name.trim().length > 0 && dir.length > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        width: 420,
        background: 'var(--bg-secondary, #252526)',
        border: '1px solid var(--border, #3c3c3c)',
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>
        {/* Modal header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border, #3c3c3c)',
          background: 'var(--bg-tertiary, #2d2d30)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #cccccc)' }}>
            New Project
          </span>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none',
            color: 'var(--text-muted, #5a5a5a)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', padding: 2, borderRadius: 3,
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '20px' }}>
          <label style={modalLabelStyle}>Project Name</label>
          <input
            autoFocus
            type="text"
            placeholder="MyGame"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && canCreate) onConfirm(name.trim(), dir);
              if (e.key === 'Escape') onCancel();
            }}
            style={modalInputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-focus, #4d9eff)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border, #3c3c3c)'; }}
          />

          <label style={{ ...modalLabelStyle, marginTop: 14 }}>Location</label>
          <PathInput
            value={dir}
            onChange={setDir}
            mode="folder"
            placeholder="Choose project folder…"
          />

          <div style={{
            display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end',
            paddingTop: 16, borderTop: '1px solid var(--border-subtle, #2d2d30)',
          }}>
            <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
            <button
              onClick={() => canCreate && onConfirm(name.trim(), dir)}
              disabled={!canCreate || loading}
              style={{
                ...createBtnStyle,
                opacity: (!canCreate || loading) ? 0.4 : 1,
                cursor: (!canCreate || loading) ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Project row ───────────────────────────────────────────────

const ProjectRow: React.FC<{
  project: RecentProject;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRemove: (e: React.MouseEvent) => void;
}> = ({ project, selected, onSelect, onOpen, onRemove }) => {
  const [hovered, setHovered] = useState(false);
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

  const pathShort = project.path.replace(/\\/g, '/').replace(/\/[^/]+\.fluxproj$/, '');

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        height: 52,
        cursor: 'pointer',
        background: selected
          ? 'var(--bg-active, #094771)'
          : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderLeft: `2px solid ${selected ? 'var(--accent, #4d9eff)' : 'transparent'}`,
        transition: 'background 80ms, border-color 80ms',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Icon */}
      <div style={{
        width: 34, height: 34, borderRadius: 6, flexShrink: 0,
        background: selected ? 'rgba(77,158,255,0.2)' : 'var(--bg-tertiary, #2d2d30)',
        border: `1px solid ${selected ? 'rgba(77,158,255,0.4)' : 'var(--border, #3c3c3c)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: selected ? 'var(--accent, #4d9eff)' : 'var(--text-muted, #5a5a5a)',
        fontSize: 16,
      }}>
        {Icons.folder}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600,
          color: selected ? 'var(--accent, #4d9eff)' : 'var(--text-primary, #cccccc)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.name}
        </div>
        <div style={{
          fontSize: 10, marginTop: 2,
          color: 'var(--text-muted, #5a5a5a)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)',
        }}>
          {pathShort}
        </div>
      </div>

      {/* Date */}
      <div style={{
        fontSize: 10, color: 'var(--text-muted, #5a5a5a)',
        flexShrink: 0, width: 80, textAlign: 'right',
      }}>
        {dateStr}
      </div>

      {/* Context menu */}
      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          style={{
            background: (hovered || menuOpen) ? 'var(--bg-hover, #2d2d30)' : 'transparent',
            border: '1px solid',
            borderColor: (hovered || menuOpen) ? 'var(--border, #3c3c3c)' : 'transparent',
            color: 'var(--text-secondary, #9d9d9d)',
            cursor: 'pointer', padding: '3px 6px', borderRadius: 3,
            display: 'flex', alignItems: 'center',
            lineHeight: 1, fontSize: 13,
            opacity: (hovered || menuOpen) ? 1 : 0,
            transition: 'opacity 80ms',
          }}
          title="Options"
        >
          ···
        </button>
        {menuOpen && (
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 2,
            background: 'var(--bg-dropdown, #252526)',
            border: '1px solid var(--border-focus, #4d9eff)',
            borderRadius: 3, overflow: 'hidden',
            boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
            zIndex: 100, minWidth: 130,
            animation: 'dropdownFadeIn 80ms ease',
          }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onOpen(); }}
              style={ctxItemStyle}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, #2d2d30)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {Icons.folderOpen}
              <span>Open</span>
            </button>
            <div style={{ height: 1, background: 'var(--border, #3c3c3c)', margin: '2px 0' }} />
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onRemove(e); }}
              style={{ ...ctxItemStyle, color: 'var(--accent-red, #f14c4c)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(241,76,76,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {Icons.trash}
              <span>Remove</span>
            </button>
          </div>
        )}
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
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

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
    if (selectedPath === path) setSelectedPath(null);
  };

  const filtered = search
    ? recentProjects.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.path.toLowerCase().includes(search.toLowerCase())
      )
    : recentProjects;

  const selectedProject = recentProjects.find(p => p.path === selectedPath) ?? null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--bg-primary, #1a1a1a)', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: 180,
        flexShrink: 0,
        background: 'var(--bg-secondary, #252526)',
        borderRight: '1px solid var(--border, #3c3c3c)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Branding */}
        <div style={{
          padding: '32px 20px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--border, #3c3c3c)',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #4d9eff 0%, #3a6fcf 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(77,158,255,0.3)',
            color: '#fff', fontSize: 22,
          }}>
            {Icons.zap}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 12, fontWeight: 800, letterSpacing: 2,
              color: 'var(--text-primary, #cccccc)',
            }}>
              FLUXION
            </div>
            <div style={{
              fontSize: 9, color: 'var(--text-muted, #5a5a5a)',
              letterSpacing: 1.5, marginTop: 2, textTransform: 'uppercase',
            }}>
              Engine v3
            </div>
          </div>
        </div>

        {/* Nav section */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 16px',
            fontSize: 11, fontWeight: 600,
            color: 'var(--accent, #4d9eff)',
            background: 'var(--accent-dim, rgba(77,158,255,0.1))',
            borderLeft: '2px solid var(--accent, #4d9eff)',
            userSelect: 'none',
          }}>
            {Icons.folder}
            Projects
          </div>
        </nav>

        {/* Bottom info */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border, #3c3c3c)',
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted, #5a5a5a)', textAlign: 'center', letterSpacing: 0.5 }}>
            {recentProjects.length} project{recentProjects.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 16px',
          height: 44, flexShrink: 0,
          borderBottom: '1px solid var(--border, #3c3c3c)',
          background: 'var(--bg-secondary, #252526)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #cccccc)', marginRight: 8 }}>
            Recent Projects
          </span>

          {/* Search */}
          <div style={{ flex: 1, position: 'relative', maxWidth: 260 }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
              style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #5a5a5a)', pointerEvents: 'none' }}>
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Filter projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', height: 26,
                background: 'var(--bg-input, #1e1e1e)',
                border: '1px solid var(--border, #3c3c3c)',
                borderRadius: 3,
                color: 'var(--text-primary, #cccccc)',
                padding: '0 24px 0 26px',
                fontSize: 11, outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-focus, #4d9eff)'; }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border, #3c3c3c)'; }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-muted, #5a5a5a)',
                cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center',
              }}>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          <div style={{ flex: 1 }} />

          <button
            onClick={() => setShowNewModal(true)}
            disabled={loading}
            style={createBtnStyle}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            New Project
          </button>
          <button
            onClick={handleAddProject}
            disabled={loading}
            style={openBtnStyle}
          >
            {Icons.folderOpen}
            Open
          </button>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px 0 64px',
          height: 26, flexShrink: 0,
          borderBottom: '1px solid var(--border, #3c3c3c)',
          background: 'var(--bg-tertiary, #2d2d30)',
        }}>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted, #5a5a5a)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Name</span>
          <span style={{ width: 80, fontSize: 10, color: 'var(--text-muted, #5a5a5a)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'right', paddingRight: 34 }}>Modified</span>
        </div>

        {/* Project list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '60%', gap: 10,
            }}>
              <div style={{ opacity: 0.2, color: 'var(--text-secondary, #9d9d9d)', fontSize: 32 }}>{Icons.folder}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #9d9d9d)' }}>
                {search ? 'No projects match your search' : 'No recent projects'}
              </div>
              {!search && (
                <div style={{ fontSize: 11, color: 'var(--text-muted, #5a5a5a)' }}>
                  Create or open an existing project to get started
                </div>
              )}
            </div>
          ) : (
            filtered.map(project => (
              <ProjectRow
                key={project.path}
                project={project}
                selected={selectedPath === project.path}
                onSelect={() => setSelectedPath(project.path)}
                onOpen={() => handleOpenRecent(project)}
                onRemove={e => handleRemoveRecent(e, project.path)}
              />
            ))
          )}
        </div>

        {/* Status bar / open button */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
          height: 36, flexShrink: 0,
          borderTop: '1px solid var(--border, #3c3c3c)',
          background: 'var(--bg-secondary, #252526)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted, #5a5a5a)', fontFamily: 'var(--font-mono)' }}>
            {selectedProject
              ? selectedProject.path.replace(/\\/g, '/')
              : `${filtered.length} project${filtered.length !== 1 ? 's' : ''}`}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {loading && (
              <span style={{ fontSize: 11, color: 'var(--text-muted, #5a5a5a)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {Icons.refresh} Loading…
              </span>
            )}
            <button
              onClick={() => selectedProject && handleOpenRecent(selectedProject)}
              disabled={!selectedProject || loading}
              style={{
                ...createBtnStyle,
                opacity: (!selectedProject || loading) ? 0.35 : 1,
                cursor: (!selectedProject || loading) ? 'not-allowed' : 'pointer',
              }}
            >
              Open Project
            </button>
          </div>
        </div>
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

const createBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '0 10px', height: 26,
  borderRadius: 3,
  border: 'none',
  background: 'var(--accent, #4d9eff)',
  color: '#fff',
  fontSize: 11, fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const openBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '0 10px', height: 26,
  borderRadius: 3,
  border: '1px solid var(--border, #3c3c3c)',
  background: '#333337',
  color: 'var(--text-primary, #cccccc)',
  fontSize: 11, fontWeight: 500,
  cursor: 'pointer',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const cancelBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '0 12px', height: 26,
  borderRadius: 3,
  border: '1px solid var(--border, #3c3c3c)',
  background: 'transparent',
  color: 'var(--text-secondary, #9d9d9d)',
  fontSize: 11, cursor: 'pointer',
  flexShrink: 0,
};

const modalLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11, fontWeight: 500,
  color: 'var(--text-secondary, #9d9d9d)',
  marginBottom: 5,
};

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0 10px',
  height: 26,
  borderRadius: 3,
  border: '1px solid var(--border, #3c3c3c)',
  background: 'var(--bg-input, #1e1e1e)',
  color: 'var(--text-primary, #cccccc)',
  fontSize: 11, outline: 'none',
  boxSizing: 'border-box',
  marginBottom: 0,
  fontFamily: 'inherit',
};

const ctxItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7,
  width: '100%', textAlign: 'left',
  padding: '0 10px', height: 24,
  background: 'transparent', border: 'none',
  color: 'var(--text-primary, #cccccc)', fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
