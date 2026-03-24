// ============================================================
// FluxionJS V2 — GPU Particle System
// Nuake-inspired particle emitter using Three.js instancing
// ============================================================

import * as THREE from 'three';
import { ECSManager, EntityId, System } from '../core/ECS';
import { TransformComponent, ParticleEmitterComponent } from '../core/Components';

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

class ParticlePool {
  particles: Particle[] = [];
  private instancedMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private colorAttr: THREE.InstancedBufferAttribute;
  private alive = 0;
  private maxCount: number;

  constructor(maxParticles: number, scene: THREE.Scene) {
    this.maxCount = maxParticles;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, maxParticles);
    this.instancedMesh.frustumCulled = false;

    // Per-instance color
    const colors = new Float32Array(maxParticles * 3);
    this.colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    this.instancedMesh.instanceColor = this.colorAttr;

    // Hide all initially
    for (let i = 0; i < maxParticles; i++) {
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
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

      // Random direction with spread
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
        // Hide dead particle
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        this.alive--;
        continue;
      }

      // Physics
      p.velocity.y += gravity * dt;
      p.position.addScaledVector(p.velocity, dt);

      // Interpolate properties
      const t = 1 - p.life / p.maxLife;
      const currentSize = THREE.MathUtils.lerp(p.startSize, p.endSize, t);
      p.color.lerpColors(p.startColor, p.endColor, t);

      // Update instance matrix
      this.dummy.position.copy(p.position);
      this.dummy.scale.set(currentSize, currentSize, currentSize);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(writeIdx, this.dummy.matrix);

      // Update instance color
      this.colorAttr.setXYZ(writeIdx, p.color.r, p.color.g, p.color.b);

      this.particles[writeIdx] = p;
      writeIdx++;
    }

    this.particles.length = writeIdx;
    this.instancedMesh.count = writeIdx;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  dispose(): void {
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
    this.instancedMesh.parent?.remove(this.instancedMesh);
  }
}

export class ParticleRenderSystem implements System {
  readonly name = 'ParticleRenderer';
  readonly requiredComponents = ['Transform', 'ParticleEmitter'];
  priority = 50;
  enabled = true;

  private pools: Map<EntityId, ParticlePool> = new Map();
  private emitAccumulators: Map<EntityId, number> = new Map();
  private lastMaxParticles: Map<EntityId, number> = new Map();
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(entities: Set<EntityId>, ecs: ECSManager, dt: number): void {
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
