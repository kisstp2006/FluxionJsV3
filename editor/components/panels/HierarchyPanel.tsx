// ============================================================
// FluxionJS V2 — Hierarchy Panel Component
// Entity tree with icons, search, context menu, inline rename,
// drag-to-reparent, categorized Add Entity menu
// Inspired by LumixEngine entity_folders + Nuake hierarchy
// ============================================================

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PanelHeader, SearchInput, Button, Icons, ContextMenu } from '../../ui';
import { useEditor, useEngine } from '../../core/EditorContext';
import { EntityId } from '../../../src/core/ECS';
import { ParticleEmitterComponent } from '../../../src/core/Components';
import * as THREE from 'three';

// ── Entity item in the tree ──
interface HierarchyItemProps {
  entity: EntityId;
  depth: number;
  isSelected: boolean;
  editingEntity: EntityId | null;
  onSelect: (entity: EntityId) => void;
  onContextMenu: (entity: EntityId, e: React.MouseEvent) => void;
  onDoubleClick: (entity: EntityId) => void;
  onRename: (entity: EntityId, name: string) => void;
  onDragStart: (entity: EntityId) => void;
  onDragOver: (entity: EntityId, e: React.DragEvent) => void;
  onDrop: (entity: EntityId) => void;
}

const HierarchyItem: React.FC<HierarchyItemProps> = ({
  entity,
  depth,
  isSelected,
  editingEntity,
  onSelect,
  onContextMenu,
  onDoubleClick,
  onRename,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const engine = useEngine();
  const [dropTarget, setDropTarget] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editName, setEditName] = useState('');

  if (!engine) return null;

  const ecs = engine.engine.ecs;
  const name = ecs.getEntityName(entity);
  const isEditing = editingEntity === entity;

  // Determine icon from components
  let icon: React.ReactNode = Icons.entity;
  let iconColor = 'var(--text-muted)';
  if (ecs.hasComponent(entity, 'MeshRenderer')) { icon = Icons.cube; iconColor = 'var(--accent-purple)'; }
  if (ecs.hasComponent(entity, 'Light')) { icon = Icons.light; iconColor = 'var(--accent-yellow)'; }
  if (ecs.hasComponent(entity, 'Camera')) { icon = Icons.camera; iconColor = 'var(--accent)'; }
  if (ecs.hasComponent(entity, 'Rigidbody')) { icon = Icons.physics; iconColor = 'var(--accent-red)'; }
  if (ecs.hasComponent(entity, 'ParticleEmitter')) { icon = Icons.particle; iconColor = 'var(--accent-yellow)'; }

  const children = [...ecs.getChildren(entity)];

  useEffect(() => {
    if (isEditing && inputRef.current) {
      setEditName(name);
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <>
      <div
        draggable={!isEditing}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(entity);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropTarget(true);
          onDragOver(entity, e);
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropTarget(false);
          onDrop(entity);
        }}
        onClick={(e) => { e.stopPropagation(); onSelect(entity); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(entity); }}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(entity, e); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '3px 8px',
          paddingLeft: `${8 + depth * 16}px`,
          cursor: 'pointer',
          fontSize: '12px',
          gap: '6px',
          background: dropTarget ? 'var(--accent-blue-dim, rgba(88,166,255,0.15))' : isSelected ? 'var(--bg-active)' : 'transparent',
          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
          transition: 'background 150ms ease',
          borderTop: dropTarget ? '2px solid var(--accent)' : '2px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!isSelected && !dropTarget) (e.currentTarget).style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          if (!isSelected && !dropTarget) (e.currentTarget).style.background = 'transparent';
        }}
      >
        <span style={{ fontSize: '11px', color: iconColor, width: '14px', textAlign: 'center' }}>
          {icon}
        </span>
        {isEditing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => onRename(entity, editName)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename(entity, editName);
              if (e.key === 'Escape') onRename(entity, name); // revert
            }}
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              border: '1px solid var(--accent)',
              borderRadius: '2px',
              color: 'var(--text-primary)',
              padding: '1px 4px',
              fontSize: '12px',
              outline: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span>{name}</span>
        )}
      </div>

      {/* Recursively render children */}
      {children.map((child) => (
        <HierarchyItem
          key={child}
          entity={child}
          depth={depth + 1}
          isSelected={false}
          editingEntity={editingEntity}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
          onRename={onRename}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
      ))}
    </>
  );
};

// ── Add Entity Dropdown Menu ──
interface AddEntityMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onAdd: (category: string, type: string) => void;
}

const AddEntityMenu: React.FC<AddEntityMenuProps> = ({ position, onClose, onAdd }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const categories = [
    {
      label: 'Primitives',
      items: [
        { type: 'empty', label: 'Empty', icon: Icons.entity },
        { type: 'cube', label: 'Cube', icon: Icons.cube },
        { type: 'sphere', label: 'Sphere', icon: Icons.sphere },
        { type: 'cylinder', label: 'Cylinder', icon: Icons.cube },
        { type: 'cone', label: 'Cone', icon: Icons.cone },
        { type: 'plane', label: 'Plane', icon: Icons.plane },
        { type: 'capsule', label: 'Capsule', icon: Icons.capsule },
        { type: 'torus', label: 'Torus', icon: Icons.torus },
      ],
    },
    {
      label: 'Lights',
      items: [
        { type: 'directional', label: 'Directional Light', icon: Icons.light },
        { type: 'point', label: 'Point Light', icon: Icons.pointLight },
        { type: 'spot', label: 'Spot Light', icon: Icons.light },
        { type: 'ambient', label: 'Ambient Light', icon: Icons.light },
      ],
    },
    {
      label: '3D',
      items: [
        { type: 'camera', label: 'Camera', icon: Icons.camera },
        { type: 'particle', label: 'Particle System', icon: Icons.particle },
      ],
    },
    {
      label: 'Physics',
      items: [
        { type: 'physics_box', label: 'Physics Box', icon: Icons.physics },
        { type: 'physics_sphere', label: 'Physics Sphere', icon: Icons.physics },
      ],
    },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 10000,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '4px 0',
        minWidth: '200px',
        maxHeight: '400px',
        overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      {categories.map((cat, ci) => (
        <div key={cat.label}>
          {ci > 0 && <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />}
          <div style={{
            padding: '4px 12px',
            fontSize: '10px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}>
            {cat.label}
          </div>
          {cat.items.map((item) => (
            <div
              key={item.type}
              onClick={() => { onAdd(cat.label, item.type); onClose(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '5px 12px',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--text-primary)',
                gap: '8px',
                transition: 'background 100ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: '16px', textAlign: 'center', opacity: 0.7 }}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ── Main Hierarchy Panel ──
export const HierarchyPanel: React.FC = () => {
  const { state, dispatch, log } = useEditor();
  const engine = useEngine();
  const [contextMenu, setContextMenu] = useState<{ entity: EntityId; pos: { x: number; y: number } } | null>(null);
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingEntity, setEditingEntity] = useState<EntityId | null>(null);
  const draggedEntity = useRef<EntityId | null>(null);

  const handleSelect = useCallback((entity: EntityId) => {
    dispatch({ type: 'SELECT_ENTITY', entity });
  }, [dispatch]);

  const handleContextMenu = useCallback((entity: EntityId, e: React.MouseEvent) => {
    setContextMenu({ entity, pos: { x: e.clientX, y: e.clientY } });
  }, []);

  const handleDoubleClick = useCallback((entity: EntityId) => {
    setEditingEntity(entity);
  }, []);

  const handleRename = useCallback((entity: EntityId, newName: string) => {
    if (!engine) return;
    setEditingEntity(null);
    const trimmed = newName.trim();
    if (trimmed) {
      engine.engine.ecs.setEntityName(entity, trimmed);
    }
  }, [engine]);

  const handleDragStart = useCallback((entity: EntityId) => {
    draggedEntity.current = entity;
  }, []);

  const handleDragOver = useCallback((_entity: EntityId, _e: React.DragEvent) => {
    // placeholder for visual feedback
  }, []);

  const handleDrop = useCallback((targetEntity: EntityId) => {
    if (!engine || draggedEntity.current === null) return;
    const src = draggedEntity.current;
    draggedEntity.current = null;
    if (src === targetEntity) return;
    // Prevent reparenting to a child of itself
    engine.engine.ecs.setParent(src, targetEntity);
    log(`Reparented to ${engine.engine.ecs.getEntityName(targetEntity)}`, 'info');
  }, [engine, log]);

  const handleAddEntity = useCallback((category: string, type: string) => {
    if (!engine) return;
    const scene = engine.scene;
    const materials = engine.materials;
    let entity: EntityId;

    switch (type) {
      // Primitives
      case 'empty':
        entity = scene.createEmpty('Empty Entity');
        break;
      case 'cube':
      case 'sphere':
      case 'cylinder':
      case 'cone':
      case 'plane':
      case 'capsule':
      case 'torus':
        entity = scene.createPrimitive(type.charAt(0).toUpperCase() + type.slice(1), type as any);
        break;
      // Lights
      case 'directional':
        entity = scene.createLight('Directional Light', 'directional', 0xffffff, 1);
        break;
      case 'point':
        entity = scene.createLight('Point Light', 'point', 0xffffff, 1);
        break;
      case 'spot':
        entity = scene.createLight('Spot Light', 'spot', 0xffffff, 1);
        break;
      case 'ambient':
        entity = scene.createLight('Ambient Light', 'ambient', 0xffffff, 0.5);
        break;
      // 3D
      case 'camera':
        entity = scene.createCamera('Camera');
        break;
      case 'particle': {
        entity = scene.createEmpty('Particle System');
        const pe = new ParticleEmitterComponent();
        pe.maxParticles = 200;
        pe.emissionRate = 30;
        engine.engine.ecs.addComponent(entity, pe);
        break;
      }
      // Physics
      case 'physics_box': {
        const mat = materials.createPBR({ name: 'physics_box', albedo: 0x888888, roughness: 0.6, metalness: 0.1 });
        entity = scene.createPhysicsBox('Physics Box', new THREE.Vector3(1, 1, 1), mat, 'dynamic');
        break;
      }
      case 'physics_sphere': {
        const mat = materials.createPBR({ name: 'physics_sphere', albedo: 0x888888, roughness: 0.6, metalness: 0.1 });
        entity = scene.createPhysicsSphere('Physics Sphere', 0.5, mat, 'dynamic');
        break;
      }
      default:
        entity = scene.createEmpty('Entity');
    }

    log(`Created: ${engine.engine.ecs.getEntityName(entity)}`, 'info');
    dispatch({ type: 'SELECT_ENTITY', entity });
    dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
  }, [engine, log, dispatch]);

  const handleDuplicate = useCallback((entity: EntityId) => {
    if (!engine) return;
    const clone = engine.scene.cloneEntity(entity);
    if (clone !== null) {
      log(`Duplicated: ${engine.engine.ecs.getEntityName(clone)}`, 'info');
      dispatch({ type: 'SELECT_ENTITY', entity: clone });
      dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
    }
  }, [engine, log, dispatch]);

  // Filter entities
  const rootEntities = useMemo(() => {
    if (!engine) return [];
    const roots = engine.engine.ecs.getRootEntities();
    if (!state.hierarchyFilter) return roots;
    return roots.filter((e) => {
      const name = engine.engine.ecs.getEntityName(e);
      return name.toLowerCase().includes(state.hierarchyFilter.toLowerCase());
    });
  }, [engine, state.hierarchyFilter, state.selectedEntity, state.entityCount]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-panel)',
    }}>
      <PanelHeader
        title="Hierarchy"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setAddMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            title="Add Entity"
          >
            {Icons.plus}
          </Button>
        }
      />
      <SearchInput
        value={state.hierarchyFilter}
        onChange={(v) => dispatch({ type: 'SET_HIERARCHY_FILTER', filter: v })}
        placeholder="Search entities..."
      />
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={() => {
          // Drop on empty area = unparent (make root)
          if (engine && draggedEntity.current !== null) {
            const src = draggedEntity.current;
            draggedEntity.current = null;
            const parent = engine.engine.ecs.getParent(src);
            if (parent !== undefined) {
              engine.engine.ecs.setParent(src, undefined as any);
              log('Moved to root', 'info');
            }
          }
        }}
      >
        {rootEntities.map((entity) => (
          <HierarchyItem
            key={entity}
            entity={entity}
            depth={0}
            isSelected={entity === state.selectedEntity}
            editingEntity={editingEntity}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            onRename={handleRename}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </div>

      {/* Add Entity Menu */}
      {addMenu && (
        <AddEntityMenu
          position={addMenu}
          onClose={() => setAddMenu(null)}
          onAdd={handleAddEntity}
        />
      )}

      {/* Context Menu */}
      {contextMenu && engine && (
        <ContextMenu
          position={contextMenu.pos}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'Rename',
              icon: Icons.pencil,
              shortcut: 'F2',
              onClick: () => setEditingEntity(contextMenu.entity),
            },
            {
              label: 'Duplicate',
              icon: Icons.copy,
              shortcut: 'Ctrl+D',
              onClick: () => handleDuplicate(contextMenu.entity),
            },
            {
              label: 'Focus',
              icon: Icons.target,
              shortcut: 'F',
              onClick: () => {
                const t = engine.engine.ecs.getComponent<any>(contextMenu.entity, 'Transform');
                if (t) engine.orbitControls.target.copy(t.position);
              },
            },
            { label: '', icon: undefined, shortcut: '', onClick: () => {}, separator: true },
            {
              label: 'Add Child',
              icon: Icons.plus,
              onClick: () => {
                const child = engine.scene.createEmpty('Child Entity');
                engine.engine.ecs.setParent(child, contextMenu.entity);
                log(`Created child entity`, 'info');
              },
            },
            {
              label: 'Unparent',
              icon: Icons.externalLink,
              onClick: () => {
                engine.engine.ecs.setParent(contextMenu.entity, undefined as any);
                log('Unparented entity', 'info');
              },
            },
            { label: '', icon: undefined, shortcut: '', onClick: () => {}, separator: true },
            {
              label: 'Delete',
              icon: Icons.trash,
              shortcut: 'Del',
              onClick: () => {
                const name = engine.engine.ecs.getEntityName(contextMenu.entity);
                engine.engine.ecs.destroyEntity(contextMenu.entity);
                if (state.selectedEntity === contextMenu.entity) {
                  dispatch({ type: 'SELECT_ENTITY', entity: null });
                }
                dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
                log(`Deleted entity: ${name}`, 'warn');
              },
            },
          ]}
        />
      )}
    </div>
  );
};
