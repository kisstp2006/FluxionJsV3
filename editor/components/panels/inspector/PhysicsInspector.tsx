import React, { useState } from 'react';
import { Section, PropertyRow, Select, NumberInput, Slider, Checkbox, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { RigidbodyComponent, ColliderComponent, CharacterControllerComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';

// ── Small axis-lock toggle row ──

const AxisLockRow: React.FC<{
  label: string;
  x: boolean; y: boolean; z: boolean;
  onX: (v: boolean) => void;
  onY: (v: boolean) => void;
  onZ: (v: boolean) => void;
}> = ({ label, x, y, z, onX, onY, onZ }) => (
  <PropertyRow label={label}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => {
        const val = [x, y, z][i];
        const cb = [onX, onY, onZ][i];
        const color = axis === 'X' ? '#f87171' : axis === 'Y' ? '#4ade80' : '#60a5fa';
        return (
          <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}>
            <Checkbox checked={val} onChange={cb} />
            <span style={{ fontSize: 11, color, fontWeight: 600 }}>{axis}</span>
          </label>
        );
      })}
    </div>
  </PropertyRow>
);

export const RigidbodyInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const rb = engine.engine.ecs.getComponent<RigidbodyComponent>(entity, 'Rigidbody');
  if (!rb) return null;

  const update = () => forceUpdate((n) => n + 1);
  const set = (key: string, v: unknown) => { setProperty(undoManager, rb, key, v); update(); };

  return (
    <Section title="Rigidbody" icon={Icons.physics} actions={<RemoveComponentButton entity={entity} componentType="Rigidbody" onRemoved={onRemoved} />}>
      <PropertyRow label="Type">
        <Select
          value={rb.bodyType}
          onChange={(v) => set('bodyType', v)}
          options={[
            { value: 'dynamic', label: 'Dynamic' },
            { value: 'static', label: 'Static' },
            { value: 'kinematic', label: 'Kinematic' },
          ]}
        />
      </PropertyRow>
      <PropertyRow label="Mass">
        <NumberInput value={rb.mass} step={0.1} onChange={(v) => set('mass', v)} />
      </PropertyRow>
      <PropertyRow label="Friction">
        <Slider value={rb.friction} min={0} max={2} step={0.1} onChange={(v) => set('friction', v)} />
      </PropertyRow>
      <PropertyRow label="Bounce">
        <Slider value={rb.restitution} min={0} max={1} step={0.05} onChange={(v) => set('restitution', v)} />
      </PropertyRow>
      <AxisLockRow
        label="Lock Position"
        x={rb.lockLinearX} y={rb.lockLinearY} z={rb.lockLinearZ}
        onX={(v) => set('lockLinearX', v)}
        onY={(v) => set('lockLinearY', v)}
        onZ={(v) => set('lockLinearZ', v)}
      />
      <AxisLockRow
        label="Lock Rotation"
        x={rb.lockAngularX} y={rb.lockAngularY} z={rb.lockAngularZ}
        onX={(v) => set('lockAngularX', v)}
        onY={(v) => set('lockAngularY', v)}
        onZ={(v) => set('lockAngularZ', v)}
      />
    </Section>
  );
};

export const ColliderInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const collider = engine.engine.ecs.getComponent<ColliderComponent>(entity, 'Collider');
  if (!collider) return null;

  const update = () => forceUpdate((n) => n + 1);

  return (
    <Section title="Collider" icon={Icons.cube} actions={<RemoveComponentButton entity={entity} componentType="Collider" onRemoved={onRemoved} />}>
      <PropertyRow label="Shape">
        <Select
          value={collider.shape}
          onChange={(v) => { setProperty(undoManager, collider, 'shape', v); update(); }}
          options={[
            { value: 'box', label: 'Box' },
            { value: 'sphere', label: 'Sphere' },
            { value: 'capsule', label: 'Capsule' },
            { value: 'cylinder', label: 'Cylinder' },
            { value: 'mesh', label: 'Mesh' },
          ]}
        />
      </PropertyRow>
      <PropertyRow label="Is Trigger">
        <Checkbox checked={collider.isTrigger} onChange={(v) => { setProperty(undoManager, collider, 'isTrigger', v); update(); }} />
      </PropertyRow>
    </Section>
  );
};

// ── Character Controller Inspector ──────────────────────────────────────────

const CC_SECTION_STYLE: React.CSSProperties = { marginBottom: 2 };

export const CharacterControllerInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const cc = engine.engine.ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController');
  if (!cc) return null;

  const update = () => forceUpdate((n) => n + 1);
  const set = (key: string, v: unknown) => { setProperty(undoManager, cc, key, v); update(); };

  return (
    <Section title="Character Controller" icon={Icons.entity} actions={<RemoveComponentButton entity={entity} componentType="CharacterController" onRemoved={onRemoved} />}>

      {/* ── Shape ── */}
      <div style={CC_SECTION_STYLE}>
        <PropertyRow label="Radius">
          <NumberInput value={cc.radius} min={0.05} step={0.05} onChange={(v) => set('radius', v)} />
        </PropertyRow>
        <PropertyRow label="Height">
          <NumberInput value={cc.height} min={0.1} step={0.1} onChange={(v) => set('height', v)} />
        </PropertyRow>
        <PropertyRow label="Crouch Height">
          <NumberInput value={cc.crouchHeight} min={0.1} step={0.1} onChange={(v) => set('crouchHeight', v)} />
        </PropertyRow>
        <PropertyRow label="Center Offset Y">
          <NumberInput value={cc.centerOffsetY} step={0.05} onChange={(v) => set('centerOffsetY', v)} />
        </PropertyRow>
      </div>

      {/* ── Speeds ── */}
      <PropertyRow label="Walk Speed">
        <NumberInput value={cc.walkSpeed} min={0} step={0.5} onChange={(v) => set('walkSpeed', v)} />
      </PropertyRow>
      <PropertyRow label="Run Speed">
        <NumberInput value={cc.runSpeed} min={0} step={0.5} onChange={(v) => set('runSpeed', v)} />
      </PropertyRow>
      <PropertyRow label="Crouch Speed">
        <NumberInput value={cc.crouchSpeed} min={0} step={0.5} onChange={(v) => set('crouchSpeed', v)} />
      </PropertyRow>
      <PropertyRow label="Air Speed">
        <NumberInput value={cc.airSpeed} min={0} step={0.5} onChange={(v) => set('airSpeed', v)} />
      </PropertyRow>

      {/* ── Jump ── */}
      <PropertyRow label="Jump Impulse">
        <NumberInput value={cc.jumpImpulse} min={0} step={0.5} onChange={(v) => set('jumpImpulse', v)} />
      </PropertyRow>
      <PropertyRow label="Max Jumps">
        <NumberInput value={cc.maxJumps} min={1} max={5} step={1} onChange={(v) => set('maxJumps', v)} />
      </PropertyRow>

      {/* ── Ground ── */}
      <PropertyRow label="Max Slope °">
        <Slider value={cc.maxSlopeAngle} min={0} max={89} step={1} onChange={(v) => set('maxSlopeAngle', v)} />
      </PropertyRow>
      <PropertyRow label="Step Height">
        <NumberInput value={cc.maxStepHeight} min={0} step={0.05} onChange={(v) => set('maxStepHeight', v)} />
      </PropertyRow>
      <PropertyRow label="Step Down">
        <NumberInput value={cc.stepDownHeight} min={0} step={0.05} onChange={(v) => set('stepDownHeight', v)} />
      </PropertyRow>

      {/* ── Air ── */}
      <PropertyRow label="Air Friction">
        <Slider value={cc.airFriction} min={0} max={1} step={0.05} onChange={(v) => set('airFriction', v)} />
      </PropertyRow>
      <PropertyRow label="Air Control">
        <Slider value={cc.airControl} min={0} max={1} step={0.05} onChange={(v) => set('airControl', v)} />
      </PropertyRow>

      {/* ── Physics ── */}
      <PropertyRow label="Gravity Scale">
        <NumberInput value={cc.gravityScale} step={0.1} onChange={(v) => set('gravityScale', v)} />
      </PropertyRow>
      <PropertyRow label="Mass (kg)">
        <NumberInput value={cc.mass} min={1} step={5} onChange={(v) => set('mass', v)} />
      </PropertyRow>
      <PropertyRow label="Push Force">
        <NumberInput value={cc.pushForce} min={0} step={5} onChange={(v) => set('pushForce', v)} />
      </PropertyRow>
    </Section>
  );
};
