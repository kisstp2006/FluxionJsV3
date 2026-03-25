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

// ── Dual Kawase Bloom: Downsample (half-res each step) ──
const BLOOM_DOWN_FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2 texelSize;
  varying vec2 vUv;
  void main() {
    vec2 hs = texelSize * 0.5;
    vec4 sum = texture2D(tDiffuse, vUv) * 4.0;
    sum += texture2D(tDiffuse, vUv + vec2(-hs.x, -hs.y));
    sum += texture2D(tDiffuse, vUv + vec2( hs.x, -hs.y));
    sum += texture2D(tDiffuse, vUv + vec2(-hs.x,  hs.y));
    sum += texture2D(tDiffuse, vUv + vec2( hs.x,  hs.y));
    gl_FragColor = sum / 8.0;
  }
`;

// ── Dual Kawase Bloom: Upsample (double-res each step, additive via GPU blending) ──
const BLOOM_UP_FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2 texelSize;
  uniform float radius;
  uniform float intensity;
  varying vec2 vUv;
  void main() {
    vec2 hs = texelSize * radius;
    vec4 sum = vec4(0.0);
    sum += texture2D(tDiffuse, vUv + vec2(-hs.x * 2.0, 0.0));
    sum += texture2D(tDiffuse, vUv + vec2(-hs.x,  hs.y)) * 2.0;
    sum += texture2D(tDiffuse, vUv + vec2( 0.0,  hs.y * 2.0));
    sum += texture2D(tDiffuse, vUv + vec2( hs.x,  hs.y)) * 2.0;
    sum += texture2D(tDiffuse, vUv + vec2( hs.x * 2.0, 0.0));
    sum += texture2D(tDiffuse, vUv + vec2( hs.x, -hs.y)) * 2.0;
    sum += texture2D(tDiffuse, vUv + vec2( 0.0, -hs.y * 2.0));
    sum += texture2D(tDiffuse, vUv + vec2(-hs.x, -hs.y)) * 2.0;
    gl_FragColor = sum / 12.0 * intensity;
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
    vec2 texel = 1.0 / resolution;
    vec3 c = getViewPos(uv);
    vec3 l = getViewPos(uv - vec2(texel.x, 0.0));
    vec3 r = getViewPos(uv + vec2(texel.x, 0.0));
    vec3 d = getViewPos(uv - vec2(0.0, texel.y));
    vec3 u = getViewPos(uv + vec2(0.0, texel.y));
    vec3 dr = r - c;
    vec3 dl = c - l;
    vec3 du = u - c;
    vec3 dd = c - d;
    vec3 dx = abs(dr.z) < abs(dl.z) ? dr : dl;
    vec3 dy = abs(du.z) < abs(dd.z) ? du : dd;
    return normalize(cross(dx, dy));
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

    // Per-pixel random rotation for kernel jitter
    float noiseAngle = hash(vUv * resolution) * 6.283185307;
    float cosA = cos(noiseAngle);
    float sinA = sin(noiseAngle);

    // Build TBN from reconstructed view-space normal
    vec3 up = abs(normal.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, normal));
    vec3 bitangent = cross(normal, tangent);

    float occlusion = 0.0;
    const int SAMPLES = 16;

    for (int i = 0; i < SAMPLES; i++) {
      float fi = float(i);

      // Golden-angle hemisphere distribution
      float angle = fi * 2.39996323;
      float r = sqrt((fi + 0.5) / float(SAMPLES));
      float z = sqrt(1.0 - r * r);
      vec3 hemi = vec3(r * cos(angle), r * sin(angle), z);

      // Rotate xy by random per-pixel angle
      float rx = hemi.x * cosA - hemi.y * sinA;
      float ry = hemi.x * sinA + hemi.y * cosA;
      hemi = vec3(rx, ry, hemi.z);

      // Transform hemisphere sample to view space via TBN
      vec3 sampleOffset = tangent * hemi.x + bitangent * hemi.y + normal * hemi.z;

      // Scale: distribute samples closer to center for inner detail
      float scale = 0.1 + 0.9 * (fi + 1.0) / float(SAMPLES);
      vec3 samplePoint = viewPos + sampleOffset * radius * scale;

      // Project sample back to screen UV
      vec4 proj = projMatrix * vec4(samplePoint, 1.0);
      vec2 sampleUV = (proj.xy / proj.w) * 0.5 + 0.5;

      // Read actual geometry depth at projected position
      float sampleDepth = getViewPos(sampleUV).z;

      // Range check: ignore large depth gaps (different surfaces)
      float rangeCheck = smoothstep(0.0, 1.0, radius / (abs(viewPos.z - sampleDepth) + 0.001));

      // Occluded if real geometry is closer to camera than sample point
      occlusion += step(samplePoint.z + bias, sampleDepth) * rangeCheck;
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
    vec2 texel = 1.0 / resolution;
    vec3 c = getViewPos(uv);
    vec3 l = getViewPos(uv - vec2(texel.x, 0.0));
    vec3 r = getViewPos(uv + vec2(texel.x, 0.0));
    vec3 d = getViewPos(uv - vec2(0.0, texel.y));
    vec3 u = getViewPos(uv + vec2(0.0, texel.y));
    vec3 dr = r - c;
    vec3 dl = c - l;
    vec3 du = u - c;
    vec3 dd = c - d;
    vec3 dx = abs(dr.z) < abs(dl.z) ? dr : dl;
    vec3 dy = abs(du.z) < abs(dd.z) ? du : dd;
    return normalize(cross(dx, dy));
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

// ── SSGI Shader — Screen-Space Global Illumination (WickedEngine-inspired) ──
// Uses golden angle spiral sampling with cosine-weighted normal falloff,
// depth rejection, and distance-based attenuation for smooth indirect lighting.
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
  uniform float backfaceLighting;
  varying vec2 vUv;

  #define PI 3.14159265359
  #define GOLDEN_ANGLE 2.399963

  vec3 getViewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    vec4 clipPos = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 viewPos = invProjMatrix * clipPos;
    return viewPos.xyz / viewPos.w;
  }

  vec3 getNormal(vec2 uv) {
    vec2 texel = 1.0 / resolution;
    vec3 c = getViewPos(uv);
    vec3 l = getViewPos(uv - vec2(texel.x, 0.0));
    vec3 r = getViewPos(uv + vec2(texel.x, 0.0));
    vec3 d = getViewPos(uv - vec2(0.0, texel.y));
    vec3 u = getViewPos(uv + vec2(0.0, texel.y));
    vec3 dr = r - c;
    vec3 dl = c - l;
    vec3 du = u - c;
    vec3 dd = c - d;
    vec3 dx = abs(dr.z) < abs(dl.z) ? dr : dl;
    vec3 dy = abs(du.z) < abs(dd.z) ? du : dd;
    return normalize(cross(dx, dy));
  }

  // Spatially coherent noise — produces structured dither that bilateral blur handles well
  float interleavedGradientNoise(vec2 coord) {
    return fract(52.9829189 * fract(0.06711056 * coord.x + 0.00583715 * coord.y));
  }

  void main() {
    float depth = texture2D(tDepth, vUv).r;
    if (depth >= 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

    vec3 P = getViewPos(vUv);
    vec3 N = getNormal(vUv);

    vec2 pixelCoord = vUv * resolution;
    float noise = interleavedGradientNoise(pixelCoord);

    // Total sample count = sliceCount * stepCount
    int totalSamples = int(sliceCountI) * int(stepCountI);

    // Screen-space sampling radius from world-space radius
    float fov = atan(1.0 / projMatrix[1][1]);
    float halfProjScale = resolution.y / (2.0 * tan(fov));
    float screenRadius = giRadius * halfProjScale / max(abs(P.z), 0.1);
    screenRadius = clamp(screenRadius, 4.0, resolution.y * 0.5);

    float totalAO = 0.0;
    vec3 totalGI = vec3(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < 128; i++) {
      if (i >= totalSamples) break;

      float fi = float(i);
      // Golden angle spiral with per-pixel angular jitter (coherent noise)
      float angle = fi * GOLDEN_ANGLE + noise * PI * 2.0;
      // Clean uniform-disk radius — no radial jitter
      float r = sqrt((fi + 0.5) / float(totalSamples)) * screenRadius;

      // Minimum 1 pixel step to avoid self-sampling
      if (r < 1.0) continue;

      vec2 sampleUV = vUv + vec2(cos(angle), sin(angle)) * r / resolution;

      // Bounds check
      if (sampleUV.x <= 0.0 || sampleUV.x >= 1.0 || sampleUV.y <= 0.0 || sampleUV.y >= 1.0) continue;

      vec3 sampleP = getViewPos(sampleUV);
      vec3 toSample = sampleP - P;
      float dist = length(toSample);

      if (dist < 0.001) continue;

      vec3 toSampleDir = toSample / dist;

      // Cosine-weighted normal falloff (hemisphere test)
      float NdotS = dot(N, toSampleDir);
      if (NdotS <= 0.0) continue; // sample is behind our surface plane

      // Depth rejection — reject samples too far behind in view-space
      // Compare view-space depth difference relative to radius
      float depthDiff = abs(sampleP.z - P.z);
      float depthReject = 1.0 - smoothstep(giRadius * giThickness, giRadius * giThickness * 2.0, depthDiff);
      if (depthReject <= 0.0) continue;

      // Distance attenuation (smooth falloff based on world-space radius)
      float distWeight = 1.0 - smoothstep(0.0, giRadius, dist);
      distWeight = pow(distWeight, giExpFactor);

      float weight = NdotS * depthReject * distWeight;

      // AO accumulation — count how much of the hemisphere is occluded
      totalAO += NdotS * depthReject;
      totalWeight += 1.0;

      // GI: pick up indirect color from scene buffer at sample location
      vec3 sampleColor = texture2D(tScene, sampleUV).rgb;

      // Backface attenuation — reduce contribution from samples facing away
      if (backfaceLighting < 0.99) {
        vec3 sampleN = getNormal(sampleUV);
        float backW = mix(max(dot(sampleN, -toSampleDir), 0.0), 1.0, backfaceLighting);
        sampleColor *= backW;
      }

      totalGI += sampleColor * weight;
    }

    float ao = 1.0;
    if (totalWeight > 0.0) {
      // Normalize AO: ratio of occluded hemisphere
      float avgAO = totalAO / totalWeight;
      ao = clamp(pow(1.0 - avgAO, aoIntensity), 0.0, 1.0);
      totalGI /= totalWeight;
    }

    // Scale GI by intensity
    totalGI *= giIntensity;

    // Firefly clamp to prevent single-pixel highlights
    float lum = dot(totalGI, vec3(0.2126, 0.7152, 0.0722));
    float maxLum = 5.0;
    if (lum > maxLum) totalGI *= maxLum / lum;

    gl_FragColor = vec4(totalGI, ao);
  }
`;

// ── SSGI Bilateral Blur — 2-pass separable depth-aware smoothing (9-tap per axis) ──
const SSGI_BLUR_FRAG = `
  uniform sampler2D tInput;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform vec2 direction;   // (1,0) for horizontal, (0,1) for vertical
  uniform float cameraNear;
  uniform float cameraFar;
  varying vec2 vUv;

  float linearizeDepth(float d) {
    return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
  }

  void main() {
    vec4 center = texture2D(tInput, vUv);
    float centerRawDepth = texture2D(tDepth, vUv).r;

    if (centerRawDepth >= 1.0) { gl_FragColor = center; return; }

    float centerDepth = linearizeDepth(centerRawDepth);
    float depthThreshold = centerDepth * 0.05;
    float invDepthSigma2 = 1.0 / (2.0 * depthThreshold * depthThreshold + 0.0001);

    // Gaussian weights for 13-tap kernel (sigma ~4.0)
    // Offsets: -6 .. +6
    float weights[13];
    weights[0] = 0.0044; weights[1] = 0.0175; weights[2] = 0.0540;
    weights[3] = 0.1218; weights[4] = 0.1872; weights[5] = 0.2100;
    weights[6] = 0.2100;
    weights[7] = 0.2100; weights[8] = 0.1872; weights[9] = 0.1218;
    weights[10] = 0.0540; weights[11] = 0.0175; weights[12] = 0.0044;

    vec2 texelStep = direction / resolution;

    vec4 result = vec4(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < 13; i++) {
      float offset = float(i - 6);
      vec2 sampleUV = vUv + texelStep * offset;

      vec4 sampleVal = texture2D(tInput, sampleUV);
      float sampleRawDepth = texture2D(tDepth, sampleUV).r;
      float sampleDepth = linearizeDepth(sampleRawDepth);

      float spatialW = weights[i];

      // Bilateral depth weight
      float depthDiff = centerDepth - sampleDepth;
      float depthW = exp(-depthDiff * depthDiff * invDepthSigma2);

      float w = spatialW * depthW;
      result += sampleVal * w;
      totalWeight += w;
    }

    gl_FragColor = result / totalWeight;
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
    backfaceLighting?: number;
    useLinearThickness?: boolean;
    screenSpaceSampling?: boolean;
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
  private bloomChain: THREE.WebGLRenderTarget[] = [];
  private static readonly BLOOM_LEVELS = 5;
  private ssaoRT: THREE.WebGLRenderTarget;
  private ssrRT: THREE.WebGLRenderTarget;
  private ssgiRT: THREE.WebGLRenderTarget;
  private ssgiBlurRT: THREE.WebGLRenderTarget;
  private ssgiBlurRT2: THREE.WebGLRenderTarget;
  private cloudRT: THREE.WebGLRenderTarget;

  // Passes
  private bloomBrightPass: FullScreenPass;
  private bloomDownPass: FullScreenPass;
  private bloomUpPass: FullScreenPass;
  private ssaoPass: FullScreenPass;
  private ssrPass: FullScreenPass;
  private ssgiPass: FullScreenPass;
  private ssgiBlurHPass: FullScreenPass;
  private ssgiBlurVPass: FullScreenPass;
  private cloudPass: FullScreenPass;
  private compositePass: FullScreenPass;

  // Reusable matrices
  private _invProjMatrix = new THREE.Matrix4();
  private _invViewMatrix = new THREE.Matrix4();
  private _lastProjHash = -1;
  private _lastNear = -1;
  private _lastFar = -1;

  // Time tracking for clouds
  private _time = 0;

  /** When true, an EnvironmentComponent is active and overrides project/editor PP settings */
  environmentOverride = false;

  // Configuration
  config: PostProcessConfig = {
    bloom: { enabled: true, threshold: 0.8, strength: 0.5, radius: 0.4, softKnee: 0.6 },
    ssao: { enabled: false, radius: 0.5, bias: 0.025, intensity: 1.0 },
    ssr: { enabled: false, maxDistance: 50, thickness: 0.5, stride: 0.3, fresnel: 1.0, opacity: 0.5, resolutionScale: 0.5 },
    ssgi: { enabled: false, sliceCount: 3, stepCount: 12, radius: 12, thickness: 1, expFactor: 2, aoIntensity: 1, giIntensity: 10, backfaceLighting: 0, useLinearThickness: false, screenSpaceSampling: true },
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

    // Bloom chain: progressive half-res RTs (level 0 = halfW×halfH, level 4 = halfW/16 × halfH/16)
    this.bloomChain = [];
    for (let i = 0; i < PostProcessingPipeline.BLOOM_LEVELS; i++) {
      const bw = Math.max(1, Math.floor(halfW / (1 << i)));
      const bh = Math.max(1, Math.floor(halfH / (1 << i)));
      this.bloomChain.push(new THREE.WebGLRenderTarget(bw, bh, rtParams));
    }
    this.ssaoRT = new THREE.WebGLRenderTarget(w, h, rtParams);
    this.ssrRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.ssgiRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.ssgiBlurRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.ssgiBlurRT2 = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
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

    // ── Bloom dual-kawase downsample pass ──
    this.bloomDownPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLOOM_DOWN_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: new THREE.Vector2() },
      },
    }));

    // ── Bloom dual-kawase upsample pass (additive GPU blending) ──
    this.bloomUpPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLOOM_UP_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: new THREE.Vector2() },
        radius: { value: 0.4 },
        intensity: { value: 0.25 },
      },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
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
        backfaceLighting: { value: 0 },
      },
    }));

    // ── SSGI Blur pass (2-pass separable bilateral) ──
    this.ssgiBlurHPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSGI_BLUR_FRAG,
      uniforms: {
        tInput: { value: null },
        tDepth: { value: null },
        direction: { value: new THREE.Vector2(1, 0) },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    this.ssgiBlurVPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSGI_BLUR_FRAG,
      uniforms: {
        tInput: { value: null },
        tDepth: { value: null },
        direction: { value: new THREE.Vector2(0, 1) },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
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
    const projMat = (this.camera as THREE.PerspectiveCamera).projectionMatrix;
    const near = (this.camera as any).near ?? 0.1;
    const far = (this.camera as any).far ?? 1000;

    // Quick hash of projection matrix diagonal — changes on FOV / aspect / near / far
    const projHash = projMat.elements[0] + projMat.elements[5] + projMat.elements[10] + projMat.elements[14];
    const projChanged = projHash !== this._lastProjHash || near !== this._lastNear || far !== this._lastFar;

    if (projChanged) {
      this._lastProjHash = projHash;
      this._lastNear = near;
      this._lastFar = far;
      this._invProjMatrix.copy(projMat).invert();

      // SSAO
      this.ssaoPass.material.uniforms['projMatrix'].value.copy(projMat);
      this.ssaoPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
      this.ssaoPass.material.uniforms['cameraNear'].value = near;
      this.ssaoPass.material.uniforms['cameraFar'].value = far;

      // SSR
      this.ssrPass.material.uniforms['projMatrix'].value.copy(projMat);
      this.ssrPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
      this.ssrPass.material.uniforms['cameraNear'].value = near;
      this.ssrPass.material.uniforms['cameraFar'].value = far;

      // SSGI
      this.ssgiPass.material.uniforms['projMatrix'].value.copy(projMat);
      this.ssgiPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
      this.ssgiPass.material.uniforms['cameraNear'].value = near;
      this.ssgiPass.material.uniforms['cameraFar'].value = far;

      // SSGI Blur
      this.ssgiBlurHPass.material.uniforms['cameraNear'].value = near;
      this.ssgiBlurHPass.material.uniforms['cameraFar'].value = far;
      this.ssgiBlurVPass.material.uniforms['cameraNear'].value = near;
      this.ssgiBlurVPass.material.uniforms['cameraFar'].value = far;

      // Clouds
      this.cloudPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
      this.cloudPass.material.uniforms['cameraNear'].value = near;
      this.cloudPass.material.uniforms['cameraFar'].value = far;
    }

    // Per-frame: texture bindings + view matrix (changes every frame with camera movement)
    this.ssaoPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssrPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssrPass.material.uniforms['tScene'].value = this.sceneRT.texture;
    this.ssgiPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssgiPass.material.uniforms['tScene'].value = this.sceneRT.texture;
    this.ssgiBlurHPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssgiBlurVPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.cloudPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;

    this._invViewMatrix.copy(this.camera.matrixWorld);
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
      this.ssgiPass.material.uniforms['sliceCountI'].value = Math.round(ssgi!.sliceCount ?? 2);
      this.ssgiPass.material.uniforms['stepCountI'].value = Math.round(ssgi!.stepCount ?? 8);
      this.ssgiPass.material.uniforms['backfaceLighting'].value = ssgi!.backfaceLighting ?? 0;
      this.ssgiPass.render(this.renderer, this.ssgiRT);

      // 2-pass separable bilateral blur
      this.ssgiBlurHPass.material.uniforms['tInput'].value = this.ssgiRT.texture;
      this.ssgiBlurHPass.render(this.renderer, this.ssgiBlurRT);

      this.ssgiBlurVPass.material.uniforms['tInput'].value = this.ssgiBlurRT.texture;
      this.ssgiBlurVPass.render(this.renderer, this.ssgiBlurRT2);
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
      this.bloomBrightPass.render(this.renderer, this.bloomChain[0]);

      // Downsample chain
      const du = this.bloomDownPass.material.uniforms;
      for (let i = 1; i < PostProcessingPipeline.BLOOM_LEVELS; i++) {
        const src = this.bloomChain[i - 1];
        du['tDiffuse'].value = src.texture;
        du['texelSize'].value.set(1.0 / src.width, 1.0 / src.height);
        this.bloomDownPass.render(this.renderer, this.bloomChain[i]);
      }

      // Upsample chain (additive via GPU blending — avoids read-write conflict)
      const uu = this.bloomUpPass.material.uniforms;
      uu['radius'].value = bloom.radius ?? 0.4;
      const savedAutoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      for (let i = PostProcessingPipeline.BLOOM_LEVELS - 2; i >= 0; i--) {
        const dst = this.bloomChain[i];
        uu['tDiffuse'].value = this.bloomChain[i + 1].texture;
        uu['texelSize'].value.set(1.0 / dst.width, 1.0 / dst.height);
        this.bloomUpPass.render(this.renderer, dst);
      }
      this.renderer.autoClear = savedAutoClear;
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
    cu['tBloom'].value = bloom?.enabled ? this.bloomChain[0].texture : this.sceneRT.texture;
    cu['bloomStrength'].value = bloom?.enabled ? (bloom.strength ?? 0.5) : 0;
    cu['tSSAO'].value = this.ssaoRT.texture;
    cu['ssaoEnabled'].value = doSSAO;
    cu['tSSR'].value = this.ssrRT.texture;
    cu['ssrEnabled'].value = doSSR;
    cu['tSSGI'].value = this.ssgiBlurRT2.texture;
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
    for (let i = 0; i < PostProcessingPipeline.BLOOM_LEVELS; i++) {
      this.bloomChain[i].setSize(halfW >> i, halfH >> i);
    }
    this.ssaoRT.setSize(width, height);
    this.ssrRT.setSize(halfW, halfH);
    this.ssgiRT.setSize(halfW, halfH);
    this.ssgiBlurRT.setSize(halfW, halfH);
    this.ssgiBlurRT2.setSize(halfW, halfH);
    this.cloudRT.setSize(halfW, halfH);


    this.ssaoPass.material.uniforms['resolution'].value.set(width, height);
    this.ssrPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.ssgiPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.ssgiBlurHPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.ssgiBlurVPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.cloudPass.material.uniforms['resolution'].value.set(halfW, halfH);
  }

  dispose(): void {
    this.sceneRT.dispose();
    for (const rt of this.bloomChain) rt.dispose();
    this.ssaoRT.dispose();
    this.ssrRT.dispose();
    this.ssgiRT.dispose();
    this.ssgiBlurRT.dispose();
    this.ssgiBlurRT2.dispose();
    this.cloudRT.dispose();
    this.bloomBrightPass.dispose();
    this.bloomDownPass.dispose();
    this.bloomUpPass.dispose();
    this.ssaoPass.dispose();
    this.ssrPass.dispose();
    this.ssgiPass.dispose();
    this.ssgiBlurHPass.dispose();
    this.ssgiBlurVPass.dispose();
    this.cloudPass.dispose();
    this.compositePass.dispose();
  }
}
