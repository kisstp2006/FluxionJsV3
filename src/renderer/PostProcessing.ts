// ============================================================
// FluxionJS V2 — Post-Processing Pipeline
// Nuake-inspired: Bloom, SSAO, SSR, Volumetrics, DOF, Vignette
// ============================================================

import * as THREE from 'three';
import { ShaderLibrary } from './ShaderLibrary';
import vertexSrc        from './shaders/vertex.glsl';
import bloomBrightSrc   from './shaders/bloom_bright.frag.glsl';
import bloomDownSrc     from './shaders/bloom_down.frag.glsl';
import bloomUpSrc       from './shaders/bloom_up.frag.glsl';
import dofCocSrc        from './shaders/dof_coc.frag.glsl';
import dofBlurSrc       from './shaders/dof_blur.frag.glsl';
import compositeSrc     from './shaders/composite.frag.glsl';
import ssaoSrc          from './shaders/ssao.frag.glsl';
import ssaoBlurSrc      from './shaders/ssao_blur.frag.glsl';
import ssrSrc           from './shaders/ssr.frag.glsl';
import ssgiSrc          from './shaders/ssgi.frag.glsl';
import ssgiBlurSrc      from './shaders/ssgi_blur.frag.glsl';
import ssgiUpscaleSrc   from './shaders/ssgi_upscale.frag.glsl';
import cloudSrc         from './shaders/cloud.frag.glsl';

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

// Shader name constants (aliases to webpack-bundled .glsl imports)
const VERTEX_SHADER      = vertexSrc;
const BLOOM_BRIGHT_FRAG  = bloomBrightSrc;
const BLOOM_DOWN_FRAG    = bloomDownSrc;
const BLOOM_UP_FRAG      = bloomUpSrc;
const DOF_COC_FRAG       = dofCocSrc;
const DOF_BLUR_FRAG      = dofBlurSrc;
const COMPOSITE_FRAG     = compositeSrc;
const SSAO_FRAG          = ssaoSrc;
const SSAO_BLUR_FRAG     = ssaoBlurSrc;
const SSR_FRAG           = ssrSrc;
const SSGI_FRAG          = ssgiSrc;
const SSGI_BLUR_FRAG     = ssgiBlurSrc;
const SSGI_UPSCALE_FRAG  = ssgiUpscaleSrc;
const CLOUD_FRAG         = cloudSrc;

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
  ssr?: {
    enabled?: boolean;
    maxDistance?: number;
    thickness?: number;
    stride?: number;
    fresnel?: number;
    opacity?: number;
    resolutionScale?: number;
    infiniteThick?: boolean;
    distanceAttenuation?: boolean;
  };
  ssgi?: {
    enabled?: boolean;
    sliceCount?: number;
    stepCount?: number;
    radius?: number;
    thickness?: number;
    expFactor?: number;
    aoIntensity?: number;
    giIntensity?: number;
    backfaceLighting?: number;
    useLinearThickness?: boolean;
    screenSpaceSampling?: boolean;
  };
  clouds?: {
    enabled?: boolean;
    minHeight?: number;
    maxHeight?: number;
    coverage?: number;
    density?: number;
    absorption?: number;
    scatter?: number;
    color?: THREE.Color;
    speed?: number;
    sunDirection?: THREE.Vector3;
  };
  vignette?: {
    enabled?: boolean;
    intensity?: number;
    roundness?: number;
  };
  dof?: {
    enabled?: boolean;
    focusDistance?: number;
    aperture?: number;
    maxBlur?: number;
  };
  exposure?: number;
  chromaticAberration?: number;
  filmGrain?: number;
}

export class PostProcessingPipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  // Render targets
  private sceneRT: THREE.WebGLRenderTarget;
  private bloomChain: THREE.WebGLRenderTarget[] = [];
  private static readonly BLOOM_LEVELS = 5;
  private ssaoRT: THREE.WebGLRenderTarget;
  private ssaoBlurRT: THREE.WebGLRenderTarget;
  private ssrRT: THREE.WebGLRenderTarget;
  private ssgiRT: THREE.WebGLRenderTarget;
  private ssgiBlurRT: THREE.WebGLRenderTarget;
  private ssgiBlurRT2: THREE.WebGLRenderTarget;
  private ssgiUpscaleRT: THREE.WebGLRenderTarget;
  private dofCocRT: THREE.WebGLRenderTarget;
  private dofBlurRT: THREE.WebGLRenderTarget;
  private cloudRT: THREE.WebGLRenderTarget;

  // Passes
  private bloomBrightPass: FullScreenPass;
  private bloomDownPass: FullScreenPass;
  private bloomUpPass: FullScreenPass;
  private ssaoPass: FullScreenPass;
  private ssaoBlurPass: FullScreenPass;
  private ssrPass: FullScreenPass;
  private ssgiPass: FullScreenPass;
  private ssgiBlurHPass: FullScreenPass;
  private ssgiBlurVPass: FullScreenPass;
  private ssgiUpscalePass: FullScreenPass;
  private dofCocPass: FullScreenPass;
  private dofBlurPass: FullScreenPass;
  private cloudPass: FullScreenPass;
  private compositePass: FullScreenPass;

  // Reusable matrices
  private _invProjMatrix = new THREE.Matrix4();
  private _invViewMatrix = new THREE.Matrix4();
  private _lastProjHash = -1;
  private _lastNear = -1;
  private _lastFar = -1;

  // Time tracking for clouds
  private _time = 0;

  // SSR dynamic resolution tracking
  private _ssrW = -1;
  private _ssrH = -1;

  // ShaderLibrary hot-reload unsubscribe callbacks
  private _shaderUnsubs: Array<() => void> = [];

  /** When true, an EnvironmentComponent is active and overrides project/editor PP settings */
  environmentOverride = false;

  // Configuration
  config: PostProcessConfig = {
    bloom: { enabled: true, threshold: 0.8, strength: 0.5, radius: 0.4, softKnee: 0.6 },
    ssao: { enabled: false, radius: 0.5, bias: 0.025, intensity: 1.0 },
    ssr: { enabled: false, maxDistance: 50, thickness: 0.5, stride: 0.3, fresnel: 1.0, opacity: 0.5, resolutionScale: 0.5, infiniteThick: false, distanceAttenuation: true },
    ssgi: { enabled: false, sliceCount: 3, stepCount: 12, radius: 12, thickness: 1, expFactor: 2, aoIntensity: 1, giIntensity: 10, backfaceLighting: 0, useLinearThickness: false, screenSpaceSampling: true },
    clouds: { enabled: false, minHeight: 200, maxHeight: 400, coverage: 0.5, density: 0.3, absorption: 1.0, scatter: 1.0, color: new THREE.Color(1, 1, 1), speed: 1.0, sunDirection: new THREE.Vector3(0.5, 1, 0.3).normalize() },
    vignette: { enabled: true, intensity: 0.3, roundness: 0.5 },
    dof: { enabled: false, focusDistance: 10, aperture: 0.025, maxBlur: 10 },
    exposure: 1.0,
    chromaticAberration: 0,
    filmGrain: 0,
  };

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const halfW = Math.floor(w / 2);
    const halfH = Math.floor(h / 2);
    const ssrScale = THREE.MathUtils.clamp(this.config.ssr?.resolutionScale ?? 0.5, 0.1, 1.0);
    const ssrW = Math.max(1, Math.floor(w * ssrScale));
    const ssrH = Math.max(1, Math.floor(h * ssrScale));

    const rtParams: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };

    // Scene RT with accessible depth texture
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      ...rtParams,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h);
    this.sceneRT.depthTexture.format = THREE.DepthFormat;
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;

    // Bloom chain: progressive half-res RTs (level 0 = halfW×halfH, level 4 = halfW/16 × halfH/16)
    this.bloomChain = [];
    for (let i = 0; i < PostProcessingPipeline.BLOOM_LEVELS; i++) {
      const bw = Math.max(1, Math.floor(halfW / (1 << i)));
      const bh = Math.max(1, Math.floor(halfH / (1 << i)));
      this.bloomChain.push(new THREE.WebGLRenderTarget(bw, bh, rtParams));
    }
    this.ssaoRT = new THREE.WebGLRenderTarget(w, h, rtParams);
    this.ssaoBlurRT = new THREE.WebGLRenderTarget(w, h, rtParams);
    this.ssrRT = new THREE.WebGLRenderTarget(ssrW, ssrH, rtParams);
    this._ssrW = ssrW;
    this._ssrH = ssrH;
    this.ssgiRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.ssgiBlurRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.ssgiBlurRT2 = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);
    this.ssgiUpscaleRT = new THREE.WebGLRenderTarget(w, h, rtParams);
    this.dofCocRT = new THREE.WebGLRenderTarget(w, h, rtParams);
    this.dofBlurRT = new THREE.WebGLRenderTarget(w, h, rtParams);
    this.cloudRT = new THREE.WebGLRenderTarget(halfW, halfH, rtParams);

    // ── Bloom bright pass ──
    this.bloomBrightPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLOOM_BRIGHT_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: 0.8 },
        softKnee: { value: 0.6 },
      },
    }));

    // ── Bloom dual-kawase downsample pass ──
    this.bloomDownPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLOOM_DOWN_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: new THREE.Vector2() },
      },
    }));

    // ── Bloom dual-kawase upsample pass (additive GPU blending) ──
    this.bloomUpPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLOOM_UP_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: new THREE.Vector2() },
        radius: { value: 0.4 },
        intensity: { value: 0.25 },
      },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }));

    // ── SSAO pass ──
    this.ssaoPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSAO_FRAG,
      uniforms: {
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(w, h) },
        radius: { value: 0.5 },
        bias: { value: 0.025 },
        intensity: { value: 1.0 },
        projMatrix: { value: new THREE.Matrix4() },
        invProjMatrix: { value: new THREE.Matrix4() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    // ── SSAO Blur pass ──
    this.ssaoBlurPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSAO_BLUR_FRAG,
      uniforms: {
        tSSAO: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(w, h) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    // ── SSR pass ──
    this.ssrPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSR_FRAG,
      uniforms: {
        tScene: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(ssrW, ssrH) },
        depthResolution: { value: new THREE.Vector2(w, h) },
        projMatrix: { value: new THREE.Matrix4() },
        invProjMatrix: { value: new THREE.Matrix4() },
        maxDistance: { value: 50 },
        thickness: { value: 0.5 },
        infiniteThick: { value: 0 },
        stride: { value: 0.3 },
        fresnel: { value: 1.0 },
        opacity: { value: 0.5 },
        distanceAttenuation: { value: 1 },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    // ── SSGI pass ──
    this.ssgiPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSGI_FRAG,
      uniforms: {
        tScene: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
        depthResolution: { value: new THREE.Vector2(w, h) },
        projMatrix: { value: new THREE.Matrix4() },
        invProjMatrix: { value: new THREE.Matrix4() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        giRadius: { value: 12 },
        giThickness: { value: 1 },
        giExpFactor: { value: 2 },
        aoIntensity: { value: 1 },
        giIntensity: { value: 10 },
        sliceCountI: { value: 2 },
        stepCountI: { value: 8 },
        backfaceLighting: { value: 0 },
        screenSpaceSampling: { value: 1 },
      },
    }));

    // ── SSGI Blur pass (2-pass separable bilateral) ──
    this.ssgiBlurHPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSGI_BLUR_FRAG,
      uniforms: {
        tInput: { value: null },
        tDepth: { value: null },
        direction: { value: new THREE.Vector2(1, 0) },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    this.ssgiBlurVPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSGI_BLUR_FRAG,
      uniforms: {
        tInput: { value: null },
        tDepth: { value: null },
        direction: { value: new THREE.Vector2(0, 1) },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    // ── SSGI Bilateral Upscale pass (half-res → full-res) ──
    this.ssgiUpscalePass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: SSGI_UPSCALE_FRAG,
      uniforms: {
        tInput: { value: null },
        tDepth: { value: null },
        lowResolution: { value: new THREE.Vector2(halfW, halfH) },
        hiResolution: { value: new THREE.Vector2(w, h) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    // ── DoF CoC pass ──
    this.dofCocPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: DOF_COC_FRAG,
      uniforms: {
        tDepth: { value: null },
        focusDistance: { value: 10 },
        aperture: { value: 0.025 },
        maxBlur: { value: 10 },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    }));

    // ── DoF Blur pass ──
    this.dofBlurPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: DOF_BLUR_FRAG,
      uniforms: {
        tScene: { value: null },
        tCoC: { value: null },
        resolution: { value: new THREE.Vector2(w, h) },
        maxBlur: { value: 10 },
      },
    }));

    // ── Cloud pass ──
    this.cloudPass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: CLOUD_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(halfW, halfH) },
        invProjMatrix: { value: new THREE.Matrix4() },
        invViewMatrix: { value: new THREE.Matrix4() },
        cameraPos: { value: new THREE.Vector3() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        cloudMinHeight: { value: 200 },
        cloudMaxHeight: { value: 400 },
        cloudCoverage: { value: 0.5 },
        cloudDensity: { value: 0.3 },
        cloudAbsorption: { value: 1.0 },
        cloudScatter: { value: 1.0 },
        cloudColor: { value: new THREE.Color(1, 1, 1) },
        sunDirection: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
        time: { value: 0 },
        cloudSpeed: { value: 1.0 },
      },
    }));

    // ── Composite pass ──
    this.compositePass = new FullScreenPass(new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tSSAO: { value: null },
        tSSR: { value: null },
        tSSGI: { value: null },
        tClouds: { value: null },
        bloomStrength: { value: 0.5 },
        bloomRadius: { value: 0.4 },
        vignetteIntensity: { value: 0.3 },
        vignetteRoundness: { value: 0.5 },
        exposure: { value: 1.0 },
        ssaoEnabled: { value: false },
        ssrEnabled: { value: false },
        ssgiEnabled: { value: false },
        cloudsEnabled: { value: false },
        tDof: { value: null },
        tDofCoC: { value: null },
        dofEnabled: { value: false },
        dofMaxBlur: { value: 10 },
        chromaticAberration: { value: 0 },
        filmGrain: { value: 0 },
        time: { value: 0 },
      },
    }));

    // ── ShaderLibrary hot-reload subscriptions ──
    // When a .glsl file changes on disk in dev mode, ShaderLibrary calls back here
    // and we swap the fragmentShader + set needsUpdate so WebGL recompiles it.
    const wire = (name: string, passes: FullScreenPass[]) => {
      this._shaderUnsubs.push(
        ShaderLibrary.onShaderChanged(name, (_n, src) => {
          for (const p of passes) {
            p.material.fragmentShader = src;
            p.material.needsUpdate = true;
          }
        }),
      );
    };
    wire('bloom_bright',  [this.bloomBrightPass]);
    wire('bloom_down',    [this.bloomDownPass]);
    wire('bloom_up',      [this.bloomUpPass]);
    wire('dof_coc',       [this.dofCocPass]);
    wire('dof_blur',      [this.dofBlurPass]);
    wire('composite',     [this.compositePass]);
    wire('ssao',          [this.ssaoPass]);
    wire('ssao_blur',     [this.ssaoBlurPass]);
    wire('ssr',           [this.ssrPass]);
    wire('ssgi',          [this.ssgiPass]);
    wire('ssgi_blur',     [this.ssgiBlurHPass, this.ssgiBlurVPass]);
    wire('ssgi_upscale',  [this.ssgiUpscalePass]);
    wire('cloud',         [this.cloudPass]);
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /** Returns the scene depth texture for soft particles, etc. */
  getSceneDepthTexture(): THREE.DepthTexture | null {
    return this.sceneRT?.depthTexture ?? null;
  }

  /** Update camera matrices for all passes that need them */
  private updateCameraUniforms(): void {
    const projMat = (this.camera as THREE.PerspectiveCamera).projectionMatrix;
    const near = (this.camera as any).near ?? 0.1;
    const far = (this.camera as any).far ?? 1000;

    // Quick hash of projection matrix diagonal — changes on FOV / aspect / near / far
    const projHash = projMat.elements[0] + projMat.elements[5] + projMat.elements[10] + projMat.elements[14];
    const projChanged = projHash !== this._lastProjHash || near !== this._lastNear || far !== this._lastFar;

    if (projChanged) {
      this._lastProjHash = projHash;
      this._lastNear = near;
      this._lastFar = far;
      this._invProjMatrix.copy(projMat).invert();

      // SSAO
      this.ssaoPass.material.uniforms['projMatrix'].value.copy(projMat);
      this.ssaoPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
      this.ssaoPass.material.uniforms['cameraNear'].value = near;
      this.ssaoPass.material.uniforms['cameraFar'].value = far;

      // SSAO Blur
      this.ssaoBlurPass.material.uniforms['cameraNear'].value = near;
      this.ssaoBlurPass.material.uniforms['cameraFar'].value = far;

      // SSR
      this.ssrPass.material.uniforms['projMatrix'].value.copy(projMat);
      this.ssrPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
      this.ssrPass.material.uniforms['cameraNear'].value = near;
      this.ssrPass.material.uniforms['cameraFar'].value = far;

      // SSGI
      this.ssgiPass.material.uniforms['projMatrix'].value.copy(projMat);
      this.ssgiPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
      this.ssgiPass.material.uniforms['cameraNear'].value = near;
      this.ssgiPass.material.uniforms['cameraFar'].value = far;

      // SSGI Blur
      this.ssgiBlurHPass.material.uniforms['cameraNear'].value = near;
      this.ssgiBlurHPass.material.uniforms['cameraFar'].value = far;
      this.ssgiBlurVPass.material.uniforms['cameraNear'].value = near;
      this.ssgiBlurVPass.material.uniforms['cameraFar'].value = far;

      // SSGI Upscale
      this.ssgiUpscalePass.material.uniforms['cameraNear'].value = near;
      this.ssgiUpscalePass.material.uniforms['cameraFar'].value = far;

      // DoF CoC
      this.dofCocPass.material.uniforms['cameraNear'].value = near;
      this.dofCocPass.material.uniforms['cameraFar'].value = far;

      // Clouds
      this.cloudPass.material.uniforms['invProjMatrix'].value.copy(this._invProjMatrix);
      this.cloudPass.material.uniforms['cameraNear'].value = near;
      this.cloudPass.material.uniforms['cameraFar'].value = far;
    }

    // Per-frame: texture bindings + view matrix (changes every frame with camera movement)
    this.ssaoPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssrPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssrPass.material.uniforms['tScene'].value = this.sceneRT.texture;
    this.ssgiPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssgiPass.material.uniforms['tScene'].value = this.sceneRT.texture;
    this.ssgiBlurHPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.ssgiBlurVPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.dofCocPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
    this.cloudPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;

    this._invViewMatrix.copy(this.camera.matrixWorld);
    this.cloudPass.material.uniforms['invViewMatrix'].value.copy(this._invViewMatrix);
    this.cloudPass.material.uniforms['cameraPos'].value.copy(this.camera.position);
    this.cloudPass.material.uniforms['cameraNear'].value = near;
    this.cloudPass.material.uniforms['cameraFar'].value = far;
  }

  private ensureSSRTargets(): void {
    const scale = THREE.MathUtils.clamp(this.config.ssr?.resolutionScale ?? 0.5, 0.1, 1.0);
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    const ssrW = Math.max(1, Math.floor(w * scale));
    const ssrH = Math.max(1, Math.floor(h * scale));

    if (ssrW === this._ssrW && ssrH === this._ssrH) return;
    this._ssrW = ssrW;
    this._ssrH = ssrH;

    this.ssrRT.setSize(ssrW, ssrH);
    this.ssrPass.material.uniforms['resolution'].value.set(ssrW, ssrH);
  }

  render(dt?: number): void {
    const bloom = this.config.bloom;
    const ssao = this.config.ssao;
    const ssr = this.config.ssr;
    const ssgi = this.config.ssgi;
    const clouds = this.config.clouds;
    const dof = this.config.dof;

    // Track time for clouds
    this._time += dt ?? 0.016;

    // 1. Render scene to texture (with depth)
    //    Disable Three.js tone mapping + color space so sceneRT stays LINEAR HDR.
    //    Tone mapping is applied once in the composite shader.
    const savedToneMapping = this.renderer.toneMapping;
    const savedOutputColorSpace = this.renderer.outputColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    this.renderer.toneMapping = savedToneMapping;
    this.renderer.outputColorSpace = savedOutputColorSpace;

    // Update shared camera uniforms
    this.updateCameraUniforms();

    // 2. SSAO (only if SSGI is disabled, since SSGI provides its own AO)
    const doSSAO = !!(ssao?.enabled && !ssgi?.enabled);
    if (doSSAO) {
      this.ssaoPass.material.uniforms['radius'].value = ssao!.radius ?? 0.5;
      this.ssaoPass.material.uniforms['bias'].value = ssao!.bias ?? 0.025;
      this.ssaoPass.material.uniforms['intensity'].value = ssao!.intensity ?? 1.0;
      this.ssaoPass.render(this.renderer, this.ssaoRT);

      // Bilateral blur
      this.ssaoBlurPass.material.uniforms['tSSAO'].value = this.ssaoRT.texture;
      this.ssaoBlurPass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
      this.ssaoBlurPass.render(this.renderer, this.ssaoBlurRT);
    }

    // 3. SSGI
    const doSSGI = !!ssgi?.enabled;
    if (doSSGI) {
      this.ssgiPass.material.uniforms['giRadius'].value = ssgi!.radius ?? 12;
      this.ssgiPass.material.uniforms['giThickness'].value = ssgi!.thickness ?? 1;
      this.ssgiPass.material.uniforms['giExpFactor'].value = ssgi!.expFactor ?? 2;
      this.ssgiPass.material.uniforms['aoIntensity'].value = ssgi!.aoIntensity ?? 1;
      this.ssgiPass.material.uniforms['giIntensity'].value = ssgi!.giIntensity ?? 10;
      this.ssgiPass.material.uniforms['sliceCountI'].value = Math.round(ssgi!.sliceCount ?? 2);
      this.ssgiPass.material.uniforms['stepCountI'].value = Math.round(ssgi!.stepCount ?? 8);
      this.ssgiPass.material.uniforms['backfaceLighting'].value = ssgi!.backfaceLighting ?? 0;
      this.ssgiPass.material.uniforms['screenSpaceSampling'].value = ssgi!.screenSpaceSampling ? 1 : 0;
      this.ssgiPass.render(this.renderer, this.ssgiRT);

      // 2-pass separable bilateral blur
      this.ssgiBlurHPass.material.uniforms['tInput'].value = this.ssgiRT.texture;
      this.ssgiBlurHPass.render(this.renderer, this.ssgiBlurRT);

      this.ssgiBlurVPass.material.uniforms['tInput'].value = this.ssgiBlurRT.texture;
      this.ssgiBlurVPass.render(this.renderer, this.ssgiBlurRT2);

      // Bilateral upscale half-res → full-res
      this.ssgiUpscalePass.material.uniforms['tInput'].value = this.ssgiBlurRT2.texture;
      this.ssgiUpscalePass.material.uniforms['tDepth'].value = this.sceneRT.depthTexture;
      this.ssgiUpscalePass.render(this.renderer, this.ssgiUpscaleRT);
    }

    // 4. SSR
    const doSSR = !!ssr?.enabled;
    if (doSSR) {
      this.ensureSSRTargets();
      this.ssrPass.material.uniforms['maxDistance'].value = ssr!.maxDistance ?? 50;
      this.ssrPass.material.uniforms['thickness'].value = ssr!.thickness ?? 0.5;
      this.ssrPass.material.uniforms['stride'].value = ssr!.stride ?? 0.3;
      this.ssrPass.material.uniforms['fresnel'].value = ssr!.fresnel ?? 1.0;
      this.ssrPass.material.uniforms['opacity'].value = ssr!.opacity ?? 0.5;
      this.ssrPass.material.uniforms['infiniteThick'].value = ssr!.infiniteThick ? 1 : 0;
      this.ssrPass.material.uniforms['distanceAttenuation'].value = ssr!.distanceAttenuation === false ? 0 : 1;
      this.ssrPass.render(this.renderer, this.ssrRT);
    }

    // 5. Bloom
    if (bloom?.enabled) {
      this.bloomBrightPass.material.uniforms['tDiffuse'].value = this.sceneRT.texture;
      this.bloomBrightPass.material.uniforms['threshold'].value = bloom.threshold ?? 0.8;
      this.bloomBrightPass.material.uniforms['softKnee'].value = bloom.softKnee ?? 0.6;
      this.bloomBrightPass.render(this.renderer, this.bloomChain[0]);

      // Downsample chain
      const du = this.bloomDownPass.material.uniforms;
      for (let i = 1; i < PostProcessingPipeline.BLOOM_LEVELS; i++) {
        const src = this.bloomChain[i - 1];
        du['tDiffuse'].value = src.texture;
        du['texelSize'].value.set(1.0 / src.width, 1.0 / src.height);
        this.bloomDownPass.render(this.renderer, this.bloomChain[i]);
      }

      // Upsample chain (additive via GPU blending — avoids read-write conflict)
      const uu = this.bloomUpPass.material.uniforms;
      uu['radius'].value = bloom.radius ?? 0.4;
      const savedAutoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      for (let i = PostProcessingPipeline.BLOOM_LEVELS - 2; i >= 0; i--) {
        const dst = this.bloomChain[i];
        uu['tDiffuse'].value = this.bloomChain[i + 1].texture;
        uu['texelSize'].value.set(1.0 / dst.width, 1.0 / dst.height);
        this.bloomUpPass.render(this.renderer, dst);
      }
      this.renderer.autoClear = savedAutoClear;
    }

    // 6. Volumetric Clouds
    const doClouds = !!clouds?.enabled;
    if (doClouds) {
      this.cloudPass.material.uniforms['cloudMinHeight'].value = clouds!.minHeight ?? 200;
      this.cloudPass.material.uniforms['cloudMaxHeight'].value = clouds!.maxHeight ?? 400;
      this.cloudPass.material.uniforms['cloudCoverage'].value = clouds!.coverage ?? 0.5;
      this.cloudPass.material.uniforms['cloudDensity'].value = clouds!.density ?? 0.3;
      this.cloudPass.material.uniforms['cloudAbsorption'].value = clouds!.absorption ?? 1.0;
      this.cloudPass.material.uniforms['cloudScatter'].value = clouds!.scatter ?? 1.0;
      this.cloudPass.material.uniforms['cloudColor'].value.copy(clouds!.color ?? new THREE.Color(1, 1, 1));
      this.cloudPass.material.uniforms['sunDirection'].value.copy(clouds!.sunDirection ?? new THREE.Vector3(0.5, 1, 0.3).normalize());
      this.cloudPass.material.uniforms['time'].value = this._time;
      this.cloudPass.material.uniforms['cloudSpeed'].value = clouds!.speed ?? 1.0;
      this.cloudPass.render(this.renderer, this.cloudRT);
    }

    // 7. Depth of Field
    const doDof = !!dof?.enabled;
    if (doDof) {
      // CoC pass
      this.dofCocPass.material.uniforms['focusDistance'].value = dof!.focusDistance ?? 10;
      this.dofCocPass.material.uniforms['aperture'].value = dof!.aperture ?? 0.025;
      this.dofCocPass.material.uniforms['maxBlur'].value = dof!.maxBlur ?? 10;
      this.dofCocPass.render(this.renderer, this.dofCocRT);

      // Bokeh blur pass
      this.dofBlurPass.material.uniforms['tScene'].value = this.sceneRT.texture;
      this.dofBlurPass.material.uniforms['tCoC'].value = this.dofCocRT.texture;
      this.dofBlurPass.material.uniforms['maxBlur'].value = dof!.maxBlur ?? 10;
      this.dofBlurPass.render(this.renderer, this.dofBlurRT);
    }

    // 8. Composite final image
    const cu = this.compositePass.material.uniforms;
    cu['tScene'].value = this.sceneRT.texture;
    cu['tBloom'].value = bloom?.enabled ? this.bloomChain[0].texture : this.sceneRT.texture;
    cu['bloomStrength'].value = bloom?.enabled ? (bloom.strength ?? 0.5) : 0;
    cu['tSSAO'].value = this.ssaoBlurRT.texture;
    cu['ssaoEnabled'].value = doSSAO;
    cu['tSSR'].value = this.ssrRT.texture;
    cu['ssrEnabled'].value = doSSR;
    cu['tSSGI'].value = this.ssgiUpscaleRT.texture;
    cu['ssgiEnabled'].value = doSSGI;
    cu['tClouds'].value = this.cloudRT.texture;
    cu['cloudsEnabled'].value = doClouds;
    cu['tDof'].value = this.dofBlurRT.texture;
    cu['tDofCoC'].value = this.dofCocRT.texture;
    cu['dofEnabled'].value = doDof;
    cu['dofMaxBlur'].value = dof?.maxBlur ?? 10;
    cu['vignetteIntensity'].value = this.config.vignette?.enabled ? (this.config.vignette.intensity ?? 0.3) : 0;
    cu['vignetteRoundness'].value = this.config.vignette?.roundness ?? 0.5;
    cu['exposure'].value = this.config.exposure ?? 1.0;
    cu['chromaticAberration'].value = this.config.chromaticAberration ?? 0;
    cu['filmGrain'].value = this.config.filmGrain ?? 0;
    cu['time'].value = this._time;
    this.compositePass.render(this.renderer, null); // output to screen
  }

  /** Render an overlay scene directly to screen (no post-processing). Clears depth only. */
  renderOverlay(overlayScene: THREE.Scene, camera: THREE.Camera): void {
    const prevAutoClear = this.renderer.autoClear;
    const prevToneMapping = this.renderer.toneMapping;
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setRenderTarget(null);
    this.renderer.clearDepth();
    this.renderer.render(overlayScene, camera);
    this.renderer.toneMapping = prevToneMapping;
    this.renderer.autoClear = prevAutoClear;
  }

  setSize(width: number, height: number): void {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);

    this.sceneRT.setSize(width, height);
    if (this.sceneRT.depthTexture) {
      this.sceneRT.depthTexture.image = { width, height };
      this.sceneRT.depthTexture.needsUpdate = true;
    }
    for (let i = 0; i < PostProcessingPipeline.BLOOM_LEVELS; i++) {
      this.bloomChain[i].setSize(halfW >> i, halfH >> i);
    }
    this.ssaoRT.setSize(width, height);
    this.ssaoBlurRT.setSize(width, height);
    this.ensureSSRTargets();
    this.ssgiRT.setSize(halfW, halfH);
    this.ssgiBlurRT.setSize(halfW, halfH);
    this.ssgiBlurRT2.setSize(halfW, halfH);
    this.ssgiUpscaleRT.setSize(width, height);
    this.dofCocRT.setSize(width, height);
    this.dofBlurRT.setSize(width, height);
    this.cloudRT.setSize(halfW, halfH);


    this.ssaoPass.material.uniforms['resolution'].value.set(width, height);
    this.ssaoBlurPass.material.uniforms['resolution'].value.set(width, height);
    this.ssrPass.material.uniforms['depthResolution'].value.set(width, height);
    this.ssgiPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.ssgiPass.material.uniforms['depthResolution'].value.set(width, height);
    this.ssgiBlurHPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.ssgiBlurVPass.material.uniforms['resolution'].value.set(halfW, halfH);
    this.ssgiUpscalePass.material.uniforms['lowResolution'].value.set(halfW, halfH);
    this.ssgiUpscalePass.material.uniforms['hiResolution'].value.set(width, height);
    this.dofBlurPass.material.uniforms['resolution'].value.set(width, height);
    this.cloudPass.material.uniforms['resolution'].value.set(halfW, halfH);
  }

  dispose(): void {
    this.sceneRT.dispose();
    for (const rt of this.bloomChain) rt.dispose();
    this.ssaoRT.dispose();
    this.ssaoBlurRT.dispose();
    this.ssrRT.dispose();
    this.ssgiRT.dispose();
    this.ssgiBlurRT.dispose();
    this.ssgiBlurRT2.dispose();
    this.ssgiUpscaleRT.dispose();
    this.dofCocRT.dispose();
    this.dofBlurRT.dispose();
    this.cloudRT.dispose();
    this.bloomBrightPass.dispose();
    this.bloomDownPass.dispose();
    this.bloomUpPass.dispose();
    this.ssaoPass.dispose();
    this.ssaoBlurPass.dispose();
    this.ssrPass.dispose();
    this.ssgiPass.dispose();
    this.ssgiBlurHPass.dispose();
    this.ssgiBlurVPass.dispose();
    this.ssgiUpscalePass.dispose();
    this.dofCocPass.dispose();
    this.dofBlurPass.dispose();
    this.cloudPass.dispose();
    this.compositePass.dispose();
    for (const unsub of this._shaderUnsubs) unsub();
    this._shaderUnsubs = [];
  }
}
