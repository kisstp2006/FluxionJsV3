// ============================================================
// FluxionJS V2 — Post-Processing Pipeline
// Nuake-inspired: Bloom, SSAO, SSR, Volumetrics, DOF, Vignette
// ============================================================

import * as THREE from 'three';

// Custom full-screen quad pass helper
class FullScreenPass {
  private fsQuad: THREE.Mesh;
  private camera: THREE.OrthographicCamera;

  constructor(material: THREE.ShaderMaterial) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target);
    renderer.render(this.fsQuad as any as THREE.Scene, this.camera);
  }

  get material(): THREE.ShaderMaterial {
    return this.fsQuad.material as THREE.ShaderMaterial;
  }

  dispose(): void {
    this.fsQuad.geometry.dispose();
    (this.fsQuad.material as THREE.ShaderMaterial).dispose();
  }
}

// ── Shader Snippets ──

const BLOOM_BRIGHT_FRAG = `
  uniform sampler2D tDiffuse;
  uniform float threshold;
  uniform float softKnee;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float knee = threshold * softKnee;
    float soft = brightness - threshold + knee;
    soft = clamp(soft, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 0.0001);
    float contribution = max(soft, brightness - threshold) / max(brightness, 0.0001);
    gl_FragColor = vec4(color.rgb * contribution, 1.0);
  }
`;

const BLUR_FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2 direction;
  uniform vec2 resolution;
  varying vec2 vUv;
  void main() {
    vec2 off1 = vec2(1.3846153846) * direction / resolution;
    vec2 off2 = vec2(3.2307692308) * direction / resolution;
    vec4 color = texture2D(tDiffuse, vUv) * 0.2270270270;
    color += texture2D(tDiffuse, vUv + off1) * 0.3162162162;
    color += texture2D(tDiffuse, vUv - off1) * 0.3162162162;
    color += texture2D(tDiffuse, vUv + off2) * 0.0702702703;
    color += texture2D(tDiffuse, vUv - off2) * 0.0702702703;
    gl_FragColor = color;
  }
`;

const COMPOSITE_FRAG = `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tSSAO;
  uniform sampler2D tSSR;
  uniform sampler2D tSSGI;
  uniform sampler2D tClouds;
  uniform float bloomStrength;
  uniform float bloomRadius;
  uniform float vignetteIntensity;
  uniform float vignetteRoundness;
  uniform float exposure;
  uniform bool ssaoEnabled;
  uniform bool ssrEnabled;
  uniform bool ssgiEnabled;
  uniform bool cloudsEnabled;
  varying vec2 vUv;

  vec3 acesFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;

    // SSGI — indirect illumination + AO (overrides SSAO when active)
    float ao = 1.0;
    if (ssgiEnabled) {
      vec4 gi = texture2D(tSSGI, vUv);
      ao = gi.a;
      scene += gi.rgb;
    } else if (ssaoEnabled) {
      ao = texture2D(tSSAO, vUv).r;
    }
    scene *= ao;

    // SSR — screen-space reflections
    if (ssrEnabled) {
      vec4 ssr = texture2D(tSSR, vUv);
      scene = mix(scene, ssr.rgb, ssr.a);
    }

    // Volumetric clouds
    if (cloudsEnabled) {
      vec4 clouds = texture2D(tClouds, vUv);
      scene = mix(scene, clouds.rgb, 1.0 - clouds.a);
    }

    // Combine bloom
    vec3 color = scene + bloom * bloomStrength;

    // Exposure
    color *= exposure;

    // Vignette
    vec2 uv = vUv * 2.0 - 1.0;
    float vignette = 1.0 - dot(uv * vignetteRoundness, uv * vignetteRoundness);
    vignette = clamp(pow(vignette, vignetteIntensity), 0.0, 1.0);
    color *= vignette;

    // Tone mapping (ACES)
    color = acesFilm(color);

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const SSAO_FRAG = `
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform float radius;
  uniform float bias;
  uniform float intensity;
  uniform mat4 projMatrix;
  uniform mat4 invProjMatrix;
  uniform float cameraNear;
  uniform float cameraFar;
  varying vec2 vUv;

  float linearizeDepth(float d) {
    return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
  }

  vec3 getViewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    vec4 clipPos = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 viewPos = invProjMatrix * clipPos;
    return viewPos.xyz / viewPos.w;
  }

  vec3 getNormal(vec2 uv) {
    vec3 p  = getViewPos(uv);
    vec3 px = getViewPos(uv + vec2(1.0 / resolution.x, 0.0));
    vec3 py = getViewPos(uv + vec2(0.0, 1.0 / resolution.y));
    return normalize(cross(px - p, py - p));
  }

  // Simple hash for noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float depth = texture2D(tDepth, vUv).r;
    if (depth >= 1.0) { gl_FragColor = vec4(1.0); return; }

    vec3 viewPos = getViewPos(vUv);
    vec3 normal = getNormal(vUv);

    float occlusion = 0.0;
    const int SAMPLES = 16;
    float angleStep = 6.283185307 / float(SAMPLES);
    float noiseAngle = hash(vUv * resolution) * 6.283185307;

    for (int i = 0; i < SAMPLES; i++) {
      float angle = float(i) * angleStep + noiseAngle;
      float r = radius * (0.5 + 0.5 * hash(vUv * resolution + float(i)));
      vec2 offset = vec2(cos(angle), sin(angle)) * r / resolution;
      vec3 samplePos = getViewPos(vUv + offset);
      vec3 diff = samplePos - viewPos;
      float dist = length(diff);
      float ndotv = max(dot(normal, diff / (dist + 0.0001)), 0.0);
      float rangeCheck = smoothstep(0.0, 1.0, radius / (abs(viewPos.z - samplePos.z) + 0.0001));
      occlusion += ndotv * rangeCheck * step(bias, dist);
    }

    float ao = 1.0 - (occlusion / float(SAMPLES)) * intensity;
    ao = clamp(ao, 0.0, 1.0);
    gl_FragColor = vec4(vec3(ao), 1.0);
  }
`;

// ── SSR Shader — Screen-Space Reflections via ray marching on depth buffer ──
const SSR_FRAG = `
  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform mat4 projMatrix;
  uniform mat4 invProjMatrix;
  uniform float maxDistance;
  uniform float thickness;
  uniform float stride;
  uniform float fresnel;
  uniform float opacity;
  uniform float cameraNear;
  uniform float cameraFar;
  varying vec2 vUv;

  vec3 getViewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    vec4 clipPos = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 viewPos = invProjMatrix * clipPos;
    return viewPos.xyz / viewPos.w;
  }

  vec3 getNormal(vec2 uv) {
    vec3 p  = getViewPos(uv);
    vec3 px = getViewPos(uv + vec2(1.0 / resolution.x, 0.0));
    vec3 py = getViewPos(uv + vec2(0.0, 1.0 / resolution.y));
    return normalize(cross(px - p, py - p));
  }

  vec2 viewToScreen(vec3 viewPos) {
    vec4 clip = projMatrix * vec4(viewPos, 1.0);
    vec2 ndc = clip.xy / clip.w;
    return ndc * 0.5 + 0.5;
  }

  void main() {
    float depth = texture2D(tDepth, vUv).r;
    if (depth >= 1.0) { gl_FragColor = vec4(0.0); return; }

    vec3 viewPos = getViewPos(vUv);
    vec3 normal = getNormal(vUv);
    vec3 viewDir = normalize(viewPos);
    vec3 reflectDir = reflect(viewDir, normal);

    // Fresnel (Schlick approximation)
    float NdotV = max(dot(normal, -viewDir), 0.0);
    float fresnelFactor = pow(1.0 - NdotV, 5.0) * fresnel + (1.0 - fresnel);

    // Ray march in view space
    float stepSize = stride;
    vec3 rayPos = viewPos;
    vec3 hitColor = vec3(0.0);
    float confidence = 0.0;

    const int MAX_STEPS = 64;
    for (int i = 0; i < MAX_STEPS; i++) {
      rayPos += reflectDir * stepSize;

      // Adaptive step size — grows with distance
      stepSize *= 1.05;

      // Check if we've gone too far
      float traveled = length(rayPos - viewPos);
      if (traveled > maxDistance) break;

      vec2 screenUV = viewToScreen(rayPos);

      // Out of bounds
      if (screenUV.x < 0.0 || screenUV.x > 1.0 || screenUV.y < 0.0 || screenUV.y > 1.0) break;

      // Compare depth
      vec3 sampleViewPos = getViewPos(screenUV);
      float depthDiff = rayPos.z - sampleViewPos.z;

      if (depthDiff > 0.0 && depthDiff < thickness) {
        // Hit! — Binary refinement (4 steps)
        vec3 lo = rayPos - reflectDir * stepSize;
        vec3 hi = rayPos;
        for (int j = 0; j < 4; j++) {
          vec3 mid = (lo + hi) * 0.5;
          vec2 midUV = viewToScreen(mid);
          vec3 midSample = getViewPos(midUV);
          if (mid.z - midSample.z > 0.0) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        vec2 hitUV = viewToScreen(hi);
        hitColor = texture2D(tScene, hitUV).rgb;

        // Edge fade — reduce confidence near screen edges
        vec2 edgeFade = smoothstep(vec2(0.0), vec2(0.05), hitUV) * (1.0 - smoothstep(vec2(0.95), vec2(1.0), hitUV));
        float edge = edgeFade.x * edgeFade.y;

        // Distance fade
        float distFade = 1.0 - clamp(traveled / maxDistance, 0.0, 1.0);

        confidence = fresnelFactor * edge * distFade * opacity;
        break;
      }
    }

    gl_FragColor = vec4(hitColor, confidence);
  }
`;

// ── SSGI Shader — Screen-Space Global Illumination (GTAO-based horizon tracing) ──
const SSGI_FRAG = `
  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform mat4 projMatrix;
  uniform mat4 invProjMatrix;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float giRadius;
  uniform float giThickness;
  uniform float giExpFactor;
  uniform float aoIntensity;
  uniform float giIntensity;
  uniform int sliceCountI;
  uniform int stepCountI;
  varying vec2 vUv;

  #define PI 3.14159265359
  #define HALF_PI 1.5707963268

  vec3 getViewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    vec4 clipPos = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 viewPos = invProjMatrix * clipPos;
    return viewPos.xyz / viewPos.w;
  }

  vec3 getNormal(vec2 uv) {
    vec3 p  = getViewPos(uv);
    vec3 px = getViewPos(uv + vec2(1.0 / resolution.x, 0.0));
    vec3 py = getViewPos(uv + vec2(0.0, 1.0 / resolution.y));
    return normalize(cross(px - p, py - p));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float interleavedGradientNoise(vec2 coord) {
    return fract(52.9829189 * fract(0.06711056 * coord.x + 0.00583715 * coord.y));
  }

  void main() {
    float depth = texture2D(tDepth, vUv).r;
    if (depth >= 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

    vec3 viewPos = getViewPos(vUv);
    vec3 viewNormal = getNormal(vUv);
    vec3 viewDir = normalize(-viewPos);

    vec2 pixelCoord = vUv * resolution;
    float noiseDir = interleavedGradientNoise(pixelCoord);
    float noiseOffset = hash(pixelCoord * 0.123);

    float totalAO = 0.0;
    vec3 totalGI = vec3(0.0);
    float halfProjScale = resolution.y / (2.0 * tan(atan(1.0 / projMatrix[1][1])));

    int sliceCount = sliceCountI;
    int stepCount = stepCountI;

    for (int s = 0; s < 4; s++) {
      if (s >= sliceCount) break;

      float rotAngle = (float(s) + noiseDir) * PI / float(sliceCount);
      vec2 sliceDir = vec2(cos(rotAngle), sin(rotAngle));
      vec2 texelStep = sliceDir / resolution;

      // Tangent-based projected normal for this slice
      vec3 sliceNormal = normalize(cross(vec3(sliceDir, 0.0), viewDir));
      vec3 tangent = cross(viewDir, sliceNormal);
      vec3 projNorm = viewNormal - sliceNormal * dot(viewNormal, sliceNormal);
      float cosN = clamp(dot(normalize(projNorm), viewDir), -1.0, 1.0);
      float n = -sign(dot(projNorm, tangent)) * acos(cosN);

      float maxStepRadius = max(giRadius * halfProjScale / abs(viewPos.z), float(stepCount));
      float stepRadius = maxStepRadius / (float(stepCount) + 1.0);

      float occBits = 0.0;
      int occCount = 0;

      // March both directions (+/-)
      for (int dir = 0; dir < 2; dir++) {
        float dirSign = dir == 0 ? 1.0 : -1.0;

        for (int t = 0; t < 32; t++) {
          if (t >= stepCount) break;

          float offset = pow(abs(stepRadius * (float(t) + noiseOffset) / maxStepRadius), giExpFactor) * maxStepRadius;
          vec2 sampleUV = vUv + texelStep * max(offset, float(t) + 1.0) * dirSign;

          // Bounds check
          if (sampleUV.x <= 0.0 || sampleUV.x >= 1.0 || sampleUV.y <= 0.0 || sampleUV.y >= 1.0) break;

          vec3 sampleViewPos = getViewPos(sampleUV);
          vec3 toSample = sampleViewPos - viewPos;
          float dist = length(toSample);
          if (dist < 0.001) continue;
          vec3 toSampleDir = toSample / dist;

          // Horizon angle test
          float horizonAngle = dot(toSampleDir, viewDir);
          float backHorizon = dot(normalize(sampleViewPos - viewDir * giThickness - viewPos), viewDir);

          float frontH = clamp((-dirSign * acos(clamp(horizonAngle, -1.0, 1.0)) - n + HALF_PI) / PI, 0.0, 1.0);
          float backH = clamp((-dirSign * acos(clamp(backHorizon, -1.0, 1.0)) - n + HALF_PI) / PI, 0.0, 1.0);
          float minH = min(frontH, backH);
          float maxH = max(frontH, backH);

          float visibility = maxH - minH;
          if (visibility > 0.01) {
            occCount++;

            // GI: read beauty at sample, weight by normal dot
            float NdotL = clamp(dot(viewNormal, toSampleDir), 0.0, 1.0);
            if (NdotL > 0.001) {
              vec3 sampleColor = texture2D(tScene, sampleUV).rgb;
              vec3 sampleNormal = getNormal(sampleUV);
              float lightNdotL = clamp(dot(sampleNormal, -toSampleDir), 0.0, 1.0);
              totalGI += sampleColor * NdotL * lightNdotL * visibility;
            }
          }
        }
      }

      totalAO += float(occCount) / (2.0 * float(stepCount));
    }

    totalAO /= float(sliceCount);
    float ao = clamp(pow(1.0 - totalAO, aoIntensity), 0.0, 1.0);

    totalGI /= float(sliceCount);
    totalGI *= giIntensity;

    // Clamp GI luminance to prevent fireflies
    float lum = dot(totalGI, vec3(0.2126, 0.7152, 0.0722));
    float maxLum = 7.0;
    if (lum > maxLum) totalGI *= maxLum / lum;

    gl_FragColor = vec4(totalGI, ao);
  }
`;

// ── Volumetric Clouds Shader — Ray marching through cloud slab with FBM noise ──
const CLOUD_FRAG = `
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform mat4 invProjMatrix;
  uniform mat4 invViewMatrix;
  uniform vec3 cameraPos;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float cloudMinHeight;
  uniform float cloudMaxHeight;
  uniform float cloudCoverage;
  uniform float cloudDensity;
  uniform float cloudAbsorption;
  uniform float cloudScatter;
  uniform vec3 cloudColor;
  uniform vec3 sunDirection;
  uniform float time;
  uniform float cloudSpeed;
  varying vec2 vUv;

  #define PI 3.14159265359
  #define CLOUD_STEPS 32
  #define LIGHT_STEPS 4

  // Simple value noise
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
          mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
          mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.01;
      a *= 0.5;
    }
    return v;
  }

  float cloudDensityAt(vec3 pos) {
    // Height-based fade
    float heightFrac = (pos.y - cloudMinHeight) / max(cloudMaxHeight - cloudMinHeight, 1.0);
    float heightFade = 4.0 * heightFrac * (1.0 - heightFrac);

    vec3 samplePos = pos * 0.002 + vec3(time * cloudSpeed * 0.01, 0.0, 0.0);
    float n = fbm(samplePos);
    float density = clamp(n - (1.0 - cloudCoverage), 0.0, 1.0) * cloudDensity * heightFade;
    return density;
  }

  // Henyey-Greenstein phase function
  float hgPhase(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
  }

  float lightMarch(vec3 pos) {
    float stepSize = (cloudMaxHeight - pos.y) / float(LIGHT_STEPS);
    float totalDensity = 0.0;
    for (int i = 0; i < LIGHT_STEPS; i++) {
      pos += sunDirection * stepSize;
      totalDensity += cloudDensityAt(pos) * stepSize;
    }
    return exp(-totalDensity * cloudAbsorption);
  }

  // Ray-plane intersection with y=h
  float intersectPlane(vec3 ro, vec3 rd, float h) {
    return (h - ro.y) / rd.y;
  }

  void main() {
    // Reconstruct world-space ray via proper inverse projection
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 viewPos4 = invProjMatrix * vec4(ndc, -1.0, 1.0);
    vec3 viewDir = viewPos4.xyz / viewPos4.w;               // perspective divide
    vec3 worldDir = normalize((invViewMatrix * vec4(viewDir, 0.0)).xyz);
    vec3 ro = cameraPos;

    // Scene depth — linearize depth buffer to view-space Z
    float sceneDepth = texture2D(tDepth, vUv).r;
    float sceneLinearZ = cameraNear * cameraFar / (cameraFar - sceneDepth * (cameraFar - cameraNear));
    // Convert view-space Z to ray distance using the SAME view direction
    float rayVsZ = abs(normalize(viewDir).z);
    float sceneWorldDist = sceneLinearZ / max(rayVsZ, 0.0001);

    // Intersect cloud slab
    float tMin = intersectPlane(ro, worldDir, cloudMinHeight);
    float tMax = intersectPlane(ro, worldDir, cloudMaxHeight);
    if (tMin > tMax) { float tmp = tMin; tMin = tMax; tMax = tmp; }
    tMin = max(tMin, 0.0);

    // Clamp tMax to scene depth — clouds behind objects are not rendered
    tMax = min(tMax, sceneWorldDist);
    tMin = min(tMin, sceneWorldDist);

    // No intersection or behind camera
    if (tMax < 0.0 || tMin >= tMax) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

    float stepSize = (tMax - tMin) / float(CLOUD_STEPS);
    float transmittance = 1.0;
    vec3 scatteredLight = vec3(0.0);

    float cosAngle = dot(worldDir, sunDirection);
    float phase = mix(hgPhase(cosAngle, 0.3), hgPhase(cosAngle, -0.3), 0.3);

    // Jitter start position with noise
    float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
    float t = tMin + stepSize * jitter;

    for (int i = 0; i < CLOUD_STEPS; i++) {
      if (transmittance < 0.01) break;

      vec3 pos = ro + worldDir * t;
      float d = cloudDensityAt(pos);

      if (d > 0.001) {
        float lightAtten = lightMarch(pos);
        float scatter = d * stepSize * cloudAbsorption;
        vec3 luminance = cloudColor * (lightAtten * phase * cloudScatter + 0.15);
        scatteredLight += luminance * scatter * transmittance;
        transmittance *= exp(-scatter);
      }

      t += stepSize;
    }

    gl_FragColor = vec4(scatteredLight, transmittance);
  }
`;

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// ── Post-Processing Pipeline ──

export interface PostProcessConfig {
  bloom?: {
    enabled?: boolean;
    threshold?: number;
    strength?: number;
    radius?: number;
    softKnee?: number;
  };
  ssao?: {
    enabled?: boolean;
    radius?: number;
    bias?: number;
    intensity?: number;
  };
  ssr?: {
    enabled?: boolean;
    maxDistance?: number;
    thickness?: number;
    stride?: number;
    fresnel?: number;
    opacity?: number;
    resolutionScale?: number;
  };
  ssgi?: {
    enabled?: boolean;
    sliceCount?: number;
    stepCount?: number;
    radius?: number;
    thickness?: number;
    expFactor?: number;
    aoIntensity?: number;
    giIntensity?: number;
  };
  clouds?: {
    enabled?: boolean;
    minHeight?: number;
    maxHeight?: number;
    coverage?: number;
    density?: number;
    absorption?: number;
    scatter?: number;
    color?: THREE.Color;
    speed?: number;
    sunDirection?: THREE.Vector3;
  };
  vignette?: {
    enabled?: boolean;
    intensity?: number;
    roundness?: number;
  };
  exposure?: number;
}

export class PostProcessingPipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  // Render targets
  private sceneRT: THREE.WebGLRenderTarget;
  private bloomBrightRT: THREE.WebGLRenderTarget;
  private bloomBlurHRT: THREE.WebGLRenderTarget;
  private bloomBlurVRT: THREE.WebGLRenderTarget;
  private ssaoRT: THREE.WebGLRenderTarget;
  private ssrRT: THREE.WebGLRenderTarget;
  private ssgiRT: THREE.WebGLRenderTarget;
  private cloudRT: THREE.WebGLRenderTarget;

  // Passes
  private bloomBrightPass: FullScreenPass;
  private bloomBlurHPass: FullScreenPass;
  private bloomBlurVPass: FullScreenPass;
  private ssaoPass: FullScreenPass;
  private ssrPass: FullScreenPass;
  private ssgiPass: FullScreenPass;
  private cloudPass: FullScreenPass;
  private compositePass: FullScreenPass;

  // Reusable matrices
  private _invProjMatrix = new THREE.Matrix4();
  private _invViewMatrix = new THREE.Matrix4();

  // Time tracking for clouds
  private _time = 0;

  // Configuration
  config: PostProcessConfig = {
    bloom: { enabled: true, threshold: 0.8, strength: 0.5, radius: 0.4, softKnee: 0.6 },
    ssao: { enabled: false, radius: 0.5, bias: 0.025, intensity: 1.0 },
    ssr: { enabled: false, maxDistance: 50, thickness: 0.5, stride: 0.3, fresnel: 1.0, opacity: 0.5, resolutionScale: 0.5 },
    ssgi: { enabled: false, sliceCount: 2, stepCount: 8, radius: 12, thickness: 1, expFactor: 2, aoIntensity: 1, giIntensity: 10 },
    clouds: { enabled: false, minHeight: 200, maxHeight: 400, coverage: 0.5, density: 0.3, absorption: 1.0, scatter: 1.0, color: new THREE.Color(1, 1, 1), speed: 1.0, sunDirection: new THREE.Vector3(0.5, 1, 0.3).normalize() },
    vignette: { enabled: true, intensity: 0.3, roundness: 0.5 },
    exposure: 1.0,
  };

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const halfW = Math.floor(w / 2);
    const halfH = Math.floor(h / 2);

    const rtParams: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };

    // Scene RT with accessible depth texture
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      ...rtParams,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h);
    this.sceneRT.depthTexture.format = THREE.DepthFormat;
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;

    this.bloomBrightRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.bloomBlurHRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.bloomBlurVRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.ssaoRT = new THREE.WebGLRenderTarget(w, h, rtParams);
    this.ssrRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.ssgiRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.cloudRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);

    // ── Bloom bright pass ──
    this.bloomBrightPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLOOM_BRIGHT_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: 0.8 },
        softKnee: { value: 0.6 },
      },
    }));

    // ── Bloom blur passes (gaussian, 2-pass separable) ──
    this.bloomBlurHPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        direction: { value: new THREE.Vector2(1, 0) },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
      },
    }));

    this.bloomBlurVPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        direction: { value: new THREE.Vector2(0, 1) },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
      },
    }));

    // ── SSAO pass ──
    this.ssaoPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSAO_FRAG,
      uniforms: {
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(w, h) },
        radius: { value: 0.5 },
        bias: { value: 0.025 },
        intensity: { value: 1.0 },
        projMatrix: { value: new THREE.Matrix4() },
        invProjMatrix: { value: new THREE.Matrix4() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    // ── SSR pass ──
    this.ssrPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSR_FRAG,
      uniforms: {
        tScene: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
        projMatrix: { value: new THREE.Matrix4() },
        invProjMatrix: { value: new THREE.Matrix4() },
        maxDistance: { value: 50 },
        thickness: { value: 0.5 },
        stride: { value: 0.3 },
        fresnel: { value: 1.0 },
        opacity: { value: 0.5 },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    // ── SSGI pass ──
    this.ssgiPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSGI_FRAG,
      uniforms: {
        tScene: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
        projMatrix: { value: new THREE.Matrix4() },
        invProjMatrix: { value: new THREE.Matrix4() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        giRadius: { value: 12 },
        giThickness: { value: 1 },
        giExpFactor: { value: 2 },
        aoIntensity: { value: 1 },
        giIntensity: { value: 10 },
        sliceCountI: { value: 2 },
        stepCountI: { value: 8 },
      },
    }));

    // ── Cloud pass ──
    this.cloudPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: CLOUD_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
        invProjMatrix: { value: new THREE.Matrix4() },
        invViewMatrix: { value: new THREE.Matrix4() },
        cameraPos: { value: new THREE.Vector3() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        cloudMinHeight: { value: 200 },
        cloudMaxHeight: { value: 400 },
        cloudCoverage: { value: 0.5 },
        cloudDensity: { value: 0.3 },
        cloudAbsorption: { value: 1.0 },
        cloudScatter: { value: 1.0 },
        cloudColor: { value: new THREE.Color(1, 1, 1) },
        sunDirection: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
        time: { value: 0 },
        cloudSpeed: { value: 1.0 },
      },
    }));

    // ── Composite pass ──
    this.compositePass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tSSAO: { value: null },
        tSSR: { value: null },
        tSSGI: { value: null },
        tClouds: { value: null },
        bloomStrength: { value: 0.5 },
        bloomRadius: { value: 0.4 },
        vignetteIntensity: { value: 0.3 },
        vignetteRoundness: { value: 0.5 },
        exposure: { value: 1.0 },
        ssaoEnabled: { value: false },
        ssrEnabled: { value: false },
        ssgiEnabled: { value: false },
        cloudsEnabled: { value: false },
      },
    }));
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /** Update camera matrices for all passes that need them */
  private updateCameraUniforms(): void {
    this._invProjMatrix.copy((this.camera as THREE.PerspectiveCamera).projectionMatrix).invert();
    this._invViewMatrix.copy(this.camera.matrixWorld);

    const near = (this.camera as any).near ?? 0.1;
    const far = (this.camera as any).far ?? 1000;
    const projMat = (this.camera as THREE.PerspectiveCamera).projectionMatrix;

    // SSAO
    this.ssaoPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssaoPass.material.uniforms['projMatrix'].value.copy(projMat);
    this.ssaoPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
    this.ssaoPass.material.uniforms['cameraNear'].value = near;
    this.ssaoPass.material.uniforms['cameraFar'].value = far;

    // SSR
    this.ssrPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssrPass.material.uniforms['tScene'].value = this.sceneRT.texture;
    this.ssrPass.material.uniforms['projMatrix'].value.copy(projMat);
    this.ssrPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
    this.ssrPass.material.uniforms['cameraNear'].value = near;
    this.ssrPass.material.uniforms['cameraFar'].value = far;

    // SSGI
    this.ssgiPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssgiPass.material.uniforms['tScene'].value = this.sceneRT.texture;
    this.ssgiPass.material.uniforms['projMatrix'].value.copy(projMat);
    this.ssgiPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
    this.ssgiPass.material.uniforms['cameraNear'].value = near;
    this.ssgiPass.material.uniforms['cameraFar'].value = far;

    // Clouds
    this.cloudPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.cloudPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
    this.cloudPass.material.uniforms['invViewMatrix'].value.copy(this._invViewMatrix);
    this.cloudPass.material.uniforms['cameraPos'].value.copy(this.camera.position);
    this.cloudPass.material.uniforms['cameraNear'].value = near;
    this.cloudPass.material.uniforms['cameraFar'].value = far;
  }

  render(dt?: number): void {
    const bloom = this.config.bloom;
    const ssao = this.config.ssao;
    const ssr = this.config.ssr;
    const ssgi = this.config.ssgi;
    const clouds = this.config.clouds;

    // Track time for clouds
    this._time += dt ?? 0.016;

    // 1. Render scene to texture (with depth)
    //    Disable Three.js tone mapping + color space so sceneRT stays LINEAR HDR.
    //    Tone mapping is applied once in the composite shader.
    const savedToneMapping = this.renderer.toneMapping;
    const savedOutputColorSpace = this.renderer.outputColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    this.renderer.toneMapping = savedToneMapping;
    this.renderer.outputColorSpace = savedOutputColorSpace;

    // Update shared camera uniforms
    this.updateCameraUniforms();

    // 2. SSAO (only if SSGI is disabled, since SSGI provides its own AO)
    const doSSAO = !!(ssao?.enabled && !ssgi?.enabled);
    if (doSSAO) {
      this.ssaoPass.material.uniforms['radius'].value = ssao!.radius ?? 0.5;
      this.ssaoPass.material.uniforms['bias'].value = ssao!.bias ?? 0.025;
      this.ssaoPass.material.uniforms['intensity'].value = ssao!.intensity ?? 1.0;
      this.ssaoPass.render(this.renderer, this.ssaoRT);
    }

    // 3. SSGI
    const doSSGI = !!ssgi?.enabled;
    if (doSSGI) {
      this.ssgiPass.material.uniforms['giRadius'].value = ssgi!.radius ?? 12;
      this.ssgiPass.material.uniforms['giThickness'].value = ssgi!.thickness ?? 1;
      this.ssgiPass.material.uniforms['giExpFactor'].value = ssgi!.expFactor ?? 2;
      this.ssgiPass.material.uniforms['aoIntensity'].value = ssgi!.aoIntensity ?? 1;
      this.ssgiPass.material.uniforms['giIntensity'].value = ssgi!.giIntensity ?? 10;
      this.ssgiPass.material.uniforms['sliceCountI'].value = ssgi!.sliceCount ?? 2;
      this.ssgiPass.material.uniforms['stepCountI'].value = ssgi!.stepCount ?? 8;
      this.ssgiPass.render(this.renderer, this.ssgiRT);
    }

    // 4. SSR
    const doSSR = !!ssr?.enabled;
    if (doSSR) {
      this.ssrPass.material.uniforms['maxDistance'].value = ssr!.maxDistance ?? 50;
      this.ssrPass.material.uniforms['thickness'].value = ssr!.thickness ?? 0.5;
      this.ssrPass.material.uniforms['stride'].value = ssr!.stride ?? 0.3;
      this.ssrPass.material.uniforms['fresnel'].value = ssr!.fresnel ?? 1.0;
      this.ssrPass.material.uniforms['opacity'].value = ssr!.opacity ?? 0.5;
      this.ssrPass.render(this.renderer, this.ssrRT);
    }

    // 5. Bloom
    if (bloom?.enabled) {
      this.bloomBrightPass.material.uniforms['tDiffuse'].value = this.sceneRT.texture;
      this.bloomBrightPass.material.uniforms['threshold'].value = bloom.threshold ?? 0.8;
      this.bloomBrightPass.material.uniforms['softKnee'].value = bloom.softKnee ?? 0.6;
      this.bloomBrightPass.render(this.renderer, this.bloomBrightRT);

      this.bloomBlurHPass.material.uniforms['tDiffuse'].value = this.bloomBrightRT.texture;
      this.bloomBlurHPass.render(this.renderer, this.bloomBlurHRT);

      this.bloomBlurVPass.material.uniforms['tDiffuse'].value = this.bloomBlurHRT.texture;
      this.bloomBlurVPass.render(this.renderer, this.bloomBlurVRT);
    }

    // 6. Volumetric Clouds
    const doClouds = !!clouds?.enabled;
    if (doClouds) {
      this.cloudPass.material.uniforms['cloudMinHeight'].value = clouds!.minHeight ?? 200;
      this.cloudPass.material.uniforms['cloudMaxHeight'].value = clouds!.maxHeight ?? 400;
      this.cloudPass.material.uniforms['cloudCoverage'].value = clouds!.coverage ?? 0.5;
      this.cloudPass.material.uniforms['cloudDensity'].value = clouds!.density ?? 0.3;
      this.cloudPass.material.uniforms['cloudAbsorption'].value = clouds!.absorption ?? 1.0;
      this.cloudPass.material.uniforms['cloudScatter'].value = clouds!.scatter ?? 1.0;
      this.cloudPass.material.uniforms['cloudColor'].value.copy(clouds!.color ?? new THREE.Color(1, 1, 1));
      this.cloudPass.material.uniforms['sunDirection'].value.copy(clouds!.sunDirection ?? new THREE.Vector3(0.5, 1, 0.3).normalize());
      this.cloudPass.material.uniforms['time'].value = this._time;
      this.cloudPass.material.uniforms['cloudSpeed'].value = clouds!.speed ?? 1.0;
      this.cloudPass.render(this.renderer, this.cloudRT);
    }

    // 7. Composite final image
    const cu = this.compositePass.material.uniforms;
    cu['tScene'].value = this.sceneRT.texture;
    cu['tBloom'].value = bloom?.enabled ? this.bloomBlurVRT.texture : this.sceneRT.texture;
    cu['bloomStrength'].value = bloom?.enabled ? (bloom.strength ?? 0.5) : 0;
    cu['tSSAO'].value = this.ssaoRT.texture;
    cu['ssaoEnabled'].value = doSSAO;
    cu['tSSR'].value = this.ssrRT.texture;
    cu['ssrEnabled'].value = doSSR;
    cu['tSSGI'].value = this.ssgiRT.texture;
    cu['ssgiEnabled'].value = doSSGI;
    cu['tClouds'].value = this.cloudRT.texture;
    cu['cloudsEnabled'].value = doClouds;
    cu['vignetteIntensity'].value = this.config.vignette?.enabled ? (this.config.vignette.intensity ?? 0.3) : 0;
    cu['vignetteRoundness'].value = this.config.vignette?.roundness ?? 0.5;
    cu['exposure'].value = this.config.exposure ?? 1.0;
    this.compositePass.render(this.renderer, null); // output to screen
  }

  /** Render an overlay scene directly to screen (no post-processing). Clears depth only. */
  renderOverlay(overlayScene: THREE.Scene, camera: THREE.Camera): void {
    const prevAutoClear = this.renderer.autoClear;
    const prevToneMapping = this.renderer.toneMapping;
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setRenderTarget(null);
    this.renderer.clearDepth();
    this.renderer.render(overlayScene, camera);
    this.renderer.toneMapping = prevToneMapping;
    this.renderer.autoClear = prevAutoClear;
  }

  setSize(width: number, height: number): void {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);

    this.sceneRT.setSize(width, height);
    if (this.sceneRT.depthTexture) {
      this.sceneRT.depthTexture.image = { width, height };
      this.sceneRT.depthTexture.needsUpdate = true;
    }
    this.bloomBrightRT.setSize(halfW, halfH);
    this.bloomBlurHRT.setSize(halfW, halfH);
    this.bloomBlurVRT.setSize(halfW, halfH);
    this.ssaoRT.setSize(width, height);
    this.ssrRT.setSize(halfW, halfH);
    this.ssgiRT.setSize(halfW, halfH);
    this.cloudRT.setSize(halfW, halfH);

    this.bloomBlurHPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.bloomBlurVPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.ssaoPass.material.uniforms['resolution'].value.set(width, height);
    this.ssrPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.ssgiPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.cloudPass.material.uniforms['resolution'].value.set(halfW, halfH);
  }

  dispose(): void {
    this.sceneRT.dispose();
    this.bloomBrightRT.dispose();
    this.bloomBlurHRT.dispose();
    this.bloomBlurVRT.dispose();
    this.ssaoRT.dispose();
    this.ssrRT.dispose();
    this.ssgiRT.dispose();
    this.cloudRT.dispose();
    this.bloomBrightPass.dispose();
    this.bloomBlurHPass.dispose();
    this.bloomBlurVPass.dispose();
    this.ssaoPass.dispose();
    this.ssrPass.dispose();
    this.ssgiPass.dispose();
    this.cloudPass.dispose();
    this.compositePass.dispose();
  }
}
