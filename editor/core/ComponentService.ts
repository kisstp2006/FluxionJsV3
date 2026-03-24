// ============================================================
// FluxionJS V2 — Component Service
// Stride-inspired property editing with undo support.
// All inspector onChange handlers should use these helpers
// instead of directly mutating component properties.
// ============================================================

import * as THREE from 'three';
import { Component, markDirty } from '../../src/core/ECS';
import {
  UndoManager,
  PropertyCommand,
  ColorPropertyCommand,
  MaterialPropertyCommand,
  MaterialColorCommand,
} from './UndoService';

/**
 * Set a scalar/enum/boolean property on a component with undo support.
 * Marks the component dirty so systems can react to the change.
 */
export function setProperty(
  undoManager: UndoManager,
  component: Component,
  property: string,
  newValue: any,
): void {
  const oldValue = (component as any)[property];
  if (oldValue === newValue) return;
  const cmd = new PropertyCommand(component, property, oldValue, newValue);
  undoManager.execute(cmd);
}

/**
 * Set a THREE.Color property on a component with undo support.
 * Uses hex clone semantics so undo/redo correctly restores color.
 */
export function setColorProperty(
  undoManager: UndoManager,
  component: Component,
  property: string,
  newColorStr: string,
): void {
  const color = (component as any)[property] as THREE.Color;
  const cmd = new ColorPropertyCommand(component, property, color, newColorStr);
  undoManager.execute(cmd);
}

/**
 * Set a scalar property on a THREE.MeshStandardMaterial with undo support.
 */
export function setMaterialProperty(
  undoManager: UndoManager,
  material: THREE.MeshStandardMaterial,
  property: string,
  newValue: any,
): void {
  const oldValue = (material as any)[property];
  if (oldValue === newValue) return;
  const cmd = new MaterialPropertyCommand(material, property, oldValue, newValue);
  undoManager.execute(cmd);
}

/**
 * Set the color of a THREE.MeshStandardMaterial with undo support.
 */
export function setMaterialColor(
  undoManager: UndoManager,
  material: THREE.MeshStandardMaterial,
  newColorStr: string,
): void {
  const cmd = new MaterialColorCommand(material, material.color, newColorStr);
  undoManager.execute(cmd);
}

/**
 * Directly mark a component dirty without undo (for use when mutation
 * is done externally, e.g. Transform gizmo dragging).
 */
export function markComponentDirty(component: Component, property?: string): void {
  markDirty(component, property);
}
