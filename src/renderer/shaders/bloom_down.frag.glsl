// Dual Kawase Bloom: Downsample (half-res each step)
uniform sampler2D tDiffuse;
uniform vec2 texelSize;
varying vec2 vUv;

void main() {
  vec2 hs = texelSize * 0.5;
  vec4 sum = texture2D(tDiffuse, vUv) * 4.0;
  sum += texture2D(tDiffuse, vUv + vec2(-hs.x, -hs.y));
  sum += texture2D(tDiffuse, vUv + vec2( hs.x, -hs.y));
  sum += texture2D(tDiffuse, vUv + vec2(-hs.x,  hs.y));
  sum += texture2D(tDiffuse, vUv + vec2( hs.x,  hs.y));
  gl_FragColor = sum / 8.0;
}
