uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tSSAO;
uniform sampler2D tSSR;
uniform sampler2D tSSGI;
uniform sampler2D tClouds;
uniform sampler2D tVolumetricFog;
uniform bool volumetricFogEnabled;
uniform float bloomStrength;
uniform float bloomRadius;
uniform float vignetteIntensity;
uniform float vignetteRoundness;
uniform float exposure;
uniform bool ssaoEnabled;
uniform bool ssrEnabled;
uniform bool ssgiEnabled;
uniform bool cloudsEnabled;
uniform sampler2D tDof;
uniform sampler2D tDofCoC;
uniform bool dofEnabled;
uniform float dofMaxBlur;
uniform float chromaticAberration;
uniform float filmGrain;
uniform float time;
varying vec2 vUv;

vec3 acesFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  // Chromatic Aberration
  vec2 dir = vUv - 0.5;
  vec2 caOffset = dir * chromaticAberration;
  vec3 scene = vec3(
    texture2D(tScene, vUv + caOffset).r,
    texture2D(tScene, vUv).g,
    texture2D(tScene, vUv - caOffset).b
  );
  vec3 bloom = texture2D(tBloom, vUv).rgb;

  // SSGI — indirect illumination + AO (overrides SSAO when active)
  float ao = 1.0;
  if (ssgiEnabled) {
    vec4 gi = texture2D(tSSGI, vUv);
    ao = gi.a;
    scene += gi.rgb;
  } else if (ssaoEnabled) {
    ao = texture2D(tSSAO, vUv).r;
  }
  scene *= ao;

  // SSR — screen-space reflections
  if (ssrEnabled) {
    vec4 ssr = texture2D(tSSR, vUv);
    scene = mix(scene, ssr.rgb, ssr.a);
  }

  // Volumetric clouds
  if (cloudsEnabled) {
    vec4 clouds = texture2D(tClouds, vUv);
    scene = mix(scene, clouds.rgb, 1.0 - clouds.a);
  }

  // Volumetric fog (inscattered light over scene, transmittance blends)
  if (volumetricFogEnabled) {
    vec4 fog = texture2D(tVolumetricFog, vUv);
    // fog.rgb = inscattered light, fog.a = transmittance (1=clear, 0=full fog)
    scene = scene * fog.a + fog.rgb;
  }

  // Depth of Field — mix sharp scene with bokeh blur based on CoC
  if (dofEnabled) {
    float coc = texture2D(tDofCoC, vUv).r * 2.0 - 1.0; // [-1, 1]
    float blurAmount = smoothstep(0.0, 1.0, abs(coc) * dofMaxBlur / max(dofMaxBlur, 0.001));
    vec3 dofColor = texture2D(tDof, vUv).rgb;
    scene = mix(scene, dofColor, blurAmount);
  }

  // Combine bloom
  vec3 color = scene + bloom * bloomStrength;

  // Exposure
  color *= exposure;

  // Vignette
  vec2 uv = vUv * 2.0 - 1.0;
  float vignette = 1.0 - dot(uv * vignetteRoundness, uv * vignetteRoundness);
  vignette = clamp(pow(vignette, vignetteIntensity), 0.0, 1.0);
  color *= vignette;

  // Tone mapping (ACES)
  color = acesFilm(color);

  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  // Film Grain (animated)
  float grain = fract(sin(dot(vUv * 467.759 + time, vec2(12.9898, 78.233))) * 43758.5453);
  color += (grain - 0.5) * filmGrain;

  gl_FragColor = vec4(color, 1.0);
}
