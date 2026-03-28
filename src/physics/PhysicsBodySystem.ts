// ============================================================
// FluxionJS V3 — Physics Body System
// Single responsibility: rigid body + collider lifecycle and
// Transform ↔ Rapier synchronisation.
//
// Rules:
//   • Only runs while engine.simulationPaused === false (game play).
//   • All Rapier object creation/destruction goes through PhysicsWorld
//     registration helpers so the reverse-lookup maps stay consistent.
//   • Body type change → full recreate (bodyType is immutable in Rapier).
//   • Scalar property change → in-place Rapier API update (no recreate).
//   • Collider shape change → collider recreate only (body preserved).
//   • Mesh / Convex shapes → async load from asset path, deferred one frame.
//   • Collision filtering applied via Rapier interaction groups.
//   • Sleeping configured per-body via canSleep flag.
// ============================================================

import * as THREE from 'three';
import { ECSManager, EntityId, System, isDirty, clearDirty } from '../core/ECS';
import { TransformComponent, RigidbodyComponent, ColliderComponent } from '../core/Components';
import { DebugConsole } from '../core/DebugConsole';
import { AssetManager } from '../assets/AssetManager';
import { PhysicsWorld } from './PhysicsWorld';

// ── Rapier interaction groups helper ─────────────────────────────────────────
// High 16 bits = membership (which groups this collider belongs to)
// Low  16 bits = filter     (which groups this collider interacts with)
function interactionGroups(layer: number, mask: number): number {
  return ((layer & 0xFFFF) << 16) | (mask & 0xFFFF);
}

// ── Extracted mesh geometry (cached per entity) ───────────────────────────────
interface MeshGeo {
  vertices: Float32Array;
  indices:  Uint32Array;
}

export class PhysicsBodySystem implements System {
  readonly name = 'PhysicsBodySystem';
  // Process any entity that has a Collider — Rigidbody is optional.
  // Entities with Collider but no Rigidbody get an implicit fixed (static) body.
  readonly requiredComponents = ['Transform', 'Collider'];
  priority = -100;
  enabled = true;

  private tracked       = new Set<EntityId>();
  private lastBodyType  = new Map<EntityId, string>();
  private lastShape     = new Map<EntityId, string>();
  private lastMeshPath  = new Map<EntityId, string>();
  /** Entities whose Rapier body was created implicitly (no RigidbodyComponent). */
  private implicitStaticEntities = new Set<EntityId>();

  // ── Mesh collision geometry cache ──────────────────────────────────────────
  /** Entities currently awaiting async geometry load. */
  private pendingMeshLoads = new Set<EntityId>();
  /** Loaded and extracted geometry per entity. `null` = load failed. */
  private meshGeometry     = new Map<EntityId, MeshGeo | null>();

  constructor(private pw: PhysicsWorld) {}

  onSceneClear(): void {
    for (const entity of this.tracked) {
      this._removeBody(entity);
    }
    this.tracked.clear();
    this.lastBodyType.clear();
    this.lastShape.clear();
    this.lastMeshPath.clear();
    this.pendingMeshLoads.clear();
    this.meshGeometry.clear();
    this.implicitStaticEntities.clear();
  }

  // No variable-rate work needed — all logic lives in fixedUpdate
  update(_entities: Set<EntityId>, _ecs: ECSManager): void { /* no-op */ }

  fixedUpdate(entities: Set<EntityId>, ecs: ECSManager): void {
    if (!this.pw.isReady) return;

    for (const entity of entities) {
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!transform) continue;

      const rb       = ecs.getComponent<RigidbodyComponent>(entity, 'Rigidbody');
      const collider = ecs.getComponent<ColliderComponent>(entity, 'Collider');
      const isImplicit = !rb; // Collider-only entity → implicit static body

      // ── Create on first encounter ─────────────────────────────────────────
      if (!this.tracked.has(entity)) {
        if (rb) {
          this._createBody(entity, rb, transform);
          this.lastBodyType.set(entity, rb.bodyType);
        } else {
          // No RigidbodyComponent — create an implicit fixed (static) body
          this._createImplicitStaticBody(entity, transform);
          this.implicitStaticEntities.add(entity);
        }
        if (collider) {
          this._createCollider(entity, collider, rb ?? null);
          this.lastShape.set(entity, collider.shape);
          this.lastMeshPath.set(entity, collider.meshPath ?? '');
        }
        this.tracked.add(entity);
      }

      // ── Implicit static entities: only react to collider changes ─────────
      if (isImplicit) {
        if (collider && isDirty(collider)) {
          const shapeChanged    = this.lastShape.get(entity) !== collider.shape;
          const meshPathChanged = this.lastMeshPath.get(entity) !== (collider.meshPath ?? '');
          if (shapeChanged || meshPathChanged) {
            this.meshGeometry.delete(entity);
            this.pendingMeshLoads.delete(entity);
            this._removeCollider(entity);
            collider.colliderHandle = null;
            this._createCollider(entity, collider, null);
            this.lastShape.set(entity, collider.shape);
            this.lastMeshPath.set(entity, collider.meshPath ?? '');
          } else {
            this._updateColliderProperties(entity, collider, null);
          }
          clearDirty(collider);
        }
        continue;
      }

      // ── React to rigidbody property changes ──────────────────────────────
      if (rb && isDirty(rb)) {
        if (this.lastBodyType.get(entity) !== rb.bodyType) {
          // Body type is immutable → full recreate
          this._removeBody(entity);
          rb.bodyHandle = null;
          this._createBody(entity, rb, transform);
          this.lastBodyType.set(entity, rb.bodyType);
          if (collider) {
            collider.colliderHandle = null;
            this._createCollider(entity, collider, rb);
            this.lastShape.set(entity, collider.shape);
            this.lastMeshPath.set(entity, collider.meshPath ?? '');
          }
        } else {
          this._updateBodyProperties(entity, rb);
        }
        clearDirty(rb);
      }

      // ── React to collider property changes ───────────────────────────────
      if (collider && isDirty(collider)) {
        const shapeChanged    = this.lastShape.get(entity) !== collider.shape;
        const meshPathChanged = this.lastMeshPath.get(entity) !== (collider.meshPath ?? '');

        if (shapeChanged || meshPathChanged) {
          // Shape or source mesh changed — invalidate geometry cache and rebuild
          this.meshGeometry.delete(entity);
          this.pendingMeshLoads.delete(entity);
          this._removeCollider(entity);
          collider.colliderHandle = null;
          this._createCollider(entity, collider, rb ?? null);
          this.lastShape.set(entity, collider.shape);
          this.lastMeshPath.set(entity, collider.meshPath ?? '');
        } else {
          this._updateColliderProperties(entity, collider, rb ?? null);
        }
        clearDirty(collider);
      }

      // ── Sync physics → transform (dynamic bodies) ─────────────────────────
      if (rb && rb.bodyHandle && rb.bodyType === 'dynamic') {
        const pos = rb.bodyHandle.translation();
        const rot = rb.bodyHandle.rotation();
        transform.position.set(pos.x, pos.y, pos.z);
        transform.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        transform.rotation.setFromQuaternion(transform.quaternion);
      }

      // ── Sync transform → physics (kinematic bodies) ───────────────────────
      if (rb && rb.bodyHandle && rb.bodyType === 'kinematic') {
        rb.bodyHandle.setNextKinematicTranslation({
          x: transform.position.x,
          y: transform.position.y,
          z: transform.position.z,
        });
        rb.bodyHandle.setNextKinematicRotation({
          x: transform.quaternion.x,
          y: transform.quaternion.y,
          z: transform.quaternion.z,
          w: transform.quaternion.w,
        });
      }
    }

    // ── Remove entities that left the tracked set ─────────────────────────
    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this._removeBody(entity);
        this.tracked.delete(entity);
        this.implicitStaticEntities.delete(entity);
        this.lastBodyType.delete(entity);
        this.lastShape.delete(entity);
        this.lastMeshPath.delete(entity);
      }
    }
  }

  // ── Body creation ─────────────────────────────────────────────────────────

  private _createBody(entity: EntityId, rb: RigidbodyComponent, t: TransformComponent): void {
    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    let desc: any;
    switch (rb.bodyType) {
      case 'dynamic':   desc = RAPIER.RigidBodyDesc.dynamic(); break;
      case 'kinematic': desc = RAPIER.RigidBodyDesc.kinematicPositionBased(); break;
      default:          desc = RAPIER.RigidBodyDesc.fixed(); break;
    }

    desc
      .setTranslation(t.worldPosition.x, t.worldPosition.y, t.worldPosition.z)
      .setRotation({ x: t.worldRotation.x, y: t.worldRotation.y, z: t.worldRotation.z, w: t.worldRotation.w })
      .setLinearDamping(rb.linearDamping)
      .setAngularDamping(rb.angularDamping)
      .setGravityScale(rb.gravityScale)
      .setCcdEnabled(rb.isContinuous)
      .setCanSleep(rb.canSleep);

    const body = world.createRigidBody(desc);

    if (rb.bodyType === 'dynamic') {
      body.setAdditionalMass(rb.mass, true);
    }

    if (rb.lockLinearX || rb.lockLinearY || rb.lockLinearZ) {
      body.setEnabledTranslations(!rb.lockLinearX, !rb.lockLinearY, !rb.lockLinearZ, true);
    }
    if (rb.lockAngularX || rb.lockAngularY || rb.lockAngularZ) {
      body.setEnabledRotations(!rb.lockAngularX, !rb.lockAngularY, !rb.lockAngularZ, true);
    }

    rb.bodyHandle = body;
    this.pw.registerBody(entity, body);
  }

  // ── Implicit static body (Collider-only entity) ───────────────────────────

  private _createImplicitStaticBody(entity: EntityId, t: TransformComponent): void {
    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(t.worldPosition.x, t.worldPosition.y, t.worldPosition.z)
      .setRotation({ x: t.worldRotation.x, y: t.worldRotation.y, z: t.worldRotation.z, w: t.worldRotation.w });

    const body = world.createRigidBody(desc);
    this.pw.registerBody(entity, body);
  }

  // ── Collider creation ─────────────────────────────────────────────────────

  private _createCollider(entity: EntityId, col: ColliderComponent, rb: RigidbodyComponent | null): void {
    const body = this.pw.getBody(entity);
    if (!body) return;
    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    let desc: any;
    switch (col.shape) {
      case 'sphere':
        desc = RAPIER.ColliderDesc.ball(col.radius);
        break;

      case 'capsule': {
        const halfCyl = Math.max(0, (col.height - 2 * col.radius)) / 2;
        desc = RAPIER.ColliderDesc.capsule(halfCyl, col.radius);
        break;
      }

      case 'mesh': {
        const geo = this._getOrLoadGeometry(entity, col);
        if (!geo) return; // pending async load — will retry when load resolves
        desc = RAPIER.ColliderDesc.trimesh(geo.vertices, geo.indices);
        break;
      }

      case 'convex': {
        const geo = this._getOrLoadGeometry(entity, col);
        if (!geo) return; // pending async load — will retry when load resolves
        desc = RAPIER.ColliderDesc.convexHull(geo.vertices);
        if (!desc) {
          DebugConsole.LogWarning(
            `[PhysicsBodySystem] convexHull failed for entity ${entity} — ` +
            `geometry may be degenerate (< 4 non-coplanar points). Falling back to Box.`
          );
          desc = RAPIER.ColliderDesc.cuboid(col.size.x / 2, col.size.y / 2, col.size.z / 2);
        }
        break;
      }

      case 'box':
      default:
        desc = RAPIER.ColliderDesc.cuboid(col.size.x / 2, col.size.y / 2, col.size.z / 2);
        break;
    }

    // Collision filtering — interaction groups: (membership << 16) | filter
    desc
      .setTranslation(col.offset.x, col.offset.y, col.offset.z)
      .setFriction(rb ? rb.friction : 0.5)
      .setRestitution(rb ? rb.restitution : 0.0)
      .setSensor(col.isTrigger)
      .setCollisionGroups(interactionGroups(col.collisionLayer, col.collisionMask))
      .setSolverGroups(interactionGroups(col.collisionLayer, col.collisionMask));

    const rapierCol = world.createCollider(desc, body);
    col.colliderHandle = rapierCol;
    this.pw.registerCollider(entity, rapierCol);
  }

  // ── Mesh geometry: get from cache or kick off async load ─────────────────

  private _getOrLoadGeometry(entity: EntityId, col: ColliderComponent): MeshGeo | null {
    // No path set → warn and signal fallback via null
    if (!col.meshPath) {
      DebugConsole.LogWarning(
        `[PhysicsBodySystem] Shape '${col.shape}' on entity ${entity} has no Mesh Source set. ` +
        `Assign a .fbx, .glb, or .fluxmesh file in the Collider component.`
      );
      return null;
    }

    // Already cached (success or failure)
    if (this.meshGeometry.has(entity)) {
      const cached = this.meshGeometry.get(entity)!;
      if (!cached) {
        // Previous load failed — fall back to box silently (warning already emitted)
        return null;
      }
      return cached;
    }

    // Already loading — wait for it
    if (this.pendingMeshLoads.has(entity)) return null;

    // Kick off async load
    this.pendingMeshLoads.add(entity);
    this._loadMeshGeometry(entity, col.meshPath, col).catch(() => {
      // Error already logged inside _loadMeshGeometry
      this.meshGeometry.set(entity, null);
      this.pendingMeshLoads.delete(entity);
    });

    return null; // deferred — collider will be created next frame
  }

  private async _loadMeshGeometry(
    entity: EntityId,
    meshPath: string,
    col: ColliderComponent,
  ): Promise<void> {
    try {
      const am = this.pw.engineRef.getSubsystem('assets') as AssetManager;
      let scene: THREE.Group;

      if (meshPath.endsWith('.fluxmesh')) {
        const result = await am.loadFluxMesh(meshPath);
        scene = result.scene;
      } else {
        const result = await am.loadModel(meshPath);
        scene = result.scene;
      }

      const geo = PhysicsBodySystem._extractGeometry(scene);
      if (!geo) {
        DebugConsole.LogWarning(
          `[PhysicsBodySystem] No geometry found in '${meshPath}' for entity ${entity}.`
        );
      }
      this.meshGeometry.set(entity, geo);
      this.lastMeshPath.set(entity, meshPath);
    } catch (err) {
      DebugConsole.LogWarning(
        `[PhysicsBodySystem] Failed to load mesh collider '${meshPath}' for entity ${entity}: ${err}`
      );
      this.meshGeometry.set(entity, null);
    } finally {
      this.pendingMeshLoads.delete(entity);
      // Trigger collider creation on the next update tick
      col.__dirty = true;
    }
  }

  // ── Geometry extraction from THREE.Group ─────────────────────────────────
  // Merges all sub-meshes into one flat vertex + index buffer.

  private static _extractGeometry(root: THREE.Object3D): MeshGeo | null {
    const positions: number[] = [];
    const indices:   number[] = [];

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const geo = (obj as THREE.Mesh).geometry as THREE.BufferGeometry;
      if (!geo) return;

      // Get world-space positions (respects child transforms)
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (!posAttr) return;

      const vertexOffset = positions.length / 3;

      // Apply object's world matrix to each vertex
      const mat = obj.matrixWorld;
      const v   = new THREE.Vector3();
      for (let i = 0; i < posAttr.count; i++) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(mat);
        positions.push(v.x, v.y, v.z);
      }

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) {
          indices.push(geo.index.array[i] + vertexOffset);
        }
      } else {
        // Non-indexed: generate triangle indices
        for (let i = 0; i < posAttr.count; i++) {
          indices.push(i + vertexOffset);
        }
      }
    });

    if (positions.length === 0) return null;

    return {
      vertices: new Float32Array(positions),
      indices:  new Uint32Array(indices),
    };
  }

  // ── In-place body property update (no recreate) ───────────────────────────

  private _updateBodyProperties(entity: EntityId, rb: RigidbodyComponent): void {
    const body = this.pw.getBody(entity);
    if (!body) return;
    body.setLinearDamping(rb.linearDamping);
    body.setAngularDamping(rb.angularDamping);
    body.setGravityScale(rb.gravityScale, true);
    body.enableCcd(rb.isContinuous);
    body.setCanSleep(rb.canSleep);
    if (rb.bodyType === 'dynamic') body.setAdditionalMass(rb.mass, true);
    body.setEnabledTranslations(!rb.lockLinearX, !rb.lockLinearY, !rb.lockLinearZ, true);
    body.setEnabledRotations(!rb.lockAngularX, !rb.lockAngularY, !rb.lockAngularZ, true);
  }

  // ── In-place collider property update (no recreate) ──────────────────────

  private _updateColliderProperties(entity: EntityId, col: ColliderComponent, rb: RigidbodyComponent | null): void {
    const rapierCol = this.pw.getCollider(entity);
    if (!rapierCol) return;
    rapierCol.setFriction(rb ? rb.friction : 0.5);
    rapierCol.setRestitution(rb ? rb.restitution : 0.0);
    rapierCol.setSensor(col.isTrigger);
    rapierCol.setCollisionGroups(interactionGroups(col.collisionLayer, col.collisionMask));
    rapierCol.setSolverGroups(interactionGroups(col.collisionLayer, col.collisionMask));
  }

  // ── Removal helpers ───────────────────────────────────────────────────────

  private _removeCollider(entity: EntityId): void {
    const rapierCol = this.pw.getCollider(entity);
    if (rapierCol) {
      try { this.pw.rapierWorld.removeCollider(rapierCol, true); } catch { /**/ }
    }
    this.pw.unregisterCollider(entity);
  }

  private _removeBody(entity: EntityId): void {
    this._removeCollider(entity);
    const body = this.pw.getBody(entity);
    if (body) {
      try { this.pw.rapierWorld.removeRigidBody(body); } catch { /**/ }
    }
    this.pw.unregisterBody(entity);
    this.pendingMeshLoads.delete(entity);
    this.meshGeometry.delete(entity);
    this.implicitStaticEntities.delete(entity);
    const rb = this.pw.engineRef.ecs.getComponent<RigidbodyComponent>(entity, 'Rigidbody');
    if (rb) rb.bodyHandle = null;
    const col = this.pw.engineRef.ecs.getComponent<ColliderComponent>(entity, 'Collider');
    if (col) col.colliderHandle = null;
  }
}
