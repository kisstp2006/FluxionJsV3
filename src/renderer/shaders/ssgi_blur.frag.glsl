// SSGI Bilateral Blur — 2-pass separable depth-aware smoothing (13-tap per axis)
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

    float depthDiff = centerDepth - sampleDepth;
    float depthW = exp(-depthDiff * depthDiff * invDepthSigma2);

    float w = spatialW * depthW;
    result += sampleVal * w;
    totalWeight += w;
  }

  gl_FragColor = result / totalWeight;
}
