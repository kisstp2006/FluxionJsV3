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
