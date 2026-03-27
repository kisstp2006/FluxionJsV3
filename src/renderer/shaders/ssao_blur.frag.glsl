// SSAO Bilateral Blur — depth-aware 4x4 kernel (single pass)
uniform sampler2D tSSAO;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;

float linearizeDepth(float d) {
  return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
}

void main() {
  float centerAO = texture2D(tSSAO, vUv).r;
  float centerDepth = linearizeDepth(texture2D(tDepth, vUv).r);

  if (texture2D(tDepth, vUv).r >= 1.0) { gl_FragColor = vec4(1.0); return; }

  float depthSigma = centerDepth * 0.05;
  float invDepthSigma2 = 1.0 / (2.0 * depthSigma * depthSigma + 0.0001);

  vec2 texel = 1.0 / resolution;
  float totalAO = 0.0;
  float totalWeight = 0.0;

  for (int x = -2; x <= 1; x++) {
    for (int y = -2; y <= 1; y++) {
      vec2 offset = vec2(float(x) + 0.5, float(y) + 0.5) * texel;
      vec2 sampleUV = vUv + offset;

      float sampleAO = texture2D(tSSAO, sampleUV).r;
      float sampleDepth = linearizeDepth(texture2D(tDepth, sampleUV).r);

      float depthDiff = centerDepth - sampleDepth;
      float w = exp(-depthDiff * depthDiff * invDepthSigma2);

      totalAO += sampleAO * w;
      totalWeight += w;
    }
  }

  gl_FragColor = vec4(vec3(totalAO / totalWeight), 1.0);
}
