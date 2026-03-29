// ============================================================
// FluxionJS V3 — Animator Inspector
// Custom inspector for AnimationComponent (typeId: 'Animation').
// Shows available clips from the loaded model, playback controls,
// speed, loop and blend time settings.
// ============================================================

import React, { useEffect, useState } from 'react';
import { PropertyRow, Checkbox, Slider, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { AnimationComponent, MeshRendererComponent } from '../../../../src/core/Components';
import { ComponentSection } from './ComponentSection';
import { ComponentInspectorRegistry } from '../../../core/ComponentInspectorRegistry';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';
import type { ComponentInspectorProps } from '../../../core/ComponentInspectorRegistry';

// ── Component inspector ───────────────────────────────────────

export const AnimatorInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({
  entity,
  onRemoved,
}) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  const [runtimeClips, setRuntimeClips] = useState<string[]>([]);

  if (!engine) return null;

  const anim = engine.engine.ecs.getComponent<AnimationComponent>(entity, 'Animation');
  if (!anim) return null;

  const meshComp = engine.engine.ecs.getComponent<MeshRendererComponent>(entity, 'MeshRenderer');

  // Refresh available clips from the runtime component each render
  const availableClips = anim.availableClips.length > 0
    ? anim.availableClips
    : runtimeClips;

  // Poll for clip availability after model loads (availableClips starts empty)
  useEffect(() => {
    if (anim.availableClips.length > 0) {
      setRuntimeClips(anim.availableClips);
      return;
    }
    const id = setInterval(() => {
      if (anim.availableClips.length > 0) {
        setRuntimeClips([...anim.availableClips]);
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, [entity, anim]);

  const refresh = () => forceUpdate(n => n + 1);

  const setField = (key: keyof AnimationComponent, value: any) => {
    setProperty(undoManager, anim, key as string, value);
    refresh();
  };

  const handleClipChange = (clipName: string) => {
    setField('currentClip', clipName);
  };

  const handlePlay = () => {
    if (!anim.mixer || !anim.currentClip) return;
    const action = anim.actions.get(anim.currentClip);
    if (action) {
      action.reset().play();
      anim.currentAction = action;
    }
    refresh();
  };

  const handleStop = () => {
    if (anim.currentAction) {
      anim.currentAction.stop();
    }
    refresh();
  };

  const isPlaying = anim.currentAction?.isRunning() ?? false;
  const hasClips = availableClips.length > 0;
  const isSkinned = meshComp?.isSkinnedMesh ?? false;

  return (
    <ComponentSection entity={entity} componentType="Animation" onRemoved={onRemoved}>
      {/* Skinned mesh indicator */}
      {isSkinned && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          marginBottom: 4,
          background: 'rgba(100,200,120,0.12)',
          border: '1px solid rgba(100,200,120,0.3)',
          borderRadius: 4,
          fontSize: 11,
          color: '#80e0a0',
        }}>
          <span style={{ opacity: 0.8 }}>{Icons.activity}</span>
          <span>Skinned Mesh</span>
        </div>
      )}

      {/* No clips banner */}
      {!hasClips && (
        <div style={{
          padding: '6px 8px',
          marginBottom: 6,
          background: 'rgba(255,200,80,0.08)',
          border: '1px solid rgba(255,200,80,0.25)',
          borderRadius: 4,
          fontSize: 11,
          color: '#ffc940',
        }}>
          No animation clips found in model
        </div>
      )}

      {/* Clip selector */}
      {hasClips && (
        <PropertyRow label="Clip">
          <select
            value={anim.currentClip}
            onChange={e => handleClipChange(e.target.value)}
            style={{
              flex: 1,
              background: '#1e2030',
              color: '#d0d0d8',
              border: '1px solid #3a3d55',
              borderRadius: 3,
              padding: '3px 6px',
              fontSize: 12,
            }}
          >
            <option value="">— select clip —</option>
            {availableClips.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </PropertyRow>
      )}

      {/* Play / Stop */}
      {hasClips && (
        <PropertyRow label="Playback">
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handlePlay}
              disabled={!anim.currentClip}
              style={{
                flex: 1,
                padding: '4px 0',
                background: isPlaying ? 'rgba(80,180,100,0.25)' : 'rgba(60,120,200,0.25)',
                border: `1px solid ${isPlaying ? 'rgba(80,180,100,0.5)' : 'rgba(60,120,200,0.5)'}`,
                borderRadius: 3,
                color: isPlaying ? '#80e0a0' : '#80a8e0',
                cursor: anim.currentClip ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
            >
              {Icons.play} Play
            </button>
            <button
              onClick={handleStop}
              style={{
                flex: 1,
                padding: '4px 0',
                background: 'rgba(200,60,60,0.2)',
                border: '1px solid rgba(200,60,60,0.4)',
                borderRadius: 3,
                color: '#e08080',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {Icons.stop} Stop
            </button>
          </div>
        </PropertyRow>
      )}

      {/* Speed */}
      <PropertyRow label="Speed">
        <Slider
          value={anim.speed}
          min={0}
          max={5}
          step={0.05}
          onChange={v => setField('speed', v)}
        />
      </PropertyRow>

      {/* Loop */}
      <PropertyRow label="Loop">
        <Checkbox
          checked={anim.loop}
          onChange={v => setField('loop', v)}
        />
      </PropertyRow>

      {/* Blend Time */}
      <PropertyRow label="Blend Time">
        <Slider
          value={anim.blendTime}
          min={0}
          max={2}
          step={0.05}
          onChange={v => setField('blendTime', v)}
        />
      </PropertyRow>

      {/* Clip list info */}
      {hasClips && (
        <div style={{ padding: '4px 8px', marginTop: 2, fontSize: 11, color: '#667' }}>
          {availableClips.length} clip{availableClips.length !== 1 ? 's' : ''} available
        </div>
      )}
    </ComponentSection>
  );
};

// ── Self-register ────────────────────────────────────

ComponentInspectorRegistry.register('Animation', AnimatorInspector as React.FC<ComponentInspectorProps>);
