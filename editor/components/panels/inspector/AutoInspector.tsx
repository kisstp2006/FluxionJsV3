// ============================================================
// FluxionJS V3 — Auto Inspector
// Reads ComponentRegistry metadata and renders the appropriate
// UI widgets automatically. No hand-written inspector needed
// for standard property types.
// ============================================================

import React, { useState } from 'react';
import * as THREE from 'three';
import {
  Section, PropertyRow,
  NumberInput, Slider, Checkbox, Select, ColorInput, Vector3Input, TextInput,
} from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId, Component } from '../../../../src/core/ECS';
import { ComponentRegistry, PropertyDescriptor } from '../../../../src/core/ComponentRegistry';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty, markComponentDirty } from '../../../core/ComponentService';

// ── Single-property renderer ─────────────────────────────────

const AutoProperty: React.FC<{
  component: Component;
  descriptor: PropertyDescriptor;
  onUpdate: () => void;
}> = ({ component, descriptor, onUpdate }) => {
  const value = (component as any)[descriptor.key];
  const label = descriptor.label || descriptor.key;

  switch (descriptor.type) {
    case 'number':
      return (
        <PropertyRow label={label}>
          <NumberInput
            value={value}
            step={descriptor.step}
            onChange={(v) => { setProperty(undoManager, component, descriptor.key, v); onUpdate(); }}
          />
        </PropertyRow>
      );

    case 'slider':
      return (
        <PropertyRow label={label}>
          <Slider
            value={value}
            min={descriptor.min ?? 0}
            max={descriptor.max ?? 1}
            step={descriptor.step}
            onChange={(v) => { setProperty(undoManager, component, descriptor.key, v); onUpdate(); }}
          />
        </PropertyRow>
      );

    case 'boolean':
      return (
        <PropertyRow label={label}>
          <Checkbox
            checked={value}
            onChange={(v) => { setProperty(undoManager, component, descriptor.key, v); onUpdate(); }}
          />
        </PropertyRow>
      );

    case 'string':
      return (
        <PropertyRow label={label}>
          <TextInput
            value={value ?? ''}
            onChange={(v) => { setProperty(undoManager, component, descriptor.key, v); onUpdate(); }}
          />
        </PropertyRow>
      );

    case 'select':
      return (
        <PropertyRow label={label}>
          <Select
            value={value}
            options={descriptor.options ?? []}
            onChange={(v) => { setProperty(undoManager, component, descriptor.key, v); onUpdate(); }}
          />
        </PropertyRow>
      );

    case 'color':
      if (!(value instanceof THREE.Color)) return null;
      return (
        <PropertyRow label={label}>
          <ColorInput
            value={`#${value.getHexString()}`}
            onChange={(v) => { setColorProperty(undoManager, component, descriptor.key, v); onUpdate(); }}
          />
        </PropertyRow>
      );

    case 'vector3':
      if (!(value instanceof THREE.Vector3)) return null;
      return (
        <PropertyRow label={label}>
          <Vector3Input
            value={value}
            onChange={(axis, val) => {
              value[axis] = val;
              markComponentDirty(component, descriptor.key);
              onUpdate();
            }}
          />
        </PropertyRow>
      );

    default:
      return null;
  }
};

// ── Component-level auto-inspector ───────────────────────────

export const AutoInspector: React.FC<{
  entity: EntityId;
  componentType: string;
  onRemoved: () => void;
}> = ({ entity, componentType, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const component = engine.engine.ecs.getComponent(entity, componentType);
  if (!component) return null;

  const definition = ComponentRegistry.get(componentType);
  if (!definition) return null;

  const update = () => forceUpdate((n) => n + 1);

  return (
    <Section
      title={definition.displayName || definition.type}
      icon={definition.icon}
      actions={
        definition.removable !== false
          ? <RemoveComponentButton entity={entity} componentType={componentType} onRemoved={onRemoved} />
          : undefined
      }
    >
      {definition.properties.map((prop) => (
        <AutoProperty
          key={prop.key}
          component={component}
          descriptor={prop}
          onUpdate={update}
        />
      ))}
    </Section>
  );
};
