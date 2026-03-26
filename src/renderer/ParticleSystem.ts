// ============================================================
// FluxionJS V3 — GPU Billboard Particle System
// Camera-facing billboard via vertex shader, soft particles via
// depth-texture fade in fragment shader.  Uses InstancedMesh
// with instanced attributes (offset, scale, color, opacity).
// ============================================================

import * as THREE from 'three';
import { ECSManager, EntityId, System } from '../core/ECS';
import { TransformComponent, ParticleEmitterComponent } from '../core/Components';

// ── Shaders ──

const PARTICLE_VERT = `
  // Per-vertex quad (PlaneGeometry)
  // Per-instance: aOffset (vec3), aScale (float), aColor (vec3), aOpacity (float)

  attribute vec3 aOffset;
  attribute float aScale;
  attribute vec3 aColor;
  attribute float aOpacity;

  uniform vec3 camRight;
  uniform vec3 camUp;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vViewZ;

  void main() {
    vUv = uv;
    vColor = aColor;
    vOpacity = aOpacity;

    // Billboard: expand quad in camera-aligned plane
    vec3 worldPos = aOffset
      + camRight * position.x * aScale
      + camUp    * position.y * aScale;

    vec4 mvPos = modelViewMatrix * vec4(worldPos, 1.0);
    vViewZ = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const PARTICLE_FRAG = `
  // Soft particles: only used when softParticles = true AND an opaque
  // depth pre-pass texture is provided (avoids framebuffer feedback loop).
  uniform bool softParticles;
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform vec2 resolution;
  uniform float softDistance;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vViewZ;

  float linearizeDepth(float d) {
    return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
  }

  void main() {
    // Circular falloff
    float dist = length(vUv - 0.5) * 2.0;
    float alpha = 1.0 - smoothstep(0.4, 1.0, dist);
    alpha *= vOpacity;

    // Soft particle fade — only when a pre-pass depth texture is available.
    // When disabled (default) the depth texture is the ACTIVE render target,
    // which would create a feedback loop and return 0 for all depth reads.
    if (softParticles) {
      vec2 screenUV = gl_FragCoord.xy / resolution;
      float sceneDepth = linearizeDepth(texture2D(tDepth, screenUV).r);
      float fade = clamp((sceneDepth - vViewZ) / softDistance, 0.0, 1.0);
      alpha *= fade;
    }

    if (alpha < 0.001) discard;

    gl_FragColor = vec4(vColor * alpha, alpha);
  }
`;

// ── Particle data ──

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  startSize: number;
  endSize: number;
  color: THREE.Color;
  startColor: THREE.Color;
  endColor: THREE.Color;
}

// ── Pool ──

class ParticlePool {
  particles: Particle[] = [];
  private instancedMesh: THREE.InstancedMesh;
  private alive = 0;
  private maxCount: number;

  // Instanced attributes
  private offsetAttr: THREE.InstancedBufferAttribute;
  private scaleAttr: THREE.InstancedBufferAttribute;
  private colorAttr: THREE.InstancedBufferAttribute;
  private opacityAttr: THREE.InstancedBufferAttribute;

  // Material ref for uniform updates
  readonly material: THREE.ShaderMaterial;

  constructor(maxParticles: number, scene: THREE.Scene) {
    this.maxCount = maxParticles;

    const geo = new THREE.PlaneGeometry(1, 1);

    // Instanced attributes
    const offsets  = new Float32Array(maxParticles * 3);
    const scales   = new Float32Array(maxParticles);
    const colors   = new Float32Array(maxParticles * 3);
    const opacities = new Float32Array(maxParticles);

    this.offsetAttr  = new THREE.InstancedBufferAttribute(offsets, 3);
    this.scaleAttr   = new THREE.InstancedBufferAttribute(scales, 1);
    this.colorAttr   = new THREE.InstancedBufferAttribute(colors, 3);
    this.opacityAttr = new THREE.InstancedBufferAttribute(opacities, 1);

    geo.setAttribute('aOffset',  this.offsetAttr);
    geo.setAttribute('aScale',   this.scaleAttr);
    geo.setAttribute('aColor',   this.colorAttr);
    geo.setAttribute('aOpacity', this.opacityAttr);

    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: {
        camRight:      { value: new THREE.Vector3(1, 0, 0) },
        camUp:         { value: new THREE.Vector3(0, 1, 0) },
        softParticles: { value: false },
        // tDepth is null by default — only set when softParticles is enabled
        // to avoid WebGL2 feedback loop (particles render into the same RT
        // whose depth texture would otherwise be bound here).
        tDepth:        { value: null as THREE.Texture | null },
        cameraNear:    { value: 0.1 },
        cameraFar:     { value: 1000 },
        resolution:    { value: new THREE.Vector2(1, 1) },
        softDistance:  { value: 1.0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, this.material, maxParticles);
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.count = 0;

    // Identity matrices — billboard is handled in vertex shader
    const identity = new THREE.Matrix4();
    for (let i = 0; i < maxParticles; i++) {
      this.instancedMesh.setMatrixAt(i, identity);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    scene.add(this.instancedMesh);
  }

  emit(
    position: THREE.Vector3,
    config: ParticleEmitterComponent,
    count: number
  ): void {
    for (let i = 0; i < count && this.alive < this.maxCount; i++) {
      const life = THREE.MathUtils.lerp(config.lifetime.x, config.lifetime.y, Math.random());
      const speed = THREE.MathUtils.lerp(config.speed.x, config.speed.y, Math.random());
      const size = THREE.MathUtils.lerp(config.size.x, config.size.y, Math.random());

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * config.spread * 2,
        1,
        (Math.random() - 0.5) * config.spread * 2
      ).normalize().multiplyScalar(speed);

      const particle: Particle = {
        position: position.clone(),
        velocity: dir,
        life,
        maxLife: life,
        size,
        startSize: size,
        endSize: size * 0.1,
        color: config.startColor.clone(),
        startColor: config.startColor.clone(),
        endColor: config.endColor.clone(),
      };

      this.particles.push(particle);
      this.alive++;
    }
  }

  update(dt: number, gravity: number): void {
    let writeIdx = 0;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.alive--;
        continue;
      }

      // Physics
      p.velocity.y += gravity * dt;
      p.position.addScaledVector(p.velocity, dt);

      // Interpolate
      const t = 1 - p.life / p.maxLife;
      const currentSize = THREE.MathUtils.lerp(p.startSize, p.endSize, t);
      p.color.lerpColors(p.startColor, p.endColor, t);

      // Write instanced attributes
      this.offsetAttr.setXYZ(writeIdx, p.position.x, p.position.y, p.position.z);
      this.scaleAttr.setX(writeIdx, currentSize);
      this.colorAttr.setXYZ(writeIdx, p.color.r, p.color.g, p.color.b);
      this.opacityAttr.setX(writeIdx, p.life / p.maxLife);

      this.particles[writeIdx] = p;
      writeIdx++;
    }

    this.particles.length = writeIdx;
    this.instancedMesh.count = writeIdx;

    this.offsetAttr.needsUpdate = true;
    this.scaleAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.opacityAttr.needsUpdate = true;
  }

  dispose(): void {
    this.instancedMesh.geometry.dispose();
    this.material.dispose();
    this.instancedMesh.parent?.remove(this.instancedMesh);
  }
}

// ── System ──

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

export class ParticleRenderSystem implements System {
  readonly name = 'ParticleRenderer';
  readonly requiredComponents = ['Transform', 'ParticleEmitter'];
  priority = 50;
  enabled = true;

  private pools: Map<EntityId, ParticlePool> = new Map();
  private emitAccumulators: Map<EntityId, number> = new Map();
  private lastMaxParticles: Map<EntityId, number> = new Map();
  private scene: THREE.Scene;
  private depthTexture: THREE.Texture | null = null;
  private camera: THREE.Camera | null = null;
  private resolution = new THREE.Vector2(1, 1);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Store the opaque-depth pre-pass texture for soft particles. */
  setDepthTexture(tex: THREE.Texture | null): void {
    this.depthTexture = tex;
    // tDepth is applied per-frame in update() only when softParticles is enabled,
    // to avoid WebGL2 feedback loop on the active render target's depth attachment.
  }

  /** Must be called every frame so billboard orientation + near/far stay current. */
  setCamera(cam: THREE.Camera, width?: number, height?: number): void {
    this.camera = cam;
    if (width && height) this.resolution.set(width, height);
  }

  update(entities: Set<EntityId>, ecs: ECSManager, dt: number): void {
    // Extract camera vectors once per frame
    if (this.camera) {
      this.camera.matrixWorld.extractBasis(_right, _up, new THREE.Vector3());
    }

    for (const entity of entities) {
      const emitter = ecs.getComponent<ParticleEmitterComponent>(entity, 'ParticleEmitter');
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!emitter || !transform || !emitter.enabled) continue;

      // Detect maxParticles change → recreate pool
      const prevMax = this.lastMaxParticles.get(entity);
      if (prevMax !== undefined && prevMax !== emitter.maxParticles && this.pools.has(entity)) {
        this.pools.get(entity)!.dispose();
        this.pools.delete(entity);
      }
      this.lastMaxParticles.set(entity, emitter.maxParticles);

      // Create pool if needed
      if (!this.pools.has(entity)) {
        this.pools.set(entity, new ParticlePool(emitter.maxParticles, this.scene));
        this.emitAccumulators.set(entity, 0);
      }

      const pool = this.pools.get(entity)!;

      // Update camera uniforms
      if (this.camera) {
        const u = pool.material.uniforms;
        u['camRight'].value.copy(_right);
        u['camUp'].value.copy(_up);
        u['cameraNear'].value = (this.camera as any).near ?? 0.1;
        u['cameraFar'].value = (this.camera as any).far ?? 1000;
        (u['resolution'].value as THREE.Vector2).copy(this.resolution);
      }

      // Sync soft-particle settings from emitter component.
      // When soft particles are off, set tDepth to null to avoid WebGL2
      // feedback loop detection (draw call rejected if a bound sampler
      // references the active depth attachment, even in dead code paths).
      {
        const u = pool.material.uniforms;
        const useSoft = emitter.softParticles && this.depthTexture !== null;
        u['softParticles'].value = useSoft;
        u['tDepth'].value = useSoft ? this.depthTexture : null;
        u['softDistance'].value = emitter.softDistance;
      }

      let accum = this.emitAccumulators.get(entity) ?? 0;

      // Emit particles
      accum += dt * emitter.emissionRate;
      const toEmit = Math.floor(accum);
      accum -= toEmit;
      this.emitAccumulators.set(entity, accum);

      if (toEmit > 0) {
        pool.emit(transform.position, emitter, toEmit);
      }

      // Update particles
      pool.update(dt, emitter.gravity);
    }

    // Clean up removed
    for (const [entity, pool] of this.pools) {
      if (!entities.has(entity)) {
        pool.dispose();
        this.pools.delete(entity);
        this.emitAccumulators.delete(entity);
      }
    }
  }

  destroy(): void {
    for (const pool of this.pools.values()) {
      pool.dispose();
    }
    this.pools.clear();
  }
}
