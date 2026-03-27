// ============================================================
// FluxionJS V3 — FUI Component Inspector
// Custom inspector for the FuiComponent on entities.
// Uses AssetInput for fuiPath so no manual path typing needed.
// ============================================================

import React, { useState } from 'react';
import { Section, PropertyRow, Select, NumberInput, Checkbox, AssetInput } from '../../../ui';
import { useEditor, useEngine } from '../../../core/EditorContext';
import { EntityId, markDirty } from '../../../../src/core/ECS';
import { FuiComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';

const modeOptions = [
  { value: 'screen', label: 'Screen Space' },
  { value: 'world', label: 'World Space' },
];

export const FuiComponentInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const { dispatch } = useEditor();
  const [, forceUpdate] = useState(0);

  if (!engine) return null;

  const comp = engine.engine.ecs.getComponent<FuiComponent>(entity, 'Fui');
  if (!comp) return null;

  const update = () => forceUpdate((n) => n + 1);

  const set = <K extends keyof FuiComponent>(key: K, value: FuiComponent[K]) => {
    setProperty(undoManager, comp, key, value);
    markDirty(comp);
    dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
    update();
  };

  return (
    <Section title="▦  UI (FUI)" defaultOpen icon="▦">
      <PropertyRow label="FUI File">
        <AssetInput
          value={comp.fuiPath || null}
          assetType="fui"
          placeholder="Select .fui file..."
          onChange={(v) => set('fuiPath', v)}
        />
      </PropertyRow>

      <PropertyRow label="Space">
        <Select
          value={comp.mode}
          options={modeOptions}
          onChange={(v) => set('mode', v as FuiComponent['mode'])}
        />
      </PropertyRow>

      {comp.mode === 'screen' && (
        <>
          <PropertyRow label="Screen X">
            <NumberInput value={comp.screenX} step={1} onChange={(v) => set('screenX', v)} />
          </PropertyRow>
          <PropertyRow label="Screen Y">
            <NumberInput value={comp.screenY} step={1} onChange={(v) => set('screenY', v)} />
          </PropertyRow>
        </>
      )}

      {comp.mode === 'world' && (
        <>
          <PropertyRow label="World W">
            <NumberInput value={comp.worldWidth} step={0.1} min={0.01} onChange={(v) => set('worldWidth', v)} />
          </PropertyRow>
          <PropertyRow label="World H">
            <NumberInput value={comp.worldHeight} step={0.1} min={0.01} onChange={(v) => set('worldHeight', v)} />
          </PropertyRow>
          <PropertyRow label="Billboard">
            <Checkbox checked={comp.billboard} onChange={(v) => set('billboard', v)} />
          </PropertyRow>
        </>
      )}

      <PropertyRow label="Play Anim">
        <input
          value={comp.playAnimation ?? ''}
          onChange={(e) => set('playAnimation', e.target.value)}
          placeholder="animation id..."
          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 6px' }}
        />
      </PropertyRow>
      <PropertyRow label="Anim Speed">
        <NumberInput value={comp.animationSpeed ?? 1} step={0.1} min={0} onChange={(v) => set('animationSpeed', v)} />
      </PropertyRow>

      <RemoveComponentButton entity={entity} componentType="Fui" onRemoved={onRemoved} />
    </Section>
  );
};
