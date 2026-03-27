// ============================================================
// FluxionJS V3 — Undo/Redo Service
// LumixEngine IEditorCommand pattern — command stack with
// execute/undo for transform changes, entity CRUD, hierarchy ops
// ============================================================

export interface EditorCommand {
  label: string;
  execute(): void;
  undo(): void;
}

type UndoListener = () => void;

export class UndoManager {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  maxHistory = 100;
  private listeners: UndoListener[] = [];

  /** Subscribe to any undo stack change. Returns unsubscribe fn. */
  subscribe(fn: UndoListener): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  execute(command: EditorCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack.length = 0;
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.notify();
  }

  /**
   * Push a command that was already applied externally (e.g. gizmo drag).
   * Does NOT call command.execute() — the action already happened.
   * Clears the redo stack and notifies listeners.
   */
  pushExternal(command: EditorCommand): void {
    this.undoStack.push(command);
    this.redoStack.length = 0;
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.notify();
  }

  undo(): EditorCommand | null {
    const cmd = this.undoStack.pop();
    if (cmd) {
      cmd.undo();
      this.redoStack.push(cmd);
      this.notify();
      return cmd;
    }
    return null;
  }

  redo(): EditorCommand | null {
    const cmd = this.redoStack.pop();
    if (cmd) {
      cmd.execute();
      this.undoStack.push(cmd);
      this.notify();
      return cmd;
    }
    return null;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.notify();
  }

  get undoLabel(): string | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].label : null;
  }

  get redoLabel(): string | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].label : null;
  }

  /** Read-only snapshot of the undo stack (oldest → newest). */
  getUndoStack(): readonly EditorCommand[] { return this.undoStack; }

  /** Read-only snapshot of the redo stack (most-recent-redo-first). */
  getRedoStack(): readonly EditorCommand[] { return this.redoStack; }
}

// ── Concrete Commands ──

import * as THREE from 'three';
import { EntityId, ECSManager, Component, markDirty } from '../../src/core/ECS';
import { TransformComponent } from '../../src/core/Components';
import type { Engine } from '../../src/core/Engine';
import type { SerializedEntity } from '../../src/scene/Scene';

// Forward-declare snapshot helpers — set at runtime to avoid circular import
type SnapshotFn = (rootId: EntityId, engine: Engine) => SerializedEntity[];
type RestoreFn = (entities: SerializedEntity[], engine: Engine, onRootRestored?: (newId: EntityId) => void) => EntityId;
let _snapshot: SnapshotFn | null = null;
let _restore: RestoreFn | null = null;

/** Called once from SceneSerializer to wire up snapshot helpers without circular import. */
export function registerSnapshotHelpers(snapshot: SnapshotFn, restore: RestoreFn): void {
  _snapshot = snapshot;
  _restore = restore;
}

// ─────────────────────────────────────────────────────────────
// Generic property command (Stride PropertyGrid pattern)
// ─────────────────────────────────────────────────────────────

export class PropertyCommand implements EditorCommand {
  label: string;
  constructor(
    private component: Component,
    private property: string,
    private oldValue: any,
    private newValue: any,
    label?: string,
  ) {
    this.label = label ?? `Set ${component.type}.${property}`;
  }
  execute(): void { (this.component as any)[this.property] = this.newValue; markDirty(this.component, this.property); }
  undo(): void    { (this.component as any)[this.property] = this.oldValue; markDirty(this.component, this.property); }
}

// ─────────────────────────────────────────────────────────────
// THREE.Color property command
// ─────────────────────────────────────────────────────────────

export class ColorPropertyCommand implements EditorCommand {
  label: string;
  private oldHex: number;
  private newHex: number;
  constructor(private component: Component, private property: string, oldColor: THREE.Color, newColorStr: string) {
    this.oldHex = oldColor.getHex();
    this.newHex = new THREE.Color(newColorStr).getHex();
    this.label = `Set ${component.type}.${property}`;
  }
  execute(): void { ((this.component as any)[this.property] as THREE.Color).setHex(this.newHex); markDirty(this.component, this.property); }
  undo(): void    { ((this.component as any)[this.property] as THREE.Color).setHex(this.oldHex); markDirty(this.component, this.property); }
}

// ─────────────────────────────────────────────────────────────
// THREE.MeshStandardMaterial property command
// ─────────────────────────────────────────────────────────────

export class MaterialPropertyCommand implements EditorCommand {
  label: string;
  constructor(private material: THREE.MeshStandardMaterial, private property: string, private oldValue: any, private newValue: any) {
    this.label = `Set Material.${property}`;
  }
  execute(): void { (this.material as any)[this.property] = this.newValue; }
  undo(): void    { (this.material as any)[this.property] = this.oldValue; }
}

// ─────────────────────────────────────────────────────────────
// Material color command
// ─────────────────────────────────────────────────────────────

export class MaterialColorCommand implements EditorCommand {
  label = 'Set Material.color';
  private oldHex: number;
  private newHex: number;
  constructor(private material: THREE.MeshStandardMaterial, oldColor: THREE.Color, newColorStr: string) {
    this.oldHex = oldColor.getHex();
    this.newHex = new THREE.Color(newColorStr).getHex();
  }
  execute(): void { this.material.color.setHex(this.newHex); }
  undo(): void    { this.material.color.setHex(this.oldHex); }
}

// ─────────────────────────────────────────────────────────────
// Transform change command
// ─────────────────────────────────────────────────────────────

export class TransformCommand implements EditorCommand {
  label: string;
  private oldPos: THREE.Vector3; private oldRot: THREE.Euler; private oldScale: THREE.Vector3;
  private newPos: THREE.Vector3; private newRot: THREE.Euler; private newScale: THREE.Vector3;

  constructor(
    private entity: EntityId,
    private ecs: ECSManager,
    old: { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 },
    next: { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 },
  ) {
    this.oldPos = old.position.clone(); this.oldRot = old.rotation.clone(); this.oldScale = old.scale.clone();
    this.newPos = next.position.clone(); this.newRot = next.rotation.clone(); this.newScale = next.scale.clone();
    this.label = `Transform ${ecs.getEntityName(entity)}`;
  }

  private apply(pos: THREE.Vector3, rot: THREE.Euler, scale: THREE.Vector3): void {
    const t = this.ecs.getComponent<TransformComponent>(this.entity, 'Transform');
    if (!t) return;
    t.position.copy(pos); t.rotation.copy(rot); t.quaternion.setFromEuler(rot); t.scale.copy(scale);
  }

  execute(): void { this.apply(this.newPos, this.newRot, this.newScale); }
  undo(): void    { this.apply(this.oldPos, this.oldRot, this.oldScale); }
}

// ─────────────────────────────────────────────────────────────
// Create entity command
// ─────────────────────────────────────────────────────────────

export class CreateEntityCommand implements EditorCommand {
  label = 'Create Entity';
  private entity: EntityId = -1;

  constructor(
    private createFn: () => EntityId,
    private ecs: ECSManager,
    private onCreated?: (id: EntityId) => void,
  ) {}

  execute(): void {
    this.entity = this.createFn();
    this.label = `Create ${this.ecs.getEntityName(this.entity)}`;
    this.onCreated?.(this.entity);
  }

  undo(): void {
    if (this.entity >= 0) this.ecs.destroyEntity(this.entity);
  }
}

// ─────────────────────────────────────────────────────────────
// Delete entity command — full subtree snapshot/restore
// ─────────────────────────────────────────────────────────────

export class DeleteEntityCommand implements EditorCommand {
  label: string;
  private snapshot: SerializedEntity[] = [];
  private restoredId: EntityId = -1;

  constructor(
    private entity: EntityId,
    private ecs: ECSManager,
    private engine: Engine,
    private onUndo?: (newRootId: EntityId) => void,
  ) {
    this.label = `Delete ${ecs.getEntityName(entity)}`;
    // Snapshot before destruction
    if (_snapshot) {
      this.snapshot = _snapshot(entity, engine);
    }
  }

  execute(): void {
    this.ecs.destroyEntity(this.entity);
  }

  undo(): void {
    if (_restore && this.snapshot.length > 0) {
      const newId = _restore(this.snapshot, this.engine, (id) => {
        this.restoredId = id;
        this.entity = id; // Keep track for potential subsequent redo
        this.onUndo?.(id);
      });
      if (newId >= 0 && this.restoredId < 0) {
        // Fallback if onRootRestored wasn't called yet (sync restore)
        this.restoredId = newId;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Duplicate entity command
// ─────────────────────────────────────────────────────────────

export class DuplicateEntityCommand implements EditorCommand {
  label = 'Duplicate Entity';
  private cloneId: EntityId = -1;

  constructor(
    private cloneFn: () => EntityId | null,
    private ecs: ECSManager,
    private onCreated?: (id: EntityId) => void,
  ) {}

  execute(): void {
    const clone = this.cloneFn();
    if (clone !== null) {
      this.cloneId = clone;
      this.label = `Duplicate ${this.ecs.getEntityName(clone)}`;
      this.onCreated?.(clone);
    }
  }

  undo(): void {
    if (this.cloneId >= 0) this.ecs.destroyEntity(this.cloneId);
  }
}

// ─────────────────────────────────────────────────────────────
// Reparent entity command
// ─────────────────────────────────────────────────────────────

export class ReparentEntityCommand implements EditorCommand {
  label: string;

  constructor(
    private entity: EntityId,
    private newParent: EntityId | undefined,
    private oldParent: EntityId | undefined,
    private ecs: ECSManager,
  ) {
    const parentName = newParent !== undefined ? ecs.getEntityName(newParent) : 'root';
    this.label = `Reparent ${ecs.getEntityName(entity)} → ${parentName}`;
  }

  execute(): void { this.ecs.setParent(this.entity, this.newParent as EntityId); }
  undo(): void    { this.ecs.setParent(this.entity, this.oldParent as EntityId); }
}

// ── Singleton ──
export const undoManager = new UndoManager();
