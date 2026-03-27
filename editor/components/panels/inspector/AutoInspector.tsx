// ============================================================
// FluxionJS V3 — Auto Inspector
// Reads @field metadata from ComponentRegistry and renders the
// appropriate UI widgets automatically. No hand-written inspector
// needed for standard property types.
//
// Supported field types:
//   number, slider, boolean, string, select, color,
//   vector3 (+ uniformScale), vector2, euler, asset
//
// Extra features:
//   · group  — fields with the same group key render inside a
//              collapsible sub-Section
//   · visibleIf — field shown only when predicate returns true
//   · diff-based memo — AutoProperty skips re-render when the
//              field key is not present in comp.__dirtyProps
// ============================================================

import React, { useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Section, PropertyRow,
  NumberInput, Slider, Checkbox, Select, ColorInput,
  Vector3Input, Vector2Input, TextInput, AssetInput,
} from '../../../ui';
import { ComponentSection } from './ComponentSection';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { BaseComponent } from '../../../../src/core/BaseComponent';
import { ComponentRegistry } from '../../../../src/core/ComponentRegistry';
import type { FieldMeta } from '../../../../src/core/ComponentDecorators';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty, markComponentDirty } from '../../../core/ComponentService';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

// ── Single field renderer ─────────────────────────────────────────────────────

interface AutoPropertyProps {
  comp: BaseComponent;
  field: FieldMeta;
  onUpdate: () => void;
  /** Increments on every parent re-render; triggers arePropsEqual evaluation. */
  _rev: number;
}

const AutoProperty = React.memo<AutoPropertyProps>(
  ({ comp, field, onUpdate }) => {
    const value = (comp as any)[field.key];
    const label = field.label || field.key;
    const [uniformLocked, setUniformLocked] = useState(false);

    switch (field.type) {
      case 'number':
        return (
          <PropertyRow label={label}>
            <NumberInput
              value={typeof value === 'number' ? value : 0}
              step={field.step}
              min={field.min}
              max={field.max}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'slider':
        return (
          <PropertyRow label={label}>
            <Slider
              value={typeof value === 'number' ? value : 0}
              min={field.min ?? 0}
              max={field.max ?? 1}
              step={field.step}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'boolean':
        return (
          <PropertyRow label={label}>
            <Checkbox
              checked={!!value}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'string':
        return (
          <PropertyRow label={label}>
            <TextInput
              value={value ?? ''}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'select':
        return (
          <PropertyRow label={label}>
            <Select
              value={value}
              options={field.options ?? []}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'color': {
        if (!(value instanceof THREE.Color)) return null;
        return (
          <PropertyRow label={label}>
            <ColorInput
              value={`#${value.getHexString()}`}
              onChange={(v) => { setColorProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );
      }

      case 'vector3': {
        if (!(value instanceof THREE.Vector3)) return null;
        if (field.uniformScale) {
          return (
            <PropertyRow label={label}>
              <div style={{ display: 'flex', gap: '4px', flex: 1, alignItems: 'center' }}>
                <Vector3Input
                  value={value}
                  onChange={(axis, val) => {
                    if (uniformLocked && (value as any)[axis] !== 0) {
                      const ratio = val / (value as any)[axis];
                      value.x = axis === 'x' ? val : value.x * ratio;
                      value.y = axis === 'y' ? val : value.y * ratio;
                      value.z = axis === 'z' ? val : value.z * ratio;
                    } else {
                      (value as any)[axis] = val;
                    }
                    markComponentDirty(comp, field.key);
                    onUpdate();
                  }}
                />
                <button
                  onClick={() => setUniformLocked(l => !l)}
                  title={uniformLocked ? 'Unlock uniform scale' : 'Lock uniform scale'}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    padding: '2px 5px',
                    color: uniformLocked ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: '10px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {uniformLocked ? '🔒' : '🔓'}
                </button>
              </div>
            </PropertyRow>
          );
        }
        return (
          <PropertyRow label={label}>
            <Vector3Input
              value={value}
              onChange={(axis, val) => {
                (value as any)[axis] = val;
                markComponentDirty(comp, field.key);
                onUpdate();
              }}
            />
          </PropertyRow>
        );
      }

      case 'vector2': {
        if (!(value instanceof THREE.Vector2)) return null;
        return (
          <PropertyRow label={label}>
            <Vector2Input
              value={value}
              onChange={(axis, val) => {
                (value as any)[axis] = val;
                markComponentDirty(comp, field.key);
                onUpdate();
              }}
            />
          </PropertyRow>
        );
      }

      case 'euler': {
        if (!(value instanceof THREE.Euler)) return null;
        // Convert radians (stored) ↔ degrees (displayed)
        const asDeg = {
          x: value.x * RAD2DEG,
          y: value.y * RAD2DEG,
          z: value.z * RAD2DEG,
        };
        return (
          <PropertyRow label={label}>
            <Vector3Input
              value={asDeg}
              step={0.1}
              onChange={(axis, deg) => {
                (value as any)[axis] = deg * DEG2RAD;
                markComponentDirty(comp, field.key);
                onUpdate();
              }}
            />
          </PropertyRow>
        );
      }

      case 'asset': {
        if (!field.assetType) return null;
        return (
          <PropertyRow label={label}>
            <AssetInput
              value={value}
              assetType={field.assetType}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v || null); onUpdate(); }}
            />
          </PropertyRow>
        );
      }

      default:
        return null;
    }
  },
  // Diff-based memo: skip re-render if this field is not in __dirtyProps.
  // Falls back to full re-render if dirty tracking is unavailable.
  (_prev, next) => {
    if (!next.comp.__dirtyProps) return false; // no tracking → always re-render
    return !next.comp.__dirtyProps.has(next.field.key); // skip if not dirty
  },
);

// ── Grouped field list ───────────────────────────────────────────────────────

const GroupedFields: React.FC<{
  fields: readonly FieldMeta[];
  comp: BaseComponent;
  onUpdate: () => void;
  rev: number;
}> = ({ fields, comp, onUpdate, rev }) => {
  // Partition into ungrouped (rendered inline) and grouped (sub-Sections)
  const ungrouped: FieldMeta[] = [];
  const groups = new Map<string, FieldMeta[]>();

  for (const f of fields) {
    if (f.visibleIf && !f.visibleIf(comp)) continue;
    if (f.group) {
      let arr = groups.get(f.group);
      if (!arr) { arr = []; groups.set(f.group, arr); }
      arr.push(f);
    } else {
      ungrouped.push(f);
    }
  }

  return (
    <>
      {ungrouped.map(f => (
        <AutoProperty key={f.key} comp={comp} field={f} onUpdate={onUpdate} _rev={rev} />
      ))}
      {[...groups.entries()].map(([groupName, groupFields]) => (
        <Section key={groupName} title={groupName} defaultOpen={false}>
          {groupFields.map(f => (
            <AutoProperty key={f.key} comp={comp} field={f} onUpdate={onUpdate} _rev={rev} />
          ))}
        </Section>
      ))}
    </>
  );
};

// ── Main AutoInspector ────────────────────────────────────────────────────────

export const AutoInspector: React.FC<{
  entity: EntityId;
  componentType: string;
  onRemoved: () => void;
}> = ({ entity, componentType, onRemoved }) => {
  const engine = useEngine();
  const [rev, setRev] = useState(0);
  if (!engine) return null;

  const comp = engine.engine.ecs.getComponent(entity, componentType) as BaseComponent | null;
  if (!comp) return null;

  const reg = ComponentRegistry.get(componentType);
  if (!reg) return null;

  const update = useCallback(() => setRev(r => r + 1), []);

  return (
    <ComponentSection entity={entity} componentType={componentType} onRemoved={onRemoved}>
      <GroupedFields fields={reg.fields} comp={comp} onUpdate={update} rev={rev} />
    </ComponentSection>
  );
};
