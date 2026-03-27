// ============================================================
// FluxionJS V3 — Add Component Popup
// Categorized, searchable component picker.
// Reads ComponentRegistry.getAddableByCategory() — no hardcoded list.
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor, useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { ComponentRegistry } from '../../../../src/core/ComponentRegistry';
import type { ComponentRegistration } from '../../../../src/core/ComponentRegistry';
import { SearchInput } from '../../../ui';

interface AddComponentPopupProps {
  entity: EntityId;
  onClose: () => void;
  onAdded: () => void;
  position?: { x: number; y: number };
}

export const AddComponentPopup: React.FC<AddComponentPopupProps> = ({
  entity,
  onClose,
  onAdded,
  position,
}) => {
  const engine  = useEngine();
  const { log, dispatch } = useEditor();
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!engine) return null;

  const existing = engine.engine.ecs.getAllComponents(entity);

  // Filter: allowMultiple OR not already present; match search query
  const q = query.toLowerCase().trim();
  const categories = ComponentRegistry.getAddableByCategory();
  const filtered = new Map<string, ComponentRegistration[]>();

  for (const [cat, regs] of categories) {
    const visible = regs.filter(reg => {
      if (!reg.meta.allowMultiple && existing.some(c => c.type === reg.meta.typeId)) return false;
      if (q && !reg.meta.displayName.toLowerCase().includes(q) && !cat.toLowerCase().includes(q)) return false;
      return true;
    });
    if (visible.length > 0) filtered.set(cat, visible);
  }

  const handleAdd = useCallback((reg: ComponentRegistration) => {
    const comp = ComponentRegistry.create(reg.meta.typeId);
    if (!comp) return;
    engine.engine.ecs.addComponent(entity, comp);
    log(`Added ${reg.meta.displayName} component`, 'info');
    dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
    onAdded();
    onClose();
  }, [engine, entity, log, dispatch, onAdded, onClose]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: position?.x,
        top: position?.y,
        zIndex: 1000,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        width: '240px',
        maxHeight: '360px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Search bar */}
      <div style={{ padding: '8px' }}>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search components..."
          autoFocus
        />
      </div>

      {/* Category list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.size === 0 ? (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '12px',
            fontStyle: 'italic',
          }}>
            No components found
          </div>
        ) : (
          [...filtered.entries()].map(([cat, regs]) => (
            <div key={cat}>
              {/* Category header */}
              <div style={{
                padding: '4px 10px 2px',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary)',
              }}>
                {cat}
              </div>

              {/* Component items */}
              {regs.map(reg => (
                <button
                  key={reg.meta.typeId}
                  onClick={() => handleAdd(reg)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '6px 12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    textAlign: 'left',
                    transition: 'background 100ms ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {reg.meta.icon && (
                    <span style={{ fontSize: '13px', opacity: 0.8, flexShrink: 0 }}>
                      {reg.meta.icon}
                    </span>
                  )}
                  <span>{reg.meta.displayName}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
