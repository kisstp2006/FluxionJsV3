// ============================================================
// FluxionJS V2 — Post-Processing Pipeline
// Nuake-inspired: Bloom, SSAO, SSR, Volumetrics, DOF, Vignette
// ============================================================

import * as THREE from 'three';

// Custom full-screen quad pass helper
class FullScreenPass {
  private fsQuad: THREE.Mesh;
  private camera: THREE.OrthographicCamera;

  constructor(material: THREE.ShaderMaterial) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target);
    renderer.render(this.fsQuad as any as THREE.Scene, this.camera);
  }

  get material(): THREE.ShaderMaterial {
    return this.fsQuad.material as THREE.ShaderMaterial;
  }

  dispose(): void {
    this.fsQuad.geometry.dispose();
    (this.fsQuad.material as THREE.ShaderMaterial).dispose();
  }
}

// ── Shader Snippets ──

const BLOOM_BRIGHT_FRAG = `
  uniform sampler2D tDiffuse;
  uniform float threshold;
  uniform float softKnee;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float knee = threshold * softKnee;
    float soft = brightness - threshold + knee;
    soft = clamp(soft, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 0.0001);
    float contribution = max(soft, brightness - threshold) / max(brightness, 0.0001);
    gl_FragColor = vec4(color.rgb * contribution, 1.0);
  }
`;

const BLUR_FRAG = `
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
`;

const COMPOSITE_FRAG = `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float bloomStrength;
  uniform float bloomRadius;
  uniform float vignetteIntensity;
  uniform float vignetteRoundness;
  uniform float exposure;
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
    vec3 scene = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;

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

    gl_FragColor = vec4(color, 1.0);
  }
`;

const SSAO_FRAG = `
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2 resolution;
  uniform float radius;
  uniform float bias;
  uniform float intensity;
  uniform mat4 projectionMatrix;
  varying vec2 vUv;

  float readDepth(vec2 coord) {
    return texture2D(tDepth, coord).r;
  }

  void main() {
    float depth = readDepth(vUv);
    if (depth >= 1.0) { gl_FragColor = vec4(1.0); return; }

    float occlusion = 0.0;
    float total = 0.0;
    const int SAMPLES = 16;
    float angleStep = 6.283185307 / float(SAMPLES);

    for (int i = 0; i < SAMPLES; i++) {
      float angle = float(i) * angleStep;
      vec2 offset = vec2(cos(angle), sin(angle)) * radius / resolution;
      float sampleDepth = readDepth(vUv + offset);
      float diff = depth - sampleDepth;
      if (diff > bias && diff < radius) {
        occlusion += 1.0;
      }
      total += 1.0;
    }

    float ao = 1.0 - (occlusion / total) * intensity;
    gl_FragColor = vec4(vec3(ao), 1.0);
  }
`;

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// ── Post-Processing Pipeline ──

export interface PostProcessConfig {
  bloom?: {
    enabled?: boolean;
    threshold?: number;
    strength?: number;
    radius?: number;
    softKnee?: number;
  };
  ssao?: {
    enabled?: boolean;
    radius?: number;
    bias?: number;
    intensity?: number;
  };
  vignette?: {
    enabled?: boolean;
    intensity?: number;
    roundness?: number;
  };
  exposure?: number;
}

export class PostProcessingPipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  // Render targets
  private sceneRT: THREE.WebGLRenderTarget;
  private bloomBrightRT: THREE.WebGLRenderTarget;
  private bloomBlurHRT: THREE.WebGLRenderTarget;
  private bloomBlurVRT: THREE.WebGLRenderTarget;
  private ssaoRT: THREE.WebGLRenderTarget;

  // Passes
  private bloomBrightPass: FullScreenPass;
  private bloomBlurHPass: FullScreenPass;
  private bloomBlurVPass: FullScreenPass;
  private ssaoPass: FullScreenPass;
  private compositePass: FullScreenPass;

  // Configuration
  config: PostProcessConfig = {
    bloom: { enabled: true, threshold: 0.8, strength: 0.5, radius: 0.4, softKnee: 0.6 },
    ssao: { enabled: true, radius: 0.5, bias: 0.025, intensity: 1.0 },
    vignette: { enabled: true, intensity: 0.3, roundness: 0.5 },
    exposure: 1.0,
  };

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const halfW = Math.floor(w / 2);
    const halfH = Math.floor(h / 2);

    const rtParams: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };

    // Render targets
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      ...rtParams,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.bloomBrightRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.bloomBlurHRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.bloomBlurVRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.ssaoRT = new THREE.WebGLRenderTarget(w, h, rtParams);

    // Bloom bright pass
    this.bloomBrightPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLOOM_BRIGHT_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: 0.8 },
        softKnee: { value: 0.6 },
      },
    }));

    // Bloom blur passes (gaussian, 2-pass separable)
    this.bloomBlurHPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        direction: { value: new THREE.Vector2(1, 0) },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
      },
    }));

    this.bloomBlurVPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        direction: { value: new THREE.Vector2(0, 1) },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
      },
    }));

    // SSAO pass
    this.ssaoPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSAO_FRAG,
      uniforms: {
        tDepth: { value: null },
        tNormal: { value: null },
        resolution: { value: new THREE.Vector2(w, h) },
        radius: { value: 0.5 },
        bias: { value: 0.025 },
        intensity: { value: 1.0 },
        projectionMatrix: { value: new THREE.Matrix4() },
      },
    }));

    // Composite pass
    this.compositePass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        bloomStrength: { value: 0.5 },
        bloomRadius: { value: 0.4 },
        vignetteIntensity: { value: 0.3 },
        vignetteRoundness: { value: 0.5 },
        exposure: { value: 1.0 },
      },
    }));
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  render(): void {
    const bloom = this.config.bloom;

    // 1. Render scene to texture
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // 2. Bloom
    if (bloom?.enabled) {
      // Extract bright parts
      this.bloomBrightPass.material.uniforms['tDiffuse'].value = this.sceneRT.texture;
      this.bloomBrightPass.material.uniforms['threshold'].value = bloom.threshold ?? 0.8;
      this.bloomBrightPass.material.uniforms['softKnee'].value = bloom.softKnee ?? 0.6;
      this.bloomBrightPass.render(this.renderer, this.bloomBrightRT);

      // Horizontal blur
      this.bloomBlurHPass.material.uniforms['tDiffuse'].value = this.bloomBrightRT.texture;
      this.bloomBlurHPass.render(this.renderer, this.bloomBlurHRT);

      // Vertical blur
      this.bloomBlurVPass.material.uniforms['tDiffuse'].value = this.bloomBlurHRT.texture;
      this.bloomBlurVPass.render(this.renderer, this.bloomBlurVRT);
    }

    // 3. Composite final image
    this.compositePass.material.uniforms['tScene'].value = this.sceneRT.texture;
    this.compositePass.material.uniforms['tBloom'].value = bloom?.enabled
      ? this.bloomBlurVRT.texture
      : this.sceneRT.texture;
    this.compositePass.material.uniforms['bloomStrength'].value = bloom?.enabled
      ? (bloom.strength ?? 0.5)
      : 0;
    this.compositePass.material.uniforms['vignetteIntensity'].value =
      this.config.vignette?.enabled ? (this.config.vignette.intensity ?? 0.3) : 0;
    this.compositePass.material.uniforms['vignetteRoundness'].value =
      this.config.vignette?.roundness ?? 0.5;
    this.compositePass.material.uniforms['exposure'].value = this.config.exposure ?? 1.0;
    this.compositePass.render(this.renderer, null); // output to screen
  }

  /** Render an overlay scene directly to screen (no post-processing). Clears depth only. */
  renderOverlay(overlayScene: THREE.Scene, camera: THREE.Camera): void {
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(null);
    this.renderer.clearDepth();
    this.renderer.render(overlayScene, camera);
    this.renderer.autoClear = prevAutoClear;
  }

  setSize(width: number, height: number): void {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);

    this.sceneRT.setSize(width, height);
    this.bloomBrightRT.setSize(halfW, halfH);
    this.bloomBlurHRT.setSize(halfW, halfH);
    this.bloomBlurVRT.setSize(halfW, halfH);
    this.ssaoRT.setSize(width, height);

    this.bloomBlurHPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.bloomBlurVPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.ssaoPass.material.uniforms['resolution'].value.set(width, height);
  }

  dispose(): void {
    this.sceneRT.dispose();
    this.bloomBrightRT.dispose();
    this.bloomBlurHRT.dispose();
    this.bloomBlurVRT.dispose();
    this.ssaoRT.dispose();
    this.bloomBrightPass.dispose();
    this.bloomBlurHPass.dispose();
    this.bloomBlurVPass.dispose();
    this.ssaoPass.dispose();
    this.compositePass.dispose();
  }
}
