// DoF: Bokeh disk blur (22-tap Poisson, CoC-weighted)
uniform sampler2D tScene;
uniform sampler2D tCoC;
uniform vec2 resolution;
uniform float maxBlur;
varying vec2 vUv;

// 22-tap Poisson disk
const vec2 poissonDisk[22] = vec2[22](
  vec2(-0.7265, 0.5345), vec2(0.5765, 0.6745),
  vec2(-0.1785, -0.8945), vec2(0.8465, -0.2185),
  vec2(-0.9345, -0.1085), vec2(0.1635, 0.3985),
  vec2(-0.4285, -0.4745), vec2(0.7085, 0.1585),
  vec2(-0.3685, 0.8215), vec2(-0.0285, -0.3855),
  vec2(0.4025, -0.5965), vec2(-0.6595, -0.6655),
  vec2(0.2925, 0.9045), vec2(-0.8785, 0.3385),
  vec2(0.9635, 0.2265), vec2(-0.2135, 0.1415),
  vec2(0.0755, -0.7145), vec2(0.5115, -0.8585),
  vec2(-0.5465, 0.1875), vec2(0.3455, -0.1665),
  vec2(-0.7895, -0.4325), vec2(0.6285, 0.4255)
);

void main() {
  float centerCoC = texture2D(tCoC, vUv).r * 2.0 - 1.0; // remap [0,1] -> [-1,1]
  float absCoC = abs(centerCoC) * maxBlur;
  float blurRadius = absCoC;

  if (blurRadius < 0.5) {
    gl_FragColor = texture2D(tScene, vUv);
    return;
  }

  vec2 texelSize = 1.0 / resolution;
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 22; i++) {
    vec2 offset = poissonDisk[i] * blurRadius * texelSize;
    vec2 sampleUV = vUv + offset;

    vec3 sampleColor = texture2D(tScene, sampleUV).rgb;
    float sampleCoC = (texture2D(tCoC, sampleUV).r * 2.0 - 1.0) * maxBlur;

    // Weight: neighbor contributes if its own blur radius covers this pixel
    float sampleRadius = abs(sampleCoC);
    float dist = length(poissonDisk[i]) * blurRadius;
    float w = smoothstep(0.0, 1.0, sampleRadius / (dist + 0.001));

    // Near-field bleeding: near-blur samples always contribute
    if (sampleCoC < 0.0) w = 1.0;

    result += sampleColor * w;
    totalWeight += w;
  }

  gl_FragColor = vec4(result / max(totalWeight, 0.001), 1.0);
}
