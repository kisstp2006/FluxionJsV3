// Dual Kawase Bloom: Upsample (double-res each step, additive via GPU blending)
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
