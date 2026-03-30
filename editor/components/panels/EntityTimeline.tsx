// ============================================================
// FluxionJS V3 — Entity Property Animation Timeline
// Bottom-panel tab for keyframe-animating any component property
// on the selected entity. Extends AnimationComponent with
// PropertyClip data; syncs with AutoInspector via TimelineContext.
// ============================================================

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import * as THREE from 'three';
import { useEditor, useEngine } from '../../core/EditorContext';
import { useTimeline } from '../../core/TimelineContext';
import { AnimationComponent } from '../../../src/core/Components';
import { markComponentDirty } from '../../core/ComponentService';
import { ComponentRegistry } from '../../../src/core/ComponentRegistry';
import {
  PropertyClip, PropertyTrack, PropertyKeyframe, PropertyEasing,
  getAnimatablePathsForFields, getValueAtPath,
} from '../../../src/core/PropertyAnimationTypes';
import { PropertyAnimatorSystem } from '../../../src/core/PropertyAnimatorSystem';
import { Icons } from '../../ui';

// ── Style helpers (mirrors FUI editor toolBtn) ────────────────────────────────

const toolBtn = (active = true): React.CSSProperties => ({
  background: active ? 'var(--bg-hover)' : 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: active ? 'var(--text-secondary)' : 'var(--text-disabled, #555)',
  cursor: active ? 'pointer' : 'default',
  padding: '2px 7px',
  fontSize: 11,
  lineHeight: '16px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  opacity: active ? 1 : 0.5,
});

const EASING_OPTIONS: { value: PropertyEasing; label: string }[] = [
  { value: 'linear',      label: 'Linear' },
  { value: 'ease-in',     label: 'Ease In' },
  { value: 'ease-out',    label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
  { value: 'step',        label: 'Step' },
];

// ── Model clip import helper ──────────────────────────────────────────────────

function convertThreeClipToPropertyClip(threeClip: THREE.AnimationClip): PropertyClip {
  const tracks: PropertyTrack[] = [];
  const quat  = new THREE.Quaternion();
  const euler = new THREE.Euler();

  for (const track of threeClip.tracks) {
    const dotIdx = track.name.lastIndexOf('.');
    if (dotIdx === -1) continue;
    const prop = track.name.slice(dotIdx + 1);
    const times  = track.times;
    const values = (track as any).values as Float32Array | number[];

    if (prop === 'position' || prop === 'scale') {
      for (const [axIdx, ax] of (['x', 'y', 'z'] as const).entries()) {
        const kfs: PropertyKeyframe[] = [];
        for (let i = 0; i < times.length; i++) {
          kfs.push({ time: times[i], value: values[i * 3 + axIdx], easing: 'linear' });
        }
        if (kfs.length > 0) {
          tracks.push({
            componentType: 'Transform',
            propertyPath: `${prop}.${ax}`,
            keyframes: kfs,
          });
        }
      }
    } else if (prop === 'quaternion') {
      const eulerKfs: [PropertyKeyframe[], PropertyKeyframe[], PropertyKeyframe[]] = [[], [], []];
      for (let i = 0; i < times.length; i++) {
        quat.set(values[i * 4], values[i * 4 + 1], values[i * 4 + 2], values[i * 4 + 3]);
        euler.setFromQuaternion(quat);
        eulerKfs[0].push({ time: times[i], value: euler.x, easing: 'linear' });
        eulerKfs[1].push({ time: times[i], value: euler.y, easing: 'linear' });
        eulerKfs[2].push({ time: times[i], value: euler.z, easing: 'linear' });
      }
      for (const [axIdx, ax] of (['x', 'y', 'z'] as const).entries()) {
        if (eulerKfs[axIdx].length > 0) {
          tracks.push({
            componentType: 'Transform',
            propertyPath: `rotation.${ax}`,
            keyframes: eulerKfs[axIdx],
          });
        }
      }
    }
  }

  return {
    id: `imp_${Date.now().toString(36)}`,
    name: threeClip.name || 'Imported',
    duration: threeClip.duration > 0 ? threeClip.duration : 1,
    loop: false,
    tracks,
  };
}

// ── Mutating helpers (direct ECS component mutations) ────────────────────────

function upsertKeyframe(
  clip: PropertyClip,
  compType: string,
  path: string,
  time: number,
  value: number,
): void {
  let track = clip.tracks.find(t => t.componentType === compType && t.propertyPath === path);
  if (!track) {
    track = { componentType: compType, propertyPath: path, keyframes: [] };
    clip.tracks.push(track);
  }
  const kfs = track.keyframes.filter(k => Math.abs(k.time - time) > 0.001);
  kfs.push({ time, value, easing: 'linear' });
  kfs.sort((a, b) => a.time - b.time);
  track.keyframes = kfs;
}

// ── Main component ────────────────────────────────────────────────────────────

export const EntityTimeline: React.FC = () => {
  const { state } = useEditor();
  const engineCtx = useEngine();
  const tl = useTimeline();

  const entityId = state.selectedEntity;

  // UI state
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedKf, setSelectedKf] = useState<{ ti: number; ki: number } | null>(null);
  const [addingTrack, setAddingTrack] = useState(false);
  const [addTrackComp, setAddTrackComp] = useState('');
  const [addTrackPath, setAddTrackPath] = useState('');
  const [autoKey, setAutoKey] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importClipName, setImportClipName] = useState('');
  const [rev, setRev] = useState(0);

  const currentTimeRef = useRef(0);
  const playRafRef     = useRef<number | null>(null);
  const playLastRef    = useRef(0);

  // Force re-render helper
  const bump = useCallback(() => setRev(r => r + 1), []);

  // Get AnimationComponent for selected entity
  const anim = useMemo(() => {
    if (entityId == null || !engineCtx) return null;
    return engineCtx.engine.ecs.getComponent<AnimationComponent>(entityId, 'Animation');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, engineCtx, rev]);

  // Derived clip list and selected clip
  const clips      = anim?.propertyClips ?? [];
  const activeClip = clips.find(c => c.id === selectedClipId) ?? null;

  // Auto-select first clip when entity changes
  useEffect(() => {
    setSelectedClipId(prev => {
      if (clips.find(c => c.id === prev)) return prev;
      return clips[0]?.id ?? null;
    });
    setCurrentTime(0);
    setIsPlaying(false);
    setSelectedKf(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  // Poll for AnimationComponent when entity is selected but component not yet present.
  // This covers the case where the user adds an Animator via the inspector while
  // the Timeline tab is open — the useMemo above won't re-run on its own.
  useEffect(() => {
    if (anim || entityId == null || !engineCtx) return;
    const id = setInterval(() => {
      const c = engineCtx.engine.ecs.getComponent<AnimationComponent>(entityId, 'Animation');
      if (c) bump();
    }, 250);
    return () => clearInterval(id);
  }, [anim, entityId, engineCtx, bump]);

  // Keep currentTimeRef in sync (used by insertKeyframe at click-time)
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  // Sync TimelineContext: active when a clip + entity are selected
  useEffect(() => {
    const isActive = entityId != null && selectedClipId != null && anim != null;

    tl._onInsertRef.current = (compType, path, value) => {
      if (!anim || !activeClip) return;
      upsertKeyframe(activeClip, compType, path, currentTimeRef.current, value);
      markComponentDirty(anim, 'propertyClips');
      bump();
    };

    tl._setTimelineState({
      isActive,
      isRecording: autoKey,
      entityId: entityId ?? null,
      clipId: selectedClipId,
    });

    return () => {
      tl._onInsertRef.current = null;
      tl._setTimelineState({ isActive: false, isRecording: false, entityId: null, clipId: null });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClipId, entityId, anim, activeClip, autoKey]);

  // Editor scrub preview: apply clip values on currentTime change
  useEffect(() => {
    if (!activeClip || entityId == null || !engineCtx) return;
    const { ecs } = engineCtx.engine;
    PropertyAnimatorSystem.scrubClip(entityId, activeClip.id, anim!, ecs, currentTime);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, selectedClipId, entityId]);

  // Playback RAF loop
  useEffect(() => {
    if (!isPlaying) {
      if (playRafRef.current) cancelAnimationFrame(playRafRef.current);
      return;
    }
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - playLastRef.current) / 1000);
      playLastRef.current = now;
      if (!activeClip) { setIsPlaying(false); return; }
      setCurrentTime(t => {
        const next = activeClip.loop
          ? ((t + dt) % activeClip.duration + activeClip.duration) % activeClip.duration
          : Math.min(t + dt, activeClip.duration);
        if (!activeClip.loop && next >= activeClip.duration) setIsPlaying(false);
        return next;
      });
      playRafRef.current = requestAnimationFrame(tick);
    };
    playLastRef.current = performance.now();
    playRafRef.current = requestAnimationFrame(tick);
    return () => { if (playRafRef.current) cancelAnimationFrame(playRafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, selectedClipId]);

  // ── Clip CRUD ──────────────────────────────────────────────────────────────

  const handleAddClip = useCallback(() => {
    if (!anim) return;
    const id = `clip_${Date.now().toString(36)}`;
    anim.propertyClips = [...anim.propertyClips, {
      id, name: 'New Clip', duration: 2, loop: false, tracks: [],
    }];
    markComponentDirty(anim, 'propertyClips');
    setSelectedClipId(id);
    setCurrentTime(0);
    bump();
  }, [anim, bump]);

  const handleDeleteClip = useCallback((id: string) => {
    if (!anim) return;
    anim.propertyClips = anim.propertyClips.filter(c => c.id !== id);
    markComponentDirty(anim, 'propertyClips');
    setSelectedClipId(prev => prev === id ? (anim.propertyClips[0]?.id ?? null) : prev);
    bump();
  }, [anim, bump]);

  const handleUpdateClip = useCallback((id: string, patch: Partial<Omit<PropertyClip, 'id' | 'tracks'>>) => {
    if (!anim) return;
    const clip = anim.propertyClips.find(c => c.id === id);
    if (!clip) return;
    Object.assign(clip, patch);
    markComponentDirty(anim, 'propertyClips');
    bump();
  }, [anim, bump]);

  const handleDuplicateClip = useCallback((id: string) => {
    if (!anim) return;
    const src = anim.propertyClips.find(c => c.id === id);
    if (!src) return;
    const newId = `clip_${Date.now().toString(36)}`;
    const copy: PropertyClip = JSON.parse(JSON.stringify(src));
    copy.id = newId;
    copy.name = src.name + ' Copy';
    anim.propertyClips = [...anim.propertyClips, copy];
    markComponentDirty(anim, 'propertyClips');
    setSelectedClipId(newId);
    bump();
  }, [anim, bump]);

  // ── Track CRUD ─────────────────────────────────────────────────────────────

  const handleAddTrack = useCallback(() => {
    if (!anim || !activeClip || !addTrackComp || !addTrackPath) return;
    if (activeClip.tracks.some(t => t.componentType === addTrackComp && t.propertyPath === addTrackPath)) return;
    activeClip.tracks = [...activeClip.tracks, {
      componentType: addTrackComp, propertyPath: addTrackPath, keyframes: [],
    }];
    markComponentDirty(anim, 'propertyClips');
    setAddingTrack(false);
    bump();
  }, [anim, activeClip, addTrackComp, addTrackPath, bump]);

  const handleDeleteTrack = useCallback((ti: number) => {
    if (!anim || !activeClip) return;
    activeClip.tracks = activeClip.tracks.filter((_, i) => i !== ti);
    markComponentDirty(anim, 'propertyClips');
    setSelectedKf(null);
    bump();
  }, [anim, activeClip, bump]);

  // ── Keyframe CRUD ──────────────────────────────────────────────────────────

  const handleAddKeyframeAtTime = useCallback((ti: number, time: number) => {
    if (!anim || !activeClip || !engineCtx) return;
    const track = activeClip.tracks[ti];
    if (!track) return;
    const comp = engineCtx.engine.ecs.getComponent(entityId!, track.componentType);
    let value = 0;
    if (comp) {
      value = getValueAtPath(comp as any, track.propertyPath);
    }
    upsertKeyframe(activeClip, track.componentType, track.propertyPath, time, value);
    markComponentDirty(anim, 'propertyClips');
    bump();
  }, [anim, activeClip, entityId, engineCtx, bump]);

  const handleDeleteKeyframe = useCallback((ti: number, ki: number) => {
    if (!anim || !activeClip) return;
    activeClip.tracks[ti].keyframes.splice(ki, 1);
    markComponentDirty(anim, 'propertyClips');
    setSelectedKf(null);
    bump();
  }, [anim, activeClip, bump]);

  const handleUpdateKeyframe = useCallback((ti: number, ki: number, patch: Partial<PropertyKeyframe>) => {
    if (!anim || !activeClip) return;
    const kf = activeClip.tracks[ti].keyframes[ki];
    if (!kf) return;
    Object.assign(kf, patch);
    if (patch.time !== undefined) {
      activeClip.tracks[ti].keyframes.sort((a, b) => a.time - b.time);
    }
    markComponentDirty(anim, 'propertyClips');
    bump();
  }, [anim, activeClip, bump]);

  // ── Model clip import ──────────────────────────────────────────────────────

  const handleImport = useCallback(() => {
    if (!anim || !importClipName) return;
    const threeClip = anim.clips.get(importClipName);
    if (!threeClip) return;
    const newClip = convertThreeClipToPropertyClip(threeClip);
    anim.propertyClips = [...anim.propertyClips, newClip];
    markComponentDirty(anim, 'propertyClips');
    setSelectedClipId(newClip.id);
    setShowImport(false);
    bump();
  }, [anim, importClipName, bump]);

  // ── Available paths for Add Track dialog ──────────────────────────────────

  const availablePaths = useMemo(() => {
    if (!engineCtx || entityId == null) return [];
    const comps = engineCtx.engine.ecs.getAllComponents(entityId);
    const paths: { compType: string; path: string; label: string }[] = [];
    for (const comp of comps) {
      const typeId: string = (comp as any).typeId ?? '';
      const reg = ComponentRegistry.get(typeId);
      if (!reg) continue;
      for (const ap of getAnimatablePathsForFields(typeId, reg.fields)) {
        paths.push({ compType: ap.componentType, path: ap.propertyPath, label: `${typeId}: ${ap.label}` });
      }
    }
    return paths;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, engineCtx]);

  // Auto-set first path when addingTrack opens
  useEffect(() => {
    if (addingTrack && availablePaths.length > 0) {
      setAddTrackComp(availablePaths[0].compType);
      setAddTrackPath(availablePaths[0].path);
    }
  }, [addingTrack, availablePaths]);

  // ── No entity selected ─────────────────────────────────────────────────────

  if (entityId == null) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        Select an entity to animate its properties
      </div>
    );
  }

  if (!anim) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        Add an <strong style={{ color: 'var(--text-secondary)', margin: '0 4px' }}>Animator</strong> component to this entity to use the property timeline
      </div>
    );
  }

  const dur = activeClip?.duration ?? 1;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden', background: 'var(--bg-panel)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>

      {/* ── Clip sidebar ── */}
      <div style={{ width: 160, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>Property Clips</span>
          <button onClick={handleAddClip} style={{ ...toolBtn(), padding: '1px 5px', fontSize: 12 }} title="New clip">+</button>
          {anim.availableClips.length > 0 && (
            <button onClick={() => { setImportClipName(anim.availableClips[0]); setShowImport(true); }} style={{ ...toolBtn(), padding: '1px 5px', fontSize: 10 }} title="Import from model animation">↓</button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {clips.length === 0 && (
            <div style={{ padding: '10px 8px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>No clips</div>
          )}
          {clips.map(clip => (
            <div
              key={clip.id}
              onClick={() => { setSelectedClipId(clip.id); setCurrentTime(0); setIsPlaying(false); setSelectedKf(null); }}
              style={{ display: 'flex', alignItems: 'center', padding: '3px 8px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: selectedClipId === clip.id ? 'var(--bg-active)' : 'transparent' }}
            >
              <span style={{ flex: 1, fontSize: 11, color: selectedClipId === clip.id ? 'var(--accent)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={clip.name}>{clip.name}</span>
              <button onClick={(e) => { e.stopPropagation(); handleDuplicateClip(clip.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', fontSize: 10 }} title="Duplicate">⎘</button>
              <button onClick={(e) => { e.stopPropagation(); handleDeleteClip(clip.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', fontSize: 12, lineHeight: 0 }} title="Delete">{Icons.close}</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Timeline area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {!activeClip ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
            {clips.length === 0 ? 'Create a clip with +' : 'Select a clip'}
          </div>
        ) : (<>

          {/* Controls bar */}
          <div style={{ padding: '3px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              onClick={() => { if (!isPlaying) playLastRef.current = performance.now(); setIsPlaying(v => !v); }}
              style={{ ...toolBtn(), padding: '2px 6px' }} title={isPlaying ? 'Pause' : 'Play'}
            >{isPlaying ? Icons.pause : Icons.play}</button>
            <button
              onClick={() => { setIsPlaying(false); setCurrentTime(0); }}
              style={{ ...toolBtn(), padding: '2px 6px' }} title="Stop"
            >{Icons.stop}</button>
            <button
              onClick={() => handleUpdateClip(activeClip.id, { loop: !activeClip.loop })}
              style={{ ...toolBtn(), padding: '2px 6px', background: activeClip.loop ? 'var(--accent)' : 'var(--bg-hover)', color: activeClip.loop ? '#fff' : 'var(--text-secondary)' }} title="Loop"
            >{Icons.refresh}</button>
            <button
              onClick={() => setAutoKey(v => !v)}
              style={{ ...toolBtn(), padding: '1px 5px', fontSize: 10, background: autoKey ? '#ef5350' : 'var(--bg-hover)', color: autoKey ? '#fff' : 'var(--text-secondary)' }}
              title="Auto-key: inspector changes auto-insert keyframes"
            >● REC</button>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 44 }}>{currentTime.toFixed(2)}s</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>/</span>
            <input
              type="number" value={activeClip.duration} step={0.1} min={0.1}
              onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) handleUpdateClip(activeClip.id, { duration: v }); }}
              style={{ width: 44, fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', padding: '1px 3px' }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>s</span>
            <input
              type="text" value={activeClip.name}
              onChange={(e) => handleUpdateClip(activeClip.id, { name: e.target.value })}
              style={{ flex: 1, minWidth: 60, fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', padding: '1px 4px' }}
            />
            <button
              onClick={() => setAddingTrack(v => !v)}
              style={{ ...toolBtn(), padding: '1px 6px', fontSize: 10, background: addingTrack ? 'var(--accent)' : 'var(--bg-hover)', color: addingTrack ? '#fff' : 'var(--text-secondary)' }}
            >+ Track</button>
          </div>

          {/* Add track row */}
          {addingTrack && (
            <div style={{ padding: '3px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, alignItems: 'center', background: 'var(--bg-input)', flexShrink: 0, flexWrap: 'wrap' }}>
              <select
                value={`${addTrackComp}|${addTrackPath}`}
                onChange={(e) => {
                  const [comp, path] = e.target.value.split('|');
                  setAddTrackComp(comp);
                  setAddTrackPath(path);
                }}
                style={{ flex: 1, minWidth: 120, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 3px' }}
              >
                {availablePaths.map(p => (
                  <option key={`${p.compType}|${p.path}`} value={`${p.compType}|${p.path}`}>{p.label}</option>
                ))}
              </select>
              <button onClick={handleAddTrack} style={{ ...toolBtn(), padding: '1px 6px', fontSize: 10 }}>Add</button>
              <button onClick={() => setAddingTrack(false)} style={{ ...toolBtn(), padding: '1px 5px' }} title="Cancel">{Icons.close}</button>
            </div>
          )}

          {/* Selected keyframe inspector */}
          {selectedKf !== null && (() => {
            const track = activeClip.tracks[selectedKf.ti];
            const kf    = track?.keyframes[selectedKf.ki];
            if (!kf || !track) return null;
            return (
              <div style={{ padding: '2px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 5, alignItems: 'center', background: 'var(--bg-input)', flexShrink: 0, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {track.componentType}.{track.propertyPath}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>t=</span>
                <input type="number" value={kf.time.toFixed(3)} step={0.01} min={0} max={dur}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handleUpdateKeyframe(selectedKf.ti, selectedKf.ki, { time: v }); }}
                  style={{ width: 52, fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', padding: '1px 3px' }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>val=</span>
                <input type="number" value={kf.value.toFixed(4)} step={0.01}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handleUpdateKeyframe(selectedKf.ti, selectedKf.ki, { value: v }); }}
                  style={{ width: 68, fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', padding: '1px 3px' }} />
                <select
                  value={kf.easing ?? 'linear'}
                  onChange={(e) => handleUpdateKeyframe(selectedKf.ti, selectedKf.ki, { easing: e.target.value as PropertyEasing })}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 3px' }}
                >
                  {EASING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  onClick={() => handleDeleteKeyframe(selectedKf.ti, selectedKf.ki)}
                  style={{ ...toolBtn(), color: '#ef5350', marginLeft: 'auto', padding: '1px 5px' }}
                  title="Delete keyframe"
                >{Icons.trash}</button>
              </div>
            );
          })()}

          {/* Ruler + track rows */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
            {(() => {
              const tickInt  = dur <= 5 ? 0.1 : dur <= 20 ? 0.5 : dur <= 60 ? 1 : 5;
              const majorMult = tickInt < 0.5 ? 10 : 2;
              const numTicks  = Math.floor(dur / tickInt);
              const labelW    = 140;

              return (<>
                {/* Sticky ruler */}
                <div style={{ display: 'flex', height: 22, position: 'sticky', top: 0, background: '#0d1117', borderBottom: '1px solid var(--border)', zIndex: 5 }}>
                  <div style={{ width: labelW, flexShrink: 0, borderRight: '1px solid var(--border)' }} />
                  <div
                    style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'ew-resize' }}
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const getT = (cx: number) => Math.max(0, Math.min(dur, ((cx - rect.left) / rect.width) * dur));
                      setCurrentTime(getT(e.clientX));
                      const onMv = (me: MouseEvent) => setCurrentTime(getT(me.clientX));
                      const onUp = () => { document.removeEventListener('mousemove', onMv); document.removeEventListener('mouseup', onUp); };
                      document.addEventListener('mousemove', onMv);
                      document.addEventListener('mouseup', onUp);
                    }}
                  >
                    {Array.from({ length: numTicks + 1 }, (_, i) => {
                      const t   = i * tickInt;
                      const pct = dur > 0 ? (t / dur) * 100 : 0;
                      const major = i % majorMult === 0;
                      return (
                        <div key={i} style={{ position: 'absolute', left: `${pct}%`, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
                          <div style={{ width: 1, height: major ? 10 : 5, background: major ? '#666' : '#333', marginTop: major ? 0 : 5 }} />
                          {major && <span style={{ fontSize: 8, color: '#888', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', marginTop: 1 }}>{t.toFixed(t < 1 ? 1 : 0)}s</span>}
                        </div>
                      );
                    })}
                    {/* Playhead */}
                    <div style={{ position: 'absolute', left: `${dur > 0 ? (currentTime / dur) * 100 : 0}%`, top: 0, width: 2, height: 999, background: '#ff4081cc', pointerEvents: 'none', transform: 'translateX(-50%)', zIndex: 3 }} />
                  </div>
                </div>

                {/* Track rows */}
                {activeClip.tracks.map((track, ti) => (
                  <div key={`${ti}-${track.componentType}-${track.propertyPath}`}
                    style={{ display: 'flex', height: 24, borderBottom: '1px solid var(--border)', alignItems: 'stretch' }}
                  >
                    {/* Label */}
                    <div style={{ width: labelW, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 5px', gap: 3, borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
                      <span style={{ flex: 1, fontSize: 9, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${track.componentType}.${track.propertyPath}`}>
                        <span style={{ color: '#888' }}>{track.componentType}.</span>
                        <b style={{ color: '#ccc' }}>{track.propertyPath}</b>
                      </span>
                      <button onClick={() => handleDeleteTrack(ti)}
                        style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0, lineHeight: 0, flexShrink: 0 }} title="Delete track">{Icons.close}</button>
                    </div>
                    {/* Keyframe area */}
                    <div
                      style={{ flex: 1, position: 'relative', background: ti % 2 === 0 ? '#0d1117' : '#0a0f1a', cursor: 'crosshair', overflow: 'hidden' }}
                      onMouseDown={(e) => {
                        if ((e.target as HTMLElement).dataset.kf) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const t = Math.max(0, Math.min(dur, ((e.clientX - rect.left) / rect.width) * dur));
                        handleAddKeyframeAtTime(ti, t);
                      }}
                    >
                      {/* Playhead line */}
                      <div style={{ position: 'absolute', left: `${dur > 0 ? (currentTime / dur) * 100 : 0}%`, top: 0, width: 1, height: '100%', background: '#ff408155', pointerEvents: 'none', transform: 'translateX(-50%)' }} />
                      {/* Keyframe diamonds */}
                      {track.keyframes.map((kf, ki) => {
                        const isSel = selectedKf?.ti === ti && selectedKf?.ki === ki;
                        const pct = dur > 0 ? (kf.time / dur) * 100 : 0;
                        return (
                          <div
                            key={ki}
                            data-kf="1"
                            title={`t=${kf.time.toFixed(3)} val=${kf.value.toFixed(3)}`}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setSelectedKf({ ti, ki });
                              setCurrentTime(kf.time);
                              const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                              const onMv = (me: MouseEvent) => {
                                const t2 = Math.max(0, Math.min(dur, ((me.clientX - rect.left) / rect.width) * dur));
                                handleUpdateKeyframe(ti, ki, { time: t2 });
                                setCurrentTime(t2);
                              };
                              const onUp = () => { document.removeEventListener('mousemove', onMv); document.removeEventListener('mouseup', onUp); };
                              document.addEventListener('mousemove', onMv);
                              document.addEventListener('mouseup', onUp);
                            }}
                            style={{
                              position: 'absolute', left: `${pct}%`, top: '50%',
                              transform: 'translate(-50%,-50%) rotate(45deg)',
                              width: 8, height: 8,
                              background: isSel ? '#ff4081' : '#ffd740',
                              border: `1px solid ${isSel ? '#ff4081' : '#ffab00'}`,
                              cursor: 'grab', zIndex: 2,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                {activeClip.tracks.length === 0 && (
                  <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    No tracks — click <b style={{ color: 'var(--text-secondary)' }}>+ Track</b> or use the <b style={{ color: '#ffd740' }}>◆</b> buttons in the inspector
                  </div>
                )}
              </>);
            })()}
          </div>

        </>)}
      </div>

      {/* ── Model import dialog ── */}
      {showImport && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6,
            padding: 16, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>Import Animation from Model</span>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Converts the model's root position/rotation/scale tracks into a Property Clip.
            </div>
            {anim.availableClips.length === 0 ? (
              <div style={{ fontSize: 11, color: '#ef5350' }}>No animation clips found on this entity's mesh.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Select clip:</label>
                <select
                  value={importClipName}
                  onChange={(e) => setImportClipName(e.target.value)}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 11, padding: '3px 6px' }}
                >
                  {anim.availableClips.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setShowImport(false)} style={{ ...toolBtn(), padding: '4px 12px' }}>Cancel</button>
              <button
                onClick={handleImport}
                disabled={!importClipName}
                style={{ padding: '4px 14px', fontSize: 11, background: 'var(--accent)', border: 'none', borderRadius: 4, color: '#fff', cursor: importClipName ? 'pointer' : 'not-allowed', opacity: importClipName ? 1 : 0.5 }}
              >Convert &amp; Import</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
