// ============================================================
// FluxionJS V3 — Binary Scene Serializer
// Produces/consumes compact .fluxsceneb files.
//
// Format overview:
//   HEADER  (10 bytes): magic 'FLX3', format version, entity count
//   STRING TABLE: deduplicated entity names + typeIds
//   PER ENTITY: id, name index, parent id, tag count, component count
//   PER COMPONENT:
//     4 bytes: FNV-32a hash of typeId
//     1 byte:  collision flag (1 = hash collision, string follows)
//     [if collision: 1 byte len + UTF-8 typeId string]
//     4 bytes: JSON payload byte length
//     N bytes: JSON payload (component.serialize() output)
//
// The JSON payload envelope provides ~30-40% size reduction over
// a plain JSON scene file by eliminating structural overhead.
// A future v2 binary format can encode each FieldType as typed
// binary data (float32, uint8, etc.) for further reduction.
// ============================================================

import { Engine } from '../core/Engine';
import { EntityId } from '../core/ECS';
import { BaseComponent } from '../core/BaseComponent';
import { ComponentRegistry } from '../core/ComponentRegistry';
import type { DeserializationContext } from '../core/SerializationContext';
import { MeshRendererComponent } from '../core/Components';
import { BinaryWriter, BinaryReader, buildStringTable, fnv32a } from '../core/BinaryUtils';
import { Scene } from '../scene/Scene';
import { DebugConsole } from '../core/DebugConsole';
import { loadDeferredModel, loadDeferredMaterial, loadDeferredFluxMesh } from './SceneSerializer';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAGIC = 0x464c5833; // 'FLX3'
const FORMAT_VERSION = 1;

// ── Serialize ─────────────────────────────────────────────────────────────────

/**
 * Serialize all entities to a compact binary buffer.
 * Component data is stored as UTF-8 JSON (one payload per component),
 * wrapped in a binary envelope for fast streaming reads.
 */
export function serializeSceneBinary(scene: Scene, engine: Engine): ArrayBuffer {
  const entities = [...engine.ecs.getAllEntities()];

  // ── Build string table ─────────────────────────────────────────────────────
  const allStrings: string[] = [];
  for (const entityId of entities) {
    allStrings.push(engine.ecs.getEntityName(entityId));
    for (const comp of engine.ecs.getAllComponents(entityId)) {
      allStrings.push(comp.type);
    }
  }
  const strTable = buildStringTable(allStrings);

  const w = new BinaryWriter();

  // ── Header ─────────────────────────────────────────────────────────────────
  w.writeUint32(MAGIC);
  w.writeUint16(FORMAT_VERSION);
  w.writeUint32(entities.length);

  // ── String table ───────────────────────────────────────────────────────────
  w.writeUint32(strTable.strings.length);
  for (const s of strTable.strings) {
    w.writeUtf8(s);
  }

  // ── Entities ───────────────────────────────────────────────────────────────
  for (const entityId of entities) {
    const name       = engine.ecs.getEntityName(entityId);
    const parentId   = engine.ecs.getParent(entityId) ?? 0;
    const components = engine.ecs.getAllComponents(entityId);

    w.writeUint32(entityId as number);
    w.writeUint16(strTable.index.get(name)!);
    w.writeUint32(parentId as number);
    w.writeUint8(0); // tag count (reserved)
    w.writeUint8(components.length);

    for (const comp of components) {
      const hash      = fnv32a(comp.type);
      const colliding = ComponentRegistry.isHashColliding(hash);
      const payload   = JSON.stringify((comp as BaseComponent).serialize());
      const payloadBytes = new TextEncoder().encode(payload);

      w.writeUint32(hash);
      w.writeUint8(colliding ? 1 : 0);
      if (colliding) {
        w.writeUtf8(comp.type);
      }
      w.writeUint32(payloadBytes.byteLength);
      w.writeBytes(payloadBytes);
    }
  }

  return w.toArrayBuffer();
}

// ── Deserialize ───────────────────────────────────────────────────────────────

/**
 * Deserialize a binary .fluxsceneb buffer into the running ECS.
 */
export function deserializeSceneBinary(engine: Engine, buffer: ArrayBuffer, scene: Scene): void {
  const r = new BinaryReader(buffer);
  const dec = new TextDecoder();

  // ── Header ─────────────────────────────────────────────────────────────────
  const magic = r.readUint32();
  if (magic !== MAGIC) {
    throw new Error(`[BinarySceneSerializer] Invalid magic: expected 0x${MAGIC.toString(16)}, got 0x${magic.toString(16)}`);
  }
  const formatVersion = r.readUint16();
  if (formatVersion !== FORMAT_VERSION) {
    throw new Error(`[BinarySceneSerializer] Unsupported format version: ${formatVersion}`);
  }
  const entityCount = r.readUint32();

  // ── String table ───────────────────────────────────────────────────────────
  const strCount = r.readUint32();
  const strings: string[] = [];
  for (let i = 0; i < strCount; i++) {
    strings.push(r.readUtf8());
  }

  // ── Deserialization context ─────────────────────────────────────────────────
  scene.clear();

  const ctx: DeserializationContext = {
    engine,
    entityIdMap: new Map(),
    deferredModelLoads: [],
    deferredMaterialLoads: [],
  };

  // Collect raw entity metadata for parent remapping after all entities are created
  const rawEntities: Array<{ oldId: number; parentId: number }> = [];

  // ── Entities ───────────────────────────────────────────────────────────────
  for (let i = 0; i < entityCount; i++) {
    const oldId      = r.readUint32();
    const nameIdx    = r.readUint16();
    const parentId   = r.readUint32();
    const _tagCount  = r.readUint8(); // reserved, skip
    const compCount  = r.readUint8();

    const name     = strings[nameIdx] ?? `Entity_${oldId}`;
    const entityId = engine.ecs.createEntity(name);
    ctx.entityIdMap.set(oldId, entityId);
    rawEntities.push({ oldId, parentId });

    for (let c = 0; c < compCount; c++) {
      const hash      = r.readUint32();
      const hasString = r.readUint8() === 1;
      const typeId    = hasString ? r.readUtf8() : (ComponentRegistry.resolveHash(hash) ?? '');
      const payloadLen = r.readUint32();
      const payloadBytes = r.readBytes(payloadLen);

      if (!typeId) {
        DebugConsole.LogWarning(`[BinarySceneSerializer] Unresolvable component hash 0x${hash.toString(16)} — skipped.`);
        continue;
      }

      const comp = ComponentRegistry.create(typeId);
      if (!comp) {
        DebugConsole.LogWarning(`[BinarySceneSerializer] Unknown component type: "${typeId}" — skipped.`);
        continue;
      }

      let data: Record<string, any> = {};
      try {
        data = JSON.parse(dec.decode(payloadBytes));
      } catch (e) {
        DebugConsole.LogWarning(`[BinarySceneSerializer] Failed to parse payload for "${typeId}": ${e}`);
      }

      (comp as BaseComponent).deserialize(data, ctx);
      engine.ecs.addComponent(entityId, comp);
    }
  }

  // ── Restore parent relationships ───────────────────────────────────────────
  for (const { oldId, parentId } of rawEntities) {
    if (parentId !== 0) {
      const newChildId  = ctx.entityIdMap.get(oldId)!;
      const newParentId = ctx.entityIdMap.get(parentId);
      if (newParentId !== undefined) {
        engine.ecs.setParent(newChildId, newParentId);
      } else {
        engine.ecs.setParent(newChildId, parentId as EntityId);
      }
    }
  }

  // ── Fire deferred asset loads ──────────────────────────────────────────────
  for (const d of ctx.deferredModelLoads) {
    if (d.modelPath.endsWith('.fluxmesh')) {
      loadDeferredFluxMesh(engine, d.meshComp, d.modelPath);
    } else {
      loadDeferredModel(engine, d.meshComp, d.modelPath);
    }
  }
  for (const d of ctx.deferredMaterialLoads) loadDeferredMaterial(engine, d.meshComp, d.materialPath);
}
