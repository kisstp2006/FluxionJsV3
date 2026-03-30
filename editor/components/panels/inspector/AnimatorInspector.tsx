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
import { AnimationRef } from '../../../../src/scripting/AnimationRef';
import { ComponentSection } from './ComponentSection';
import { ComponentInspectorRegistry } from '../../../core/ComponentInspectorRegistry';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';
import type { ComponentInspectorProps } from '../../../core/ComponentInspectorRegistry';

// ── Component inspector ───────────────────────────────────────

interface LiveDebugInfo {
  bones: string[];
  skinnedCount: number;
  actionTime: number;
  actionDuration: number;
  actionWeight: number;
  mixerTime: number;
}

export const AnimatorInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({
  entity,
  onRemoved,
}) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  const [runtimeClips, setRuntimeClips] = useState<string[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [bonesOpen, setBonesOpen] = useState(false);
  const [liveDebug, setLiveDebug] = useState<LiveDebugInfo | null>(null);

  if (!engine) return null;

  const anim = engine.engine.ecs.getComponent<AnimationComponent>(entity, 'Animation');
  if (!anim) return null;

  const meshComp = engine.engine.ecs.getComponent<MeshRendererComponent>(entity, 'MeshRenderer');

  // Refresh available clips from the runtime component each render
  const availableClips = anim.availableClips.length > 0
    ? anim.availableClips
    : runtimeClips;

  // ── Live debug polling ──
  useEffect(() => {
    if (!debugOpen || !engine) { setLiveDebug(null); return; }
    const ecs = engine.engine.ecs;
    const collect = () => {
      const animComp = ecs.getComponent<AnimationComponent>(entity, 'Animation');
      const meshC    = ecs.getComponent<MeshRendererComponent>(entity, 'MeshRenderer');
      if (!animComp) return;
      const bones: string[] = [];
      let skinnedCount = 0;
      const root = meshC?.mesh as any;
      if (root?.traverse) {
        root.traverse((child: any) => {
          if (child.isSkinnedMesh && child.skeleton) {
            skinnedCount++;
            for (const bone of child.skeleton.bones as any[]) {
              if (!bones.includes(bone.name)) bones.push(bone.name);
            }
          }
        });
      }
      const act = animComp.currentAction as any;
      setLiveDebug({
        bones,
        skinnedCount,
        actionTime:     act?.time                   ?? 0,
        actionDuration: act?.getClip?.()?.duration  ?? 0,
        actionWeight:   act?.getEffectiveWeight?.() ?? 1,
        mixerTime:      (animComp.mixer as any)?.time ?? 0,
      });
    };
    collect();
    const id = setInterval(collect, 100);
    return () => clearInterval(id);
  }, [debugOpen, entity, engine]);

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

  const handleClipRefDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-fluxion-anim-clip');
    if (!raw) return;
    try {
      const { path, clip } = JSON.parse(raw) as { path: string; clip: string };
      if (!clip) return;
      anim.clipRef = new AnimationRef(path, clip);
      setField('currentClip', clip);
    } catch { /* malformed data — ignore */ }
  };

  const clearClipRef = () => {
    anim.clipRef = null;
    refresh();
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

  const handleDump = () => {
    console.group(`[Animator Debug] Entity ${entity}`);
    console.log('Available clips:', availableClips);
    console.log('Current clip:', anim.currentClip || '(none)');
    console.log('Mixer:', anim.mixer ?? 'null');
    console.log('Current action:', anim.currentAction ?? 'null');
    console.log('Actions map:', anim.actions);
    if (liveDebug) {
      console.log(`SkinnedMesh count: ${liveDebug.skinnedCount}`);
      console.log(`Bones (${liveDebug.bones.length}):`, liveDebug.bones);
      console.log(`Action time: ${liveDebug.actionTime.toFixed(3)}s / ${liveDebug.actionDuration.toFixed(3)}s`);
      console.log(`Effective weight: ${liveDebug.actionWeight.toFixed(3)}`);
      console.log(`Mixer time: ${liveDebug.mixerTime.toFixed(3)}s`);
    }
    if (meshComp?.mesh) {
      const root = meshComp.mesh as any;
      console.group('Scene graph SkinnedMesh breakdown');
      root.traverse?.((child: any) => {
        if (child.isSkinnedMesh && child.skeleton) {
          console.group(`SkinnedMesh: "${child.name}" — ${child.skeleton.bones.length} bones`);
          (child.skeleton.bones as any[]).forEach((b: any, i: number) => console.log(`  [${i}] ${b.name}`));
          console.groupEnd();
        }
      });
      console.groupEnd();
    }
    console.groupEnd();
  };

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

      {/* Clip reference drop zone */}
      <PropertyRow label="Clip Ref">
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-fluxion-anim-clip')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={handleClipRefDrop}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            background: anim.clipRef?.isValid ? 'rgba(80,150,255,0.10)' : 'rgba(255,255,255,0.04)',
            border: `1px dashed ${anim.clipRef?.isValid ? 'rgba(80,150,255,0.5)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 4,
            fontSize: 11,
            color: anim.clipRef?.isValid ? '#90bff0' : '#555',
            cursor: 'default',
            minWidth: 0,
          }}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {anim.clipRef?.isValid ? anim.clipRef.label : '— drag clip from Asset Browser —'}
          </span>
          {anim.clipRef?.isValid && (
            <button
              onClick={clearClipRef}
              title="Clear clip reference"
              style={{
                background: 'none', border: 'none', color: '#888',
                cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px', flexShrink: 0,
              }}
            >×</button>
          )}
        </div>
      </PropertyRow>

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

      {/* ── Debug section ── */}
      <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setDebugOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 8px', background: 'none', border: 'none',
            color: '#556', cursor: 'pointer', fontSize: 11, textAlign: 'left',
          }}
        >
          <span>{debugOpen ? '▾' : '▸'}</span>
          <span>Debug</span>
          {debugOpen && liveDebug && (
            <span style={{ marginLeft: 'auto', color: '#445' }}>
              {liveDebug.skinnedCount} mesh · {liveDebug.bones.length} bones
            </span>
          )}
        </button>

        {debugOpen && (
          <div style={{ padding: '4px 8px 8px', fontSize: 11, color: '#99a' }}>

            {/* Skeleton info */}
            {liveDebug && liveDebug.skinnedCount === 0 && (
              <div style={{
                padding: '4px 8px', marginBottom: 6,
                background: 'rgba(200,100,40,0.10)',
                border: '1px solid rgba(200,100,40,0.3)',
                borderRadius: 3, color: '#c87848',
              }}>
                ⚠ No SkinnedMesh found in scene graph
              </div>
            )}

            {liveDebug && liveDebug.skinnedCount > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 3, color: '#80e0a0' }}
                  onClick={() => setBonesOpen(o => !o)}
                >
                  <span>{liveDebug.skinnedCount} SkinnedMesh · {liveDebug.bones.length} bones</span>
                  <span>{bonesOpen ? '▾' : '▸'}</span>
                </div>
                {bonesOpen && (
                  <div style={{
                    maxHeight: 120, overflowY: 'auto',
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 3, padding: '3px 6px',
                    fontFamily: 'monospace', fontSize: 10, color: '#8ab', lineHeight: 1.8,
                  }}>
                    {liveDebug.bones.map((b, i) => (
                      <div key={i}><span style={{ color: '#445', marginRight: 6 }}>{i}</span>{b}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action time progress bar */}
            {liveDebug && liveDebug.actionDuration > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>Time</span>
                  <span style={{ fontFamily: 'monospace', color: '#aac' }}>
                    {liveDebug.actionTime.toFixed(2)}s / {liveDebug.actionDuration.toFixed(2)}s
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (liveDebug.actionTime / liveDebug.actionDuration) * 100)}%`,
                    background: '#5090d0', borderRadius: 2,
                  }} />
                </div>
              </div>
            )}

            {/* Blend weight (only shown when blending) */}
            {liveDebug && liveDebug.actionWeight < 0.995 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>Blend weight</span>
                  <span style={{ fontFamily: 'monospace', color: '#e0a060' }}>
                    {liveDebug.actionWeight.toFixed(2)}
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${liveDebug.actionWeight * 100}%`,
                    background: '#d08040', borderRadius: 2,
                  }} />
                </div>
              </div>
            )}

            {/* Mixer time */}
            {liveDebug && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#667' }}>
                <span>Mixer time</span>
                <span style={{ fontFamily: 'monospace' }}>{liveDebug.mixerTime.toFixed(3)}s</span>
              </div>
            )}

            <button
              onClick={handleDump}
              style={{
                width: '100%', padding: '4px 8px',
                background: 'rgba(80,80,160,0.15)',
                border: '1px solid rgba(80,80,160,0.3)',
                borderRadius: 3, color: '#7878b8',
                cursor: 'pointer', fontSize: 11,
              }}
            >
              Dump State to Console
            </button>
          </div>
        )}
      </div>
    </ComponentSection>
  );
};

// ── Self-register ────────────────────────────────────

ComponentInspectorRegistry.register('Animation', AnimatorInspector as React.FC<ComponentInspectorProps>);
