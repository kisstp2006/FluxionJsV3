// ============================================================
// FluxionJS V3 — Physics Worker
// Runs Rapier off the main thread. Receives typed messages,
// steps the physics world, and writes dynamic body results
// back to a SharedArrayBuffer.
//
// Threading model (per frame):
//   Main thread writes kinematic transforms → buffer
//   Sends 'step' message → this worker
//   Worker reads kinematic slots, runs world.step()
//   Worker writes dynamic body positions → buffer
//   Worker sends 'step-done' with dynamic slot list
//   Main thread awaits, reads dynamic transforms from buffer
// ============================================================

import type {
  PhysicsWorkerRequest,
  PhysicsWorkerResponse,
  SerializedBodyDesc,
} from './PhysicsWorkerProtocol';
import type { EntityId } from '../core/ECS';

const FLOATS_PER_SLOT = 10;

type Rapier = typeof import('@dimforge/rapier3d-compat');
let rapier: Rapier | null = null;
let world:  InstanceType<Rapier['World']> | null = null;
let buffer: Float32Array | null = null;

// entity → Rapier body handle
const bodyMap = new Map<EntityId, any>();
// entity → slot index in SharedTransformBuffer
const slotMap = new Map<EntityId, number>();

async function init(
  sharedBuffer: SharedArrayBuffer,
  gravity: [number, number, number],
): Promise<void> {
  rapier = await import('@dimforge/rapier3d-compat');
  await rapier.init();
  world  = new rapier.World({ x: gravity[0], y: gravity[1], z: gravity[2] } as any);
  buffer = new Float32Array(sharedBuffer);
  const resp: PhysicsWorkerResponse = { type: 'ready' };
  (self as any).postMessage(resp);
}

function addBody(entity: EntityId, desc: SerializedBodyDesc): void {
  if (!rapier || !world) return;
  let bodyDesc: any;
  switch (desc.bodyType) {
    case 'dynamic':   bodyDesc = rapier.RigidBodyDesc.dynamic();   break;
    case 'kinematic': bodyDesc = rapier.RigidBodyDesc.kinematicPositionBased(); break;
    default:          bodyDesc = rapier.RigidBodyDesc.fixed();      break;
  }
  bodyDesc.setLinearDamping(desc.linearDamping);
  bodyDesc.setAngularDamping(desc.angularDamping);
  bodyDesc.setGravityScale(desc.gravityScale);
  bodyDesc.canSleep = desc.canSleep;

  // Set initial pose from shared buffer
  if (buffer) {
    const base = desc.slot * FLOATS_PER_SLOT;
    bodyDesc.setTranslation(buffer[base], buffer[base + 1], buffer[base + 2]);
    bodyDesc.setRotation({ x: buffer[base + 3], y: buffer[base + 4], z: buffer[base + 5], w: buffer[base + 6] });
  }

  const body = world.createRigidBody(bodyDesc);
  bodyMap.set(entity, body);
  slotMap.set(entity, desc.slot);
}

function removeBody(entity: EntityId): void {
  if (!world) return;
  const body = bodyMap.get(entity);
  if (body) world.removeRigidBody(body);
  bodyMap.delete(entity);
  slotMap.delete(entity);
}

function step(dt: number, kinematicSlots: Int32Array): void {
  if (!world || !buffer || !rapier) return;

  // Write kinematic body transforms from buffer
  for (const [entity, body] of bodyMap) {
    if (!body.isKinematic()) continue;
    const slot = slotMap.get(entity);
    if (slot === undefined) continue;
    const base = slot * FLOATS_PER_SLOT;
    body.setNextKinematicTranslation({ x: buffer[base], y: buffer[base + 1], z: buffer[base + 2] });
    body.setNextKinematicRotation({ x: buffer[base + 3], y: buffer[base + 4], z: buffer[base + 5], w: buffer[base + 6] });
  }

  world.timestep = dt;
  world.step();

  // Write dynamic body results back to buffer
  const dynamicSlotsList: number[] = [];
  for (const [entity, body] of bodyMap) {
    if (!body.isDynamic()) continue;
    const slot = slotMap.get(entity);
    if (slot === undefined) continue;
    const t = body.translation();
    const r = body.rotation();
    const base = slot * FLOATS_PER_SLOT;
    buffer[base]     = t.x; buffer[base + 1] = t.y; buffer[base + 2] = t.z;
    buffer[base + 3] = r.x; buffer[base + 4] = r.y; buffer[base + 5] = r.z; buffer[base + 6] = r.w;
    dynamicSlotsList.push(slot);
  }

  const dynamicSlots = new Int32Array(dynamicSlotsList);
  const resp: PhysicsWorkerResponse = { type: 'step-done', dynamicSlots };
  (self as any).postMessage(resp, [dynamicSlots.buffer]);
}

self.onmessage = async (e: MessageEvent<PhysicsWorkerRequest>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':        await init(msg.buffer, msg.gravity); break;
    case 'step':        step(msg.dt, msg.kinematicSlots);    break;
    case 'add-body':    addBody(msg.entity, msg.desc);        break;
    case 'remove-body': removeBody(msg.entity);               break;
    case 'set-gravity':
      if (world) world.gravity = { x: msg.gravity[0], y: msg.gravity[1], z: msg.gravity[2] };
      break;
  }
};
