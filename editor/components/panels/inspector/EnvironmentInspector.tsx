import React from 'react';
import { Section, PropertyRow, Select, ColorInput, Slider, NumberInput, Checkbox, Icons, AssetInput } from '../../../ui';
import { EntityId } from '../../../../src/core/ECS';
import { EnvironmentComponent, ToneMappingMode, BackgroundMode, FogMode, SkyboxMode } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty, markComponentDirty } from '../../../core/ComponentService';
import { useComponentInspector } from '../../../core/useComponentInspector';

export const EnvironmentInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const [env, update] = useComponentInspector<EnvironmentComponent>(entity, 'Environment');
  if (!env) return null;

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
        {env.backgroundMode === 'skybox' && (
          <>
            <PropertyRow label="Source">
              <Select
                value={env.skyboxMode}
                onChange={(v) => { setProperty(undoManager, env, 'skyboxMode', v as SkyboxMode); update(); }}
                options={[
                  { value: 'panorama', label: 'Panorama (1 image)' },
                  { value: 'cubemap', label: 'Cubemap (6 faces)' },
                  { value: 'procedural', label: 'Procedural Sky' },
                ]}
              />
            </PropertyRow>
            {env.skyboxMode === 'panorama' && (
              <PropertyRow label="Image">
                <AssetInput
                  value={env.skyboxPath}
                  assetType="texture"
                  placeholder="Select panorama image"
                  onChange={(v) => { setProperty(undoManager, env, 'skyboxPath', v || null); update(); }}
                />
              </PropertyRow>
            )}
            {env.skyboxMode === 'cubemap' && (
              <>
                {(['right', 'left', 'top', 'bottom', 'front', 'back'] as const).map((face) => (
                  <PropertyRow key={face} label={face.charAt(0).toUpperCase() + face.slice(1)}>
                    <AssetInput
                      value={env.skyboxFaces[face]}
                      assetType="texture"
                      placeholder={`Select ${face} face`}
                      onChange={(v) => {
                        env.skyboxFaces = { ...env.skyboxFaces, [face]: v || null };
                        markComponentDirty(env, 'skyboxFaces');
                        update();
                      }}
                    />
                  </PropertyRow>
                ))}
              </>
            )}
            {env.skyboxMode === 'procedural' && (
              <>
                <PropertyRow label="Turbidity">
                  <Slider value={env.skyTurbidity} min={0} max={20} step={0.1} onChange={(v) => { setProperty(undoManager, env, 'skyTurbidity', v); update(); }} />
                </PropertyRow>
                <PropertyRow label="Rayleigh">
                  <Slider value={env.skyRayleigh} min={0} max={4} step={0.01} onChange={(v) => { setProperty(undoManager, env, 'skyRayleigh', v); update(); }} />
                </PropertyRow>
                <PropertyRow label="Mie Coefficient">
                  <Slider value={env.skyMieCoefficient} min={0} max={0.1} step={0.001} onChange={(v) => { setProperty(undoManager, env, 'skyMieCoefficient', v); update(); }} />
                </PropertyRow>
                <PropertyRow label="Mie Directional">
                  <Slider value={env.skyMieDirectionalG} min={0} max={1} step={0.01} onChange={(v) => { setProperty(undoManager, env, 'skyMieDirectionalG', v); update(); }} />
                </PropertyRow>
                <PropertyRow label="Sun Elevation">
                  <Slider value={env.sunElevation} min={-10} max={90} step={0.5} onChange={(v) => { setProperty(undoManager, env, 'sunElevation', v); update(); }} />
                </PropertyRow>
                <PropertyRow label="Sun Azimuth">
                  <Slider value={env.sunAzimuth} min={0} max={360} step={1} onChange={(v) => { setProperty(undoManager, env, 'sunAzimuth', v); update(); }} />
                </PropertyRow>
              </>
            )}
          </>
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

      {/* ── SSR ── */}
      <Section title="SSR (Screen Space Reflections)" defaultOpen={false}>
        <PropertyRow label="Enabled">
          <Checkbox checked={env.ssrEnabled} onChange={(v) => { setProperty(undoManager, env, 'ssrEnabled', v); update(); }} />
        </PropertyRow>
        {env.ssrEnabled && (
          <>
            <PropertyRow label="Max Distance">
              <Slider value={env.ssrMaxDistance} min={1} max={200} step={1} onChange={(v) => { setProperty(undoManager, env, 'ssrMaxDistance', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Resolution Scale">
              <Slider value={env.ssrResolutionScale} min={0.1} max={1} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'ssrResolutionScale', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Thickness">
              <Slider value={env.ssrThickness} min={0.01} max={5} step={0.01} onChange={(v) => { setProperty(undoManager, env, 'ssrThickness', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Infinite Thick">
              <Checkbox checked={env.ssrInfiniteThick} onChange={(v) => { setProperty(undoManager, env, 'ssrInfiniteThick', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Stride">
              <Slider value={env.ssrStride} min={0.05} max={2} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'ssrStride', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Fresnel">
              <Slider value={env.ssrFresnel} min={0} max={1} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'ssrFresnel', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Distance Attenuation">
              <Checkbox checked={env.ssrDistanceAttenuation} onChange={(v) => { setProperty(undoManager, env, 'ssrDistanceAttenuation', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Opacity">
              <Slider value={env.ssrOpacity} min={0} max={1} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'ssrOpacity', v); update(); }} />
            </PropertyRow>
          </>
        )}
      </Section>

      {/* ── SSGI ── */}
      <Section title="SSGI (Global Illumination)" defaultOpen={false}>
        <PropertyRow label="Enabled">
          <Checkbox checked={env.ssgiEnabled} onChange={(v) => { setProperty(undoManager, env, 'ssgiEnabled', v); update(); }} />
        </PropertyRow>
        {env.ssgiEnabled && (
          <>
            <PropertyRow label="Slice Count">
              <Slider value={env.ssgiSliceCount} min={1} max={4} step={1} onChange={(v) => { setProperty(undoManager, env, 'ssgiSliceCount', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Step Count">
              <Slider value={env.ssgiStepCount} min={1} max={32} step={1} onChange={(v) => { setProperty(undoManager, env, 'ssgiStepCount', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Radius">
              <Slider value={env.ssgiRadius} min={1} max={25} step={0.5} onChange={(v) => { setProperty(undoManager, env, 'ssgiRadius', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Thickness">
              <Slider value={env.ssgiThickness} min={0.01} max={10} step={0.1} onChange={(v) => { setProperty(undoManager, env, 'ssgiThickness', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Exp Factor">
              <Slider value={env.ssgiExpFactor} min={1} max={3} step={0.1} onChange={(v) => { setProperty(undoManager, env, 'ssgiExpFactor', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="AO Intensity">
              <Slider value={env.ssgiAoIntensity} min={0} max={4} step={0.1} onChange={(v) => { setProperty(undoManager, env, 'ssgiAoIntensity', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="GI Intensity">
              <Slider value={env.ssgiGiIntensity} min={0} max={100} step={1} onChange={(v) => { setProperty(undoManager, env, 'ssgiGiIntensity', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Backface Lighting">
              <Slider value={env.ssgiBackfaceLighting} min={0} max={1} step={0.05} onChange={(v) => { setProperty(undoManager, env, 'ssgiBackfaceLighting', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Use Linear Thickness">
              <Checkbox checked={env.ssgiUseLinearThickness} onChange={(v) => { setProperty(undoManager, env, 'ssgiUseLinearThickness', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Screen-Space Sampling">
              <Checkbox checked={env.ssgiScreenSpaceSampling} onChange={(v) => { setProperty(undoManager, env, 'ssgiScreenSpaceSampling', v); update(); }} />
            </PropertyRow>
          </>
        )}
      </Section>

      {/* ── Volumetric Clouds ── */}
      <Section title="Volumetric Clouds" defaultOpen={false}>
        <PropertyRow label="Enabled">
          <Checkbox checked={env.cloudsEnabled} onChange={(v) => { setProperty(undoManager, env, 'cloudsEnabled', v); update(); }} />
        </PropertyRow>
        {env.cloudsEnabled && (
          <>
            <PropertyRow label="Min Height">
              <NumberInput value={env.cloudMinHeight} step={10} min={0} onChange={(v) => { setProperty(undoManager, env, 'cloudMinHeight', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Max Height">
              <NumberInput value={env.cloudMaxHeight} step={10} min={0} onChange={(v) => { setProperty(undoManager, env, 'cloudMaxHeight', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Coverage">
              <Slider value={env.cloudCoverage} min={0} max={1} step={0.01} onChange={(v) => { setProperty(undoManager, env, 'cloudCoverage', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Density">
              <Slider value={env.cloudDensity} min={0} max={2} step={0.01} onChange={(v) => { setProperty(undoManager, env, 'cloudDensity', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Absorption">
              <Slider value={env.cloudAbsorption} min={0} max={5} step={0.1} onChange={(v) => { setProperty(undoManager, env, 'cloudAbsorption', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Scatter">
              <Slider value={env.cloudScatter} min={0} max={5} step={0.1} onChange={(v) => { setProperty(undoManager, env, 'cloudScatter', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Color">
              <ColorInput
                value={`#${env.cloudColor.getHexString()}`}
                onChange={(v) => { setColorProperty(undoManager, env, 'cloudColor', v); update(); }}
              />
            </PropertyRow>
            <PropertyRow label="Speed">
              <Slider value={env.cloudSpeed} min={0} max={10} step={0.1} onChange={(v) => { setProperty(undoManager, env, 'cloudSpeed', v); update(); }} />
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

      {/* ── Shadows (CSM) ── */}
      <Section title="Shadows" defaultOpen={false}>
        <PropertyRow label="Cascades">
          <Slider value={env.shadowCascades} min={0} max={6} step={1} onChange={(v) => { setProperty(undoManager, env, 'shadowCascades', v); update(); }} />
        </PropertyRow>
        <PropertyRow label="Distance">
          <NumberInput value={env.shadowDistance} step={10} min={10} onChange={(v) => { setProperty(undoManager, env, 'shadowDistance', v); update(); }} />
        </PropertyRow>
      </Section>

      {/* ── Depth of Field ── */}
      <Section title="Depth of Field" defaultOpen={false}>
        <PropertyRow label="Enabled">
          <Checkbox checked={env.dofEnabled} onChange={(v) => { setProperty(undoManager, env, 'dofEnabled', v); update(); }} />
        </PropertyRow>
        {env.dofEnabled && (
          <>
            <PropertyRow label="Focus Distance">
              <NumberInput value={env.dofFocusDistance} step={0.5} min={0.1} onChange={(v) => { setProperty(undoManager, env, 'dofFocusDistance', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Aperture">
              <Slider value={env.dofAperture} min={0.001} max={0.2} step={0.001} onChange={(v) => { setProperty(undoManager, env, 'dofAperture', v); update(); }} />
            </PropertyRow>
            <PropertyRow label="Max Blur">
              <Slider value={env.dofMaxBlur} min={1} max={30} step={1} onChange={(v) => { setProperty(undoManager, env, 'dofMaxBlur', v); update(); }} />
            </PropertyRow>
          </>
        )}
      </Section>

      {/* ── Chromatic Aberration & Film Grain ── */}
      <Section title="Effects" defaultOpen={false}>
        <PropertyRow label="Chromatic Aberration">
          <Slider value={env.chromaticAberration} min={0} max={0.02} step={0.001} onChange={(v) => { setProperty(undoManager, env, 'chromaticAberration', v); update(); }} />
        </PropertyRow>
        <PropertyRow label="Film Grain">
          <Slider value={env.filmGrain} min={0} max={0.5} step={0.01} onChange={(v) => { setProperty(undoManager, env, 'filmGrain', v); update(); }} />
        </PropertyRow>
      </Section>
    </Section>
  );
};
