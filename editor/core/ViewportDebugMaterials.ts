// ============================================================
// FluxionJS V3 — Viewport Debug Material Controller
//
// Design:
//   - wireframe / normals-world: renderer.overrideMaterial only
//   - all other modes: ONE shared ShaderMaterial as overrideMaterial
//     + per-mesh onBeforeRender callback that updates uniforms to
//     point at that mesh's original textures/values.
//     → zero per-mesh allocation, one GL program per mode family.
//
// Channel mapping (glTF / THREE.js standard):
//   Roughness  → roughnessMap.g
//   Metalness  → metalnessMap.b
//   Occlusion  → aoMap.r  (UV set determined by aoMap.channel)
// ============================================================

import * as THREE from 'three';
import type { ViewportShadingMode } from './EditorState';

// ── Internal state ───────────────────────────────────────────
type StoredData = {
  onBefore: THREE.Object3D['onBeforeRender'];
};
const _stored = new Map<THREE.Mesh, StoredData>();
let _activeRenderer: THREE.WebGLRenderer | null = null;
let _currentMode: ViewportShadingMode = 'lit';

// ── Singleton shared materials (created once, reused) ────────
let _wireframeMat:    THREE.MeshBasicMaterial  | null = null;
let _normalWorldMat:  THREE.MeshNormalMaterial | null = null;
let _albedoMat:       THREE.ShaderMaterial     | null = null;
let _emissiveMat:     THREE.ShaderMaterial     | null = null;
let _channelMat:      THREE.ShaderMaterial     | null = null;
let _tangentNormMat:  THREE.ShaderMaterial     | null = null;

// ── Vertex shader shared by all custom debug modes ───────────
const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ── Albedo / Unlit shader ────────────────────────────────────
const ALBEDO_FRAG = /* glsl */`
uniform sampler2D map;
uniform bool      hasMap;
uniform vec3      color;
varying vec2      vUv;
void main() {
  vec3 c = hasMap ? texture2D(map, vUv).rgb * color : color;
  gl_FragColor = vec4(c, 1.0);
}
`;

// ── Emissive shader ──────────────────────────────────────────
const EMISSIVE_FRAG = /* glsl */`
uniform sampler2D emissiveMap;
uniform bool      hasEmissiveMap;
uniform vec3      emissive;
varying vec2      vUv;
void main() {
  vec3 c = hasEmissiveMap ? texture2D(emissiveMap, vUv).rgb * emissive : emissive;
  gl_FragColor = vec4(c, 1.0);
}
`;

// ── Generic channel shader (supports r/g/b, invert, fallback scalar) ──
// channelMask selects the channel: vec4(1,0,0,0)=R, (0,1,0,0)=G, (0,0,1,0)=B
const CHANNEL_FRAG = /* glsl */`
uniform sampler2D map;
uniform bool      hasMap;
uniform vec4      channelMask;   // which channel to extract
uniform float     scalar;        // fallback when no texture
uniform bool      invert;
varying vec2      vUv;
void main() {
  float v = hasMap ? dot(texture2D(map, vUv), channelMask) : scalar;
  if (invert) v = 1.0 - v;
  gl_FragColor = vec4(v, v, v, 1.0);
}
`;

// ── Tangent-space normal map viewer ─────────────────────────
const TANGENT_NORM_FRAG = /* glsl */`
uniform sampler2D normalMap;
uniform bool      hasNormalMap;
varying vec2      vUv;
void main() {
  vec3 n = hasNormalMap ? texture2D(normalMap, vUv).rgb : vec3(0.5, 0.5, 1.0);
  gl_FragColor = vec4(n, 1.0);
}
`;

// ── Channel mask constants ───────────────────────────────────
const MASK_R = new THREE.Vector4(1, 0, 0, 0);
const MASK_G = new THREE.Vector4(0, 1, 0, 0);
const MASK_B = new THREE.Vector4(0, 0, 1, 0);

// ── Lazy material getters ────────────────────────────────────
function getWireframeMat(): THREE.MeshBasicMaterial {
  return _wireframeMat ??= new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
}
function getNormalWorldMat(): THREE.MeshNormalMaterial {
  return _normalWorldMat ??= new THREE.MeshNormalMaterial();
}
function getAlbedoMat(): THREE.ShaderMaterial {
  return _albedoMat ??= new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: ALBEDO_FRAG,
    uniforms: {
      map:    { value: null },
      hasMap: { value: false },
      color:  { value: new THREE.Color(1, 1, 1) },
    },
  });
}
function getEmissiveMat(): THREE.ShaderMaterial {
  return _emissiveMat ??= new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: EMISSIVE_FRAG,
    uniforms: {
      emissiveMap:    { value: null },
      hasEmissiveMap: { value: false },
      emissive:       { value: new THREE.Color(0, 0, 0) },
    },
  });
}
function getChannelMat(): THREE.ShaderMaterial {
  return _channelMat ??= new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: CHANNEL_FRAG,
    uniforms: {
      map:         { value: null },
      hasMap:      { value: false },
      channelMask: { value: MASK_R.clone() },
      scalar:      { value: 1.0 },
      invert:      { value: false },
    },
  });
}
function getTangentNormMat(): THREE.ShaderMaterial {
  return _tangentNormMat ??= new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: TANGENT_NORM_FRAG,
    uniforms: {
      normalMap:    { value: null },
      hasNormalMap: { value: false },
    },
  });
}

// ── Per-mesh onBeforeRender factory ─────────────────────────

function _makeCallback(
  mode: ViewportShadingMode,
  orig: THREE.MeshStandardMaterial,
  mesh: THREE.Mesh,
): THREE.Object3D['onBeforeRender'] {
  switch (mode) {
    case 'unlit':
    case 'albedo': {
      const mat = getAlbedoMat();
      return function () {
        mat.uniforms.map.value    = orig.map;
        mat.uniforms.hasMap.value = !!orig.map;
        mat.uniforms.color.value.copy(orig.color);
        mat.uniformsNeedUpdate = true;
      };
    }

    case 'emissive': {
      const mat = getEmissiveMat();
      return function () {
        mat.uniforms.emissiveMap.value    = orig.emissiveMap ?? null;
        mat.uniforms.hasEmissiveMap.value = !!orig.emissiveMap;
        // Bake emissive * intensity into the uniform so the shader stays simple
        mat.uniforms.emissive.value.copy(orig.emissive)
          .multiplyScalar(orig.emissiveIntensity ?? 1);
        mat.uniformsNeedUpdate = true;
      };
    }

    case 'roughness':
    case 'glossiness': {
      const mat     = getChannelMat();
      const doInvert = mode === 'glossiness';
      return function () {
        mat.uniforms.map.value         = orig.roughnessMap ?? null;
        mat.uniforms.hasMap.value      = !!orig.roughnessMap;
        mat.uniforms.channelMask.value = MASK_G; // roughness → G channel (glTF)
        mat.uniforms.scalar.value      = orig.roughness;
        mat.uniforms.invert.value      = doInvert;
        mat.uniformsNeedUpdate = true;
      };
    }

    case 'metalness': {
      const mat = getChannelMat();
      return function () {
        mat.uniforms.map.value         = orig.metalnessMap ?? null;
        mat.uniforms.hasMap.value      = !!orig.metalnessMap;
        mat.uniforms.channelMask.value = MASK_B; // metalness → B channel (glTF)
        mat.uniforms.scalar.value      = orig.metalness;
        mat.uniforms.invert.value      = false;
        mat.uniformsNeedUpdate = true;
      };
    }

    case 'occlusion': {
      const mat    = getChannelMat();
      const geo    = mesh.geometry as THREE.BufferGeometry | undefined;
      // Respect aoMap.channel (default 0 = primary UV).
      // Warn if an unsupported channel is used; show white as fallback.
      const aoTex  = orig.aoMap ?? null;
      const uvChan = aoTex?.channel ?? 0;
      const canSample = !aoTex || uvChan === 0; // our shader only has vUv (channel 0)
      // If the mesh geometry is missing uv attributes, also disable map
      const hasUv  = !!(geo?.attributes?.['uv']);
      return function () {
        const useTex = canSample && hasUv;
        mat.uniforms.map.value         = useTex ? aoTex : null;
        mat.uniforms.hasMap.value      = !!(useTex && aoTex);
        mat.uniforms.channelMask.value = MASK_R; // occlusion → R channel (glTF)
        mat.uniforms.scalar.value      = 1.0;    // fallback = no occlusion (white)
        mat.uniforms.invert.value      = false;
        mat.uniformsNeedUpdate = true;
      };
    }

    case 'normals-tangent': {
      const mat = getTangentNormMat();
      return function () {
        mat.uniforms.normalMap.value    = orig.normalMap ?? null;
        mat.uniforms.hasNormalMap.value = !!orig.normalMap;
        mat.uniformsNeedUpdate = true;
      };
    }

    default:
      return function () {};
  }
}

// ── Resolve the primary standard material for a mesh slot ────
function _getPrimaryStdMat(
  mesh: THREE.Mesh,
): THREE.MeshStandardMaterial | null {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (mat instanceof THREE.MeshStandardMaterial) return mat as THREE.MeshStandardMaterial;
  return null;
}

// ── Map mode → which shared override material to set ─────────
function _getOverrideMat(mode: ViewportShadingMode): THREE.Material | null {
  switch (mode) {
    case 'wireframe':     return getWireframeMat();
    case 'normals-world': return getNormalWorldMat();
    case 'unlit':
    case 'albedo':        return getAlbedoMat();
    case 'emissive':      return getEmissiveMat();
    case 'roughness':
    case 'glossiness':
    case 'metalness':
    case 'occlusion':     return getChannelMat();
    case 'normals-tangent': return getTangentNormMat();
    default:              return null;
  }
}

// ── Whether mode needs per-mesh onBeforeRender callbacks ─────
function _needsCallbacks(mode: ViewportShadingMode): boolean {
  return mode !== 'lit' &&
    mode !== 'wireframe' &&
    mode !== 'normals-world';
}

// ── Internal restore (does NOT touch _currentMode) ──────────
function _doRestore(): void {
  // Restore onBeforeRender callbacks — iterate _stored directly
  // so we handle scene changes (mesh may no longer be in the scene)
  for (const [mesh, { onBefore }] of _stored) {
    mesh.onBeforeRender = onBefore;
  }
  _stored.clear();

  if (_activeRenderer) {
    (_activeRenderer as any).overrideMaterial = null;
  }
  _activeRenderer = null;
}

// ── Public API ───────────────────────────────────────────────

export function applyDebugMode(
  mode: ViewportShadingMode,
  scene: THREE.Object3D,
  renderer: THREE.WebGLRenderer,
): void {
  // Clean up any previous mode
  _doRestore();
  _currentMode = mode;

  if (mode === 'lit') return;

  _activeRenderer = renderer;
  (renderer as any).overrideMaterial = _getOverrideMat(mode);

  if (!_needsCallbacks(mode)) return;

  // Install per-mesh callbacks so the shared override material gets
  // the correct uniforms for each draw call
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const orig = _getPrimaryStdMat(obj);
    if (!orig) return; // skip gizmos / helper meshes that have non-standard materials

    const origOnBefore = obj.onBeforeRender;
    _stored.set(obj, { onBefore: origOnBefore });
    obj.onBeforeRender = _makeCallback(mode, orig, obj);
  });
}

export function restoreDebugMode(
  _scene: THREE.Object3D,
  _renderer: THREE.WebGLRenderer,
): void {
  _doRestore();
  _currentMode = 'lit';
}
