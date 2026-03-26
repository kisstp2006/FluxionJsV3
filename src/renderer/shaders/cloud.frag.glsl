// Volumetric Clouds — Ray marching through cloud slab with FBM noise
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
  float heightFrac = (pos.y - cloudMinHeight) / max(cloudMaxHeight - cloudMinHeight, 1.0);
  float heightFade = 4.0 * heightFrac * (1.0 - heightFrac);
  vec3 samplePos = pos * 0.002 + vec3(time * cloudSpeed * 0.01, 0.0, 0.0);
  float n = fbm(samplePos);
  return clamp(n - (1.0 - cloudCoverage), 0.0, 1.0) * cloudDensity * heightFade;
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

float intersectPlane(vec3 ro, vec3 rd, float h) {
  return (h - ro.y) / rd.y;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 viewPos4 = invProjMatrix * vec4(ndc, -1.0, 1.0);
  vec3 viewDir = viewPos4.xyz / viewPos4.w;
  vec3 worldDir = normalize((invViewMatrix * vec4(viewDir, 0.0)).xyz);
  vec3 ro = cameraPos;

  float sceneDepth = texture2D(tDepth, vUv).r;
  float sceneLinearZ = cameraNear * cameraFar / (cameraFar - sceneDepth * (cameraFar - cameraNear));
  float rayVsZ = abs(normalize(viewDir).z);
  float sceneWorldDist = sceneLinearZ / max(rayVsZ, 0.0001);

  float tMin = intersectPlane(ro, worldDir, cloudMinHeight);
  float tMax = intersectPlane(ro, worldDir, cloudMaxHeight);
  if (tMin > tMax) { float tmp = tMin; tMin = tMax; tMax = tmp; }
  tMin = max(tMin, 0.0);

  tMax = min(tMax, sceneWorldDist);
  tMin = min(tMin, sceneWorldDist);

  if (tMax < 0.0 || tMin >= tMax) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  float stepSize = (tMax - tMin) / float(CLOUD_STEPS);
  float transmittance = 1.0;
  vec3 scatteredLight = vec3(0.0);

  float cosAngle = dot(worldDir, sunDirection);
  float phase = mix(hgPhase(cosAngle, 0.3), hgPhase(cosAngle, -0.3), 0.3);

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
