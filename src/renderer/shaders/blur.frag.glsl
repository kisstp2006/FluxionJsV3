uniform sampler2D tDiffuse;
uniform vec2 direction;
uniform vec2 resolution;
varying vec2 vUv;

void main() {
  vec2 off1 = vec2(1.3846153846) * direction / resolution;
  vec2 off2 = vec2(3.2307692308) * direction / resolution;
  vec4 color = texture2D(tDiffuse, vUv) * 0.2270270270;
  color += texture2D(tDiffuse, vUv + off1) * 0.3162162162;
  color += texture2D(tDiffuse, vUv - off1) * 0.3162162162;
  color += texture2D(tDiffuse, vUv + off2) * 0.0702702703;
  color += texture2D(tDiffuse, vUv - off2) * 0.0702702703;
  gl_FragColor = color;
}
