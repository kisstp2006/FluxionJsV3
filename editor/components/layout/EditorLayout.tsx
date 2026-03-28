// ============================================================
// FluxionJS V2 — Editor Layout (Root Component)
// Pure layout + scene lifecycle wiring
// ============================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { SplitPane } from '../../ui';
import { Titlebar } from './Titlebar';
import { Toolbar } from './Toolbar';
import { BottomPanel } from './BottomPanel';
import { HierarchyPanel } from '../panels/HierarchyPanel';
import { InspectorPanel } from '../panels/InspectorPanel';
import { Viewport } from '../panels/Viewport';
import { ProjectManagerPanel } from '../panels/ProjectManagerPanel';
import { SettingsPanel } from '../panels/SettingsPanel';
import { ProjectSettingsPanel } from '../panels/ProjectSettingsPanel';
import { KeyboardHandler, StatsUpdater, TransformSync, SimulationSync, GridSync, GizmoSync, CameraGizmoSync, AssetHotReload, ColliderGizmoSync, LightGizmoSync, AudioGizmoSync, ParticleGizmoSync } from './EditorLogic';
import { useEditor, EngineProvider } from '../../core/EditorContext';
import { EngineSubsystems } from '../../core/EditorEngine';
import { loadProjectScene } from '../../core/SceneService';
import { projectManager } from '../../../src/project/ProjectManager';
import { serializeScene } from '../../../src/project/SceneSerializer';
import { serializeSceneBinary } from '../../../src/project/BinarySceneSerializer';
import { NewSceneDialog, SceneFormat } from './NewSceneDialog';
import { SettingsService } from '../../core/SettingsService';
import { ProjectSettingsService } from '../../core/ProjectSettingsService';
import { bindSettings, dispose as disposeSettingsBindings } from '../../core/SettingsBindings';
import { AssetHotReloadService } from '../../core/AssetHotReloadService';
import { ProjectSettingsRegistry } from '../../core/ProjectSettingsRegistry';
import { DebugGroups } from '../../core/EditorState';

// ── Editor Layout ──
export const EditorLayout: React.FC = () => {
  const { state, dispatch, log } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasReady, setCanvasReady] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showProjectSettings, setShowProjectSettings] = React.useState(false);
  const [showNewSceneDialog, setShowNewSceneDialog] = useState(false);
  const engineRef = useRef<EngineSubsystems | null>(null);

  // Listen for open-visual-material-editor events — open in separate OS window
  React.useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail?.path;
      if (path) window.fluxionAPI?.openVisualMaterialEditor?.(path);
    };
    window.addEventListener('fluxion:open-visual-material-editor', handler);
    return () => window.removeEventListener('fluxion:open-visual-material-editor', handler);
  }, []);

  // Listen for open-fui-editor events — open in separate OS window
  React.useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail?.path;
      if (path) window.fluxionAPI?.openFuiEditor?.(path);
    };
    window.addEventListener('fluxion:open-fui-editor', handler);
    return () => window.removeEventListener('fluxion:open-fui-editor', handler);
  }, []);

  // Listen for open-script-editor events — open Monaco script editor window
  React.useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail?.path;
      if (path) (window as any).fluxionAPI?.openScriptEditor?.(path);
    };
    window.addEventListener('fluxion:open-script-editor', handler);
    return () => window.removeEventListener('fluxion:open-script-editor', handler);
  }, []);

  // Listen for material-changed relay from VME windows (IPC) and re-dispatch as local custom event
  React.useEffect(() => {
    window.fluxionAPI?.onMaterialChangedRelay?.((changedPath: string) => {
      window.dispatchEvent(
        new CustomEvent('fluxion:material-changed', { detail: { path: changedPath } })
      );
    });
    return () => {
      window.fluxionAPI?.offMaterialChangedRelay?.();
    };
  }, []);

  const handleLog = useCallback((text: string, type: 'info' | 'warn' | 'error' | 'system') => {
    log(text, type);
  }, [log]);

  // Save scene handler
  const saveScene = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || !state.projectLoaded || !state.currentScenePath) return;

    try {
      const scenePath = projectManager.resolvePath(state.currentScenePath);
      const data = serializeScene(
        eng.scene,
        eng.engine,
        eng.editorCamera,
        eng.orbitControls.target
      );
      const api = window.fluxionAPI;
      if (!api) return;
      await api.writeFile(scenePath, JSON.stringify(data, null, 2));
      dispatch({ type: 'SET_SCENE_DIRTY', dirty: false });
      log(`Scene saved: ${state.currentScenePath}`, 'system');
    } catch (err: any) {
      log(`Failed to save: ${err.message}`, 'error');
    }
  }, [state.projectLoaded, state.currentScenePath, dispatch, log]);

  // Listen for Ctrl+S custom event
  useEffect(() => {
    const handler = () => saveScene();
    window.addEventListener('fluxion:save-scene', handler);
    return () => window.removeEventListener('fluxion:save-scene', handler);
  }, [saveScene]);

  // Listen for asset browser scene-open custom event
  useEffect(() => {
    const handler = async (e: Event) => {
      const absPath = (e as CustomEvent<string>).detail;
      if (!absPath) return;
      const eng = engineRef.current;
      if (!eng) return;
      try {
        await loadProjectScene(eng, absPath, handleLog);
        const relPath = projectManager.relativePath(absPath);
        dispatch({ type: 'SET_SCENE_PATH', path: relPath });
        dispatch({ type: 'SET_SCENE_DIRTY', dirty: false });
        log(`Opened scene: ${relPath}`, 'system');
      } catch (err: any) {
        log(`Failed to open scene: ${(err as Error).message}`, 'error');
      }
    };
    window.addEventListener('fluxion:open-scene', handler);
    return () => window.removeEventListener('fluxion:open-scene', handler);
  }, [dispatch, handleLog, log]);

  // Open project handler
  const handleProjectOpened = useCallback(async (projectPath: string) => {
    const config = projectManager.config;
    if (!config) return;

    dispatch({ type: 'LOAD_PROJECT', path: projectPath, name: config.name });

    // Initialize settings persistence for this project
    await SettingsService.init(projectManager.projectDir!);
    await ProjectSettingsService.init();

    // Load debug group toggles from project settings
    dispatch({
      type: 'LOAD_DEBUG_GROUPS',
      groups: {
        physics:        ProjectSettingsRegistry.get<boolean>('editor.debug.physics')        ?? true,
        camera:         ProjectSettingsRegistry.get<boolean>('editor.debug.camera')         ?? true,
        lights:         ProjectSettingsRegistry.get<boolean>('editor.debug.lights')         ?? true,
        audio:          ProjectSettingsRegistry.get<boolean>('editor.debug.audio')          ?? true,
        particles:      ProjectSettingsRegistry.get<boolean>('editor.debug.particles')      ?? true,
        drawInPlayMode: ProjectSettingsRegistry.get<boolean>('editor.debug.drawInPlayMode') ?? true,
      } as DebugGroups,
    });

    // Load default scene once engine is ready
    const eng = engineRef.current;
    if (eng && config.defaultScene) {
      try {
        const scenePath = projectManager.resolvePath(config.defaultScene);
        await loadProjectScene(eng, scenePath, handleLog);
        dispatch({ type: 'SET_SCENE_PATH', path: config.defaultScene });
        dispatch({ type: 'SET_SCENE_DIRTY', dirty: false });
      } catch (err: any) {
        handleLog(`Failed to load scene: ${err.message}`, 'error');
      }
    }

    // Start watching project directory for file changes
    if (projectManager.projectDir) {
      AssetHotReloadService.start(projectManager.projectDir).catch(() => {});
    }

    await projectManager.addToRecent(config.name, projectPath);
  }, [dispatch, handleLog]);

  // Handle engine ready — if project already loaded, load scene
  const handleEngineReady = useCallback(async (sys: EngineSubsystems) => {
    engineRef.current = sys;

    // Bind all editor settings to engine subsystems (live)
    bindSettings(sys);

    if (state.projectLoaded && projectManager.config?.defaultScene) {
      try {
        const scenePath = projectManager.resolvePath(projectManager.config.defaultScene);
        await loadProjectScene(sys, scenePath, handleLog);
        dispatch({ type: 'SET_SCENE_PATH', path: projectManager.config.defaultScene });
      } catch (err: any) {
        handleLog(`Failed to load default scene: ${err.message}`, 'error');
      }
    }
  }, [state.projectLoaded, dispatch, handleLog]);

  // Close project
  const handleCloseProject = useCallback(() => {
    const eng = engineRef.current;
    if (eng) {
      eng.scene.clear();
    }
    AssetHotReloadService.stop().catch(() => {});
    disposeSettingsBindings();
    ProjectSettingsService.dispose();
    SettingsService.dispose();
    projectManager.closeProject();
    dispatch({ type: 'CLOSE_PROJECT' });
    log('Project closed', 'system');
  }, [dispatch, log]);

  // New scene — step 1: open format dialog
  const handleNewScene = useCallback(() => {
    if (!state.projectLoaded) return;
    setShowNewSceneDialog(true);
  }, [state.projectLoaded]);

  // New scene — step 2: format chosen, open native save dialog and write file
  const handleNewSceneConfirm = useCallback(async (format: SceneFormat) => {
    setShowNewSceneDialog(false);
    const api = window.fluxionAPI;
    if (!api) return;

    const isBinary = format === 'binary';
    const ext = isBinary ? 'fluxsceneb' : 'fluxscene';
    const savePath = await api.saveFileDialog?.([
      { name: isBinary ? 'FluxionJS Binary Scene' : 'FluxionJS Scene', extensions: [ext] },
    ]);
    if (!savePath) return;

    const eng = engineRef.current;
    if (!eng) return;

    eng.scene.clear();
    eng.scene.name = savePath.split(/[\\/]/).pop()?.replace(`.${ext}`, '') || 'New Scene';
    eng.scene.path = savePath;

    // Default content
    eng.scene.createLight('Ambient Light', 'ambient', 0x4466aa, 0.4);
    eng.scene.createLight('Directional Light', 'directional', 0xffeedd, 2.0);

    if (isBinary) {
      const buffer = serializeSceneBinary(eng.scene, eng.engine);
      await api.writeFileBinary?.(savePath, buffer);
    } else {
      const data = serializeScene(eng.scene, eng.engine, eng.editorCamera, eng.orbitControls.target);
      await api.writeFile(savePath, JSON.stringify(data, null, 2));
    }

    const relPath = projectManager.relativePath(savePath);
    dispatch({ type: 'SET_SCENE_PATH', path: relPath });
    dispatch({ type: 'SET_SCENE_DIRTY', dirty: false });
    log(`New scene created: ${eng.scene.name} (${format})`, 'system');
  }, [dispatch, log]);

  // Open scene
  const handleOpenScene = useCallback(async () => {
    if (!state.projectLoaded) return;
    const api = window.fluxionAPI;
    if (!api) return;

    const path = await api.openFileDialog?.([
      { name: 'FluxionJS Scene', extensions: ['fluxscene'] },
    ]);
    if (!path) return;

    const eng = engineRef.current;
    if (eng) {
      try {
        await loadProjectScene(eng, path, handleLog);
        const relPath = projectManager.relativePath(path);
        dispatch({ type: 'SET_SCENE_PATH', path: relPath });
        dispatch({ type: 'SET_SCENE_DIRTY', dirty: false });
      } catch (err: any) {
        log(`Failed to open scene: ${err.message}`, 'error');
      }
    }
  }, [state.projectLoaded, dispatch, handleLog, log]);

  // If no project loaded, show project manager
  if (!state.projectLoaded) {
    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Titlebar />
        <ProjectManagerPanel onProjectOpened={handleProjectOpened} />
      </div>
    );
  }

  return (
    <EngineProvider
      canvas={canvasReady ? canvasRef.current : null}
      onLog={handleLog}
      onReady={handleEngineReady}
    >
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Titlebar */}
        <Titlebar
          onSaveScene={saveScene}
          onCloseProject={handleCloseProject}
          onNewScene={handleNewScene}
          onOpenScene={handleOpenScene}
          onOpenSettings={() => setShowSettings(true)}
          onOpenProjectSettings={() => setShowProjectSettings(true)}
        />

        {/* Toolbar */}
        <Toolbar />

        {/* Main resizable area: nested SplitPanes */}
        <SplitPane
          direction="vertical"
          primaryPosition="end"
          size={state.bottomPanelHeight}
          minSize={100}
          maxSize={500}
          onSizeChange={(h) => dispatch({ type: 'SET_BOTTOM_HEIGHT', height: h })}
        >
          {/* Top row: Hierarchy | Viewport | Inspector */}
          <SplitPane
            direction="horizontal"
            primaryPosition="start"
            size={state.leftPanelWidth}
            minSize={200}
            maxSize={500}
            onSizeChange={(w) => dispatch({ type: 'SET_LEFT_WIDTH', width: w })}
          >
            {/* Left Panel: Hierarchy */}
            <div style={{
              borderRight: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              height: '100%',
            }}>
              <HierarchyPanel />
            </div>

            {/* Center + Right */}
            <SplitPane
              direction="horizontal"
              primaryPosition="end"
              size={state.rightPanelWidth}
              minSize={200}
              maxSize={500}
              onSizeChange={(w) => dispatch({ type: 'SET_RIGHT_WIDTH', width: w })}
            >
              {/* Center: Viewport */}
              <Viewport onCanvasReady={(canvas) => {
                if (!canvasRef.current) {
                  canvasRef.current = canvas;
                  setCanvasReady(true);
                }
              }} />

              {/* Right Panel: Inspector */}
              <div style={{
                borderLeft: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                height: '100%',
              }}>
                <InspectorPanel />
              </div>
            </SplitPane>
          </SplitPane>

          {/* Bottom Panel: Console / Assets / Profiler */}
          <BottomPanel />
        </SplitPane>
      </div>

      {/* Invisible logic components */}
      <KeyboardHandler />
      <StatsUpdater />
      <TransformSync />
      <SimulationSync />
      <GridSync />
      <GizmoSync />
      <CameraGizmoSync />
      <ColliderGizmoSync />
      <LightGizmoSync />
      <AudioGizmoSync />
      <ParticleGizmoSync />
      <AssetHotReload />

      {/* Settings Modal */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Project Settings Modal */}
      {showProjectSettings && <ProjectSettingsPanel onClose={() => setShowProjectSettings(false)} />}

      {/* New Scene Dialog */}
      {showNewSceneDialog && (
        <NewSceneDialog
          onConfirm={handleNewSceneConfirm}
          onCancel={() => setShowNewSceneDialog(false)}
        />
      )}
    </EngineProvider>
  );
};
