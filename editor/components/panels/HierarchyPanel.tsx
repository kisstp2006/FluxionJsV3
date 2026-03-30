// ============================================================
// FluxionJS V2 — Hierarchy Panel Component
// Entity tree with icons, search, context menu, inline rename,
// drag-to-reparent, categorized Add Entity menu
// Inspired by LumixEngine entity_folders + Nuake hierarchy
// ============================================================

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PanelHeader, SearchInput, Button, Icons, ContextMenu } from '../../ui';
import { AddEntityPopup } from './hierarchy/AddEntityPopup';
import { useEditor, useEngine } from '../../core/EditorContext';
import { EntityId } from '../../../src/core/ECS';
import { ComponentRegistry } from '../../../src/core/ComponentRegistry';
import * as THREE from 'three';
import { undoManager, CreateEntityCommand, DeleteEntityCommand, DuplicateEntityCommand, ReparentEntityCommand } from '../../core/UndoService';

// ── Entity item in the tree ──
interface HierarchyItemProps {
  entity: EntityId;
  depth: number;
  isSelected: boolean;
  isHidden: boolean;
  isLocked: boolean;
  selectedEntity: EntityId | null;
  editingEntity: EntityId | null;
  onSelect: (entity: EntityId) => void;
  onContextMenu: (entity: EntityId, e: React.MouseEvent) => void;
  onDoubleClick: (entity: EntityId) => void;
  onRename: (entity: EntityId, name: string) => void;
  onDragStart: (entity: EntityId) => void;
  onDragOver: (entity: EntityId, e: React.DragEvent) => void;
  onDrop: (entity: EntityId) => void;
  onToggleHide: (entity: EntityId) => void;
  onToggleLock: (entity: EntityId) => void;
  hiddenEntities: Set<EntityId>;
  lockedEntities: Set<EntityId>;
}

const HierarchyItem: React.FC<HierarchyItemProps> = ({
  entity,
  depth,
  isSelected,
  isHidden,
  isLocked,
  selectedEntity,
  editingEntity,
  onSelect,
  onContextMenu,
  onDoubleClick,
  onRename,
  onDragStart,
  onDragOver,
  onDrop,
  onToggleHide,
  onToggleLock,
  hiddenEntities,
  lockedEntities,
}) => {
  const [hovering, setHovering] = useState(false);
  const engine = useEngine();
  const [dropTarget, setDropTarget] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editName, setEditName] = useState('');

  if (!engine) return null;

  const ecs = engine.engine.ecs;
  const name = ecs.getEntityName(entity);
  const isEditing = editingEntity === entity;

  // Determine icon from components — registry-driven, priority-sorted
  const iconRules = useMemo(() => ComponentRegistry.getHierarchyIconRules(), []);
  let icon: React.ReactNode = Icons.entity;
  let iconColor = 'var(--text-muted)';
  for (const rule of iconRules) {
    if (ecs.hasComponent(entity, rule.typeId)) {
      icon = (Icons as any)[rule.icon] ?? rule.icon;
      iconColor = rule.color ?? iconColor;
      break;
    }
  }

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
        onClick={(e) => { e.stopPropagation(); if (!isLocked) onSelect(entity); }}
        onDoubleClick={(e) => { e.stopPropagation(); if (!isLocked) onDoubleClick(entity); }}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(entity, e); }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '3px 8px',
          paddingLeft: `${8 + depth * 16}px`,
          cursor: isLocked ? 'not-allowed' : 'pointer',
          fontSize: '12px',
          gap: '6px',
          background: dropTarget ? 'var(--accent-blue-dim, rgba(88,166,255,0.15))' : isSelected ? 'var(--bg-active)' : hovering ? 'var(--bg-hover)' : 'transparent',
          color: isLocked ? 'var(--text-muted)' : isSelected ? 'var(--accent)' : 'var(--text-primary)',
          opacity: isHidden ? 0.45 : 1,
          transition: 'background 150ms ease',
          borderTop: dropTarget ? '2px solid var(--accent)' : '2px solid transparent',
        }}
      >
        <span style={{ fontSize: '11px', color: isLocked ? 'var(--text-muted)' : iconColor, width: '14px', textAlign: 'center' }}>
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
          <span style={{ flex: 1 }}>{name}</span>
        )}
        {/* Hide / Lock icons — shown on hover */}
        {hovering && (
          <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto', flexShrink: 0 }}
            onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onToggleHide(entity)}
              title={isHidden ? 'Show in scene' : 'Hide in scene'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                fontSize: '11px', lineHeight: 1,
                color: isHidden ? 'var(--accent-yellow)' : 'var(--text-muted)',
              }}
            >
              {Icons.eye}
            </button>
            <button
              onClick={() => onToggleLock(entity)}
              title={isLocked ? 'Unlock' : 'Lock (prevent selection)'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                fontSize: '11px', lineHeight: 1,
                color: isLocked ? 'var(--accent-yellow)' : 'var(--text-muted)',
              }}
            >
              {Icons.lock}
            </button>
          </div>
        )}
      </div>

      {/* Recursively render children */}
      {children.map((child) => (
        <HierarchyItem
          key={child}
          entity={child}
          depth={depth + 1}
          isSelected={child === selectedEntity}
          isHidden={hiddenEntities.has(child)}
          isLocked={lockedEntities.has(child)}
          selectedEntity={selectedEntity}
          editingEntity={editingEntity}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
          onRename={onRename}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onToggleHide={onToggleHide}
          onToggleLock={onToggleLock}
          hiddenEntities={hiddenEntities}
          lockedEntities={lockedEntities}
        />
      ))}
    </>
  );
};


// ── Main Hierarchy Panel ──
export const HierarchyPanel: React.FC = () => {
  const { state, dispatch, log } = useEditor();
  const engine = useEngine();
  const [contextMenu, setContextMenu] = useState<{ entity: EntityId; pos: { x: number; y: number } } | null>(null);
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingEntity, setEditingEntity] = useState<EntityId | null>(null);
  const [hiddenEntities, setHiddenEntities] = useState<Set<EntityId>>(new Set());
  const [lockedEntities, setLockedEntities] = useState<Set<EntityId>>(new Set());
  const draggedEntity = useRef<EntityId | null>(null);

  const handleToggleHide = useCallback((entity: EntityId) => {
    if (!engine) return;
    setHiddenEntities(prev => {
      const next = new Set(prev);
      const isNowHidden = !next.has(entity);
      if (isNowHidden) { next.add(entity); } else { next.delete(entity); }
      // Toggle MeshRenderer visibility
      const mr = engine.engine.ecs.getComponent<any>(entity, 'MeshRenderer');
      if (mr) mr.enabled = !isNowHidden;
      return next;
    });
  }, [engine]);

  const handleToggleLock = useCallback((entity: EntityId) => {
    setLockedEntities(prev => {
      const next = new Set(prev);
      if (next.has(entity)) { next.delete(entity); } else { next.add(entity); }
      return next;
    });
  }, []);

  // Track ECS topology changes without triggering on every frame.
  // hierarchyRevision only increments when entities are created/destroyed.
  const [hierarchyRevision, setHierarchyRevision] = useState(0);
  const lastRevRef = useRef(0);
  useEffect(() => {
    if (!engine) return;
    const handler = () => {
      const rev = engine.engine.ecs.hierarchyRevision;
      if (rev !== lastRevRef.current) {
        lastRevRef.current = rev;
        setHierarchyRevision(rev);
      }
    };
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine]);

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
    const oldParent = engine.engine.ecs.getParent(src);
    undoManager.execute(new ReparentEntityCommand(src, targetEntity, oldParent, engine.engine.ecs));
    log(`Reparented to ${engine.engine.ecs.getEntityName(targetEntity)}`, 'info');
  }, [engine, log]);

  const handleAddEntity = useCallback((_category: string, type: string) => {
    if (!engine) return;
    const scene = engine.scene;
    const materials = engine.materials;
    const ecs = engine.engine.ecs;

    const createFn = (): EntityId => {
      switch (type) {
        case 'empty': return scene.createEmpty('Empty Entity');
        case 'cube': case 'sphere': case 'cylinder': case 'cone': case 'plane': case 'capsule': case 'torus':
          return scene.createPrimitive(type.charAt(0).toUpperCase() + type.slice(1), type as any);
        case 'directional': return scene.createLight('Directional Light', 'directional', 0xffffff, 1);
        case 'point':       return scene.createLight('Point Light', 'point', 0xffffff, 1);
        case 'spot':        return scene.createLight('Spot Light', 'spot', 0xffffff, 1);
        case 'ambient':     return scene.createLight('Ambient Light', 'ambient', 0xffffff, 0.5);
        case 'camera':      return scene.createCamera('Camera');
        case 'particle': {
          const e = scene.createEmpty('Particle System');
          const pe = ComponentRegistry.create('ParticleEmitter');
          if (pe) { (pe as any).maxParticles = 200; (pe as any).emissionRate = 30; ecs.addComponent(e, pe); }
          return e;
        }
        case 'text3d':  return scene.createText('3D Text');
        case 'sprite':  return scene.createSprite('Sprite');
        case 'physics_box': {
          const mat = materials.createPBR({ name: 'physics_box', albedo: 0x888888, roughness: 0.6, metalness: 0.1 });
          return scene.createPhysicsBox('Physics Box', new THREE.Vector3(1, 1, 1), mat, 'dynamic');
        }
        case 'physics_sphere': {
          const mat = materials.createPBR({ name: 'physics_sphere', albedo: 0x888888, roughness: 0.6, metalness: 0.1 });
          return scene.createPhysicsSphere('Physics Sphere', 0.5, mat, 'dynamic');
        }
        default: return scene.createEmpty('Entity');
      }
    };

    undoManager.execute(new CreateEntityCommand(createFn, ecs, (entity) => {
      log(`Created: ${ecs.getEntityName(entity)}`, 'info');
      dispatch({ type: 'SELECT_ENTITY', entity });
      dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
    }));
  }, [engine, log, dispatch]);

  const handleDuplicate = useCallback((entity: EntityId) => {
    if (!engine) return;
    const ecs = engine.engine.ecs;
    undoManager.execute(new DuplicateEntityCommand(
      () => engine.scene.cloneEntity(entity),
      ecs,
      (clone) => {
        log(`Duplicated: ${ecs.getEntityName(clone)}`, 'info');
        dispatch({ type: 'SELECT_ENTITY', entity: clone });
        dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
      },
    ));
  }, [engine, log, dispatch]);

  // Filter entities
  // Collect all entity ids whose name matches the filter (recursive)
  const matchedEntities = useMemo<Set<EntityId> | null>(() => {
    if (!engine || !state.hierarchyFilter) return null;
    const q = state.hierarchyFilter.toLowerCase();
    const ecs = engine.engine.ecs;
    const matched = new Set<EntityId>();
    for (const id of ecs.getAllEntities()) {
      if (ecs.getEntityName(id).toLowerCase().includes(q)) {
        // Mark entity and all its ancestors so the tree stays connected
        matched.add(id);
        let parent = ecs.getParent(id);
        while (parent !== undefined) {
          matched.add(parent);
          parent = ecs.getParent(parent);
        }
      }
    }
    return matched;
  }, [engine, state.hierarchyFilter, hierarchyRevision]);

  const rootEntities = useMemo(() => {
    if (!engine) return [];
    const roots = engine.engine.ecs.getRootEntities();
    if (!matchedEntities) return roots;
    return roots.filter((e) => matchedEntities.has(e));
  }, [engine, matchedEntities, state.selectedEntity, hierarchyRevision]);

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
            const oldParent = engine.engine.ecs.getParent(src);
            if (oldParent !== undefined) {
              undoManager.execute(new ReparentEntityCommand(src, undefined, oldParent, engine.engine.ecs));
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
            isHidden={hiddenEntities.has(entity)}
            isLocked={lockedEntities.has(entity)}
            selectedEntity={state.selectedEntity}
            editingEntity={editingEntity}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            onRename={handleRename}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onToggleHide={handleToggleHide}
            onToggleLock={handleToggleLock}
            hiddenEntities={hiddenEntities}
            lockedEntities={lockedEntities}
          />
        ))}
      </div>

      {/* Add Entity Popup */}
      {addMenu && (
        <AddEntityPopup
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
                const target = contextMenu.entity;
                undoManager.execute(new DeleteEntityCommand(
                  target,
                  engine.engine.ecs,
                  engine.engine,
                  (newId) => {
                    dispatch({ type: 'SELECT_ENTITY', entity: newId });
                    dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
                    log(`Restored entity`, 'info');
                  },
                ));
                if (state.selectedEntity === target) dispatch({ type: 'SELECT_ENTITY', entity: null });
                dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
                log(`Deleted entity: ${engine.engine.ecs.getEntityName(target)}`, 'warn');
              },
            },
          ]}
        />
      )}
    </div>
  );
};
