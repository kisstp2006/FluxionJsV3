import React, { useState } from 'react';
import { Section, PropertyRow, Select, ColorInput, Slider, NumberInput, Checkbox, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { EnvironmentComponent, ToneMappingMode, BackgroundMode, FogMode } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty } from '../../../core/ComponentService';

export const EnvironmentInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const env = engine.engine.ecs.getComponent<EnvironmentComponent>(entity, 'Environment');
  if (!env) return null;

  const update = () => forceUpdate((n) => n + 1);

  return (
    <Section
      title="Environment"
      icon={Icons.globe}
      actions={<RemoveComponentButton entity={entity} componentType="Environment" onRemoved={onRemoved} />}
    >
      {/* ── Background ── */}
      <Section title="Background" defaultOpen>
        <PropertyRow label="Mode">
          <Select
            value={env.backgroundMode}
            onChange={(v) => { setProperty(undoManager, env, 'backgroundMode', v as BackgroundMode); update(); }}
            options={[
              { value: 'color', label: 'Solid Color' },
              { value: 'skybox', label: 'Skybox' },
            ]}
          />
        </PropertyRow>
        {env.backgroundMode === 'color' && (
          <PropertyRow label="Color">
            <ColorInput
              value={`#${env.backgroundColor.getHexString()}`}
              onChange={(v) => { setColorProperty(undoManager, env, 'backgroundColor', v); update(); }}
            />
          </PropertyRow>
        )}
      </Section>

      {/* ── Ambient Light ── */}
      <Section title="Ambient Light" defaultOpen>
        <PropertyRow label="Color">
          <ColorInput
            value={`#${env.ambientColor.getHexString()}`}
            onChange={(v) => { setColorProperty(undoManager, env, 'ambientColor', v); update(); }}
          />
        </PropertyRow>
        <PropertyRow label="Intensity">
          <Slider value={env.ambientIntensity} min={0} max={3} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'ambientIntensity', v); update(); }} />
        </PropertyRow>
      </Section>

      {/* ── Fog ── */}
      <Section title="Fog" defaultOpen>
        <PropertyRow label="Enabled">
          <Checkbox checked={env.fogEnabled} onChange={(v) => { setProperty(undoManager, env, 'fogEnabled', v); update(); }} />
        </PropertyRow>
        {env.fogEnabled && (
          <>
            <PropertyRow label="Color">
              <ColorInput
                value={`#${env.fogColor.getHexString()}`}
                onChange={(v) => { setColorProperty(undoManager, env, 'fogColor', v); update(); }}
              />
            </PropertyRow>
            <PropertyRow label="Type">
              <Select
                value={env.fogMode}
                onChange={(v) => { setProperty(undoManager, env, 'fogMode', v as FogMode); update(); }}
                options={[
                  { value: 'exponential', label: 'Exponential' },
                  { value: 'linear', label: 'Linear' },
                ]}
              />
            </PropertyRow>
            {env.fogMode === 'exponential' ? (
              <PropertyRow label="Density">
                <Slider value={env.fogDensity} min={0} max={0.1} step={0.001} onChange={(v) => { setProperty(undoManager, env, 'fogDensity', v); update(); }} />
              </PropertyRow>
            ) : (
              <>
                <PropertyRow label="Near">
                  <NumberInput value={env.fogNear} step={1} min={0} onChange={(v) => { setProperty(undoManager, env, 'fogNear', v); update(); }} />
                </PropertyRow>
                <PropertyRow label="Far">
                  <NumberInput value={env.fogFar} step={1} min={0} onChange={(v) => { setProperty(undoManager, env, 'fogFar', v); update(); }} />
                </PropertyRow>
              </>
            )}
          </>
        )}
      </Section>

      {/* ── Tone Mapping ── */}
      <Section title="Tone Mapping" defaultOpen>
        <PropertyRow label="Mode">
          <Select
            value={env.toneMapping}
            onChange={(v) => { setProperty(undoManager, env, 'toneMapping', v as ToneMappingMode); update(); }}
            options={[
              { value: 'None', label: 'None' },
              { value: 'Linear', label: 'Linear' },
              { value: 'Reinhard', label: 'Reinhard' },
              { value: 'ACES', label: 'ACES Filmic' },
              { value: 'AgX', label: 'AgX' },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Exposure">
          <Slider value={env.exposure} min={0.1} max={5} step={0.1} onChange={(v) => { setProperty(undoManager, env, 'exposure', v); update(); }} />
        </PropertyRow>
      </Section>

      {/* ── Bloom ── */}
      <Section title="Bloom" defaultOpen>
        <PropertyRow label="Enabled">
          <Checkbox checked={env.bloomEnabled} onChange={(v) => { setProperty(undoManager, env, 'bloomEnabled', v); update(); }} />
        </PropertyRow>
        {env.bloomEnabled && (
          <>
            <PropertyRow label="Threshold">
              <Slider value={env.bloomThreshold} min={0} max={2} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'bloomThreshold', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Strength">
              <Slider value={env.bloomStrength} min={0} max={3} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'bloomStrength', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Radius">
              <Slider value={env.bloomRadius} min={0} max={1} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'bloomRadius', v); update(); }} />
            </PropertyRow>
          </>
        )}
      </Section>

      {/* ── SSAO ── */}
      <Section title="SSAO" defaultOpen={false}>
        <PropertyRow label="Enabled">
          <Checkbox checked={env.ssaoEnabled} onChange={(v) => { setProperty(undoManager, env, 'ssaoEnabled', v); update(); }} />
        </PropertyRow>
        {env.ssaoEnabled && (
          <>
            <PropertyRow label="Radius">
              <Slider value={env.ssaoRadius} min={0.01} max={2} step={0.01} onChange={(v) => { setProperty(undoManager, env, 'ssaoRadius', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Bias">
              <Slider value={env.ssaoBias} min={0} max={0.1} step={0.005} onChange={(v) => { setProperty(undoManager, env, 'ssaoBias', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Intensity">
              <Slider value={env.ssaoIntensity} min={0} max={3} step={0.1} onChange={(v) => { setProperty(undoManager, env, 'ssaoIntensity', v); update(); }} />
            </PropertyRow>
          </>
        )}
      </Section>

      {/* ── Vignette ── */}
      <Section title="Vignette" defaultOpen={false}>
        <PropertyRow label="Enabled">
          <Checkbox checked={env.vignetteEnabled} onChange={(v) => { setProperty(undoManager, env, 'vignetteEnabled', v); update(); }} />
        </PropertyRow>
        {env.vignetteEnabled && (
          <>
            <PropertyRow label="Intensity">
              <Slider value={env.vignetteIntensity} min={0} max={2} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'vignetteIntensity', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Roundness">
              <Slider value={env.vignetteRoundness} min={0} max={2} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'vignetteRoundness', v); update(); }} />
            </PropertyRow>
          </>
        )}
      </Section>
    </Section>
  );
};
