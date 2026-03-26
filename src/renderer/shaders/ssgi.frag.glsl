// SSGI — Screen-Space Global Illumination (WickedEngine-inspired)
// Golden angle spiral sampling with cosine-weighted normal falloff,
// depth rejection, and distance-based attenuation for smooth indirect lighting.
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform vec2 depthResolution;
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
// If > 0.5: interpret giRadius directly as screen-space pixel radius.
// If <= 0.5: interpret giRadius as world-space radius and project it.
uniform float screenSpaceSampling;
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
  vec2 texel = 1.0 / depthResolution;
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

  int totalSamples = int(sliceCountI) * int(stepCountI);

  float fov = atan(1.0 / projMatrix[1][1]);
  float halfProjScale = resolution.y / (2.0 * tan(fov));
  float screenRadiusWorld = giRadius * halfProjScale / max(abs(P.z), 0.1);
  float screenRadius = mix(screenRadiusWorld, giRadius, clamp(screenSpaceSampling, 0.0, 1.0));
  screenRadius = clamp(screenRadius, 4.0, resolution.y * 0.5);

  float totalAO = 0.0;
  vec3 totalGI = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 128; i++) {
    if (i >= totalSamples) break;

    float fi = float(i);
    float angle = fi * GOLDEN_ANGLE + noise * PI * 2.0;
    float r = sqrt((fi + 0.5) / float(totalSamples)) * screenRadius;

    if (r < 1.0) continue;

    vec2 sampleUV = vUv + vec2(cos(angle), sin(angle)) * r / resolution;

    if (sampleUV.x <= 0.0 || sampleUV.x >= 1.0 || sampleUV.y <= 0.0 || sampleUV.y >= 1.0) continue;

    vec3 sampleP = getViewPos(sampleUV);
    vec3 toSample = sampleP - P;
    float dist = length(toSample);

    if (dist < 0.001) continue;

    vec3 toSampleDir = toSample / dist;

    float NdotS = dot(N, toSampleDir);
    if (NdotS <= 0.0) continue;

    float depthDiff = abs(sampleP.z - P.z);
    float depthReject = 1.0 - smoothstep(giRadius * giThickness, giRadius * giThickness * 2.0, depthDiff);
    if (depthReject <= 0.0) continue;

    float distWeight = 1.0 - smoothstep(0.0, giRadius, dist);
    distWeight = pow(distWeight, giExpFactor);

    float weight = NdotS * depthReject * distWeight;

    totalAO += NdotS * depthReject;
    totalWeight += 1.0;

    vec3 sampleColor = texture2D(tScene, sampleUV).rgb;

    if (backfaceLighting < 0.99) {
      vec3 sampleN = getNormal(sampleUV);
      float backW = mix(max(dot(sampleN, -toSampleDir), 0.0), 1.0, backfaceLighting);
      sampleColor *= backW;
    }

    totalGI += sampleColor * weight;
  }

  float ao = 1.0;
  if (totalWeight > 0.0) {
    float avgAO = totalAO / totalWeight;
    ao = clamp(pow(1.0 - avgAO, aoIntensity), 0.0, 1.0);
    totalGI /= totalWeight;
  }

  totalGI *= giIntensity;

  // Firefly clamp
  float lum = dot(totalGI, vec3(0.2126, 0.7152, 0.0722));
  float maxLum = 5.0;
  if (lum > maxLum) totalGI *= maxLum / lum;

  gl_FragColor = vec4(totalGI, ao);
}
