// ============================================================
// Volumetric Light Scattering (God Rays)
// Ray-marches from the current UV toward the light source UV,
// accumulating inscattered brightness with exponential decay.
// Input: scene color RT — bright areas (sky, emissive, lights)
// become the "light shaft" source.
// Output: RGB inscattered light, additive-blended in composite.
// ============================================================

uniform sampler2D tDiffuse;
uniform vec2  lightPosition;   // UV-space light position (0..1)
uniform float exposure;        // overall brightness multiplier
uniform float decay;           // per-sample falloff (0.85–1.0)
uniform float density;         // step density along ray
uniform float weight;          // per-sample weight
uniform int   samples;         // ray-march sample count

varying vec2 vUv;

const int MAX_SAMPLES = 100;

void main() {
  vec2 texCoord = vUv;
  vec2 deltaTexCoord = texCoord - lightPosition;
  deltaTexCoord *= (1.0 / float(samples)) * density;

  vec4 color = texture2D(tDiffuse, texCoord);
  float illuminationDecay = 1.0;

  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (i == samples) break;
    texCoord -= deltaTexCoord;
    vec4 s = texture2D(tDiffuse, clamp(texCoord, vec2(0.001), vec2(0.999)));
    s *= illuminationDecay * weight;
    color += s;
    illuminationDecay *= decay;
  }

  gl_FragColor = vec4(color.rgb * exposure, 1.0);
}
