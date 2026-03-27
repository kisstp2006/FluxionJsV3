// Volumetric Fog — ray marching with height falloff, Henyey-Greenstein scattering,
// FogVolume instances (Box / Ellipsoid / World), full light support
// (directional, point, spot — mirrors Godot's volumetric fog lighting model).
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform mat4 invProjMatrix;
uniform mat4 invViewMatrix;
uniform vec3 cameraPos;
uniform float cameraNear;
uniform float cameraFar;

// Global fog
uniform float fogDensity;
uniform vec3  fogAlbedo;
uniform float fogScatter;       // Henyey-Greenstein g [-1..1]
uniform float fogAbsorption;    // extinction multiplier
uniform float fogHeightBase;    // world Y below which density = fogDensity
uniform float fogHeightFalloff; // exp falloff above fogHeightBase
uniform vec3  fogEmission;      // self-emission color
uniform float fogEmissionEnergy;
uniform float fogAffectSky;     // [0-1] blend fog over sky pixels too
uniform int   fogSteps;
uniform float fogMaxDistance;

// Lights (directional + point + spot — up to 8)
#define MAX_LIGHTS 8
uniform int   fogLightCount;
uniform int   fogLightType[MAX_LIGHTS];      // 0=directional 1=point 2=spot
uniform vec3  fogLightPos[MAX_LIGHTS];       // world position (point/spot)
uniform vec3  fogLightDir[MAX_LIGHTS];       // direction FROM light (directional/spot), normalized
uniform vec3  fogLightColor[MAX_LIGHTS];
uniform float fogLightIntensity[MAX_LIGHTS];
uniform float fogLightRange[MAX_LIGHTS];     // point/spot falloff radius
uniform float fogLightOuterCos[MAX_LIGHTS];  // cos(outerAngle) for spot
uniform float fogLightInnerCos[MAX_LIGHTS];  // cos(innerAngle) for spot

// FogVolumes (up to 8)
#define MAX_VOLUMES 8
uniform int   fogVolumeCount;
uniform vec3  fogVolumePos[MAX_VOLUMES];
uniform vec3  fogVolumeSize[MAX_VOLUMES];
uniform int   fogVolumeShape[MAX_VOLUMES];   // 0=box 1=ellipsoid 2=world
uniform float fogVolumeDensity[MAX_VOLUMES];
uniform vec3  fogVolumeAlbedo[MAX_VOLUMES];
uniform vec3  fogVolumeEmission[MAX_VOLUMES];
uniform float fogVolumeEmissionEnergy[MAX_VOLUMES];
uniform float fogVolumeNegative[MAX_VOLUMES];

varying vec2 vUv;

#define PI 3.14159265359

// ── Utilities ────────────────────────────────────────────────

float linearizeDepth(float depth) {
  return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
}

// Henyey-Greenstein phase function
float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.0001), 1.5));
}

// Point/spot distance falloff — matches Three.js inverse-square with hard cutoff
float distAttenuation(float dist, float range) {
  float x = clamp(dist / max(range, 0.001), 0.0, 1.0);
  // Smooth polynomial falloff: 1 at center, 0 at edge
  float atten = (1.0 - x * x);
  return atten * atten;
}

// Spot cone attenuation — smooth blend between inner and outer cone
float spotAttenuation(vec3 toLightNorm, vec3 lightDir, float outerCos, float innerCos) {
  // toLightNorm: direction FROM sample TOWARD light
  // lightDir: direction the spot points (FROM the fixture)
  float cosTheta = dot(toLightNorm, -lightDir);
  return smoothstep(outerCos, innerCos, cosTheta);
}

// Box SDF — returns factor [0,1], 1 inside box
float boxWeight(vec3 p, vec3 center, vec3 halfSize) {
  vec3 d = abs(p - center) - halfSize;
  float inside = -max(d.x, max(d.y, d.z));
  float edgeSize = max(min(halfSize.x, min(halfSize.y, halfSize.z)) * 0.1, 0.001);
  return clamp(inside / edgeSize, 0.0, 1.0);
}

// Ellipsoid SDF — returns factor [0,1], 1 at center, 0 at surface
float ellipsoidWeight(vec3 p, vec3 center, vec3 radii) {
  vec3 d = (p - center) / max(radii, vec3(0.001));
  float r2 = dot(d, d);
  return clamp(1.0 - r2, 0.0, 1.0);
}

// ── Density / albedo / emission at world pos ─────────────────

struct FogSample {
  float density;
  vec3  albedo;
  vec3  emission;
};

FogSample sampleFog(vec3 pos) {
  float heightDiff   = pos.y - fogHeightBase;
  float heightFactor = exp(-max(0.0, heightDiff) * fogHeightFalloff);
  float globalDensity = fogDensity * heightFactor;

  vec3  albedo   = fogAlbedo * globalDensity;
  vec3  emission = fogEmission * fogEmissionEnergy * globalDensity;
  float density  = globalDensity;

  for (int i = 0; i < MAX_VOLUMES; i++) {
    if (i >= fogVolumeCount) break;

    float w = 0.0;
    int shape = fogVolumeShape[i];
    if (shape == 0) {
      w = boxWeight(pos, fogVolumePos[i], fogVolumeSize[i]);
    } else if (shape == 1) {
      w = ellipsoidWeight(pos, fogVolumePos[i], fogVolumeSize[i]);
    } else {
      w = 1.0;
    }

    float vd  = fogVolumeDensity[i] * w;
    float neg = fogVolumeNegative[i];

    if (neg > 0.5) {
      density = max(0.0, density - vd);
      albedo  = max(vec3(0.0), albedo - fogVolumeAlbedo[i] * vd);
    } else {
      density  += vd;
      albedo   += fogVolumeAlbedo[i] * vd;
      emission += fogVolumeEmission[i] * fogVolumeEmissionEnergy[i] * vd;
    }
  }

  FogSample s;
  s.density  = max(0.0, density);
  s.albedo   = (s.density > 0.0001) ? albedo / s.density : fogAlbedo;
  s.emission = emission;
  return s;
}

// ── Light contribution at a sample point ─────────────────────

// Evaluates all lights at position `pos` for a ray marching in `rayDir`.
// Returns the total in-scattered radiance (before density & step weighting).
vec3 evaluateLights(vec3 pos, vec3 rayDir, vec3 albedo) {
  vec3 total = vec3(0.0);

  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= fogLightCount) break;

    int   lt        = fogLightType[i];
    vec3  lcolor    = fogLightColor[i] * fogLightIntensity[i];
    float phase;
    float atten     = 1.0;

    if (lt == 0) {
      // ── Directional light ──────────────────────────────────────
      // Phase is constant per-ray (direction doesn't change along ray).
      // fogLightDir[i] = normalized direction FROM light (same as sunDirection).
      phase = hgPhase(dot(rayDir, -fogLightDir[i]), fogScatter);

    } else if (lt == 1) {
      // ── Point light ────────────────────────────────────────────
      vec3  toLight     = fogLightPos[i] - pos;
      float dist        = length(toLight);
      vec3  toLightNorm = toLight / max(dist, 0.0001);
      phase             = hgPhase(dot(rayDir, toLightNorm), fogScatter);
      atten             = distAttenuation(dist, fogLightRange[i]);

    } else {
      // ── Spot light ─────────────────────────────────────────────
      vec3  toLight     = fogLightPos[i] - pos;
      float dist        = length(toLight);
      vec3  toLightNorm = toLight / max(dist, 0.0001);
      phase             = hgPhase(dot(rayDir, toLightNorm), fogScatter);
      float distAtten   = distAttenuation(dist, fogLightRange[i]);
      float coneAtten   = spotAttenuation(toLightNorm, fogLightDir[i], fogLightOuterCos[i], fogLightInnerCos[i]);
      atten             = distAtten * coneAtten;
    }

    total += lcolor * phase * atten * albedo;
  }

  return total;
}

// ── Main ─────────────────────────────────────────────────────

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 viewDir4 = invProjMatrix * vec4(ndc, -1.0, 1.0);
  vec3 viewDir  = viewDir4.xyz / viewDir4.w;
  vec3 worldDir = normalize((invViewMatrix * vec4(viewDir, 0.0)).xyz);

  float rawDepth       = texture2D(tDepth, vUv).r;
  float linearZ        = linearizeDepth(rawDepth);
  float viewDirZ       = abs(normalize(viewDir).z);
  float sceneWorldDist = linearZ / max(viewDirZ, 0.0001);

  bool  isSky = (rawDepth >= 0.9999);
  float tMax  = isSky ? fogMaxDistance * fogAffectSky : min(sceneWorldDist, fogMaxDistance);

  if (tMax <= 0.001) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  int   steps    = max(4, min(fogSteps, 64));
  float stepSize = tMax / float(steps);

  float jitter = fract(sin(dot(vUv * 453.7, vec2(12.9898, 78.233))) * 43758.5453);
  float t = stepSize * (0.5 + jitter * 0.5);

  float transmittance = 1.0;
  vec3  inscattering  = vec3(0.0);

  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    if (transmittance < 0.01) break;

    vec3 pos = cameraPos + worldDir * t;
    FogSample s = sampleFog(pos);

    if (s.density > 0.0001) {
      float extinction  = s.density * fogAbsorption * stepSize;
      float sampleTrans = exp(-extinction);

      // All light sources (directional + point + spot)
      vec3 lightContrib = evaluateLights(pos, worldDir, s.albedo);

      // Self-emission
      vec3 emissionContrib = s.emission;

      inscattering += (lightContrib + emissionContrib) * transmittance * (1.0 - sampleTrans);
      transmittance *= sampleTrans;
    }

    t += stepSize;
  }

  gl_FragColor = vec4(inscattering, transmittance);
}
