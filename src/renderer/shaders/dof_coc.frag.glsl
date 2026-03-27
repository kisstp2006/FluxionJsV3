// DoF: Circle of Confusion from depth
uniform sampler2D tDepth;
uniform float focusDistance;
uniform float aperture;
uniform float maxBlur;
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;

float linearizeDepth(float d) {
  return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
}

void main() {
  float rawDepth = texture2D(tDepth, vUv).r;
  if (rawDepth >= 1.0) { gl_FragColor = vec4(maxBlur, 0.0, 0.0, 1.0); return; }

  float depth = linearizeDepth(rawDepth);
  float coc = (depth - focusDistance) * aperture / depth;
  coc = clamp(coc, -maxBlur, maxBlur);
  gl_FragColor = vec4(coc * 0.5 + 0.5, 0.0, 0.0, 1.0); // remap [-maxBlur, maxBlur] -> [0, 1]
}
