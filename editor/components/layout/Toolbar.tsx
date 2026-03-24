// ============================================================
// FluxionJS V2 — Toolbar Component
// Tool selection + play controls + stats (Nuake toolbar style)
// ============================================================

import React from 'react';
import { Button, Tooltip, Icons, NumberInput, Select } from '../../ui';
import { useEditor, EditorTool, ViewportShadingMode } from '../../core/EditorContext';

export const Toolbar: React.FC = () => {
  const { state, dispatch } = useEditor();

  const tools: Array<{ tool: EditorTool; icon: string; label: string; shortcut: string }> = [
    { tool: 'select', icon: Icons.select, label: 'Select', shortcut: 'Q' },
    { tool: 'move', icon: Icons.move, label: 'Move', shortcut: 'W' },
    { tool: 'rotate', icon: Icons.rotate, label: 'Rotate', shortcut: 'E' },
    { tool: 'scale', icon: Icons.scale, label: 'Scale', shortcut: 'R' },
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      height: '36px',
      padding: '0 8px',
      gap: '8px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Transform Tools */}
      <div style={{
        display: 'flex',
        gap: '2px',
        padding: '0 4px',
        borderRight: '1px solid var(--border)',
      }}>
        {tools.map(({ tool, icon, label, shortcut }) => (
          <Tooltip key={tool} text={`${label} (${shortcut})`}>
            <Button
              variant="icon"
              active={state.activeTool === tool}
              onClick={() => dispatch({ type: 'SET_TOOL', tool })}
            >
              {icon}
            </Button>
          </Tooltip>
        ))}
      </div>

      {/* Space + Snap */}
      <div style={{
        display: 'flex',
        gap: '2px',
        padding: '0 4px',
        borderRight: '1px solid var(--border)',
      }}>
        <Tooltip text="Local/World Space">
          <Button
            variant="icon"
            active={state.transformSpace === 'local'}
            onClick={() => dispatch({
              type: 'SET_TRANSFORM_SPACE',
              space: state.transformSpace === 'local' ? 'world' : 'local',
            })}
          >
            {state.transformSpace === 'local' ? Icons.localSpace : Icons.worldSpace}
          </Button>
        </Tooltip>
        <Tooltip text="Toggle Snap">
          <Button
            variant="icon"
            active={state.snapEnabled}
            onClick={() => dispatch({ type: 'TOGGLE_SNAP' })}
          >
            {Icons.grid}
          </Button>
        </Tooltip>
        {state.snapEnabled && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <Tooltip text="Translation Snap">
              <NumberInput
                value={state.snapConfig.translationSnap}
                onChange={(v) => dispatch({ type: 'SET_SNAP_CONFIG', config: { translationSnap: Math.max(0.01, v) } })}
                step={0.25}
                min={0.01}
                style={{ width: '48px', height: '22px', fontSize: '10px' }}
              />
            </Tooltip>
            <Tooltip text="Rotation Snap (degrees)">
              <NumberInput
                value={Math.round(state.snapConfig.rotationSnap * (180 / Math.PI))}
                onChange={(v) => dispatch({ type: 'SET_SNAP_CONFIG', config: { rotationSnap: Math.max(1, v) * (Math.PI / 180) } })}
                step={5}
                min={1}
                style={{ width: '48px', height: '22px', fontSize: '10px' }}
              />
            </Tooltip>
            <Tooltip text="Scale Snap">
              <NumberInput
                value={state.snapConfig.scaleSnap}
                onChange={(v) => dispatch({ type: 'SET_SNAP_CONFIG', config: { scaleSnap: Math.max(0.01, v) } })}
                step={0.05}
                min={0.01}
                style={{ width: '48px', height: '22px', fontSize: '10px' }}
              />
            </Tooltip>
          </div>
        )}
      </div>

      {/* Viewport Controls */}
      <div style={{
        display: 'flex',
        gap: '2px',
        padding: '0 4px',
        alignItems: 'center',
        borderRight: '1px solid var(--border)',
      }}>
        <Tooltip text="Toggle Grid">
          <Button
            variant="icon"
            active={state.showGrid}
            onClick={() => dispatch({ type: 'TOGGLE_GRID' })}
          >
            {Icons.grid}
          </Button>
        </Tooltip>
        <Select
          value={state.viewportShading}
          onChange={(v) => dispatch({ type: 'SET_VIEWPORT_SHADING', mode: v as ViewportShadingMode })}
          options={[
            { value: 'lit', label: 'Lit' },
            { value: 'unlit', label: 'Unlit' },
            { value: 'wireframe', label: 'Wire' },
          ]}
          style={{ width: '64px', height: '22px', fontSize: '10px', padding: '0 4px' }}
        />
      </div>

      {/* Play Controls */}
      <div style={{
        display: 'flex',
        gap: '2px',
        padding: '0 4px',
        borderRight: '1px solid var(--border)',
      }}>
        <Tooltip text={state.isPlaying ? 'Pause' : 'Play'}>
          <Button
            variant="icon"
            onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
            style={{ color: state.isPlaying ? 'var(--accent-yellow)' : 'var(--accent-green)' }}
          >
            {state.isPlaying ? Icons.pause : Icons.play}
          </Button>
        </Tooltip>
        <Tooltip text="Stop">
          <Button
            variant="icon"
            onClick={() => dispatch({ type: 'STOP_PLAY' })}
          >
            {Icons.stop}
          </Button>
        </Tooltip>
      </div>

      {/* Stats (right aligned) */}
      <div style={{
        marginLeft: 'auto',
        display: 'flex',
        gap: '12px',
        color: 'var(--text-secondary)',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
      }}>
        <span style={{ color: 'var(--accent-green)' }}>{state.fps} FPS</span>
        <span>{state.entityCount} entities</span>
      </div>
    </div>
  );
};
