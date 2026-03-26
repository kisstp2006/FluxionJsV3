// ============================================================
// FluxionJS V2 — Undo/Redo Service
// LumixEngine IEditorCommand pattern — command stack with
// execute/undo for transform changes, entity CRUD
// ============================================================

export interface EditorCommand {
  label: string;
  execute(): void;
  undo(): void;
}

export class UndoManager {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  maxHistory = 100;

  execute(command: EditorCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack.length = 0;
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  undo(): EditorCommand | null {
    const cmd = this.undoStack.pop();
    if (cmd) {
      cmd.undo();
      this.redoStack.push(cmd);
      return cmd;
    }
    return null;
  }

  redo(): EditorCommand | null {
    const cmd = this.redoStack.pop();
    if (cmd) {
      cmd.execute();
      this.undoStack.push(cmd);
      return cmd;
    }
    return null;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get undoLabel(): string | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].label : null;
  }

  get redoLabel(): string | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].label : null;
  }
}

// ── Concrete Commands ──

import * as THREE from 'three';
import { EntityId, ECSManager, Component, markDirty } from '../../src/core/ECS';
import { TransformComponent } from '../../src/core/Components';

/**
 * Generic property-level undo command (Stride PropertyGrid pattern).
 * Works with any component type and property name.
 */
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

  execute(): void {
    (this.component as any)[this.property] = this.newValue;
    markDirty(this.component, this.property);
  }

  undo(): void {
    (this.component as any)[this.property] = this.oldValue;
    markDirty(this.component, this.property);
  }
}

/**
 * Undo command for THREE.Color properties (needs clone semantics).
 */
export class ColorPropertyCommand implements EditorCommand {
  label: string;
  private oldHex: number;
  private newHex: number;

  constructor(
    private component: Component,
    private property: string,
    oldColor: THREE.Color,
    newColorStr: string,
  ) {
    this.oldHex = oldColor.getHex();
    this.newHex = new THREE.Color(newColorStr).getHex();
    this.label = `Set ${component.type}.${property}`;
  }

  execute(): void {
    ((this.component as any)[this.property] as THREE.Color).setHex(this.newHex);
    markDirty(this.component, this.property);
  }

  undo(): void {
    ((this.component as any)[this.property] as THREE.Color).setHex(this.oldHex);
    markDirty(this.component, this.property);
  }
}

/**
 * Undo command for THREE.MeshStandardMaterial property edits.
 * Material properties live on the Three.js object, not the ECS component.
 */
export class MaterialPropertyCommand implements EditorCommand {
  label: string;

  constructor(
    private material: THREE.MeshStandardMaterial,
    private property: string,
    private oldValue: any,
    private newValue: any,
  ) {
    this.label = `Set Material.${property}`;
  }

  execute(): void {
    (this.material as any)[this.property] = this.newValue;
  }

  undo(): void {
    (this.material as any)[this.property] = this.oldValue;
  }
}

/**
 * Undo command for material color edits.
 */
export class MaterialColorCommand implements EditorCommand {
  label: string;
  private oldHex: number;
  private newHex: number;

  constructor(
    private material: THREE.MeshStandardMaterial,
    oldColor: THREE.Color,
    newColorStr: string,
  ) {
    this.oldHex = oldColor.getHex();
    this.newHex = new THREE.Color(newColorStr).getHex();
    this.label = 'Set Material.color';
  }

  execute(): void {
    this.material.color.setHex(this.newHex);
  }

  undo(): void {
    this.material.color.setHex(this.oldHex);
  }
}

/** Records a transform change (position, rotation, scale) */
export class TransformCommand implements EditorCommand {
  label: string;
  private entity: EntityId;
  private ecs: ECSManager;
  private oldPos: THREE.Vector3;
  private oldRot: THREE.Euler;
  private oldScale: THREE.Vector3;
  private newPos: THREE.Vector3;
  private newRot: THREE.Euler;
  private newScale: THREE.Vector3;

  constructor(
    entity: EntityId,
    ecs: ECSManager,
    oldTransform: { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 },
    newTransform: { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 },
  ) {
    this.entity = entity;
    this.ecs = ecs;
    this.oldPos = oldTransform.position.clone();
    this.oldRot = oldTransform.rotation.clone();
    this.oldScale = oldTransform.scale.clone();
    this.newPos = newTransform.position.clone();
    this.newRot = newTransform.rotation.clone();
    this.newScale = newTransform.scale.clone();
    this.label = `Transform ${ecs.getEntityName(entity)}`;
  }

  execute(): void {
    const t = this.ecs.getComponent<TransformComponent>(this.entity, 'Transform');
    if (!t) return;
    t.position.copy(this.newPos);
    t.rotation.copy(this.newRot);
    t.quaternion.setFromEuler(this.newRot);
    t.scale.copy(this.newScale);
  }

  undo(): void {
    const t = this.ecs.getComponent<TransformComponent>(this.entity, 'Transform');
    if (!t) return;
    t.position.copy(this.oldPos);
    t.rotation.copy(this.oldRot);
    t.quaternion.setFromEuler(this.oldRot);
    t.scale.copy(this.oldScale);
  }
}

/** Records entity creation (undo = destroy, redo = re-create) */
export class CreateEntityCommand implements EditorCommand {
  label: string;
  private entity: EntityId;
  private ecs: ECSManager;
  constructor(
    createFn: () => EntityId,
    ecs: ECSManager,
    onCreated?: (entity: EntityId) => void,
  ) {
    this.ecs = ecs;
    this.entity = createFn();
    this.label = `Create ${ecs.getEntityName(this.entity)}`;
    onCreated?.(this.entity);
  }

  execute(): void {
    // Re-create only on redo (first execute handled in constructor)
  }

  undo(): void {
    this.ecs.destroyEntity(this.entity);
  }
}

/** Records entity deletion (undo = re-create, redo = destroy again) */
export class DeleteEntityCommand implements EditorCommand {
  label: string;
  private entity: EntityId;
  private ecs: ECSManager;
  private entityName: string;

  constructor(entity: EntityId, ecs: ECSManager) {
    this.entity = entity;
    this.ecs = ecs;
    this.entityName = ecs.getEntityName(entity);
    this.label = `Delete ${this.entityName}`;
  }

  execute(): void {
    this.ecs.destroyEntity(this.entity);
  }

  undo(): void {
    const e = this.ecs.createEntity(this.entityName);
    this.entity = e;
  }
}

// Singleton instance
export const undoManager = new UndoManager();
