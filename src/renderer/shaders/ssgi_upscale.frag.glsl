// SSGI Bilateral Upscale — half-res -> full-res depth-guided interpolation
uniform sampler2D tInput;      // half-res blurred SSGI
uniform sampler2D tDepth;      // full-res depth
uniform vec2 lowResolution;    // half-res size
uniform vec2 hiResolution;     // full-res size
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;

float linearizeDepth(float d) {
  return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
}

void main() {
  float hiDepth = linearizeDepth(texture2D(tDepth, vUv).r);

  // Sky — pass through
  if (texture2D(tDepth, vUv).r >= 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Map full-res UV to low-res texel center
  vec2 lowTexel = 1.0 / lowResolution;
  vec2 lowUV = vUv * lowResolution - 0.5;
  vec2 base = (floor(lowUV) + 0.5) * lowTexel;
  vec2 frac_ = fract(lowUV);

  // 4 nearest low-res texels (bilinear neighbourhood)
  vec2 offsets[4];
  offsets[0] = vec2(0.0, 0.0);
  offsets[1] = vec2(lowTexel.x, 0.0);
  offsets[2] = vec2(0.0, lowTexel.y);
  offsets[3] = vec2(lowTexel.x, lowTexel.y);

  float bilinW[4];
  bilinW[0] = (1.0 - frac_.x) * (1.0 - frac_.y);
  bilinW[1] = frac_.x * (1.0 - frac_.y);
  bilinW[2] = (1.0 - frac_.x) * frac_.y;
  bilinW[3] = frac_.x * frac_.y;

  float depthSigma = hiDepth * 0.03;
  float invDepthSigma2 = 1.0 / (2.0 * depthSigma * depthSigma + 0.0001);

  vec4 result = vec4(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 4; i++) {
    vec2 sampleUV = base + offsets[i];
    vec4 sampleVal = texture2D(tInput, sampleUV);

    float sampleDepth = linearizeDepth(texture2D(tDepth, sampleUV).r);

    float depthDiff = hiDepth - sampleDepth;
    float depthW = exp(-depthDiff * depthDiff * invDepthSigma2);

    float w = bilinW[i] * depthW;
    result += sampleVal * w;
    totalWeight += w;
  }

  gl_FragColor = (totalWeight > 0.001) ? result / totalWeight : texture2D(tInput, vUv);
}
