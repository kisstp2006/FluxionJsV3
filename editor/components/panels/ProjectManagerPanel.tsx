// ============================================================
// FluxionJS V2 — Project Manager Panel
// Welcome screen / project browser (Nuake WelcomeWindow style)
// ============================================================

import React, { useState, useEffect } from 'react';
import { useEditor } from '../../core/EditorContext';
import { projectManager, RecentProject } from '../../../src/project/ProjectManager';

export const ProjectManagerPanel: React.FC<{
  onProjectOpened: (projectPath: string) => void;
}> = ({ onProjectOpened }) => {
  const { log } = useEditor();
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    projectManager.getRecentProjects().then(setRecentProjects).catch(() => {});
  }, []);

  const handleNewProject = async () => {
    if (!newProjectName.trim()) return;

    const api = window.fluxionAPI;
    if (!api) return;

    const dir = await (api as any).openDirDialog?.();
    if (!dir) return;

    setLoading(true);
    try {
      await projectManager.createProject(newProjectName.trim(), dir);
      log(`Project created: ${newProjectName}`, 'system');
      // After createProject, projectFilePath is set
      onProjectOpened(projectManager.projectFilePath!);
    } catch (err: any) {
      log(`Failed to create project: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = async () => {
    const api = window.fluxionAPI;
    if (!api) return;

    const path = await api.openFileDialog?.([
      { name: 'FluxionJS Project', extensions: ['fluxproj'] },
    ]);
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

  const removeRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await projectManager.removeFromRecent(path);
    setRecentProjects(prev => prev.filter(r => r.path !== path));
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
    }}>
      <div style={{
        width: '640px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '1px',
            marginBottom: '4px',
          }}>
            ⚡ FluxionJS V2
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Game Engine — Project Manager
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              disabled={loading}
              style={actionBtnStyle}
            >
              📄 New Project
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
              <input
                autoFocus
                type="text"
                placeholder="Project name..."
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleNewProject(); if (e.key === 'Escape') setCreating(false); }}
                style={inputStyle}
              />
              <button onClick={handleNewProject} disabled={loading || !newProjectName.trim()} style={actionBtnStyle}>
                Create
              </button>
              <button onClick={() => setCreating(false)} style={{ ...actionBtnStyle, background: 'var(--bg-tertiary)' }}>
                Cancel
              </button>
            </div>
          )}

          {!creating && (
            <button onClick={handleOpenProject} disabled={loading} style={actionBtnStyle}>
              📂 Open Project
            </button>
          )}
        </div>

        {/* Recent Projects */}
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}>
            Recent Projects
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}>
            {recentProjects.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px', textAlign: 'center' }}>
                No recent projects
              </div>
            )}
            {recentProjects.map((project) => (
              <div
                key={project.path}
                onClick={() => handleOpenRecent(project)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                  background: 'var(--bg-secondary)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {project.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {project.path}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {new Date(project.lastOpened).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => removeRecent(e, project.path)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '2px 4px',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    title="Remove from recent"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Loading...
          </div>
        )}
      </div>
    </div>
  );
};

const actionBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 150ms ease',
  flex: 1,
};

const inputStyle: React.CSSProperties = {
  flex: 2,
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
};
